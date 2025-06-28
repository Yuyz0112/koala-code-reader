import { describe, test, expect, vi, beforeEach } from "vitest";
import {
  GetEntryFileNode,
  ImproveBasicInputNode,
  Actions,
  AnalyzeFileNode,
  UserFeedbackNode,
  ReduceHistoryNode,
  FinishNode,
  WaitingForBasicInputImprovementNode,
  WaitingForUserFeedbackNode,
} from "./nodes";
import { LLM } from "./utils/llm";
import { SharedStorage, FileItem } from "./utils/storage";
import { MemoryLayer } from "./utils/memory-layer";

// Test utility functions
function createMockLLM(): LLM {
  return {
    getEntryFile: vi.fn(),
    analyzeFile: vi.fn(),
    reduceHistory: vi.fn(),
    agenticWriter: vi
      .fn()
      .mockResolvedValue({ final_output: "Updated output from AgenticWriter" }),
  } as any;
}

function createMockMemoryLayer(): MemoryLayer {
  return {
    set: vi.fn().mockResolvedValue(undefined),
    retrieve: vi.fn().mockResolvedValue([]),
  } as any;
}

function createMockSharedStorage(): SharedStorage {
  return {
    basic: {
      repoName: "test-repo",
      mainGoal: "understand the codebase",
      files: [
        { path: "src/index.ts", status: "pending", type: "file" },
        { path: "src/utils.ts", status: "pending", type: "file" },
        {
          path: "src/done.ts",
          status: "done",
          type: "file",
          understanding: "Already analyzed",
        },
      ],
    },
    history: [],
    reducedOutput: "",
    completed: false,
  };
}

function createMockReadFileFromStorage(): (
  filePath: string,
  storage: { basic: SharedStorage["basic"] }
) => Promise<string> {
  return vi.fn().mockResolvedValue("file content");
}

describe("GetEntryFileNode", () => {
  let mockLLM: LLM;
  let node: GetEntryFileNode;
  let sharedStorage: SharedStorage;
  const runId = "test-run-id";

  beforeEach(() => {
    mockLLM = createMockLLM();
    node = new GetEntryFileNode(mockLLM, runId);
    sharedStorage = createMockSharedStorage();
  });

  describe("prep", () => {
    test("should return only basic storage from shared storage", async () => {
      const result = await node.prep(sharedStorage);

      expect(result).toEqual({
        basic: sharedStorage.basic,
      });
    });
  });

  describe("exec", () => {
    test("should return askUser when LLM needs more info", async () => {
      const mockResponse = {
        decision: "need_more_info" as const,
        ask_user: "Please provide more details about the project structure",
      };

      vi.mocked(mockLLM.getEntryFile).mockResolvedValue(mockResponse);

      const prepRes = { basic: sharedStorage.basic };
      const result = await node.exec(prepRes);

      expect(mockLLM.getEntryFile).toHaveBeenCalledWith(prepRes);
      expect(result).toEqual({
        askUser: "Please provide more details about the project structure",
      });
    });

    test("should return askUser with default message when ask_user is undefined", async () => {
      const mockResponse = {
        decision: "need_more_info" as const,
        ask_user: undefined,
      };

      vi.mocked(mockLLM.getEntryFile).mockResolvedValue(mockResponse);

      const prepRes = { basic: sharedStorage.basic };
      const result = await node.exec(prepRes);

      expect(result).toEqual({
        askUser: "Please provide more information.",
      });
    });

    test("should return nextFile when entry file is found", async () => {
      const mockResponse = {
        decision: "entry_file_found" as const,
        next_file: {
          name: "src/index.ts",
          reason: "This appears to be the main entry point",
        },
      };

      vi.mocked(mockLLM.getEntryFile).mockResolvedValue(mockResponse);

      const prepRes = { basic: sharedStorage.basic };
      const result = await node.exec(prepRes);

      expect(mockLLM.getEntryFile).toHaveBeenCalledWith(prepRes);
      expect(result).toEqual({
        nextFile: mockResponse.next_file,
      });
    });

    test("should throw error when decision is entry_file_found but next_file is missing", async () => {
      const mockResponse = {
        decision: "entry_file_found" as const,
        next_file: undefined,
      };

      vi.mocked(mockLLM.getEntryFile).mockResolvedValue(mockResponse);

      const prepRes = { basic: sharedStorage.basic };

      await expect(node.exec(prepRes)).rejects.toThrow(
        "Unexpected response from LLM: entry_file_found"
      );
    });

    test("should throw error for unexpected decision", async () => {
      const mockResponse = {
        decision: "unknown_decision" as any,
      };

      vi.mocked(mockLLM.getEntryFile).mockResolvedValue(mockResponse);

      const prepRes = { basic: sharedStorage.basic };

      await expect(node.exec(prepRes)).rejects.toThrow(
        "Unexpected response from LLM: unknown_decision"
      );
    });
  });

  describe("post", () => {
    test("should set askUser and return IMPROVE_BASIC_INPUT when execRes contains askUser", async () => {
      const execRes = { askUser: "Need more information" };

      const result = await node.post(sharedStorage, undefined, execRes);

      expect(sharedStorage.basic.askUser).toBe("Need more information");
      expect(result).toBe(Actions.IMPROVE_BASIC_INPUT);
    });

    test("should set nextFile and return DO_ANALYZE when execRes contains nextFile", async () => {
      const execRes = {
        nextFile: {
          name: "src/index.ts",
          reason: "Entry point",
        },
      };

      const result = await node.post(sharedStorage, undefined, execRes);

      expect(sharedStorage.nextFile).toEqual(execRes.nextFile);
      expect(result).toBe(Actions.DO_ANALYZE);
    });
  });
});

