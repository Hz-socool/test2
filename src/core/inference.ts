import {
  RESPONSIVE_PLAN_VERSION,
  type BreakpointPlan,
  type BreakpointPreset,
  type ConfidenceBand,
  type LayoutDirection,
  type LayoutRules,
  type NodeSnapshot,
  type PlanConfiguration,
  type PlanWarning,
  type ResponsivePlan,
  type ResponsivePlanNode
} from "../shared/model";

export const DEFAULT_BREAKPOINTS: BreakpointPreset[] = [
  { id: "desktop", name: "Desktop", width: 1440 },
  { id: "tablet", name: "Tablet", width: 768 },
  { id: "mobile", name: "Mobile", width: 375 }
];

export const DEFAULT_CONFIGURATION: PlanConfiguration = {
  enableWrap: true,
  minWidth: 240,
  maxWidth: 1440,
  minHeight: 48,
  maxHeight: 1024,
  fidelityTolerance: 2,
  breakpoints: DEFAULT_BREAKPOINTS
};

interface AxisAnalysis {
  direction: LayoutDirection;
  ordered: NodeSnapshot[];
  gaps: number[];
  score: number;
  spacingConsistency: number;
}

interface NodeInferenceContext {
  configuration: PlanConfiguration;
  isRoot: boolean;
}

export function normalizeConfiguration(
  configuration: PlanConfiguration
): PlanConfiguration {
  const breakpoints = configuration.breakpoints.map((breakpoint) => ({
    id: breakpoint.id.trim(),
    name: breakpoint.name.trim(),
    width: round(breakpoint.width)
  }));

  if (breakpoints.length === 0) {
    throw new Error("At least one breakpoint is required.");
  }

  const ids = new Set<string>();
  for (const breakpoint of breakpoints) {
    if (!breakpoint.id || !breakpoint.name || breakpoint.width <= 0) {
      throw new Error("Every breakpoint needs a name, id, and positive width.");
    }
    if (ids.has(breakpoint.id)) {
      throw new Error(`Breakpoint id '${breakpoint.id}' is duplicated.`);
    }
    ids.add(breakpoint.id);
  }

  const minWidth = normalizeBound(configuration.minWidth, "minimum width");
  const maxWidth = normalizeBound(configuration.maxWidth, "maximum width");
  const minHeight = normalizeBound(configuration.minHeight, "minimum height");
  const maxHeight = normalizeBound(configuration.maxHeight, "maximum height");

  if (minWidth !== null && maxWidth !== null && minWidth > maxWidth) {
    throw new Error("Minimum width cannot exceed maximum width.");
  }
  if (minHeight !== null && maxHeight !== null && minHeight > maxHeight) {
    throw new Error("Minimum height cannot exceed maximum height.");
  }
  if (
    !Number.isFinite(configuration.fidelityTolerance) ||
    configuration.fidelityTolerance < 0
  ) {
    throw new Error("Fidelity tolerance must be zero or greater.");
  }

  return {
    enableWrap: configuration.enableWrap,
    minWidth,
    maxWidth,
    minHeight,
    maxHeight,
    fidelityTolerance: round(configuration.fidelityTolerance),
    breakpoints
  };
}

