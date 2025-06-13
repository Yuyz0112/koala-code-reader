import { Node } from "pocketflow";
import { FileItem, SharedStorage } from "./utils/storage";
import { LLM } from "./utils/llm";

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
  llm: LLM;
  runId: string;

  constructor(llm: LLM, runId: string, maxRetries?: number) {
    super(maxRetries);
    this.llm = llm;
    this.runId = runId;
  }

  async prep(shared: SharedStorage): Promise<Pick<SharedStorage, "basic">> {
    return {
      basic: shared.basic,
    };
  }

  async exec(
    prepRes: Pick<SharedStorage, "basic">
  ): Promise<Pick<SharedStorage, "nextFile"> | { askUser: string }> {
    console.log(
      `[${this.runId}] GetEntryFileNode.exec: Starting LLM call for entry file selection`
    );

    const { decision, next_file, ask_user } = await this.llm.getEntryFile(
      prepRes
    );

    console.log(
      `[${this.runId}] GetEntryFileNode.exec: LLM call completed, decision: ${decision}`
    );

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
  runId: string;

  constructor(runId: string, maxRetries?: number) {
    super(maxRetries);
    this.runId = runId;
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
  llm: LLM;
  readFileFromStorage: (
    filePath: string,
    storage: { basic: SharedStorage["basic"] }
  ) => Promise<string>;
  runId: string;

  constructor(
    llm: LLM,
    readFileFromStorage: (
      filePath: string,
      storage: { basic: SharedStorage["basic"] }
    ) => Promise<string>,
    runId: string,
    maxRetries?: number
  ) {
    super(maxRetries);
    this.llm = llm;
    this.readFileFromStorage = readFileFromStorage;
    this.runId = runId;
  }

  async prep(
    shared: SharedStorage
  ): Promise<
    Pick<SharedStorage, "basic" | "nextFile" | "currentFile" | "userFeedback">
  > {
    return {
      basic: shared.basic,
      nextFile: shared.nextFile,
      currentFile: shared.currentFile,
      userFeedback: shared.userFeedback,
    };
  }

  // Step 1 in exec: Determine target file name from user feedback or nextFile
  private getTargetFileName(
    prepRes: Pick<
      SharedStorage,
      "basic" | "nextFile" | "currentFile" | "userFeedback"
    >
  ): string | null {
    if (prepRes.userFeedback?.action === "reject") {
      // User rejected current analysis, re-analyze the same file with reject reason
      const currentFileName = prepRes.currentFile?.name;
      console.log(
        `[${this.runId}] AnalyzeFileNode: Processing reject feedback, re-analyzing current file: ${currentFileName}`
      );

      if (!currentFileName) {
        throw new Error("No current file to re-analyze after reject feedback");
      }

      return currentFileName;
    } else {
      // Normal flow - use next file
      const targetFileName = prepRes.nextFile?.name;
      console.log(
        `[${this.runId}] AnalyzeFileNode: Processing normal flow for file: ${targetFileName}`
      );

      if (!targetFileName) {
        throw new Error("No file specified for analysis");
      }

      return targetFileName;
    }
  }

  // Step 2 in exec: Validate target file exists and hasn't been analyzed yet
  private validateFile(
    fileName: string,
    files: FileItem[]
  ): { error?: string } {
    const targetFile = files.find((file) => file.path === fileName);

    if (!targetFile) {
      return {
        error: "File not found in available files, requesting regeneration",
      };
    }

    if (targetFile.status === "done" && targetFile.summary) {
      return {
        error: "File has already been analyzed, please select a different file",
      };
    }

    return {};
  }

  // Step 3 in exec: Read file content and call LLM to analyze, return analysis result or completion
  private async analyzeFileContent(
    prepRes: Pick<SharedStorage, "basic" | "nextFile" | "userFeedback">,
    targetFileName: string
  ): Promise<Pick<SharedStorage, "currentFile" | "nextFile"> | null> {
    console.log(
      `[${this.runId}] AnalyzeFileNode: Starting file content read for ${targetFileName}`
    );

    const toAnalyzeContent = await this.readFileFromStorage(
      targetFileName,
      prepRes
    );

    console.log(
      `[${this.runId}] AnalyzeFileNode: File content read completed, size: ${toAnalyzeContent.length} chars`
    );

    console.log(
      `[${this.runId}] AnalyzeFileNode: Starting LLM analysis for ${targetFileName}`
    );

    const result = await this.llm.analyzeFile(prepRes, toAnalyzeContent);

    console.log(
      `[${this.runId}] AnalyzeFileNode: LLM analysis completed for ${targetFileName}`
    );

    if ("analysis_complete" in result) {
      console.log(
        `[${this.runId}] AnalyzeFileNode: Analysis marked as complete by LLM`
      );
      return null;
    }

    console.log(
      `[${this.runId}] AnalyzeFileNode: Analysis successful, next file: ${result.next_focus_proposal.next_filename}`
    );

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

  async exec(
    prepRes: Pick<
      SharedStorage,
      "basic" | "nextFile" | "currentFile" | "userFeedback"
    >
  ): Promise<
    | Pick<SharedStorage, "currentFile" | "nextFile">
    | null
    | { needsRegeneration: true; reason: string }
  > {
    console.log(
      `[${this.runId}] AnalyzeFileNode.exec: Starting file analysis process`
    );

    // Step 1: Get target file name
    const targetFileName = this.getTargetFileName(prepRes);

    if (targetFileName === null) {
      // Analysis complete
      return null;
    }

    // Step 2: Validate the target file
    const validation = this.validateFile(targetFileName, prepRes.basic.files);
    if (validation.error) {
      console.log(
        `[${this.runId}] AnalyzeFileNode.exec: File validation failed: ${validation.error}`
      );
      return {
        needsRegeneration: true,
        reason: validation.error,
      };
    }

    // Step 3: Analyze file content
    return await this.analyzeFileContent(prepRes, targetFileName);
  }

  async post(
    shared: SharedStorage,
    _: unknown,
    execRes:
      | Pick<SharedStorage, "currentFile" | "nextFile">
      | null
      | { needsRegeneration: true; reason: string }
  ): Promise<string | undefined> {
    if (!execRes) {
      shared.completed = true;
      // all files analyzed, let reduce node check buffered summaries
      return Actions.DO_REDUCE;
    }

    if ("needsRegeneration" in execRes) {
      // File doesn't exist or already analyzed, treat as user feedback reject to regenerate
      shared.userFeedback = {
        action: "reject",
        reason: execRes.reason,
      };
      return Actions.DO_ANALYZE;
    }

    shared.currentFile = execRes.currentFile;
    shared.nextFile = execRes.nextFile;

    return Actions.ASK_USER_FEEDBACK;
  }
}

export class UserFeedbackNode extends Node {
  runId: string;

  constructor(runId: string, maxRetries?: number) {
    super(maxRetries);
    this.runId = runId;
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
  llm: LLM;
  runId: string;

  constructor(llm: LLM, runId: string, maxRetries?: number) {
    super(maxRetries);
    this.llm = llm;
    this.runId = runId;
  }

  async prep(
    shared: SharedStorage
  ): Promise<
    Pick<
      SharedStorage,
      | "summariesBuffer"
      | "reducedOutput"
      | "currentFile"
      | "userFeedback"
      | "basic"
      | "completed"
    >
  > {
    return {
      summariesBuffer: shared.summariesBuffer,
      reducedOutput: shared.reducedOutput,
      currentFile: shared.currentFile,
      userFeedback: shared.userFeedback,
      basic: shared.basic,
      completed: shared.completed,
    };
  }

  async exec(
    prepRes: Pick<
      SharedStorage,
      | "summariesBuffer"
      | "reducedOutput"
      | "currentFile"
      | "userFeedback"
      | "basic"
      | "completed"
    >
  ): Promise<
    Pick<SharedStorage, "reducedOutput" | "summariesBuffer"> & {
      updatedFiles: FileItem[];
    }
  > {
    console.log(
      `[${this.runId}] ReduceHistoryNode.exec: Starting history reduction process`
    );

    // Step 1: Determine current summary based on user feedback
    let currentSummary = "";
    if (prepRes.userFeedback?.action === "refined") {
      currentSummary = prepRes.userFeedback.userSummary;
      console.log(
        `[${this.runId}] ReduceHistoryNode.exec: Using refined summary from user feedback`
      );
    } else if (prepRes.userFeedback?.action === "accept") {
      currentSummary = prepRes.currentFile?.analysis?.summary || "";
      console.log(
        `[${this.runId}] ReduceHistoryNode.exec: Using accepted summary from analysis`
      );
    } else {
      throw new Error(
        "Unexpected user feedback action: " + prepRes.userFeedback?.action
      );
    }

    // Step 2: Update files with summary and add to summariesBuffer
    const updatedFiles = [...prepRes.basic.files];
    const currentFilePath = prepRes.currentFile?.name;

    if (currentFilePath && currentSummary) {
      console.log(
        `[${this.runId}] ReduceHistoryNode.exec: Updating file status for ${currentFilePath}`
      );

      // Find and update the file with summary and status
      const fileIndex = updatedFiles.findIndex(
        (f) => f.path === currentFilePath
      );
      if (fileIndex !== -1) {
        updatedFiles[fileIndex] = {
          ...updatedFiles[fileIndex],
          summary: currentSummary,
          status: "done" as const,
        };
      }

      prepRes.summariesBuffer.push({
        filename: currentFilePath,
        summary: currentSummary,
      });

      console.log(
        `[${this.runId}] ReduceHistoryNode.exec: Added to summaries buffer, current buffer size: ${prepRes.summariesBuffer.length}`
      );
    }

    if (prepRes.summariesBuffer.length < 5 && !prepRes.completed) {
      console.log(
        `[${this.runId}] ReduceHistoryNode.exec: Buffer not full (${prepRes.summariesBuffer.length}/5) and analysis not completed, skipping LLM reduction`
      );
      return {
        reducedOutput: prepRes.reducedOutput,
        summariesBuffer: prepRes.summariesBuffer,
        updatedFiles,
      };
    }

    // Step 3: Use LLM to reduce history with new information
    console.log(
      `[${this.runId}] ReduceHistoryNode.exec: Starting LLM history reduction with ${prepRes.summariesBuffer.length} summaries`
    );
    const { reduced_output } = await this.llm.reduceHistory({
      basic: { ...prepRes.basic, files: updatedFiles },
      reducedOutput: prepRes.reducedOutput,
      summariesBuffer: prepRes.summariesBuffer,
      userFeedback: prepRes.userFeedback,
    });
    console.log(
      `[${this.runId}] ReduceHistoryNode.exec: LLM history reduction completed`
    );

    return {
      reducedOutput: reduced_output,
      summariesBuffer: [],
      updatedFiles,
    };
  }

  async post(
    shared: SharedStorage,
    _: unknown,
    execRes: Pick<SharedStorage, "reducedOutput" | "summariesBuffer"> & {
      updatedFiles: FileItem[];
    }
  ): Promise<string | undefined> {
    shared.reducedOutput = execRes.reducedOutput;
    shared.summariesBuffer = execRes.summariesBuffer;
    shared.basic.files = execRes.updatedFiles;

    if (shared.completed) {
      return Actions.ALL_FILES_ANALYZED;
    }

    return Actions.DO_ANALYZE;
  }
}

export class FinishNode extends Node {
  runId: string;

  constructor(runId: string, maxRetries?: number) {
    super(maxRetries);
    this.runId = runId;
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
  runId: string;

  constructor(runId: string, maxRetries?: number) {
    super(maxRetries);
    this.runId = runId;
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
  runId: string;

  constructor(runId: string, maxRetries?: number) {
    super(maxRetries);
    this.runId = runId;
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
