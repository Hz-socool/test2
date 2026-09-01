import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

type LayerType = "FRAME" | "GROUP" | "TEXT" | "RECTANGLE" | "ELLIPSE" | "VECTOR" | "INSTANCE";
type Strategy = "AUTO_LAYOUT" | "ATOMIC" | "SKIP";
type Disposition = "ready" | "confirmation-required" | "unsupported";

interface GoldenNode {
  id: string;
  parentId: string;
  type: LayerType;
  x: number;
  y: number;
  width: number;
  height: number;
  visible?: boolean;
  locked?: boolean;
  rotation?: number;
  isMask?: boolean;
  missingFont?: boolean;
  componentReferenceId?: string;
}

interface GoldenFixture {
  id: string;
  title: string;
  pattern: string;
  input: {
    root: { id: string; type: LayerType; width: number; height: number; locked?: boolean };
    nodes: GoldenNode[];
  };
  expected: {
    geometryTolerance: number;
    disposition: Disposition;
    root: {
      direction: "HORIZONTAL" | "VERTICAL";
      wrap: "WRAP" | "NO_WRAP";
      itemSpacing: number;
      counterAxisSpacing: number;
      padding: { top: number; right: number; bottom: number; left: number };
      sizing: Record<string, string | number | null>;
      flowChildIds: string[];
      absoluteChildIds: string[];
    };
    hierarchy: Array<{
      id: string;
      parentId: string | null;
      strategy: Strategy;
      flowChildIds: string[];
      absoluteChildIds: string[];
    }>;
    breakpoints: Array<{ id: string; overrides: Array<Record<string, unknown>> }>;
    preserve: { contentIds: string[]; visualStyleIds: string[]; componentReferenceIds: string[] };
  };
}

interface GoldenDocument {
  schemaVersion: number;
  geometryTolerance: number;
  breakpoints: Array<{ id: string; name: string; width: number }>;
  fixtures: GoldenFixture[];
}

interface EdgeCase {
  id: string;
  risk: string;
  input: {
    root: { id: string; type: LayerType; width: number; height: number; locked?: boolean };
    nodes: GoldenNode[];
  };
  expected: {
    disposition: Disposition;
    rootStrategy: Strategy;
    atomicIds: string[];
    absoluteIds: string[];
    skippedIds: string[];
    [key: string]: unknown;
  };
}

interface EdgeDocument {
  schemaVersion: number;
  cases: EdgeCase[];
}

const p0 = load<GoldenDocument>("./golden/p0-fixtures.json");
const edges = load<EdgeDocument>("./golden/edge-cases.json");

const requiredPatterns = [
  "button",
  "navigation",
  "card",
  "form",
  "list",
  "toolbar",
  "nested-layout",
  "wrap",
  "min-max",
  "breakpoint-structural-change"
];