export function buildResponsivePlan(
  snapshot: NodeSnapshot,
  inputConfiguration: PlanConfiguration
): ResponsivePlan {
  const configuration = normalizeConfiguration(inputConfiguration);
  const warnings = [
    ...collectWarnings(snapshot),
    ...collectConfigurationWarnings(snapshot, configuration)
  ];
  const root = inferPlanNode(snapshot, { configuration, isRoot: true });
  const planWarnings = [...warnings, ...collectPlanWarnings(root)];
  const skippedNodeIds = collectSkippedIds(root);
  const selectionSupported = snapshot.type === "FRAME" || snapshot.type === "GROUP";
  const rootLocked = snapshot.locked;
  const hasBlocker = planWarnings.some((warning) => warning.severity === "blocker");
  const confidence = round(
    selectionSupported ? Math.min(root.confidence, rootLocked ? 0.2 : 1) : 0
  );
  const confidenceBand = toConfidenceBand(confidence);
  const disposition =
    !selectionSupported || hasBlocker || confidenceBand === "low"
      ? "unsupported"
      : confidenceBand === "medium" || planWarnings.some(isConfirmationWarning)
        ? "confirmation-required"
        : "ready";

  const reasons = [
    selectionSupported
      ? `Selected ${snapshot.type.toLowerCase()} can be analyzed without writes.`
      : `Selection type ${snapshot.type} is outside the Frame/Group scope.`,
    root.layout === null
      ? "No safe root flow was inferred."
      : `${root.layout.direction.toLowerCase()} flow inferred from child geometry.`,
    "Conversion mode is a duplicate placed on the current page."
  ];

  const breakpoints: BreakpointPlan[] = configuration.breakpoints.map((preset) => ({
    ...preset,
    overrides:
      root.layout === null
        ? []
        : [
            {
              nodeId: root.sourceId,
              direction: null,
              wrap:
                configuration.enableWrap && root.layout.direction === "HORIZONTAL"
                  ? "WRAP"
                  : "NO_WRAP",
              childOrder: root.orderedChildIds,
              hiddenChildIds: snapshot.children
                .filter((child) => !child.visible)
                .map((child) => child.id),
              horizontalSizing: "FIXED",
              verticalSizing: "HUG"
            }
          ]
  }));

  return {
    schemaVersion: RESPONSIVE_PLAN_VERSION,
    mode: "DUPLICATE",
    disposition,
    source: {
      id: snapshot.id,
      name: snapshot.name,
      type: snapshot.type,
      width: snapshot.bounds.width,
      height: snapshot.bounds.height
    },
    configuration,
    root,
    breakpoints,
    insertedWrappers: [],
    confidence,
    confidenceBand,
    reasons,
    warnings: planWarnings,
    skippedNodeIds
  };
}

function inferPlanNode(
  snapshot: NodeSnapshot,
  context: NodeInferenceContext
): ResponsivePlanNode {
  if (isAtomic(snapshot)) {
    return atomicPlan(snapshot);
  }

  const warnings: PlanWarning[] = [];
  const specialChildren = snapshot.children.filter(
    (child) => !child.visible || child.locked || child.isMask || Math.abs(child.rotation) > 0.1
  );
  const flowChildren = snapshot.children.filter(
    (child) => !specialChildren.some((special) => special.id === child.id)
  );

  if (flowChildren.length < 2) {
    warnings.push({
      code: "INSUFFICIENT_FLOW_EVIDENCE",
      severity: "warning",
      nodeId: snapshot.id,
      message: "At least two regular visible children are required to infer a flow."
    });
    return {
      sourceId: snapshot.id,
      sourceName: snapshot.name,
      sourceType: snapshot.type,
      strategy: context.isRoot ? "SKIP" : "ATOMIC",
      confidence: 0.35,
      confidenceBand: "low",
      reasons: ["Not enough child geometry to infer Auto Layout safely."],
      warnings,
      orderedChildIds: snapshot.children.map((child) => child.id),
      absoluteChildIds: specialChildren.map((child) => child.id),
      layout: null,
      children: snapshot.children.map((child) =>
        inferPlanNode(child, { ...context, isRoot: false })
      )
    };
  }

  const horizontal = analyzeAxis(flowChildren, "HORIZONTAL");
  const vertical = analyzeAxis(flowChildren, "VERTICAL");
  const chosen = horizontal.score >= vertical.score ? horizontal : vertical;
  const ambiguity = Math.abs(horizontal.score - vertical.score);
  const overlapCount = chosen.gaps.filter(
    (gap) => gap < -context.configuration.fidelityTolerance
  ).length;
  let confidence =
    chosen.score * 0.72 + chosen.spacingConsistency * 0.18 + ambiguity * 0.1;

  if (snapshot.type === "GROUP") confidence -= 0.04;
  if (specialChildren.length > 0) confidence -= 0.12;
  if (overlapCount > 0) confidence -= Math.min(0.3, overlapCount * 0.12);
  confidence = round(clamp(confidence, 0, 1));

  if (overlapCount > 0) {
    warnings.push({
      code: "FLOW_OVERLAP",
      severity: "warning",
      nodeId: snapshot.id,
      message: "Candidate flow children overlap on the inferred primary axis."
    });
  }
  if (specialChildren.length > 0) {
    warnings.push({
      code: "ABSOLUTE_CHILDREN_PRESERVED",
      severity: "warning",
      nodeId: snapshot.id,
      message: `${specialChildren.length} child node(s) will remain outside the inferred flow.`
    });
  }

  const layout = buildLayoutRules(snapshot, chosen, context);
  const confidenceBand = toConfidenceBand(confidence);

  return {
    sourceId: snapshot.id,
    sourceName: snapshot.name,
    sourceType: snapshot.type,
    strategy: confidenceBand === "low" ? "SKIP" : "AUTO_LAYOUT",
    confidence,
    confidenceBand,
    reasons: [
      `${chosen.direction.toLowerCase()} ordering has geometry score ${chosen.score.toFixed(2)}.`,
      `Spacing consistency score is ${chosen.spacingConsistency.toFixed(2)}.`,
      specialChildren.length === 0
        ? "All visible direct children participate in the inferred flow."
        : "Risky or hidden direct children stay Absolute/preserved."
    ],
    warnings,
    orderedChildIds: chosen.ordered.map((child) => child.id),
    absoluteChildIds: specialChildren.map((child) => child.id),
    layout,
    children: snapshot.children.map((child) =>
      inferPlanNode(child, { ...context, isRoot: false })
    )
  };
}

