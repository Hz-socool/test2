import {
  validateBreakpoint,
  validateSourceWidthFidelity
} from "../core/validation";
import type {
  AxisConstraints,
  BreakpointOverride,
  BreakpointPlan,
  ConversionReport,
  GeometryTree,
  LayoutRules,
  NodeSnapshot,
  ResponsivePlan,
  ResponsivePlanNode
} from "../shared/model";
import { fingerprintSceneNode } from "./snapshot";

interface VariantResult {
  frame: FrameNode;
  geometry: GeometryTree;
}

export async function applyResponsivePlan(
  source: FrameNode | GroupNode,
  sourceSnapshot: NodeSnapshot,
  plan: ResponsivePlan,
  confirmed: boolean
): Promise<ConversionReport> {
  assertPlanCanRun(source, sourceSnapshot, plan, confirmed);
  const sourceFingerprintBefore = await fingerprintSceneNode(source);
  let output: FrameNode | null = null;

  try {
    const container = createOutputContainer(source, plan);
    output = container;
    const base = createVariant(
      source,
      container,
      plan,
      null,
      `${source.name} / Base`,
      plan.source.width,
      true
    );
    const breakpointResults = plan.breakpoints.map((breakpoint) => ({
      breakpoint,
      result: createVariant(
        source,
        container,
        plan,
        breakpoint,
        `${breakpoint.name} / ${breakpoint.width}`,
        breakpoint.width,
        false
      )
    }));

    const sourceFingerprintAfter = await fingerprintSceneNode(source);
    const sourceUnchanged = sourceFingerprintBefore === sourceFingerprintAfter;
    const sourceWidthFidelity = validateSourceWidthFidelity(
      sourceSnapshot,
      base.geometry,
      plan.configuration.fidelityTolerance
    );
    const breakpoints = breakpointResults.map(({ breakpoint, result }) =>
      validateBreakpoint(plan, breakpoint, result.geometry)
    );
    const success =
      sourceUnchanged &&
      sourceWidthFidelity.passed &&
      breakpoints.every((validation) => validation.passed);

    if (!success) {
      container.name = `[VALIDATION FAILED] ${container.name}`;
    }

    figma.currentPage.selection = [container];
    figma.viewport.scrollAndZoomIntoView([container]);

    return {
      success,
      sourceUnchanged,
      sourceWidthFidelity,
      breakpoints,
      outputNodeId: container.id,
      outputName: container.name,
      warnings: plan.warnings
    };
  } catch (error) {
    if (output !== null && !output.removed) output.remove();
    throw error;
  }
}

function assertPlanCanRun(
  source: FrameNode | GroupNode,
  snapshot: NodeSnapshot,
  plan: ResponsivePlan,
  confirmed: boolean
): void {
  if (plan.mode !== "DUPLICATE") {
    throw new Error("Only duplicate conversion mode is supported in the MVP spike.");
  }
  if (plan.source.id !== source.id || snapshot.id !== source.id) {
    throw new Error("Selection changed after analysis; analyze the current selection again.");
  }
  if (
    Math.abs(plan.source.width - source.width) > plan.configuration.fidelityTolerance ||
    Math.abs(plan.source.height - source.height) > plan.configuration.fidelityTolerance
  ) {
    throw new Error("Source geometry changed after analysis; analyze again before conversion.");
  }
  if (plan.disposition === "unsupported") {
    throw new Error("This plan contains a blocker and cannot be converted safely.");
  }
  if (plan.disposition === "confirmation-required" && !confirmed) {
    throw new Error("Explicit confirmation is required for this medium-confidence plan.");
  }
  if (snapshot.insideInstance) {
    throw new Error(
      "An internal Instance descendant cannot be converted independently while preserving its component relationship."
    );
  }
}

