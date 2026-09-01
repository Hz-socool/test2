import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_CONFIGURATION,
  buildResponsivePlan,
  normalizeConfiguration
} from "../src/core/inference";
import type { NodeSnapshot } from "../src/shared/model";

interface Fixture {
  input: NodeSnapshot;
  expected: {
    direction: "HORIZONTAL" | "VERTICAL";
    wrap: "WRAP" | "NO_WRAP";
    itemSpacing: number;
    padding: { top: number; right: number; bottom: number; left: number };
    orderedChildIds: string[];
  };
}

const horizontal = loadFixture("horizontal-frame.json");
const vertical = loadFixture("vertical-group.json");

describe("ResponsivePlan inference", () => {
  it.each([
    ["horizontal frame", horizontal],
    ["vertical group", vertical]
  ])("infers the golden %s without mutating its snapshot", (_name, fixture) => {
    const before = JSON.stringify(fixture.input);
    const plan = buildResponsivePlan(fixture.input, DEFAULT_CONFIGURATION);

    expect(JSON.stringify(fixture.input)).toBe(before);
    expect(plan.schemaVersion).toBe(1);
    expect(plan.mode).toBe("DUPLICATE");
    expect(plan.disposition).toBe("ready");
    expect(plan.root.strategy).toBe("AUTO_LAYOUT");
    expect(plan.root.layout).toMatchObject({
      direction: fixture.expected.direction,
      wrap: fixture.expected.wrap,
      itemSpacing: fixture.expected.itemSpacing,
      padding: fixture.expected.padding,
      sizing: { minWidth: 240, maxWidth: 1440, minHeight: 48, maxHeight: 1024 }
    });
    expect(plan.root.orderedChildIds).toEqual(fixture.expected.orderedChildIds);
    expect(plan.breakpoints.map(({ name, width }) => ({ name, width }))).toEqual([
      { name: "Desktop", width: 1440 },
      { name: "Tablet", width: 768 },
      { name: "Mobile", width: 375 }
    ]);
    expect(JSON.parse(JSON.stringify(plan))).toEqual(plan);
  });

  it("treats an Instance as atomic and keeps its component reference in the snapshot", () => {
    const snapshot = structuredClone(horizontal.input);
    const instance = snapshot.children[1];
    if (instance === undefined) throw new Error("fixture is missing the instance candidate");
    instance.type = "INSTANCE";
    instance.component = { kind: "INSTANCE", mainComponentId: "component-primary" };
    instance.children = [structuredClone(snapshot.children[0]!)];

    const plan = buildResponsivePlan(snapshot, DEFAULT_CONFIGURATION);
    const instancePlan = plan.root.children.find((child) => child.sourceId === instance.id);

    expect(instancePlan).toMatchObject({ strategy: "ATOMIC", children: [] });
    expect(plan.warnings).toContainEqual(
      expect.objectContaining({ code: "INSTANCE_ATOMIC", severity: "info" })
    );
    expect(snapshot.children[1]?.component?.mainComponentId).toBe("component-primary");
  });

  it("blocks masks, rotations, locked roots, and selections inside Instances", () => {
    const cases: Array<[string, (snapshot: NodeSnapshot) => void]> = [
      ["MASK_UNSUPPORTED", (snapshot) => { snapshot.children[0]!.isMask = true; }],
      ["ROTATION_UNSUPPORTED", (snapshot) => { snapshot.children[0]!.rotation = 12; }],
      ["LOCKED_NODE", (snapshot) => { snapshot.locked = true; }],
      ["INSTANCE_ANCESTOR_UNSUPPORTED", (snapshot) => { snapshot.insideInstance = true; }],
      ["GROUP_BACKGROUND_UNSUPPORTED", (snapshot) => {
        snapshot.children[0]!.type = "GROUP";
        snapshot.children[0]!.hasContainerBackground = true;
      }],
      ["PROTOTYPE_DATA_PRESENT", (snapshot) => {
        snapshot.children[0]!.type = "GROUP";
        snapshot.children[0]!.prototypeReactionCount = 1;
      }],
      ["COMPONENT_DESCENDANT_UNSUPPORTED", (snapshot) => {
        snapshot.children[0]!.type = "COMPONENT";
        snapshot.children[0]!.component = {
          kind: "COMPONENT",
          mainComponentId: null
        };
      }]
    ];

    for (const [code, mutate] of cases) {
      const snapshot = structuredClone(horizontal.input);
      mutate(snapshot);
      const plan = buildResponsivePlan(snapshot, DEFAULT_CONFIGURATION);
      expect(plan.disposition).toBe("unsupported");
      expect(plan.warnings).toContainEqual(expect.objectContaining({ code }));
    }
  });

  it("requires confirmation for risky Absolute children but does not silently drop them", () => {
    const snapshot = structuredClone(horizontal.input);
    snapshot.children[2]!.visible = false;
    const plan = buildResponsivePlan(snapshot, DEFAULT_CONFIGURATION);

    expect(plan.disposition).toBe("confirmation-required");
    expect(plan.root.absoluteChildIds).toEqual(["action-three"]);
    expect(plan.root.warnings).toContainEqual(
      expect.objectContaining({ code: "ABSOLUTE_CHILDREN_PRESERVED" })
    );
  });
});

describe("configuration validation", () => {
  it("rejects invalid bounds and duplicate breakpoint ids", () => {
    expect(() =>
      normalizeConfiguration({
        ...DEFAULT_CONFIGURATION,
        minWidth: 800,
        maxWidth: 400
      })
    ).toThrow(/Minimum width/);

    expect(() =>
      normalizeConfiguration({
        ...DEFAULT_CONFIGURATION,
        breakpoints: [
          { id: "same", name: "Wide", width: 1200 },
          { id: "same", name: "Narrow", width: 400 }
        ]
      })
    ).toThrow(/duplicated/);
  });

  it("blocks plans whose source or breakpoint cannot satisfy configured Min/Max", () => {
    const sourceOutside = buildResponsivePlan(horizontal.input, {
      ...DEFAULT_CONFIGURATION,
      maxWidth: 400
    });
    expect(sourceOutside.disposition).toBe("unsupported");
    expect(sourceOutside.warnings).toContainEqual(
      expect.objectContaining({ code: "SOURCE_OUTSIDE_CONSTRAINTS" })
    );

    const breakpointOutside = buildResponsivePlan(horizontal.input, {
      ...DEFAULT_CONFIGURATION,
      minWidth: 400
    });
    expect(breakpointOutside.disposition).toBe("unsupported");
    expect(breakpointOutside.warnings).toContainEqual(
      expect.objectContaining({ code: "BREAKPOINT_OUTSIDE_CONSTRAINTS" })
    );
  });
});

function loadFixture(name: string): Fixture {
  return JSON.parse(
    readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8")
  ) as Fixture;
}