function analyzeAxis(
  children: NodeSnapshot[],
  direction: LayoutDirection
): AxisAnalysis {
  const primaryStart = (node: NodeSnapshot) =>
    direction === "HORIZONTAL" ? node.bounds.x : node.bounds.y;
  const primarySize = (node: NodeSnapshot) =>
    direction === "HORIZONTAL" ? node.bounds.width : node.bounds.height;
  const crossStart = (node: NodeSnapshot) =>
    direction === "HORIZONTAL" ? node.bounds.y : node.bounds.x;
  const crossSize = (node: NodeSnapshot) =>
    direction === "HORIZONTAL" ? node.bounds.height : node.bounds.width;
  const ordered = [...children].sort(
    (left, right) => primaryStart(left) - primaryStart(right)
  );
  const gaps: number[] = [];

  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1];
    const current = ordered[index];
    if (previous === undefined || current === undefined) continue;
    gaps.push(
      primaryStart(current) - (primaryStart(previous) + primarySize(previous))
    );
  }

  const nonOverlapRatio =
    gaps.filter((gap) => gap >= -0.5).length / Math.max(1, gaps.length);
  const crossCenters = children.map(
    (child) => crossStart(child) + crossSize(child) / 2
  );
  const averageCrossSize =
    children.reduce((sum, child) => sum + crossSize(child), 0) / children.length;
  const crossDrift = range(crossCenters) / Math.max(1, averageCrossSize);
  const alignmentScore = 1 - clamp(crossDrift, 0, 1);
  const primaryCenters = children.map(
    (child) => primaryStart(child) + primarySize(child) / 2
  );
  const primarySpread = range(primaryCenters);
  const crossSpread = range(crossCenters);
  const dominance = primarySpread / Math.max(1, primarySpread + crossSpread);
  const positiveGaps = gaps.filter((gap) => gap >= 0);
  const medianGap = median(positiveGaps);
  const meanDeviation =
    positiveGaps.length === 0
      ? 1
      : positiveGaps.reduce((sum, gap) => sum + Math.abs(gap - medianGap), 0) /
        positiveGaps.length;
  const spacingConsistency =
    positiveGaps.length === 0
      ? 0
      : 1 - clamp(meanDeviation / Math.max(1, medianGap), 0, 1);
  const score = round(
    nonOverlapRatio * 0.5 + alignmentScore * 0.3 + dominance * 0.2
  );

  return {
    direction,
    ordered,
    gaps,
    score,
    spacingConsistency: round(spacingConsistency)
  };
}

function buildLayoutRules(
  snapshot: NodeSnapshot,
  analysis: AxisAnalysis,
  context: NodeInferenceContext
): LayoutRules {
  const children = analysis.ordered;
  const minX = Math.min(...children.map((child) => child.bounds.x));
  const minY = Math.min(...children.map((child) => child.bounds.y));
  const maxX = Math.max(
    ...children.map((child) => child.bounds.x + child.bounds.width)
  );
  const maxY = Math.max(
    ...children.map((child) => child.bounds.y + child.bounds.height)
  );
  const crossAlignment = inferCrossAlignment(children, analysis.direction);
  const nonNegativeGaps = analysis.gaps.filter((gap) => gap >= 0);
  const itemSpacing = round(median(nonNegativeGaps));

  return {
    direction: analysis.direction,
    wrap:
      context.configuration.enableWrap && analysis.direction === "HORIZONTAL"
        ? "WRAP"
        : "NO_WRAP",
    itemSpacing,
    counterAxisSpacing: itemSpacing,
    padding: {
      top: round(Math.max(0, minY)),
      right: round(Math.max(0, snapshot.bounds.width - maxX)),
      bottom: round(Math.max(0, snapshot.bounds.height - maxY)),
      left: round(Math.max(0, minX))
    },
    primaryAxisAlign: "MIN",
    counterAxisAlign: crossAlignment,
    sizing: {
      horizontal: "FIXED",
      vertical: context.isRoot ? "FIXED" : "HUG",
      minWidth: context.isRoot ? context.configuration.minWidth : null,
      maxWidth: context.isRoot ? context.configuration.maxWidth : null,
      minHeight: context.isRoot ? context.configuration.minHeight : null,
      maxHeight: context.isRoot ? context.configuration.maxHeight : null
    }
  };
}

