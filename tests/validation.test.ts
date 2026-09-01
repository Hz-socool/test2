import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIGURATION, buildResponsivePlan } from "../src/core/inference";
import {
  snapshotToGeometryTree,
  validateBreakpoint,
  validateSourceWidthFidelity
} from "../src/core/validation";
import type { GeometryTree, NodeSnapshot } from "../src/shared/model";

const source = JSON.parse(
  readFileSync(new URL("./fixtures/horizontal-frame.json", import.meta.url), "utf8")
).input as NodeSnapshot;

describe("source-width validation", () => {
  it("passes an unchanged geometry tree", () => {
    const result = validateSourceWidthFidelity(
      source,
      snapshotToGeometryTree(source),
      2
    );
    expect(result.passed).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it("fails when any key-node geometry drifts beyond tolerance", () => {
    const geometry = snapshotToGeometryTree(source);
    geometry.records[0]!.bounds.x += 2.01;
    const result = validateSourceWidthFidelity(source, geometry, 2);

    expect(result.passed).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ code: "SOURCE_GEOMETRY_DRIFT" })
    );
  });
});

describe("breakpoint validation", () => {
  it("passes a wrapped breakpoint with intact constraints and reading order", () => {
    const plan = buildResponsivePlan(source, DEFAULT_CONFIGURATION);
    const breakpoint = plan.breakpoints.find(({ id }) => id === "mobile");
    if (breakpoint === undefined) throw new Error("mobile breakpoint missing");
    const geometry = mobileGeometry();
    const result = validateBreakpoint(plan, breakpoint, geometry);

    expect(result.passed).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it("reports overlap, overflow, order, and Min/Max write failures", () => {
    const plan = buildResponsivePlan(source, DEFAULT_CONFIGURATION);
    const breakpoint = plan.breakpoints.find(({ id }) => id === "mobile");
    if (breakpoint === undefined) throw new Error("mobile breakpoint missing");
    const geometry = mobileGeometry();
    geometry.records[1]!.bounds = { x: -10, y: 16, width: 380, height: 48 };
    geometry.records[2]!.bounds = { x: 16, y: 80, width: 156, height: 48 };
    geometry.constraints.minWidth = null;

    const result = validateBreakpoint(plan, breakpoint, geometry);
    const codes = result.issues.map((issue) => issue.code);

    expect(result.passed).toBe(false);
    expect(codes).toContain("BREAKPOINT_OVERFLOW");
    expect(codes).toContain("BREAKPOINT_OVERLAP");
    expect(codes).toContain("READING_ORDER_MISMATCH");
    expect(codes).toContain("CONSTRAINT_WRITE_MISMATCH");
  });
});

function mobileGeometry(): GeometryTree {
  return {
    root: { x: 0, y: 0, width: 375, height: 140 },
    constraints: {
      horizontal: "FIXED",
      vertical: "HUG",
      minWidth: 240,
      maxWidth: 1440,
      minHeight: 48,
      maxHeight: 1024
    },
    records: [
      {
        sourceId: "action-one",
        parentSourceId: "root-horizontal",
        bounds: { x: 16, y: 16, width: 96, height: 48 },
        visible: true,
        layoutPositioning: "AUTO"
      },
      {
        sourceId: "action-two",
        parentSourceId: "root-horizontal",
        bounds: { x: 124, y: 16, width: 132, height: 48 },
        visible: true,
        layoutPositioning: "AUTO"
      },
      {
        sourceId: "action-three",
        parentSourceId: "root-horizontal",
        bounds: { x: 16, y: 76, width: 156, height: 48 },
        visible: true,
        layoutPositioning: "AUTO"
      }
    ]
  };
}
