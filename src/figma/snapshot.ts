import type {
  NodeSnapshot,
  RectSnapshot,
  SerializableNodeType
} from "../shared/model";

export interface SelectionEligibility {
  eligible: boolean;
  node: FrameNode | GroupNode | null;
  name: string | null;
  reason: string;
}

export function getSelectionEligibility(): SelectionEligibility {
  const selection = figma.currentPage.selection;
  if (selection.length !== 1) {
    return {
      eligible: false,
      node: null,
      name: null,
      reason: "Select exactly one Frame or Group."
    };
  }

  const node = selection[0];
  if (node === undefined || (node.type !== "FRAME" && node.type !== "GROUP")) {
    return {
      eligible: false,
      node: null,
      name: node?.name ?? null,
      reason: "The selected layer is not a Frame or Group."
    };
  }

  if (node.removed) {
    return {
      eligible: false,
      node: null,
      name: node.name,
      reason: "The selected layer is no longer available."
    };
  }

  return {
    eligible: true,
    node,
    name: node.name,
    reason: node.locked
      ? "The selection is locked; analysis is available but conversion will be blocked."
      : "Ready for non-mutating analysis."
  };
}

export async function snapshotSceneNode(node: SceneNode): Promise<NodeSnapshot> {
  const type = toSerializableType(node.type);
  const children =
    node.type === "FRAME" || node.type === "GROUP"
      ? await Promise.all(node.children.map((child) => snapshotSceneNode(child)))
      : [];
  const absoluteBounds = node.absoluteBoundingBox;

  return {
    id: node.id,
    name: node.name,
    type,
    bounds: {
      x: round(node.x),
      y: round(node.y),
      width: round(node.width),
      height: round(node.height)
    },
    absoluteBounds: absoluteBounds === null ? null : copyRect(absoluteBounds),
    visible: node.visible,
    locked: node.locked,
    rotation:
      "rotation" in node && typeof node.rotation === "number" ? round(node.rotation) : 0,
    isMask: "isMask" in node && node.isMask === true,
    opacity: "opacity" in node && typeof node.opacity === "number" ? node.opacity : 1,
    text:
      node.type === "TEXT"
        ? {
            characterCount: node.characters.length,
            hasMissingFont: node.hasMissingFont,
            autoResize: node.textAutoResize
          }
        : null,
    component: await readComponentReference(node),
    prototypeReactionCount: await readReactionCount(node),
    hasContainerBackground:
      node.type === "GROUP" &&
      (node.backgrounds.length > 0 || node.backgroundStyleId.length > 0),
    insideInstance: hasInstanceAncestor(node),
    children
  };
}

export async function fingerprintSceneNode(node: SceneNode): Promise<string> {
  return JSON.stringify(await snapshotSceneNode(node));
}

async function readComponentReference(
  node: SceneNode
): Promise<NodeSnapshot["component"]> {
  if (node.type === "INSTANCE") {
    const mainComponent = await node.getMainComponentAsync().catch(() => null);
    return {
      kind: "INSTANCE",
      mainComponentId: mainComponent?.id ?? null
    };
  }
  if (node.type === "COMPONENT" || node.type === "COMPONENT_SET") {
    return {
      kind: node.type,
      mainComponentId: null
    };
  }
  return null;
}

async function readReactionCount(node: SceneNode): Promise<number> {
  if ("getReactionsAsync" in node && typeof node.getReactionsAsync === "function") {
    const reactions = await node.getReactionsAsync().catch(() => []);
    return reactions.length;
  }
  return 0;
}

function toSerializableType(type: SceneNode["type"]): SerializableNodeType {
  switch (type) {
    case "FRAME":
    case "GROUP":
    case "TEXT":
    case "RECTANGLE":
    case "ELLIPSE":
    case "LINE":
    case "VECTOR":
    case "BOOLEAN_OPERATION":
    case "INSTANCE":
    case "COMPONENT":
    case "COMPONENT_SET":
    case "SECTION":
      return type;
    default:
      return "OTHER";
  }
}

function hasInstanceAncestor(node: BaseNode): boolean {
  let parent = node.parent;
  while (parent !== null) {
    if (parent.type === "INSTANCE") return true;
    parent = parent.parent;
  }
  return false;
}

function copyRect(rect: Rect): RectSnapshot {
  return {
    x: round(rect.x),
    y: round(rect.y),
    width: round(rect.width),
    height: round(rect.height)
  };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
