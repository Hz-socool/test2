import type {
  AxisConstraints,
  BreakpointPlan,
  GeometryRecord,
  GeometryTree,
  NodeSnapshot,
  RectSnapshot,
  ResponsivePlan,
  ResponsivePlanNode,
  ValidationIssue,
  ViewportValidation
} from "../shared/model";

export function snapshotToGeometryTree(snapshot: NodeSnapshot): GeometryTree {
  const records: GeometryRecord[] = [];

  const visit = (
    node: NodeSnapshot,
    parentSourceId: string,
    offsetX: number,
    offsetY: number
  ): void => {
    records.push({
      sourceId: node.id,
      parentSourceId,
      bounds: {
        x: round(offsetX + node.bounds.x),
        y: round(offsetY + node.bounds.y),
        width: node.bounds.width,
        height: node.bounds.height
      },
      visible: node.visible,
      layoutPositioning: "AUTO"
    });
    node.children.forEach((child) =>
      visit(child, node.id, offsetX + node.bounds.x, offsetY + node.bounds.y)
    );
  };

  snapshot.children.forEach((child) => visit(child, snapshot.id, 0, 0));

  return {
    root: { x: 0, y: 0, width: snapshot.bounds.width, height: snapshot.bounds.height },
    constraints: emptyConstraints(),
    records
  };
}

export function validateSourceWidthFidelity(
  source: NodeSnapshot,
  candidate: GeometryTree,
  tolerance: number
): ViewportValidation {
  const expected = snapshotToGeometryTree(source);
  const issues: ValidationIssue[] = [];

  compareValue(
    "SOURCE_ROOT_WIDTH",
    source.id,
    "root width",
    expected.root.width,
    candidate.root.width,
    tolerance,
    issues
  );
  compareValue(
    "SOURCE_ROOT_HEIGHT",
    source.id,
    "root height",
    expected.root.height,
    candidate.root.height,
    tolerance,
    issues
  );

  const candidateById = new Map(
    candidate.records.map((record) => [record.sourceId, record])
  );
  for (const expectedRecord of expected.records) {
    const actualRecord = candidateById.get(expectedRecord.sourceId);
    if (actualRecord === undefined) {
      issues.push({
        code: "SOURCE_NODE_MISSING",
        severity: "error",
        nodeIds: [expectedRecord.sourceId],
        message: "A source node is missing from the converted duplicate."
      });
      continue;
    }
    compareRect(expectedRecord, actualRecord, tolerance, issues);
  }

  return {
    id: "source-width",
    name: "Source width",
    width: source.bounds.width,
    passed: issues.length === 0,
    issues
  };
}

export function validateBreakpoint(
  plan: ResponsivePlan,
  breakpoint: BreakpointPlan,
  geometry: GeometryTree
): ViewportValidation {
  const issues: ValidationIssue[] = [];
  const tolerance = plan.configuration.fidelityTolerance;
  const layout = plan.root.layout;

  compareValue(
    "BREAKPOINT_WIDTH",
    plan.source.id,
    "breakpoint width",
    breakpoint.width,
    geometry.root.width,
    tolerance,
    issues
  );

  if (layout !== null) {
    validateConstraintWrites(layout.sizing, geometry.constraints, tolerance, issues);
    validateFlow(plan.root, geometry, tolerance, issues);
  }

  return {
    id: breakpoint.id,
    name: breakpoint.name,
    width: breakpoint.width,
    passed: issues.length === 0,
    issues
  };
}

function validateFlow(
  rootPlan: ResponsivePlanNode,
  geometry: GeometryTree,
  tolerance: number,
  issues: ValidationIssue[]
): void {
  const flowIdSet = new Set(rootPlan.orderedChildIds);
  const flowRecords = geometry.records.filter(
    (record) =>
      record.parentSourceId === rootPlan.sourceId &&
      flowIdSet.has(record.sourceId) &&
      record.visible &&
      record.layoutPositioning === "AUTO"
  );

  for (const record of flowRecords) {
    if (!isContained(record.bounds, geometry.root, tolerance)) {
      issues.push({
        code: "BREAKPOINT_OVERFLOW",
        severity: "error",
        nodeIds: [record.sourceId],
        message: "A flow child extends outside the generated breakpoint frame."
      });
    }
  }

  for (let leftIndex = 0; leftIndex < flowRecords.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < flowRecords.length; rightIndex += 1) {
      const left = flowRecords[leftIndex];
      const right = flowRecords[rightIndex];
      if (left !== undefined && right !== undefined && overlaps(left.bounds, right.bounds, tolerance)) {
        issues.push({
          code: "BREAKPOINT_OVERLAP",
          severity: "error",
          nodeIds: [left.sourceId, right.sourceId],
          message: "Two flow children overlap at this breakpoint."
        });
      }
    }
  }

  const layout = rootPlan.layout;
  if (layout === null) return;
  const actualOrder = [...flowRecords]
    .sort((left, right) => visualComparator(left, right, layout.direction))
    .map((record) => record.sourceId);
  const expectedOrder = rootPlan.orderedChildIds.filter((id) =>
    flowRecords.some((record) => record.sourceId === id)
  );

  if (actualOrder.join("|") !== expectedOrder.join("|")) {
    issues.push({
      code: "READING_ORDER_MISMATCH",
      severity: "error",
      nodeIds: actualOrder,
      message: "Visual reading order differs from the planned child order."
    });
  }
}