function inferCrossAlignment(
  children: NodeSnapshot[],
  direction: LayoutDirection
): "MIN" | "CENTER" | "MAX" {
  const start = children.map((child) =>
    direction === "HORIZONTAL" ? child.bounds.y : child.bounds.x
  );
  const center = children.map((child) =>
    direction === "HORIZONTAL"
      ? child.bounds.y + child.bounds.height / 2
      : child.bounds.x + child.bounds.width / 2
  );
  const end = children.map((child) =>
    direction === "HORIZONTAL"
      ? child.bounds.y + child.bounds.height
      : child.bounds.x + child.bounds.width
  );
  const candidates: Array<{ alignment: "MIN" | "CENTER" | "MAX"; drift: number }> = [
    { alignment: "MIN", drift: range(start) },
    { alignment: "CENTER", drift: range(center) },
    { alignment: "MAX", drift: range(end) }
  ];
  candidates.sort((left, right) => left.drift - right.drift);
  return candidates[0]?.alignment ?? "MIN";
}

function collectWarnings(snapshot: NodeSnapshot): PlanWarning[] {
  const warnings: PlanWarning[] = [];

  walk(snapshot, (node) => {
    if (node.isMask) {
      warnings.push({
        code: "MASK_UNSUPPORTED",
        severity: "blocker",
        nodeId: node.id,
        message: "Masked compositions are outside the supported spike scope."
      });
    }
    if (Math.abs(node.rotation) > 0.1) {
      warnings.push({
        code: "ROTATION_UNSUPPORTED",
        severity: "blocker",
        nodeId: node.id,
        message: "Rotated geometry cannot be refactored safely by the current inference model."
      });
    }
    if (node.locked) {
      warnings.push({
        code: "LOCKED_NODE",
        severity: node.id === snapshot.id ? "blocker" : "warning",
        nodeId: node.id,
        message: "Locked nodes are preserved and require explicit review."
      });
    }
    if (node.text?.hasMissingFont) {
      warnings.push({
        code: "MISSING_FONT_PRESERVED",
        severity: "warning",
        nodeId: node.id,
        message: "Text has a missing font; content is cloned but text properties are not edited."
      });
    }
    if (node.type === "INSTANCE") {
      warnings.push({
        code: "INSTANCE_ATOMIC",
        severity: "info",
        nodeId: node.id,
        message: "Instance is treated as an atomic child and is never detached or internally reparented."
      });
    }
    if (node.type === "COMPONENT" || node.type === "COMPONENT_SET") {
      warnings.push({
        code: "COMPONENT_DESCENDANT_UNSUPPORTED",
        severity: "blocker",
        nodeId: node.id,
        message: "Cloning a container converts nested main Components to Instances, so this subtree is not zero-loss."
      });
    }
    if (node.prototypeReactionCount > 0) {
      warnings.push({
        code: "PROTOTYPE_DATA_PRESENT",
        severity: node.type === "GROUP" ? "blocker" : "info",
        nodeId: node.id,
        message:
          node.type === "GROUP"
            ? "Group-to-Frame conversion cannot prove prototype-data preservation."
            : "Prototype reactions are retained by cloning; verify them in the generated copy."
      });
    }
    if (node.type === "GROUP" && node.hasContainerBackground) {
      warnings.push({
        code: "GROUP_BACKGROUND_UNSUPPORTED",
        severity: "blocker",
        nodeId: node.id,
        message: "Group-to-Frame conversion cannot preserve a Group background style safely."
      });
    }
  });

  if (snapshot.type !== "FRAME" && snapshot.type !== "GROUP") {
    warnings.push({
      code: "SELECTION_UNSUPPORTED",
      severity: "blocker",
      nodeId: snapshot.id,
      message: "Select exactly one editable Frame or Group."
    });
  }

  if (snapshot.insideInstance) {
    warnings.push({
      code: "INSTANCE_ANCESTOR_UNSUPPORTED",
      severity: "blocker",
      nodeId: snapshot.id,
      message: "An internal Instance descendant cannot be converted independently while preserving its component relationship."
    });
  }

  return warnings;
}