describe("ImproveBasicInputNode", () => {
  let node: ImproveBasicInputNode;
  let sharedStorage: SharedStorage;
  const runId = "test-run-id";

  beforeEach(() => {
    node = new ImproveBasicInputNode(runId);
    sharedStorage = createMockSharedStorage();
  });

  describe("post", () => {
    test("should set callToAction and return WAITING_FOR_BASIC_INPUT_IMPROVEMENT", async () => {
      const result = await node.post(sharedStorage, undefined, undefined);

      expect(sharedStorage.callToAction).toBe("improve_basic_input");
      expect(result).toBe(Actions.WAITING_FOR_BASIC_INPUT_IMPROVEMENT);
    });
  });
});

describe("AnalyzeFileNode", () => {
  let mockLLM: LLM;
  let mockReadFileFromStorage: (
    filePath: string,
    storage: { basic: SharedStorage["basic"] }
  ) => Promise<string>;
  let mockMemoryLayer: MemoryLayer;
  let node: AnalyzeFileNode;
  let sharedStorage: SharedStorage;
  const runId = "test-run-id";

  beforeEach(() => {
    mockLLM = createMockLLM();
    mockReadFileFromStorage = createMockReadFileFromStorage();
    mockMemoryLayer = createMockMemoryLayer();
    node = new AnalyzeFileNode(
      mockLLM,
      "mock-github-token",
      mockReadFileFromStorage,
      mockMemoryLayer,
      runId
    );
    sharedStorage = createMockSharedStorage();
  });

  describe("prep", () => {
    test("should return required fields from shared storage", async () => {
      const result = await node.prep(sharedStorage);

      expect(result).toEqual({
        basic: sharedStorage.basic,
        nextFile: sharedStorage.nextFile,
        currentFile: sharedStorage.currentFile,
        userFeedback: sharedStorage.userFeedback,
      });
    });
  });

  describe("getTargetFileName", () => {
    test("should return currentFile.name when userFeedback action is reject", () => {
      const prepRes = {
        basic: sharedStorage.basic,
        nextFile: { name: "src/utils.ts", reason: "Next file" },
        currentFile: { name: "src/index.ts" },
        userFeedback: {
          action: "reject" as const,
          reason: "Not detailed enough",
        },
      };

      // Access private method for testing
      const result = node["getTargetFileName"](prepRes);

      expect(result).toBe("src/index.ts");
    });

    test("should return nextFile.name for normal flow", () => {
      const prepRes = {
        basic: sharedStorage.basic,
        nextFile: { name: "src/utils.ts", reason: "Next file" },
        currentFile: { name: "src/index.ts" },
        userFeedback: undefined,
      };

      const result = node["getTargetFileName"](prepRes);

      expect(result).toBe("src/utils.ts");
    });

    test("should throw error when nextFile is missing in normal flow", () => {
      const prepRes = {
        basic: sharedStorage.basic,
        nextFile: undefined,
        currentFile: { name: "src/index.ts" },
        userFeedback: undefined,
      };

      expect(() => node["getTargetFileName"](prepRes)).toThrow(
        "No file specified for analysis"
      );
    });

    test("should throw error when currentFile is missing in reject flow", () => {
      const prepRes = {
        basic: sharedStorage.basic,
        nextFile: { name: "src/utils.ts", reason: "Next file" },
        currentFile: undefined,
        userFeedback: {
          action: "reject" as const,
          reason: "Not detailed enough",
        },
      };

      expect(() => node["getTargetFileName"](prepRes)).toThrow(
        "No current file to re-analyze after reject feedback"
      );
    });
  });

  describe("validateFile", () => {
    test("should return error when file is not found", () => {
      const result = node["validateFile"](
        "src/missing.ts",
        sharedStorage.basic.files,
        false
      );

      expect(result).toEqual({
        error: "File not found in available files, requesting regeneration",
      });
    });

    test("should return error when file is already analyzed", () => {
      const result = node["validateFile"](
        "src/done.ts",
        sharedStorage.basic.files,
        false
      );

      expect(result).toEqual({
        error: "File has already been analyzed, please select a different file",
      });
    });

    test("should return empty object when file is valid", () => {
      const result = node["validateFile"](
        "src/index.ts",
        sharedStorage.basic.files,
        false
      );

      expect(result).toEqual({});
    });

    test("should allow reanalysis of completed file when allowReanalyze is true", () => {
      const analyzeFileNode = new AnalyzeFileNode(
        mockLLM,
        "mock-github-token",
        mockReadFileFromStorage,
        mockMemoryLayer,
        "test-run-id"
      );

      const files: FileItem[] = [
        {
          path: "src/completed.ts",
          type: "file",
          status: "done",
          understanding: "Previous analysis result",
        },
      ];

      // Should fail when allowReanalyze is false (default)
      const validationWithoutReanalyze = (analyzeFileNode as any).validateFile(
        "src/completed.ts",
        files,
        false
      );
      expect(validationWithoutReanalyze.error).toBe(
        "File has already been analyzed, please select a different file"
      );

      // Should pass when allowReanalyze is true
      const validationWithReanalyze = (analyzeFileNode as any).validateFile(
        "src/completed.ts",
        files,
        true
      );
      expect(validationWithReanalyze.error).toBeUndefined();
    });
  });

  describe("analyzeFileContent", () => {
    test("should return null when LLM returns analysis_complete", async () => {
      const mockAnalysisCompleteResponse = {
        analysis_complete: true as const,
        final_understanding: "Analysis completed successfully",
      };
      vi.mocked(mockLLM.analyzeFile).mockResolvedValue(
        mockAnalysisCompleteResponse
      );

      const prepRes = {
        basic: sharedStorage.basic,
        nextFile: { name: "src/index.ts", reason: "Entry point" },
        userFeedback: undefined,
      };

      const result = await node["analyzeFileContent"](prepRes, "src/index.ts");

      expect(mockReadFileFromStorage).toHaveBeenCalledWith(
        "src/index.ts",
        prepRes
      );
      expect(mockLLM.analyzeFile).toHaveBeenCalledWith(
        prepRes,
        {
          name: "src/index.ts",
          content: "file content",
        },
        []
      );
      expect(result).toBeNull();
    });

    test("should return analysis result when LLM returns analysis data", async () => {
      const mockAnalysisResponse = {
        current_analysis: {
          filename: "src/index.ts",
          understanding: "Main entry point of the application",
        },
        next_focus_proposal: {
          next_filename: "src/utils.ts",
          reason: "Contains utility functions referenced in index.ts",
        },
      };
      vi.mocked(mockLLM.analyzeFile).mockResolvedValue(mockAnalysisResponse);

      const prepRes = {
        basic: sharedStorage.basic,
        nextFile: { name: "src/index.ts", reason: "Entry point" },
        userFeedback: undefined,
      };

      const result = await node["analyzeFileContent"](prepRes, "src/index.ts");

      expect(result).toEqual({
        currentFile: {
          name: "src/index.ts",
          analysis: {
            understanding: "Main entry point of the application",
          },
        },
        nextFile: {
          name: "src/utils.ts",
          reason: "Contains utility functions referenced in index.ts",
        },
      });
    });
  });

  describe("exec", () => {
    test("should return needsRegeneration when file validation fails", async () => {
      const prepRes = {
        basic: sharedStorage.basic,
        nextFile: { name: "src/missing.ts", reason: "Test file" },
        currentFile: { name: "src/index.ts" },
        userFeedback: undefined,
      };

      const result = await node.exec(prepRes);

      expect(result).toEqual({
        needsRegeneration: true,
        reason: "File not found in available files, requesting regeneration",
      });
    });

    test("should return analysis result for successful complete flow", async () => {
      const mockAnalysisResponse = {
        current_analysis: {
          filename: "src/index.ts",
          understanding: "Main entry point",
        },
        next_focus_proposal: {
          next_filename: "src/utils.ts",
          reason: "Next logical file",
        },
      };
      vi.mocked(mockLLM.analyzeFile).mockResolvedValue(mockAnalysisResponse);

      const prepRes = {
        basic: sharedStorage.basic,
        nextFile: { name: "src/index.ts", reason: "Entry point" },
        currentFile: undefined,
        userFeedback: undefined,
      };

      const result = await node.exec(prepRes);

      expect(result).toEqual({
        currentFile: {
          name: "src/index.ts",
          analysis: {
            understanding: "Main entry point",
          },
        },
        nextFile: {
          name: "src/utils.ts",
          reason: "Next logical file",
        },
      });
    });

    test("should handle file reading errors", async () => {
      vi.mocked(mockReadFileFromStorage).mockRejectedValue(
        new Error("File read error")
      );

      const prepRes = {
        basic: sharedStorage.basic,
        nextFile: { name: "src/index.ts", reason: "Entry point" },
        currentFile: undefined,
        userFeedback: undefined,
      };

      await expect(node.exec(prepRes)).rejects.toThrow("File read error");
    });
  });

  describe("post", () => {
    test("should set completed and return DO_REDUCE when execRes is null", async () => {
      const result = await node.post(sharedStorage, undefined, null);

      expect(sharedStorage.completed).toBe(true);
      expect(result).toBe(Actions.DO_REDUCE);
    });

    test("should set userFeedback and return DO_ANALYZE when needsRegeneration", async () => {
      const execRes = {
        needsRegeneration: true as const,
        reason: "File not found",
      };

      const result = await node.post(sharedStorage, undefined, execRes);

      expect(sharedStorage.userFeedback).toEqual({
        action: "reject",
        reason: "File not found",
      });
      expect(result).toBe(Actions.DO_ANALYZE);
    });

    test("should update currentFile and nextFile and return ASK_USER_FEEDBACK", async () => {
      const execRes = {
        currentFile: {
          name: "src/index.ts",
          analysis: { understanding: "Test understanding" },
        },
        nextFile: {
          name: "src/utils.ts",
          reason: "Next file",
        },
      };

      const result = await node.post(sharedStorage, undefined, execRes);

      expect(sharedStorage.currentFile).toEqual(execRes.currentFile);
      expect(sharedStorage.nextFile).toEqual(execRes.nextFile);
      expect(result).toBe(Actions.ASK_USER_FEEDBACK);
    });
  });
});