function validateConstraintWrites(
  expected: AxisConstraints,
  actual: AxisConstraints,
  tolerance: number,
  issues: ValidationIssue[]
): void {
  const pairs: Array<{
    key: keyof Pick<AxisConstraints, "minWidth" | "maxWidth" | "minHeight" | "maxHeight">;
    label: string;
  }> = [
    { key: "minWidth", label: "minimum width" },
    { key: "maxWidth", label: "maximum width" },
    { key: "minHeight", label: "minimum height" },
    { key: "maxHeight", label: "maximum height" }
  ];

  for (const pair of pairs) {
    const expectedValue = expected[pair.key];
    const actualValue = actual[pair.key];
    const matches =
      expectedValue === null
        ? actualValue === null
        : actualValue !== null && Math.abs(expectedValue - actualValue) <= tolerance;
    if (!matches) {
      issues.push({
        code: "CONSTRAINT_WRITE_MISMATCH",
        severity: "error",
        nodeIds: [],
        message: `Generated ${pair.label} does not match the ResponsivePlan.`
      });
    }
  }
}

function compareRect(
  expected: GeometryRecord,
  actual: GeometryRecord,
  tolerance: number,
  issues: ValidationIssue[]
): void {
  const fields: Array<keyof RectSnapshot> = ["x", "y", "width", "height"];
  const deltas = fields.map((field) =>
    Math.abs(expected.bounds[field] - actual.bounds[field])
  );
  const maximumDelta = Math.max(...deltas);
  if (maximumDelta > tolerance) {
    issues.push({
      code: "SOURCE_GEOMETRY_DRIFT",
      severity: "error",
      nodeIds: [expected.sourceId],
      message: `Converted geometry differs by up to ${round(maximumDelta)} px (tolerance ${tolerance} px).`
    });
  }
}

function compareValue(
  code: string,
  nodeId: string,
  label: string,
  expected: number,
  actual: number,
  tolerance: number,
  issues: ValidationIssue[]
): void {
  const delta = Math.abs(expected - actual);
  if (delta > tolerance) {
    issues.push({
      code,
      severity: "error",
      nodeIds: [nodeId],
      message: `Generated ${label} is ${round(actual)} px; expected ${round(expected)} px (tolerance ${tolerance} px).`
    });
  }
}

function isContained(
  child: RectSnapshot,
  root: RectSnapshot,
  tolerance: number
): boolean {
  return (
    child.x >= -tolerance &&
    child.y >= -tolerance &&
    child.x + child.width <= root.width + tolerance &&
    child.y + child.height <= root.height + tolerance
  );
}

function overlaps(
  left: RectSnapshot,
  right: RectSnapshot,
  tolerance: number
): boolean {
  const horizontal =
    Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x);
  const vertical =
    Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y);
  return horizontal > tolerance && vertical > tolerance;
}

function visualComparator(
  left: GeometryRecord,
  right: GeometryRecord,
  direction: "HORIZONTAL" | "VERTICAL"
): number {
  if (direction === "VERTICAL") {
    return left.bounds.y - right.bounds.y || left.bounds.x - right.bounds.x;
  }
  const sharesRow =
    Math.min(left.bounds.y + left.bounds.height, right.bounds.y + right.bounds.height) -
      Math.max(left.bounds.y, right.bounds.y) >
    0;
  return sharesRow
    ? left.bounds.x - right.bounds.x
    : left.bounds.y - right.bounds.y || left.bounds.x - right.bounds.x;
}

function emptyConstraints(): AxisConstraints {
  return {
    horizontal: "FIXED",
    vertical: "FIXED",
    minWidth: null,
    maxWidth: null,
    minHeight: null,
    maxHeight: null
  };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
