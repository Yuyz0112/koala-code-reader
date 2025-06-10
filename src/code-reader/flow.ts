import {
  Actions,
  AnalyzeFileNode,
  FinishNode,
  GetEntryFileNode,
  ImproveBasicInputNode,
  ReduceHistoryNode,
  UserFeedbackNode,
  WaitingForBasicInputImprovementNode,
  WaitingForUserFeedbackNode,
} from "./nodes";
import { SharedStorage } from "./utils/storage";
import { PersistedFlow, KVStore } from "./persisted-flow";
import { LLM, ModelSet } from "./utils/llm";

const MAX_RETRIES = 3;

// Create and configure the flow nodes
export function createFlowNodes(models: ModelSet) {
  const llm = new LLM(models);

  const getEntryFileNode = new GetEntryFileNode(llm, MAX_RETRIES);
  const improveBasicInputNode = new ImproveBasicInputNode(MAX_RETRIES);
  const waitingForBasicInputImprovementNode =
    new WaitingForBasicInputImprovementNode(MAX_RETRIES);
  const analyzeFileNode = new AnalyzeFileNode(llm, MAX_RETRIES);
  const userFeedbackNode = new UserFeedbackNode(MAX_RETRIES);
  const waitingForUserFeedbackNode = new WaitingForUserFeedbackNode(
    MAX_RETRIES
  );
  const reduceHistoryNode = new ReduceHistoryNode(llm, MAX_RETRIES);
  const finishNode = new FinishNode(MAX_RETRIES);

  // Configure node connections
  getEntryFileNode.on(Actions.DO_ANALYZE, analyzeFileNode);
  getEntryFileNode.on(Actions.IMPROVE_BASIC_INPUT, improveBasicInputNode);

  improveBasicInputNode.on(
    Actions.WAITING_FOR_BASIC_INPUT_IMPROVEMENT,
    waitingForBasicInputImprovementNode
  );
  waitingForBasicInputImprovementNode.on(
    Actions.GET_ENTRY_FILE,
    getEntryFileNode
  );

  analyzeFileNode.on(Actions.ASK_USER_FEEDBACK, userFeedbackNode);
  analyzeFileNode.on(Actions.DO_REDUCE, reduceHistoryNode);
  analyzeFileNode.on(Actions.DO_ANALYZE, analyzeFileNode);

  userFeedbackNode.on(
    Actions.WAITING_FOR_USER_FEEDBACK,
    waitingForUserFeedbackNode
  );

  waitingForUserFeedbackNode.on(Actions.DO_ANALYZE, analyzeFileNode);
  waitingForUserFeedbackNode.on(Actions.DO_REDUCE, reduceHistoryNode);

  reduceHistoryNode.on(Actions.DO_ANALYZE, analyzeFileNode);
  reduceHistoryNode.on(Actions.ALL_FILES_ANALYZED, finishNode);

  return getEntryFileNode;
}

// Create a new persisted flow instance
export function createPersistedFlow(
  kvStore: KVStore,
  models: ModelSet,
  runId?: string
): PersistedFlow<SharedStorage> {
  const startNode = createFlowNodes(models);
  return new PersistedFlow<SharedStorage>(startNode, kvStore, runId);
}

// Export the PersistedFlow class and related utilities
export { PersistedFlow, type KVStore } from "./persisted-flow";
export { R2KVStore } from "./utils/r2-kv-store";