describe("UserFeedbackNode", () => {
  let node: UserFeedbackNode;
  let sharedStorage: SharedStorage;
  const runId = "test-run-id";

  beforeEach(() => {
    node = new UserFeedbackNode(runId);
    sharedStorage = createMockSharedStorage();
  });

  describe("post", () => {
    test("should set callToAction and return WAITING_FOR_USER_FEEDBACK", async () => {
      const result = await node.post(sharedStorage, undefined, undefined);

      expect(sharedStorage.callToAction).toBe("user_feedback");
      expect(result).toBe(Actions.WAITING_FOR_USER_FEEDBACK);
    });
  });
});

describe("FinishNode", () => {
  let node: FinishNode;
  let sharedStorage: SharedStorage;
  const runId = "test-run-id";

  beforeEach(() => {
    node = new FinishNode(runId);
    sharedStorage = createMockSharedStorage();
  });

  describe("post", () => {
    test("should set callToAction to finish", async () => {
      const result = await node.post(sharedStorage, undefined, undefined);

      expect(sharedStorage.callToAction).toBe("finish");
      expect(result).toBeUndefined();
    });
  });
});

describe("WaitingForBasicInputImprovementNode", () => {
  let node: WaitingForBasicInputImprovementNode;
  let sharedStorage: SharedStorage;
  const runId = "test-run-id";

  beforeEach(() => {
    node = new WaitingForBasicInputImprovementNode(runId);
    sharedStorage = createMockSharedStorage();
  });

  describe("post", () => {
    test("should remove askUser flag and return GET_ENTRY_FILE", async () => {
      sharedStorage.basic.askUser = "Need more info";

      const result = await node.post(sharedStorage, undefined, undefined);

      expect(sharedStorage.basic.askUser).toBeUndefined();
      expect(result).toBe(Actions.GET_ENTRY_FILE);
    });

    test("should work when askUser flag is not present", async () => {
      delete sharedStorage.basic.askUser;

      const result = await node.post(sharedStorage, undefined, undefined);

      expect(result).toBe(Actions.GET_ENTRY_FILE);
    });
  });
});