function createOutputContainer(
  source: FrameNode | GroupNode,
  plan: ResponsivePlan
): FrameNode {
  const output = figma.createFrame();
  output.name = `${source.name} / Responsive`;
  output.fills = [];
  output.clipsContent = false;
  output.layoutMode = "HORIZONTAL";
  output.layoutWrap = "WRAP";
  output.primaryAxisSizingMode = "AUTO";
  output.counterAxisSizingMode = "AUTO";
  output.itemSpacing = 48;
  output.counterAxisSpacing = 48;
  output.paddingTop = 24;
  output.paddingRight = 24;
  output.paddingBottom = 24;
  output.paddingLeft = 24;

  const absoluteBounds = source.absoluteBoundingBox;
  output.x =
    absoluteBounds === null
      ? source.x + source.width + 80
      : absoluteBounds.x + absoluteBounds.width + 80;
  output.y = absoluteBounds?.y ?? source.y;
  output.setPluginData("responsive-plan", JSON.stringify(plan));
  output.setPluginData("responsive-plan-version", String(plan.schemaVersion));
  return output;
}

function createVariant(
  source: FrameNode | GroupNode,
  output: FrameNode,
  plan: ResponsivePlan,
  breakpoint: BreakpointPlan | null,
  name: string,
  width: number,
  preserveSourceHeight: boolean
): VariantResult {
  const clone = source.clone();

  try {
    output.appendChild(clone);
    const nodeBySourceId = new Map<string, SceneNode>();
    pairSourceAndClone(source, clone, nodeBySourceId);
    const overrides = new Map<string, BreakpointOverride>();
    breakpoint?.overrides.forEach((override) => overrides.set(override.nodeId, override));
    applyPlanBottomUp(plan.root, nodeBySourceId, overrides);

    const rootNode = nodeBySourceId.get(plan.root.sourceId);
    if (rootNode?.type !== "FRAME") {
      throw new Error("Converted variant root is not a Frame.");
    }
    rootNode.name = name;
    setVariantWidth(rootNode, width, preserveSourceHeight, plan.root, overrides);
    rootNode.setPluginData("responsive-source-id", source.id);
    if (breakpoint !== null) {
      rootNode.setPluginData("responsive-breakpoint-id", breakpoint.id);
      rootNode.setPluginData("responsive-breakpoint-width", String(breakpoint.width));
    }

    return {
      frame: rootNode,
      geometry: captureGeometry(rootNode, plan.root, nodeBySourceId)
    };
  } catch (error) {
    if (!clone.removed) clone.remove();
    throw error;
  }
}

function pairSourceAndClone(
  source: SceneNode,
  clone: SceneNode,
  nodeBySourceId: Map<string, SceneNode>
): void {
  nodeBySourceId.set(source.id, clone);
  if (
    (source.type === "FRAME" || source.type === "GROUP") &&
    (clone.type === "FRAME" || clone.type === "GROUP")
  ) {
    const count = Math.min(source.children.length, clone.children.length);
    for (let index = 0; index < count; index += 1) {
      const sourceChild = source.children[index];
      const cloneChild = clone.children[index];
      if (sourceChild !== undefined && cloneChild !== undefined) {
        pairSourceAndClone(sourceChild, cloneChild, nodeBySourceId);
      }
    }
  }
}

function applyPlanBottomUp(
  planNode: ResponsivePlanNode,
  nodeBySourceId: Map<string, SceneNode>,
  overrides: Map<string, BreakpointOverride>
): void {
  planNode.children.forEach((child) =>
    applyPlanBottomUp(child, nodeBySourceId, overrides)
  );
  if (planNode.strategy !== "AUTO_LAYOUT" || planNode.layout === null) return;

  let node = nodeBySourceId.get(planNode.sourceId);
  if (node === undefined) {
    throw new Error(`Duplicate node for '${planNode.sourceName}' is missing.`);
  }
  if (node.type === "INSTANCE") {
    throw new Error("An Instance boundary reached the structural applier unexpectedly.");
  }
  if (node.type === "GROUP") {
    node = convertClonedGroup(node, planNode.sourceId, nodeBySourceId);
  }
  if (node.type !== "FRAME") {
    throw new Error(`Node '${planNode.sourceName}' cannot accept Auto Layout writes.`);
  }

  const override = overrides.get(planNode.sourceId) ?? null;
  const effectiveRules = mergeRules(planNode.layout, override);
  applyFrameRules(node, planNode, effectiveRules, override, nodeBySourceId);
}

