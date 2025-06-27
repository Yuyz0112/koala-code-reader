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
import { MemoryLayer } from "./utils/memory-layer";
import { readFileFromStorage } from "./utils/fs";

const MAX_RETRIES = 3;

// Create and configure the flow nodes
export function createFlowNodes(
  models: ModelSet,
  githubToken: string,
  memoryLayer: MemoryLayer,
  runId: string
) {
  const llm = new LLM(models, githubToken);

  const getEntryFileNode = new GetEntryFileNode(llm, runId, MAX_RETRIES);
  const improveBasicInputNode = new ImproveBasicInputNode(runId, MAX_RETRIES);
  const waitingForBasicInputImprovementNode =
    new WaitingForBasicInputImprovementNode(runId, MAX_RETRIES);
  const analyzeFileNode = new AnalyzeFileNode(
    llm,
    githubToken,
    readFileFromStorage,
    memoryLayer,
    runId,
    MAX_RETRIES
  );
  const userFeedbackNode = new UserFeedbackNode(runId, MAX_RETRIES);
  const waitingForUserFeedbackNode = new WaitingForUserFeedbackNode(
    runId,
    MAX_RETRIES
  );
  const reduceHistoryNode = new ReduceHistoryNode(
    llm,
    memoryLayer,
    runId,
    MAX_RETRIES
  );
  const finishNode = new FinishNode(runId, MAX_RETRIES);

  // Configure node connections
  getEntryFileNode.on(Actions.DO_ANALYZE, analyzeFileNode);
  getEntryFileNode.on(Actions.IMPROVE_BASIC_INPUT, improveBasicInputNode);
  getEntryFileNode.on(Actions.GET_ENTRY_FILE, getEntryFileNode);

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
  githubToken: string,
  memoryLayer: MemoryLayer,
  runId?: string
): PersistedFlow<SharedStorage> {
  const flowRunId =
    runId || `flow-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const startNode = createFlowNodes(
    models,
    githubToken,
    memoryLayer,
    flowRunId
  );
  return new PersistedFlow<SharedStorage>(startNode, kvStore, flowRunId);
}

// Export the PersistedFlow class and related utilities
export { PersistedFlow, type KVStore } from "./persisted-flow";
