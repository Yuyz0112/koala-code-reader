import { Node } from "pocketflow";
import { FileItem, SharedStorage, HistoryEntry } from "./utils/storage";
import { LLM } from "./utils/llm";
import { MemoryLayer, StorageContext } from "./utils/memory-layer";

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
  ): Promise<
    | Pick<SharedStorage, "nextFile">
    | { askUser: string }
    | { wrongPath: string }
  > {
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
      const exists = prepRes.basic.files.some((f) => f.path === next_file.name);
      if (!exists) {
        console.warn(
          `[${this.runId}] LLM returned non-existent entry file: ${next_file.name}`
        );
        return { wrongPath: next_file.name };
      }

      return {
        nextFile: next_file,
      };
    }

    throw new Error("Unexpected response from LLM: " + decision);
  }

  async post(
    shared: SharedStorage,
    _: unknown,
    execRes:
      | Pick<SharedStorage, "nextFile">
      | { askUser: string }
      | { wrongPath: string }
  ): Promise<string | undefined> {
    if ("wrongPath" in execRes) {
      shared.basic.previousWrongPath = execRes.wrongPath;
      return Actions.GET_ENTRY_FILE;
    }

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
  githubToken: string;
  readFileFromStorage: (
    filePath: string,
    storage: { basic: SharedStorage["basic"] },
    githubToken: string
  ) => Promise<string>;
  memoryLayer: MemoryLayer; // Required memory layer for context retrieval
  runId: string;

  constructor(
    llm: LLM,
    githubToken: string,
    readFileFromStorage: (
      filePath: string,
      storage: { basic: SharedStorage["basic"] },
      githubToken: string
    ) => Promise<string>,
    memoryLayer: MemoryLayer, // Required parameter before runId
    runId: string,
    maxRetries?: number
  ) {
    super(maxRetries);
    this.llm = llm;
    this.githubToken = githubToken;
    this.readFileFromStorage = readFileFromStorage;
    this.memoryLayer = memoryLayer;
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
    if (prepRes.basic.files.every((f) => f.status !== "pending")) {
      return null;
    }

    if (prepRes.userFeedback?.action === "finish") {
      // User wants to finish analysis early, stop processing more files
      console.log(
        `[${this.runId}] AnalyzeFileNode: User requested to finish analysis early`
      );
      return null;
    }

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
    } else if (
      prepRes.userFeedback?.action === "refine" &&
      prepRes.userFeedback.nextFile
    ) {
      // User provided refined understanding and selected a specific next file
      console.log(
        `[${this.runId}] AnalyzeFileNode: Processing refine feedback with user-selected next file: ${prepRes.userFeedback.nextFile}`
      );
      return prepRes.userFeedback.nextFile;
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
    files: FileItem[],
    allowReanalyze: boolean
  ): { error?: string } {
    const targetFile = files.find((file) => file.path === fileName);

    if (!allowReanalyze && !targetFile) {
      return {
        error: "File not found in available files, requesting regeneration",
      };
    }

    if (
      !allowReanalyze &&
      targetFile?.status === "done" &&
      targetFile.understanding
    ) {
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
      prepRes,
      this.githubToken
    );

    console.log(
      `[${this.runId}] AnalyzeFileNode: File content read completed, size: ${toAnalyzeContent.length} chars`
    );

    // Retrieve relevant context from Memory Layer
    let relevantContexts: string[] = [];
    try {
      console.log(
        `[${this.runId}] AnalyzeFileNode: Retrieving context from memory layer`
      );
      const storageContext: StorageContext = {
        files: prepRes.basic.files,
      };
      relevantContexts = await this.memoryLayer.retrieve(
        targetFileName,
        toAnalyzeContent,
        storageContext,
        { runId: this.runId }
      );
      console.log(
        `[${this.runId}] AnalyzeFileNode: Retrieved ${relevantContexts.length} context items from memory`
      );
    } catch (error) {
      console.warn(
        `[${this.runId}] AnalyzeFileNode: Failed to retrieve memory context:`,
        error
      );
    }

    console.log(
      `[${this.runId}] AnalyzeFileNode: Starting LLM analysis for ${targetFileName}`
    );

    const result = await this.llm.analyzeFile(
      prepRes,
      {
        name: targetFileName,
        content: toAnalyzeContent,
      },
      relevantContexts
    );

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
          understanding: result.current_analysis.understanding,
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
    const allowReanalyze = prepRes.userFeedback?.action === "reject";
    const validation = this.validateFile(
      targetFileName,
      prepRes.basic.files,
      allowReanalyze
    );
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
  memoryLayer: MemoryLayer;
  runId: string;

  constructor(
    llm: LLM,
    memoryLayer: MemoryLayer,
    runId: string,
    maxRetries?: number
  ) {
    super(maxRetries);
    this.llm = llm;
    this.memoryLayer = memoryLayer;
    this.runId = runId;
  }

  async prep(
    shared: SharedStorage
  ): Promise<
    Pick<
      SharedStorage,
      | "reducedOutput"
      | "currentFile"
      | "userFeedback"
      | "basic"
      | "completed"
      | "history"
    >
  > {
    return {
      reducedOutput: shared.reducedOutput,
      currentFile: shared.currentFile,
      userFeedback: shared.userFeedback,
      basic: shared.basic,
      completed: shared.completed,
      history: shared.history,
    };
  }

  async exec(
    prepRes: Pick<
      SharedStorage,
      | "reducedOutput"
      | "currentFile"
      | "userFeedback"
      | "basic"
      | "completed"
      | "history"
    >
  ): Promise<
    Pick<SharedStorage, "reducedOutput"> & {
      updatedFiles: FileItem[];
      updatedHistory: HistoryEntry[];
    }
  > {
    console.log(
      `[${this.runId}] ReduceHistoryNode.exec: Starting history reduction process`
    );

    // Step 1: Determine current understanding based on user feedback
    let currentUnderstanding = "";
    if (prepRes.userFeedback?.action === "refine") {
      currentUnderstanding = prepRes.userFeedback.userUnderstanding;
      console.log(
        `[${this.runId}] ReduceHistoryNode.exec: Using refine understanding from user feedback`
      );
    } else if (
      prepRes.userFeedback?.action === "accept" ||
      prepRes.userFeedback?.action === "finish"
    ) {
      currentUnderstanding = prepRes.currentFile?.analysis?.understanding || "";
      console.log(
        `[${this.runId}] ReduceHistoryNode.exec: Using ${
          prepRes.userFeedback.action === "finish"
            ? "accepted understanding and finishing"
            : "accepted understanding"
        } from analysis`
      );
    } else {
      throw new Error(
        "Unexpected user feedback action: " + prepRes.userFeedback?.action
      );
    }

    // Step 2: Update files with understanding and add to history
    const updatedFiles = [...prepRes.basic.files];
    const currentFilePath = prepRes.currentFile?.name;
    const updatedHistory = [...(prepRes.history || [])];

    if (currentFilePath && currentUnderstanding && prepRes.userFeedback) {
      console.log(
        `[${this.runId}] ReduceHistoryNode.exec: Updating file status for ${currentFilePath}`
      );

      // Find and update the file with understanding and status
      const fileIndex = updatedFiles.findIndex(
        (f) => f.path === currentFilePath
      );
      if (fileIndex !== -1) {
        updatedFiles[fileIndex] = {
          ...updatedFiles[fileIndex],
          understanding: currentUnderstanding,
          status: "done" as const,
        };
      }

      // Add entry to history
      const historyEntry = {
        filePath: currentFilePath,
        feedbackAction: prepRes.userFeedback.action,
        timestamp: Date.now(),
        reason:
          "reason" in prepRes.userFeedback
            ? prepRes.userFeedback.reason
            : undefined,
      };
      updatedHistory.push(historyEntry);

      console.log(
        `[${this.runId}] ReduceHistoryNode.exec: Added history entry for ${currentFilePath} with action ${prepRes.userFeedback.action}`
      );

      // Store final understanding in Memory Layer
      try {
        console.log(
          `[${this.runId}] ReduceHistoryNode.exec: Storing final understanding in memory layer for ${currentFilePath}`
        );
        await this.memoryLayer.set(currentFilePath, currentUnderstanding, {
          runId: this.runId,
          timestamp: Date.now(),
        });
        console.log(
          `[${this.runId}] ReduceHistoryNode.exec: Successfully stored understanding in memory`
        );
      } catch (error) {
        console.warn(
          `[${this.runId}] ReduceHistoryNode.exec: Failed to store understanding in memory:`,
          error
        );
      }

      console.log(
        `[${this.runId}] ReduceHistoryNode.exec: File understanding stored in memory`
      );
    }

    let final_output = prepRes.reducedOutput || "";

    if (prepRes.completed || prepRes.userFeedback?.action === "finish") {
      // Step 3: Use AgenticWriter to generate final output based on memory
      console.log(
        `[${
          this.runId
        }] ReduceHistoryNode.exec: Starting AgenticWriter for final output generation${
          prepRes.userFeedback?.action === "finish"
            ? " (user requested finish)"
            : ""
        }`
      );
      const result = await this.llm.agenticWriter({
        basic: { ...prepRes.basic, files: updatedFiles },
        memoryLayer: this.memoryLayer,
        completed: true,
      });
      final_output = result.final_output;
      console.log(
        `[${this.runId}] ReduceHistoryNode.exec: AgenticWriter completed`
      );
    }

    return {
      reducedOutput: final_output,
      updatedFiles,
      updatedHistory,
    };
  }

  async post(
    shared: SharedStorage,
    _: unknown,
    execRes: Pick<SharedStorage, "reducedOutput"> & {
      updatedFiles: FileItem[];
      updatedHistory: HistoryEntry[];
    }
  ): Promise<string | undefined> {
    shared.reducedOutput = execRes.reducedOutput;
    shared.basic.files = execRes.updatedFiles;
    shared.history = execRes.updatedHistory;

    // Check if user requested to finish early
    if (shared.userFeedback?.action === "finish") {
      shared.completed = true;
      return Actions.ALL_FILES_ANALYZED;
    }

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

    if (shared.userFeedback?.action === "finish") {
      return Actions.DO_REDUCE;
    }

    return Actions.DO_REDUCE;
  }
}