function convertClonedGroup(
  group: GroupNode,
  sourceId: string,
  nodeBySourceId: Map<string, SceneNode>
): FrameNode {
  const parent = group.parent;
  if (parent === null || !("insertChild" in parent)) {
    throw new Error("The duplicated Group has no writable parent.");
  }

  const index = parent.children.indexOf(group);
  const frame = figma.createFrame();
  parent.insertChild(Math.max(0, index), frame);
  frame.name = group.name;
  frame.resizeWithoutConstraints(group.width, group.height);
  frame.x = group.x;
  frame.y = group.y;
  frame.rotation = group.rotation;
  frame.visible = group.visible;
  frame.opacity = group.opacity;
  frame.blendMode = group.blendMode;
  frame.clipsContent = false;
  frame.fills = [];

  const childPositions = [...group.children].map((child) => ({
    child,
    x: child.x,
    y: child.y
  }));
  for (const position of childPositions) {
    frame.appendChild(position.child);
    position.child.x = position.x;
    position.child.y = position.y;
  }

  nodeBySourceId.set(sourceId, frame);
  group.remove();
  return frame;
}

function mergeRules(
  rules: LayoutRules,
  override: BreakpointOverride | null
): LayoutRules {
  if (override === null) return rules;
  return {
    ...rules,
    direction: override.direction ?? rules.direction,
    wrap: override.wrap ?? rules.wrap,
    sizing: {
      ...rules.sizing,
      horizontal: override.horizontalSizing ?? rules.sizing.horizontal,
      vertical: override.verticalSizing ?? rules.sizing.vertical
    }
  };
}

function applyFrameRules(
  frame: FrameNode,
  planNode: ResponsivePlanNode,
  rules: LayoutRules,
  override: BreakpointOverride | null,
  nodeBySourceId: Map<string, SceneNode>
): void {
  const originalSize = { width: frame.width, height: frame.height };
  const absolutePositions = new Map<string, { x: number; y: number }>();
  for (const sourceId of planNode.absoluteChildIds) {
    const child = nodeBySourceId.get(sourceId);
    if (child !== undefined && child.parent === frame) {
      absolutePositions.set(sourceId, { x: child.x, y: child.y });
    }
  }

  const order = override?.childOrder ?? planNode.orderedChildIds;
  order.forEach((sourceId, index) => {
    const child = nodeBySourceId.get(sourceId);
    if (child !== undefined && child.parent === frame) frame.insertChild(index, child);
  });

  if (rules.direction === "VERTICAL" && frame.layoutMode === "HORIZONTAL") {
    frame.layoutWrap = "NO_WRAP";
  }
  frame.layoutMode = rules.direction;
  if (rules.direction === "HORIZONTAL") frame.layoutWrap = rules.wrap;
  frame.itemSpacing = rules.itemSpacing;
  if (rules.direction === "HORIZONTAL" && rules.wrap === "WRAP") {
    frame.counterAxisSpacing = rules.counterAxisSpacing;
  }
  frame.paddingTop = rules.padding.top;
  frame.paddingRight = rules.padding.right;
  frame.paddingBottom = rules.padding.bottom;
  frame.paddingLeft = rules.padding.left;
  frame.primaryAxisAlignItems = rules.primaryAxisAlign;
  frame.counterAxisAlignItems = rules.counterAxisAlign;
  setAxisSizingModes(frame, rules);
  frame.resizeWithoutConstraints(originalSize.width, originalSize.height);
  frame.minWidth = rules.sizing.minWidth;
  frame.maxWidth = rules.sizing.maxWidth;
  frame.minHeight = rules.sizing.minHeight;
  frame.maxHeight = rules.sizing.maxHeight;

  for (const [sourceId, position] of absolutePositions) {
    const child = nodeBySourceId.get(sourceId);
    if (child !== undefined && child.parent === frame && "layoutPositioning" in child) {
      child.layoutPositioning = "ABSOLUTE";
      child.x = position.x;
      child.y = position.y;
    }
  }
  override?.hiddenChildIds.forEach((sourceId) => {
    const child = nodeBySourceId.get(sourceId);
    if (child !== undefined) child.visible = false;
  });
}

