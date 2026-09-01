export const RESPONSIVE_PLAN_VERSION = 1 as const;

export type SerializableNodeType =
  | "FRAME"
  | "GROUP"
  | "TEXT"
  | "RECTANGLE"
  | "ELLIPSE"
  | "LINE"
  | "VECTOR"
  | "BOOLEAN_OPERATION"
  | "INSTANCE"
  | "COMPONENT"
  | "COMPONENT_SET"
  | "SECTION"
  | "OTHER";

export interface RectSnapshot {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface NodeSnapshot {
  id: string;
  name: string;
  type: SerializableNodeType;
  bounds: RectSnapshot;
  absoluteBounds: RectSnapshot | null;
  visible: boolean;
  locked: boolean;
  rotation: number;
  isMask: boolean;
  opacity: number;
  text: {
    characterCount: number;
    hasMissingFont: boolean;
    autoResize: string;
  } | null;
  component: {
    kind: "INSTANCE" | "COMPONENT" | "COMPONENT_SET";
    mainComponentId: string | null;
  } | null;
  prototypeReactionCount: number;
  hasContainerBackground: boolean;
  insideInstance: boolean;
  children: NodeSnapshot[];
}

export type LayoutDirection = "HORIZONTAL" | "VERTICAL";
export type LayoutWrap = "NO_WRAP" | "WRAP";
export type AxisSizing = "FIXED" | "HUG" | "FILL";
export type ConfidenceBand = "high" | "medium" | "low";
export type PlanDisposition = "ready" | "confirmation-required" | "unsupported";
export type PlanNodeStrategy = "AUTO_LAYOUT" | "ATOMIC" | "SKIP";

export interface LayoutPadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface AxisConstraints {
  horizontal: AxisSizing;
  vertical: AxisSizing;
  minWidth: number | null;
  maxWidth: number | null;
  minHeight: number | null;
  maxHeight: number | null;
}

export interface LayoutRules {
  direction: LayoutDirection;
  wrap: LayoutWrap;
  itemSpacing: number;
  counterAxisSpacing: number;
  padding: LayoutPadding;
  primaryAxisAlign: "MIN" | "CENTER" | "MAX" | "SPACE_BETWEEN";
  counterAxisAlign: "MIN" | "CENTER" | "MAX" | "BASELINE";
  sizing: AxisConstraints;
}

export interface PlanWarning {
  code: string;
  severity: "info" | "warning" | "blocker";
  nodeId: string | null;
  message: string;
}

export interface ResponsivePlanNode {
  sourceId: string;
  sourceName: string;
  sourceType: SerializableNodeType;
  strategy: PlanNodeStrategy;
  confidence: number;
  confidenceBand: ConfidenceBand;
  reasons: string[];
  warnings: PlanWarning[];
  orderedChildIds: string[];
  absoluteChildIds: string[];
  layout: LayoutRules | null;
  children: ResponsivePlanNode[];
}

export interface BreakpointPreset {
  id: string;
  name: string;
  width: number;
}

export interface BreakpointOverride {
  nodeId: string;
  direction: LayoutDirection | null;
  wrap: LayoutWrap | null;
  childOrder: string[] | null;
  hiddenChildIds: string[];
  horizontalSizing: AxisSizing | null;
  verticalSizing: AxisSizing | null;
}

export interface BreakpointPlan extends BreakpointPreset {
  overrides: BreakpointOverride[];
}

export interface InsertedWrapperPlan {
  id: string;
  parentSourceId: string;
  childSourceIds: string[];
  reason: string;
  confidence: number;
}

export interface PlanConfiguration {
  enableWrap: boolean;
  minWidth: number | null;
  maxWidth: number | null;
  minHeight: number | null;
  maxHeight: number | null;
  fidelityTolerance: number;
  breakpoints: BreakpointPreset[];
}

export interface ResponsivePlan {
  schemaVersion: typeof RESPONSIVE_PLAN_VERSION;
  mode: "DUPLICATE";
  disposition: PlanDisposition;
  source: {
    id: string;
    name: string;
    type: SerializableNodeType;
    width: number;
    height: number;
  };
  configuration: PlanConfiguration;
  root: ResponsivePlanNode;
  breakpoints: BreakpointPlan[];
  insertedWrappers: InsertedWrapperPlan[];
  confidence: number;
  confidenceBand: ConfidenceBand;
  reasons: string[];
  warnings: PlanWarning[];
  skippedNodeIds: string[];
}

export interface GeometryRecord {
  sourceId: string;
  parentSourceId: string;
  bounds: RectSnapshot;
  visible: boolean;
  layoutPositioning: "AUTO" | "ABSOLUTE";
}

export interface GeometryTree {
  root: RectSnapshot;
  constraints: AxisConstraints;
  records: GeometryRecord[];
}

export interface ValidationIssue {
  code: string;
  severity: "warning" | "error";
  nodeIds: string[];
  message: string;
}

export interface ViewportValidation {
  id: string;
  name: string;
  width: number;
  passed: boolean;
  issues: ValidationIssue[];
}

export interface ConversionReport {
  success: boolean;
  sourceUnchanged: boolean;
  sourceWidthFidelity: ViewportValidation;
  breakpoints: ViewportValidation[];
  outputNodeId: string | null;
  outputName: string | null;
  warnings: PlanWarning[];
}

export interface AnalyzeRequest {
  type: "ANALYZE";
  configuration: PlanConfiguration;
}

export interface ConvertRequest {
  type: "CONVERT";
  confirmed: boolean;
}

export type PluginRequest = AnalyzeRequest | ConvertRequest;

export type PluginResponse =
  | { type: "SELECTION"; eligible: boolean; name: string | null; reason: string }
  | { type: "ANALYSIS_STARTED" }
  | { type: "ANALYSIS_RESULT"; snapshot: NodeSnapshot; plan: ResponsivePlan }
  | { type: "CONVERSION_STARTED" }
  | { type: "CONVERSION_RESULT"; report: ConversionReport }
  | { type: "ERROR"; message: string };