describe("independent P0 golden fixture contract", () => {
  it("covers every required P0 pattern exactly once", () => {
    expect(p0.schemaVersion).toBe(1);
    expect(p0.geometryTolerance).toBe(2);
    expect(p0.fixtures.map((fixture) => fixture.pattern)).toEqual(requiredPatterns);
    expect(new Set(p0.fixtures.map((fixture) => fixture.id)).size).toBe(p0.fixtures.length);
  });

  it.each(p0.fixtures)("is deterministic and complete: $id", (fixture) => {
    expect(fixture.expected.geometryTolerance).toBe(2);
    expect(fixture.input.root.type === "FRAME" || fixture.input.root.type === "GROUP").toBe(true);
    expect(fixture.input.root.width).toBeGreaterThan(0);
    expect(fixture.input.root.height).toBeGreaterThan(0);

    const inputIds = new Set([fixture.input.root.id, ...fixture.input.nodes.map((node) => node.id)]);
    expect(inputIds.size).toBe(fixture.input.nodes.length + 1);
    for (const node of fixture.input.nodes) {
      expect(inputIds.has(node.parentId)).toBe(true);
      expect(node.parentId).not.toBe(node.id);
      for (const value of [node.x, node.y, node.width, node.height]) expect(Number.isFinite(value)).toBe(true);
      expect(node.width).toBeGreaterThan(0);
      expect(node.height).toBeGreaterThan(0);
    }

    const hierarchyIds = fixture.expected.hierarchy.map((node) => node.id);
    expect(new Set(hierarchyIds)).toEqual(inputIds);
    expect(fixture.expected.hierarchy.find((node) => node.id === fixture.input.root.id)?.parentId).toBeNull();
    for (const expectedNode of fixture.expected.hierarchy) {
      const inputNode = fixture.input.nodes.find((node) => node.id === expectedNode.id);
      if (expectedNode.id !== fixture.input.root.id) {
        expect(inputNode).toBeDefined();
        expect(expectedNode.parentId).toBe(inputNode?.parentId);
      }
      const childIds = fixture.input.nodes.filter((node) => node.parentId === expectedNode.id).map((node) => node.id);
      expect([...expectedNode.flowChildIds, ...expectedNode.absoluteChildIds].sort()).toEqual(childIds.sort());
      expect(new Set([...expectedNode.flowChildIds, ...expectedNode.absoluteChildIds]).size).toBe(childIds.length);
    }

    const rootExpected = fixture.expected.root;
    const rootHierarchy = fixture.expected.hierarchy.find((node) => node.id === fixture.input.root.id);
    expect(rootHierarchy?.flowChildIds).toEqual(rootExpected.flowChildIds);
    expect(rootHierarchy?.absoluteChildIds).toEqual(rootExpected.absoluteChildIds);
    expect(rootExpected.itemSpacing).toBeGreaterThanOrEqual(0);
    expect(rootExpected.counterAxisSpacing).toBeGreaterThanOrEqual(0);
    for (const value of Object.values(rootExpected.padding)) expect(value).toBeGreaterThanOrEqual(0);
    for (const id of [...fixture.expected.preserve.contentIds, ...fixture.expected.preserve.visualStyleIds, ...fixture.expected.preserve.componentReferenceIds]) expect(inputIds.has(id)).toBe(true);

    expect(fixture.expected.breakpoints.map((breakpoint) => breakpoint.id)).toEqual(p0.breakpoints.map((breakpoint) => breakpoint.id));
    for (const breakpoint of fixture.expected.breakpoints) {
      for (const override of breakpoint.overrides) {
        expect(typeof override.nodeId).toBe("string");
        expect(inputIds.has(override.nodeId as string)).toBe(true);
      }
    }
    expect(JSON.stringify(fixture)).toBe(JSON.stringify(JSON.parse(JSON.stringify(fixture))));
  });

  it("defines deterministic positive breakpoint presets", () => {
    expect(p0.breakpoints).toHaveLength(3);
    expect(new Set(p0.breakpoints.map((breakpoint) => breakpoint.id)).size).toBe(3);
    expect(new Set(p0.breakpoints.map((breakpoint) => breakpoint.width)).size).toBe(3);
    for (const breakpoint of p0.breakpoints) {
      expect(breakpoint.id).not.toBe("");
      expect(breakpoint.name).not.toBe("");
      expect(breakpoint.width).toBeGreaterThan(0);
    }
  });
});

describe("independent safety edge-case contract", () => {
  it("covers all required safety risks", () => {
    expect(edges.schemaVersion).toBe(1);
    expect(edges.cases.map((testCase) => testCase.risk)).toEqual([
      "Instance",
      "Missing font",
      "Locked node",
      "Locked root",
      "Mask",
      "Overlapping flow children",
      "Hidden node",
      "Rotation",
      "Unsupported input"
    ]);
    expect(new Set(edges.cases.map((testCase) => testCase.id)).size).toBe(edges.cases.length);
  });

  it.each(edges.cases)("has an explicit safe action: $id", (testCase) => {
    const ids = new Set([testCase.input.root.id, ...testCase.input.nodes.map((node) => node.id)]);
    expect(testCase.expected.rootStrategy).toMatch(/^(AUTO_LAYOUT|ATOMIC|SKIP)$/);
    for (const id of [...testCase.expected.atomicIds, ...testCase.expected.absoluteIds, ...testCase.expected.skippedIds]) expect(ids.has(id)).toBe(true);
    expect(testCase.expected.mustNot).toBeDefined();
    expect((testCase.expected.mustNot as string[]).length).toBeGreaterThan(0);

    const instanceNodes = testCase.input.nodes.filter((node) => node.type === "INSTANCE");
    if (instanceNodes.length > 0) {
      expect(testCase.expected.preserveComponentReferenceIds).toEqual(instanceNodes.map((node) => node.id));
      expect(testCase.expected.mustNot as string[]).toEqual(expect.arrayContaining(["detach-instance", "reparent-instance-descendant"]));
    }
    if (testCase.input.root.locked === true) expect(testCase.expected.disposition).toBe("unsupported");
    if (testCase.input.root.type !== "FRAME" && testCase.input.root.type !== "GROUP") expect(testCase.expected.disposition).toBe("unsupported");
  });
});

function load<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8")) as T;
}