function setAxisSizingModes(frame: FrameNode, rules: LayoutRules): void {
  if (rules.direction === "HORIZONTAL") {
    frame.primaryAxisSizingMode = rules.sizing.horizontal === "HUG" ? "AUTO" : "FIXED";
    frame.counterAxisSizingMode = rules.sizing.vertical === "HUG" ? "AUTO" : "FIXED";
  } else {
    frame.primaryAxisSizingMode = rules.sizing.vertical === "HUG" ? "AUTO" : "FIXED";
    frame.counterAxisSizingMode = rules.sizing.horizontal === "HUG" ? "AUTO" : "FIXED";
  }
}

function setVariantWidth(
  frame: FrameNode,
  width: number,
  preserveSourceHeight: boolean,
  rootPlan: ResponsivePlanNode,
  overrides: Map<string, BreakpointOverride>
): void {
  frame.resizeWithoutConstraints(width, frame.height);
  if (preserveSourceHeight || rootPlan.layout === null) return;
  const rules = mergeRules(rootPlan.layout, overrides.get(rootPlan.sourceId) ?? null);
  setAxisSizingModes(frame, rules);
}

function captureGeometry(
  root: FrameNode,
  rootPlan: ResponsivePlanNode,
  nodeBySourceId: Map<string, SceneNode>
): GeometryTree {
  const rootBounds = root.absoluteBoundingBox;
  if (rootBounds === null) throw new Error("Generated root has no measurable bounds.");
  const parentById = new Map<string, string>();
  const visitPlan = (node: ResponsivePlanNode): void => {
    node.children.forEach((child) => {
      parentById.set(child.sourceId, node.sourceId);
      visitPlan(child);
    });
  };
  visitPlan(rootPlan);

  const records = [...parentById.entries()].flatMap(([sourceId, parentSourceId]) => {
    const node = nodeBySourceId.get(sourceId);
    const bounds = node?.absoluteBoundingBox;
    if (node === undefined || bounds == null || node.removed) return [];
    return [
      {
        sourceId,
        parentSourceId,
        bounds: {
          x: round(bounds.x - rootBounds.x),
          y: round(bounds.y - rootBounds.y),
          width: round(bounds.width),
          height: round(bounds.height)
        },
        visible: node.visible,
        layoutPositioning:
          "layoutPositioning" in node && node.layoutPositioning === "ABSOLUTE"
            ? ("ABSOLUTE" as const)
            : ("AUTO" as const)
      }
    ];
  });

  return {
    root: { x: 0, y: 0, width: round(root.width), height: round(root.height) },
    constraints: readConstraints(root, rootPlan),
    records
  };
}

function readConstraints(
  frame: FrameNode,
  rootPlan: ResponsivePlanNode
): AxisConstraints {
  return {
    horizontal: rootPlan.layout?.sizing.horizontal ?? "FIXED",
    vertical: rootPlan.layout?.sizing.vertical ?? "FIXED",
    minWidth: frame.minWidth,
    maxWidth: frame.maxWidth,
    minHeight: frame.minHeight,
    maxHeight: frame.maxHeight
  };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