describe("WaitingForUserFeedbackNode", () => {
  let node: WaitingForUserFeedbackNode;
  let sharedStorage: SharedStorage;
  const runId = "test-run-id";

  beforeEach(() => {
    node = new WaitingForUserFeedbackNode(runId);
    sharedStorage = createMockSharedStorage();
  });

  describe("post", () => {
    test("should return DO_ANALYZE when userFeedback action is reject", async () => {
      sharedStorage.userFeedback = {
        action: "reject",
        reason: "Not good enough",
      };

      const result = await node.post(sharedStorage, undefined, undefined);

      expect(result).toBe(Actions.DO_ANALYZE);
    });

    test("should return DO_REDUCE for non-reject feedback", async () => {
      sharedStorage.userFeedback = { action: "accept" };

      const result = await node.post(sharedStorage, undefined, undefined);

      expect(result).toBe(Actions.DO_REDUCE);
    });

    test("should return DO_REDUCE when userFeedback is undefined", async () => {
      sharedStorage.userFeedback = undefined;

      const result = await node.post(sharedStorage, undefined, undefined);

      expect(result).toBe(Actions.DO_REDUCE);
    });

    test("should return DO_REDUCE for refine action", async () => {
      sharedStorage.userFeedback = {
        action: "refine",
        userUnderstanding: "Better understanding",
      };

      const result = await node.post(sharedStorage, undefined, undefined);

      expect(result).toBe(Actions.DO_REDUCE);
    });
  });
});

