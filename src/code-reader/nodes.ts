import { Node } from "pocketflow";
import { SharedStorage } from "./utils/storage";
import { LLM } from "./utils/llm";
import { readFileFromStorage } from "./utils/fs";

export enum Actions {
  IMPROVE_BASIC_INPUT = "improveBasicInput",
  WAITING_FOR_BASIC_INPUT_IMPROVEMENT = "waitingForBasicInputImprovement",
  GET_ENTRY_FILE = "getEntryFile",
  DO_ANALYZE = "doAnalyze",
  ASK_USER_FEEDBACK = "askUserFeedback",
  WAITING_FOR_USER_FEEDBACK = "waitingForUserFeedback",
  DO_REDUCE = "doReduce",
  ALL_FILES_ANALYZED = "allFilesAnalyzed",
}

export class GetEntryFileNode extends Node {
  constructor(maxRetries?: number) {
    super(maxRetries);
  }

  async prep(
    shared: SharedStorage
  ): Promise<Pick<SharedStorage, "basic" | "__ctx">> {
    return {
      basic: shared.basic,
      __ctx: shared.__ctx,
    };
  }

  async exec(
    prepRes: Pick<SharedStorage, "basic" | "__ctx">
  ): Promise<Pick<SharedStorage, "nextFile"> | { askUser: string }> {
    const llm = new LLM(prepRes.__ctx.models);
    const { decision, next_file, ask_user } = await llm.getEntryFile(prepRes);

    if (decision === "need_more_info") {
      return { askUser: ask_user ?? "Please provide more information." };
    }

    if (decision === "entry_file_found" && next_file) {
      return {
        nextFile: next_file,
      };
    }

    throw new Error("Unexpected response from LLM: " + decision);
  }

  async post(
    shared: SharedStorage,
    _: unknown,
    execRes: Pick<SharedStorage, "nextFile"> | { askUser: string }
  ): Promise<string | undefined> {
    if ("askUser" in execRes) {
      shared.basic.askUser = execRes.askUser;
      return Actions.IMPROVE_BASIC_INPUT;
    }

    shared.nextFile = execRes.nextFile;

    return Actions.DO_ANALYZE;
  }
}

export class ImproveBasicInputNode extends Node {
  constructor(maxRetries?: number) {
    super(maxRetries);
  }

  async post(
    shared: SharedStorage,
    _: unknown,
    __: void
  ): Promise<string | undefined> {
    // Set call to action for UI to detect that user input is needed
    // Flow will pause here, waiting for user to provide improved input via API
    shared.callToAction = "improve_basic_input";

    // Return waiting action - this will cause flow to pause
    return Actions.WAITING_FOR_BASIC_INPUT_IMPROVEMENT;
  }
}

export class AnalyzeFileNode extends Node {
  constructor(maxRetries?: number) {
    super(maxRetries);
  }

  async prep(
    shared: SharedStorage
  ): Promise<
    Pick<
      SharedStorage,
      | "basic"
      | "nextFile"
      | "currentFile"
      | "userFeedback"
      | "allSummaries"
      | "__ctx"
    >
  > {
    return {
      basic: shared.basic,
      nextFile: shared.nextFile,
      currentFile: shared.currentFile,
      userFeedback: shared.userFeedback,
      allSummaries: shared.allSummaries,
      __ctx: shared.__ctx,
    };
  }

  async exec(
    prepRes: Pick<
      SharedStorage,
      | "basic"
      | "nextFile"
      | "currentFile"
      | "userFeedback"
      | "allSummaries"
      | "__ctx"
    >
  ): Promise<Pick<SharedStorage, "currentFile" | "nextFile"> | null> {
    const toAnalyzeContent = await readFileFromStorage(
      (prepRes.userFeedback?.action === "reject"
        ? prepRes.currentFile?.name
        : prepRes.nextFile?.name) || "",
      prepRes
    );

    const llm = new LLM(prepRes.__ctx.models);
    const result = await llm.analyzeFile(prepRes, toAnalyzeContent);

    if ("analysis_complete" in result) {
      // Analysis is complete, no more files to analyze
      return null;
    }

    // Continue with next file
    return {
      currentFile: {
        name: result.current_analysis.filename,
        analysis: {
          summary: result.current_analysis.summary,
        },
      },
      nextFile: {
        name: result.next_focus_proposal.next_filename,
        reason: result.next_focus_proposal.reason,
      },
    };
  }

  async post(
    shared: SharedStorage,
    _: unknown,
    execRes: Pick<SharedStorage, "currentFile" | "nextFile"> | null
  ): Promise<string | undefined> {
    if (!execRes) {
      shared.completed = true;
      // all files analyzed, let reduce node check buffered summaries
      return Actions.DO_REDUCE;
    }

    shared.currentFile = execRes.currentFile;
    shared.nextFile = execRes.nextFile;

    return Actions.ASK_USER_FEEDBACK;
  }
}

export class UserFeedbackNode extends Node {
  constructor(maxRetries?: number) {
    super(maxRetries);
  }

