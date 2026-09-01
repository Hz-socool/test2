import { buildResponsivePlan } from "./core/inference";
import { applyResponsivePlan } from "./figma/apply";
import {
  getSelectionEligibility,
  snapshotSceneNode
} from "./figma/snapshot";
import type {
  NodeSnapshot,
  PluginRequest,
  PluginResponse,
  ResponsivePlan
} from "./shared/model";

interface AnalysisState {
  source: FrameNode | GroupNode;
  snapshot: NodeSnapshot;
  plan: ResponsivePlan;
}

let analysisState: AnalysisState | null = null;

figma.showUI(__html__, { width: 420, height: 680, themeColors: true });

postSelection();

figma.on("selectionchange", () => {
  analysisState = null;
  postSelection();
});

figma.ui.onmessage = async (request: PluginRequest) => {
  try {
    if (request.type === "ANALYZE") {
      post({ type: "ANALYSIS_STARTED" });
      const eligibility = getSelectionEligibility();
      if (!eligibility.eligible || eligibility.node === null) {
        throw new Error(eligibility.reason);
      }
      const snapshot = await snapshotSceneNode(eligibility.node);
      const plan = buildResponsivePlan(snapshot, request.configuration);
      analysisState = { source: eligibility.node, snapshot, plan };
      post({ type: "ANALYSIS_RESULT", snapshot, plan });
      return;
    }

    if (request.type === "CONVERT") {
      if (analysisState === null) {
        throw new Error("Analyze the current selection before converting it.");
      }
      const eligibility = getSelectionEligibility();
      if (
        !eligibility.eligible ||
        eligibility.node === null ||
        eligibility.node.id !== analysisState.source.id
      ) {
        throw new Error("Selection changed after analysis; analyze again.");
      }
      const liveSnapshot = await snapshotSceneNode(eligibility.node);
      if (JSON.stringify(liveSnapshot) !== JSON.stringify(analysisState.snapshot)) {
        throw new Error("The source changed after analysis; analyze again before conversion.");
      }

      post({ type: "CONVERSION_STARTED" });
      const report = await applyResponsivePlan(
        eligibility.node,
        analysisState.snapshot,
        analysisState.plan,
        request.confirmed
      );
      post({ type: "CONVERSION_RESULT", report });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected plugin error.";
    post({ type: "ERROR", message });
  }
};

function postSelection(): void {
  const eligibility = getSelectionEligibility();
  post({
    type: "SELECTION",
    eligible: eligibility.eligible,
    name: eligibility.name,
    reason: eligibility.reason
  });
}

function post(response: PluginResponse): void {
  figma.ui.postMessage(response);
}