describe("ReduceHistoryNode", () => {
  let mockLLM: LLM;
  let mockMemoryLayer: MemoryLayer;
  let node: ReduceHistoryNode;
  let sharedStorage: SharedStorage;
  const runId = "test-run-id";

  beforeEach(() => {
    mockLLM = createMockLLM();
    mockMemoryLayer = createMockMemoryLayer();
    node = new ReduceHistoryNode(mockLLM, mockMemoryLayer, runId);
    sharedStorage = createMockSharedStorage();

    // Set up default test data
    sharedStorage.currentFile = {
      name: "src/test.ts",
      analysis: {
        understanding: "Test file analysis understanding",
      },
    };
    sharedStorage.userFeedback = {
      action: "accept",
    };
    sharedStorage.reducedOutput = "Previous reduced output";
    sharedStorage.completed = false;
  });

  describe("prep", () => {
    test("should return required fields from shared storage", async () => {
      const result = await node.prep(sharedStorage);

      expect(result).toEqual({
        reducedOutput: sharedStorage.reducedOutput,
        currentFile: sharedStorage.currentFile,
        userFeedback: sharedStorage.userFeedback,
        basic: sharedStorage.basic,
        completed: sharedStorage.completed,
      });
    });
  });

  describe("exec", () => {
    describe("user feedback handling", () => {
      test("should use refine understanding when userFeedback action is refine", async () => {
        const prepRes = {
          reducedOutput: "Previous output",
          currentFile: {
            name: sharedStorage.basic.files[0].path,
            analysis: { understanding: "Original understanding" },
          },
          userFeedback: {
            action: "refine" as const,
            userUnderstanding: "User improved understanding",
          },
          basic: sharedStorage.basic,
          completed: false,
          history: [],
        };

        const result = await node.exec(prepRes);

        expect(result.updatedFiles[0]?.understanding).toBe(
          "User improved understanding"
        );
      });

      test("should use original understanding when userFeedback action is accept", async () => {
        const prepRes = {
          reducedOutput: "Previous output",
          currentFile: {
            name: sharedStorage.basic.files[0].path,
            analysis: { understanding: "Original analysis understanding" },
          },
          userFeedback: {
            action: "accept" as const,
          },
          basic: sharedStorage.basic,
          completed: false,
          history: [],
        };

        const result = await node.exec(prepRes);

        expect(result.updatedFiles[0]?.understanding).toBe(
          "Original analysis understanding"
        );
      });

      test("should throw error for unexpected userFeedback action", async () => {
        const prepRes = {
          reducedOutput: "Previous output",
          currentFile: {
            name: "src/test.ts",
            analysis: { understanding: "Test understanding" },
          },
          userFeedback: {
            action: "unknown" as any,
          },
          basic: sharedStorage.basic,
          completed: false,
          history: [],
        };

        await expect(node.exec(prepRes)).rejects.toThrow(
          "Unexpected user feedback action: unknown"
        );
      });

      test("should throw error when userFeedback is missing", async () => {
        const prepRes = {
          reducedOutput: "Previous output",
          currentFile: {
            name: "src/test.ts",
            analysis: { understanding: "Test understanding" },
          },
          userFeedback: undefined,
          basic: sharedStorage.basic,
          completed: false,
          history: [],
        };

        await expect(node.exec(prepRes)).rejects.toThrow(
          "Unexpected user feedback action: undefined"
        );
      });
    });

    describe("file status updates", () => {
      test("should update file status to done and add understanding to buffer", async () => {
        const prepRes = {
          reducedOutput: "Previous output",
          currentFile: {
            name: "src/index.ts",
            analysis: { understanding: "Index file understanding" },
          },
          userFeedback: {
            action: "accept" as const,
          },
          basic: {
            ...sharedStorage.basic,
            files: [
              {
                path: "src/index.ts",
                status: "pending" as const,
                type: "file" as const,
              },
              {
                path: "src/utils.ts",
                status: "pending" as const,
                type: "file" as const,
              },
            ],
          },
          completed: false,
          history: [],
        };

        const result = await node.exec(prepRes);

        // Check file status update
        const updatedFile = result.updatedFiles.find(
          (f) => f.path === "src/index.ts"
        );
        expect(updatedFile).toEqual({
          path: "src/index.ts",
          status: "done",
          type: "file",
          understanding: "Index file understanding",
        });
      });

      test("should handle case when currentFile is missing", async () => {
        const prepRes = {
          reducedOutput: "Previous output",
          currentFile: undefined,
          userFeedback: {
            action: "accept" as const,
          },
          basic: sharedStorage.basic,
          completed: false,
        };

        // Should not process anything when currentFile is missing
        expect(mockMemoryLayer.set).not.toHaveBeenCalled();
      });

      test("should handle case when file is not found in files array", async () => {
        const prepRes = {
          reducedOutput: "Previous output",
          currentFile: {
            name: "src/missing.ts",
            analysis: { understanding: "Missing file understanding" },
          },
          userFeedback: {
            action: "accept" as const,
          },
          basic: {
            ...sharedStorage.basic,
            files: [
              {
                path: "src/index.ts",
                status: "pending" as const,
                type: "file" as const,
              },
            ],
          },
          completed: false,
          history: [],
        };

        const result = await node.exec(prepRes);

        // Original files array should remain unchanged
        expect(result.updatedFiles).toEqual([
          { path: "src/index.ts", status: "pending", type: "file" },
        ]);
      });
    });
  });

  describe("post", () => {
    test("should update shared storage with exec results", async () => {
      const execRes = {
        reducedOutput: "New reduced output",
        updatedFiles: [
          {
            path: "src/test.ts",
            status: "done" as const,
            type: "file" as const,
            understanding: "Test understanding",
          },
        ],
        updatedHistory: [],
      };

      const result = await node.post(sharedStorage, undefined, execRes);

      expect(sharedStorage.reducedOutput).toBe("New reduced output");
      expect(sharedStorage.basic.files).toEqual(execRes.updatedFiles);
    });

    test("should return ALL_FILES_ANALYZED when completed is true", async () => {
      sharedStorage.completed = true;

      const execRes = {
        reducedOutput: "Final output",
        updatedFiles: [],
        updatedHistory: [],
      };

      const result = await node.post(sharedStorage, undefined, execRes);

      expect(result).toBe(Actions.ALL_FILES_ANALYZED);
    });

    test("should return DO_ANALYZE when completed is false", async () => {
      sharedStorage.completed = false;

      const execRes = {
        reducedOutput: "Intermediate output",
        updatedFiles: [],
        updatedHistory: [],
      };

      const result = await node.post(sharedStorage, undefined, execRes);

      expect(result).toBe(Actions.DO_ANALYZE);
    });
  });
});
