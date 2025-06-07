import { Flow } from "pocketflow";
import {
  Actions,
  AnalyzeFileNode,
  FinishNode,
  GetEntryFileNode,
  ImproveBasicInputNode,
  ReduceHistoryNode,
  UserFeedbackNode,
} from "./nodes";
import { SharedStorage } from "./utils/storage";

const MAX_RETRIES = 3;

const getEntryFileNode = new GetEntryFileNode(MAX_RETRIES);
const improveBasicInputNode = new ImproveBasicInputNode(MAX_RETRIES);
const analyzeFileNode = new AnalyzeFileNode(MAX_RETRIES);
const userFeedbackNode = new UserFeedbackNode(MAX_RETRIES);
const reduceHistoryNode = new ReduceHistoryNode(MAX_RETRIES);
const finishNode = new FinishNode(MAX_RETRIES);

getEntryFileNode.on(Actions.DO_ANALYZE, analyzeFileNode);
getEntryFileNode.on(Actions.IMPROVE_BASIC_INPUT, improveBasicInputNode);

improveBasicInputNode.on(Actions.GET_ENTRY_FILE, getEntryFileNode);

analyzeFileNode.on(Actions.ASK_USER_FEEDBACK, userFeedbackNode);
analyzeFileNode.on(Actions.DO_REDUCE, reduceHistoryNode);

userFeedbackNode.on(Actions.DO_ANALYZE, analyzeFileNode);
userFeedbackNode.on(Actions.DO_REDUCE, reduceHistoryNode);

reduceHistoryNode.on(Actions.DO_ANALYZE, analyzeFileNode);
reduceHistoryNode.on(Actions.ALL_FILES_ANALYZED, finishNode);

export const flow = new Flow<SharedStorage>(getEntryFileNode);