  async post(
    shared: SharedStorage,
    _: unknown,
    __: void
  ): Promise<string | undefined> {
    // Set call to action for UI to detect that user feedback is needed
    // Flow will pause here, waiting for user to provide feedback via API
    shared.callToAction = "user_feedback";

    // Return waiting action - this will cause flow to pause
    return Actions.WAITING_FOR_USER_FEEDBACK;
  }
}

export class ReduceHistoryNode extends Node {
  constructor(maxRetries?: number) {
    super(maxRetries);
  }

  async prep(
    shared: SharedStorage
  ): Promise<
    Pick<
      SharedStorage,
      | "allSummaries"
      | "summariesBuffer"
      | "reducedOutput"
      | "currentFile"
      | "userFeedback"
      | "basic"
      | "completed"
      | "__ctx"
    >
  > {
    return {
      allSummaries: shared.allSummaries,
      summariesBuffer: shared.summariesBuffer,
      reducedOutput: shared.reducedOutput,
      currentFile: shared.currentFile,
      userFeedback: shared.userFeedback,
      basic: shared.basic,
      completed: shared.completed,
      __ctx: shared.__ctx,
    };
  }

  async exec(
    prepRes: Pick<
      SharedStorage,
      | "allSummaries"
      | "summariesBuffer"
      | "reducedOutput"
      | "currentFile"
      | "userFeedback"
      | "basic"
      | "completed"
      | "__ctx"
    >
  ): Promise<
    Pick<SharedStorage, "allSummaries" | "reducedOutput" | "summariesBuffer">
  > {
    // Step 1: Determine current summary based on user feedback
    let currentSummary = "";
    if (prepRes.userFeedback?.action === "refined") {
      currentSummary = prepRes.userFeedback.userSummary;
    } else if (prepRes.userFeedback?.action === "accept") {
      currentSummary = prepRes.currentFile?.analysis?.summary || "";
    } else {
      throw new Error(
        "Unexpected user feedback action: " + prepRes.userFeedback?.action
      );
    }

    // Step 2: Add current file & summary to allSummaries
    const updatedAllSummaries = [...prepRes.allSummaries];
    if (prepRes.currentFile?.name && currentSummary) {
      updatedAllSummaries.push({
        filename: prepRes.currentFile.name,
        summary: currentSummary,
      });

      prepRes.summariesBuffer.push({
        filename: prepRes.currentFile.name,
        summary: currentSummary,
      });
    }

    if (prepRes.summariesBuffer.length < 5 && !prepRes.completed) {
      return {
        allSummaries: updatedAllSummaries,
        reducedOutput: prepRes.reducedOutput,
        summariesBuffer: prepRes.summariesBuffer,
      };
    }

    // Step 3: Use LLM to reduce history with new information
    const llm = new LLM(prepRes.__ctx.models);
    const { reduced_output } = await llm.reduceHistory({
      basic: prepRes.basic,
      allSummaries: updatedAllSummaries,
      reducedOutput: prepRes.reducedOutput,
      summariesBuffer: prepRes.summariesBuffer,
      userFeedback: prepRes.userFeedback,
    });

    return {
      allSummaries: updatedAllSummaries,
      reducedOutput: reduced_output,
      summariesBuffer: [],
    };
  }

  async post(
    shared: SharedStorage,
    _: unknown,
    execRes: Pick<
      SharedStorage,
      "allSummaries" | "reducedOutput" | "summariesBuffer"
    >
  ): Promise<string | undefined> {
    shared.reducedOutput = execRes.reducedOutput;
    shared.allSummaries = execRes.allSummaries;
    shared.summariesBuffer = execRes.summariesBuffer;

    if (shared.completed) {
      return Actions.ALL_FILES_ANALYZED;
    }

    return Actions.DO_ANALYZE;
  }
}

export class FinishNode extends Node {
  constructor(maxRetries?: number) {
    super(maxRetries);
  }

  async post(
    shared: SharedStorage,
    _: unknown,
    __: void
  ): Promise<string | undefined> {
    // Set callToAction to indicate the flow is finished and ready for final client interaction
    shared.callToAction = "finish";
    return;
  }
}

export class WaitingForBasicInputImprovementNode extends Node {
  constructor(maxRetries?: number) {
    super(maxRetries);
  }

  async post(
    shared: SharedStorage,
    _: unknown,
    __: void
  ): Promise<string | undefined> {
    // User input has been processed by FlowManager, callToAction has been cleared
    // Remove askUser flag since input has been improved
    if (shared.basic.askUser) {
      delete shared.basic.askUser;
    }

    // FlowManager already cleared callToAction, just proceed to next step
    return Actions.GET_ENTRY_FILE;
  }
}

export class WaitingForUserFeedbackNode extends Node {
  constructor(maxRetries?: number) {
    super(maxRetries);
  }

  async post(
    shared: SharedStorage,
    _: unknown,
    __: void
  ): Promise<string | undefined> {
    // User input has been processed by FlowManager, callToAction has been cleared
    // FlowManager already cleared callToAction, just proceed based on user feedback

    // Determine next flow step based on feedback type
    if (shared.userFeedback?.action === "reject") {
      return Actions.DO_ANALYZE;
    }

    return Actions.DO_REDUCE;
  }
}