function collectConfigurationWarnings(
  snapshot: NodeSnapshot,
  configuration: PlanConfiguration
): PlanWarning[] {
  const warnings: PlanWarning[] = [];
  const sourceWidthOutside =
    (configuration.minWidth !== null && snapshot.bounds.width < configuration.minWidth) ||
    (configuration.maxWidth !== null && snapshot.bounds.width > configuration.maxWidth);
  const sourceHeightOutside =
    (configuration.minHeight !== null && snapshot.bounds.height < configuration.minHeight) ||
    (configuration.maxHeight !== null && snapshot.bounds.height > configuration.maxHeight);

  if (sourceWidthOutside || sourceHeightOutside) {
    warnings.push({
      code: "SOURCE_OUTSIDE_CONSTRAINTS",
      severity: "blocker",
      nodeId: snapshot.id,
      message: "Configured Min/Max constraints exclude the source size, so source-width fidelity cannot pass."
    });
  }

  for (const breakpoint of configuration.breakpoints) {
    const outside =
      (configuration.minWidth !== null && breakpoint.width < configuration.minWidth) ||
      (configuration.maxWidth !== null && breakpoint.width > configuration.maxWidth);
    if (outside) {
      warnings.push({
        code: "BREAKPOINT_OUTSIDE_CONSTRAINTS",
        severity: "blocker",
        nodeId: snapshot.id,
        message: `${breakpoint.name} width ${breakpoint.width} is outside the configured Min/Max range.`
      });
    }
  }
  return warnings;
}

function isAtomic(snapshot: NodeSnapshot): boolean {
  return (
    snapshot.type === "INSTANCE" ||
    snapshot.type === "COMPONENT" ||
    snapshot.type === "COMPONENT_SET" ||
    (snapshot.type !== "FRAME" && snapshot.type !== "GROUP")
  );
}

function atomicPlan(snapshot: NodeSnapshot): ResponsivePlanNode {
  const reason =
    snapshot.type === "INSTANCE"
      ? "Instance boundary is preserved as an atomic node."
      : "Leaf or unsupported container is not structurally rewritten.";
  return {
    sourceId: snapshot.id,
    sourceName: snapshot.name,
    sourceType: snapshot.type,
    strategy: "ATOMIC",
    confidence: 1,
    confidenceBand: "high",
    reasons: [reason],
    warnings: [],
    orderedChildIds: [],
    absoluteChildIds: [],
    layout: null,
    children: []
  };
}

function collectSkippedIds(root: ResponsivePlanNode): string[] {
  const skipped: string[] = [];
  const visit = (node: ResponsivePlanNode): void => {
    if (node.strategy === "SKIP") skipped.push(node.sourceId);
    node.children.forEach(visit);
  };
  visit(root);
  return skipped;
}

function collectPlanWarnings(root: ResponsivePlanNode): PlanWarning[] {
  const warnings: PlanWarning[] = [];
  const visit = (node: ResponsivePlanNode): void => {
    warnings.push(...node.warnings);
    node.children.forEach(visit);
  };
  visit(root);
  return warnings;
}

function isConfirmationWarning(warning: PlanWarning): boolean {
  return warning.severity === "warning" && warning.code !== "MISSING_FONT_PRESERVED";
}

function walk(snapshot: NodeSnapshot, visitor: (node: NodeSnapshot) => void): void {
  visitor(snapshot);
  snapshot.children.forEach((child) => walk(child, visitor));
}

function normalizeBound(value: number | null, label: string): number | null {
  if (value === null) return null;
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive number or empty.`);
  }
  return round(value);
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const value = sorted[middle];
  if (value === undefined) return 0;
  if (sorted.length % 2 === 1) return value;
  const previous = sorted[middle - 1];
  return previous === undefined ? value : (previous + value) / 2;
}

function range(values: number[]): number {
  return values.length === 0 ? 0 : Math.max(...values) - Math.min(...values);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function toConfidenceBand(confidence: number): ConfidenceBand {
  if (confidence >= 0.8) return "high";
  if (confidence >= 0.6) return "medium";
  return "low";
}
