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
import { SharedStorage } from "./utils/storage";

// Test utility functions
function createMockLLM(): LLM {
  return {
    getEntryFile: vi.fn(),
    analyzeFile: vi.fn(),
    reduceHistory: vi.fn(),
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
          summary: "Already analyzed",
        },
      ],
    },
    summariesBuffer: [],
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
  let node: AnalyzeFileNode;
  let sharedStorage: SharedStorage;
  const runId = "test-run-id";

  beforeEach(() => {
    mockLLM = createMockLLM();
    mockReadFileFromStorage = createMockReadFileFromStorage();
    node = new AnalyzeFileNode(mockLLM, mockReadFileFromStorage, runId);
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
        sharedStorage.basic.files
      );

      expect(result).toEqual({
        error: "File not found in available files, requesting regeneration",
      });
    });

    test("should return error when file is already analyzed", () => {
      const result = node["validateFile"](
        "src/done.ts",
        sharedStorage.basic.files
      );

      expect(result).toEqual({
        error: "File has already been analyzed, please select a different file",
      });
    });

    test("should return empty object when file is valid", () => {
      const result = node["validateFile"](
        "src/index.ts",
        sharedStorage.basic.files
      );

      expect(result).toEqual({});
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
      expect(mockLLM.analyzeFile).toHaveBeenCalledWith(prepRes, "file content");
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
            summary: "Main entry point of the application",
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
            summary: "Main entry point",
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
          analysis: { summary: "Test summary" },
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

    test("should return DO_REDUCE for refined action", async () => {
      sharedStorage.userFeedback = {
        action: "refined",
        userSummary: "Better summary",
      };

      const result = await node.post(sharedStorage, undefined, undefined);

      expect(result).toBe(Actions.DO_REDUCE);
    });
  });
});

describe("ReduceHistoryNode", () => {
  let mockLLM: LLM;
  let node: ReduceHistoryNode;
  let sharedStorage: SharedStorage;
  const runId = "test-run-id";

  beforeEach(() => {
    mockLLM = createMockLLM();
    node = new ReduceHistoryNode(mockLLM, runId);
    sharedStorage = createMockSharedStorage();

    // Set up default test data
    sharedStorage.currentFile = {
      name: "src/test.ts",
      analysis: {
        summary: "Test file analysis summary",
      },
    };
    sharedStorage.userFeedback = {
      action: "accept",
    };
    sharedStorage.summariesBuffer = [];
    sharedStorage.reducedOutput = "Previous reduced output";
    sharedStorage.completed = false;
  });

  describe("prep", () => {
    test("should return required fields from shared storage", async () => {
      const result = await node.prep(sharedStorage);

      expect(result).toEqual({
        summariesBuffer: sharedStorage.summariesBuffer,
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
      test("should use refined summary when userFeedback action is refined", async () => {
        const prepRes = {
          summariesBuffer: [],
          reducedOutput: "Previous output",
          currentFile: {
            name: sharedStorage.basic.files[0].path,
            analysis: { summary: "Original summary" },
          },
          userFeedback: {
            action: "refined" as const,
            userSummary: "User improved summary",
          },
          basic: sharedStorage.basic,
          completed: false,
        };

        const result = await node.exec(prepRes);

        expect(result.updatedFiles[0]?.summary).toBe("User improved summary");
        expect(prepRes.summariesBuffer).toContainEqual({
          filename: sharedStorage.basic.files[0].path,
          summary: "User improved summary",
        });
      });

      test("should use original summary when userFeedback action is accept", async () => {
        const prepRes = {
          summariesBuffer: [],
          reducedOutput: "Previous output",
          currentFile: {
            name: sharedStorage.basic.files[0].path,
            analysis: { summary: "Original analysis summary" },
          },
          userFeedback: {
            action: "accept" as const,
          },
          basic: sharedStorage.basic,
          completed: false,
        };

        const result = await node.exec(prepRes);

        expect(result.updatedFiles[0]?.summary).toBe(
          "Original analysis summary"
        );
        expect(prepRes.summariesBuffer).toContainEqual({
          filename: sharedStorage.basic.files[0].path,
          summary: "Original analysis summary",
        });
      });

      test("should throw error for unexpected userFeedback action", async () => {
        const prepRes = {
          summariesBuffer: [],
          reducedOutput: "Previous output",
          currentFile: {
            name: "src/test.ts",
            analysis: { summary: "Test summary" },
          },
          userFeedback: {
            action: "unknown" as any,
          },
          basic: sharedStorage.basic,
          completed: false,
        };

        await expect(node.exec(prepRes)).rejects.toThrow(
          "Unexpected user feedback action: unknown"
        );
      });

      test("should throw error when userFeedback is missing", async () => {
        const prepRes = {
          summariesBuffer: [],
          reducedOutput: "Previous output",
          currentFile: {
            name: "src/test.ts",
            analysis: { summary: "Test summary" },
          },
          userFeedback: undefined,
          basic: sharedStorage.basic,
          completed: false,
        };

        await expect(node.exec(prepRes)).rejects.toThrow(
          "Unexpected user feedback action: undefined"
        );
      });
    });

    describe("file status updates", () => {
      test("should update file status to done and add summary to buffer", async () => {
        const prepRes = {
          summariesBuffer: [],
          reducedOutput: "Previous output",
          currentFile: {
            name: "src/index.ts",
            analysis: { summary: "Index file summary" },
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
          summary: "Index file summary",
        });

        // Check buffer addition
        expect(prepRes.summariesBuffer).toContainEqual({
          filename: "src/index.ts",
          summary: "Index file summary",
        });
      });

      test("should handle case when currentFile is missing", async () => {
        const prepRes = {
          summariesBuffer: [],
          reducedOutput: "Previous output",
          currentFile: undefined,
          userFeedback: {
            action: "accept" as const,
          },
          basic: sharedStorage.basic,
          completed: false,
        };

        const result = await node.exec(prepRes);

        // Should not add anything to buffer when currentFile is missing
        expect(prepRes.summariesBuffer).toHaveLength(0);
        expect(result.summariesBuffer).toHaveLength(0);
      });

      test("should handle case when file is not found in files array", async () => {
        const prepRes = {
          summariesBuffer: [],
          reducedOutput: "Previous output",
          currentFile: {
            name: "src/missing.ts",
            analysis: { summary: "Missing file summary" },
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
        };

        const result = await node.exec(prepRes);

        // Should still add to buffer even if file not found in array
        expect(prepRes.summariesBuffer).toContainEqual({
          filename: "src/missing.ts",
          summary: "Missing file summary",
        });

        // Original files array should remain unchanged
        expect(result.updatedFiles).toEqual([
          { path: "src/index.ts", status: "pending", type: "file" },
        ]);
      });
    });

    describe("LLM call decision logic", () => {
      test("should skip LLM call when buffer is not full and analysis not completed", async () => {
        const prepRes = {
          summariesBuffer: [
            { filename: "file1.ts", summary: "Summary 1" },
            { filename: "file2.ts", summary: "Summary 2" },
          ],
          reducedOutput: "Previous output",
          currentFile: {
            name: "src/test.ts",
            analysis: { summary: "Test summary" },
          },
          userFeedback: {
            action: "accept" as const,
          },
          basic: sharedStorage.basic,
          completed: false,
        };

        const result = await node.exec(prepRes);

        // Should not call LLM
        expect(mockLLM.reduceHistory).not.toHaveBeenCalled();

        // Should return original reducedOutput and keep buffer
        expect(result.reducedOutput).toBe("Previous output");
        expect(result.summariesBuffer).toHaveLength(3); // 2 existing + 1 new
      });

      test("should call LLM when buffer is full (>=5)", async () => {
        const prepRes = {
          summariesBuffer: [
            { filename: "file1.ts", summary: "Summary 1" },
            { filename: "file2.ts", summary: "Summary 2" },
            { filename: "file3.ts", summary: "Summary 3" },
            { filename: "file4.ts", summary: "Summary 4" },
          ],
          reducedOutput: "Previous output",
          currentFile: {
            name: "src/test.ts",
            analysis: { summary: "Test summary" },
          },
          userFeedback: {
            action: "accept" as const,
          },
          basic: sharedStorage.basic,
          completed: false,
        };

        vi.mocked(mockLLM.reduceHistory).mockResolvedValue({
          reduced_output: "New reduced output",
        });

        const result = await node.exec(prepRes);

        // Should call LLM
        expect(mockLLM.reduceHistory).toHaveBeenCalledWith({
          basic: { ...prepRes.basic, files: expect.any(Array) },
          reducedOutput: "Previous output",
          summariesBuffer: expect.arrayContaining([
            { filename: "file1.ts", summary: "Summary 1" },
            { filename: "src/test.ts", summary: "Test summary" },
          ]),
          userFeedback: prepRes.userFeedback,
        });

        // Should return new reduced output and clear buffer
        expect(result.reducedOutput).toBe("New reduced output");
        expect(result.summariesBuffer).toHaveLength(0);
      });

      test("should call LLM when analysis is completed even with partial buffer", async () => {
        const prepRes = {
          summariesBuffer: [{ filename: "file1.ts", summary: "Summary 1" }],
          reducedOutput: "Previous output",
          currentFile: {
            name: "src/test.ts",
            analysis: { summary: "Test summary" },
          },
          userFeedback: {
            action: "accept" as const,
          },
          basic: sharedStorage.basic,
          completed: true,
        };

        vi.mocked(mockLLM.reduceHistory).mockResolvedValue({
          reduced_output: "Final reduced output",
        });

        const result = await node.exec(prepRes);

        // Should call LLM even with partial buffer when completed
        expect(mockLLM.reduceHistory).toHaveBeenCalled();
        expect(result.reducedOutput).toBe("Final reduced output");
        expect(result.summariesBuffer).toHaveLength(0);
      });

      test("should handle empty summariesBuffer with LLM call", async () => {
        const prepRes = {
          summariesBuffer: [],
          reducedOutput: "Previous output",
          currentFile: {
            name: "src/test.ts",
            analysis: { summary: "Test summary" },
          },
          userFeedback: {
            action: "accept" as const,
          },
          basic: sharedStorage.basic,
          completed: true,
        };

        vi.mocked(mockLLM.reduceHistory).mockResolvedValue({
          reduced_output: "Reduced with single item",
        });

        const result = await node.exec(prepRes);

        expect(mockLLM.reduceHistory).toHaveBeenCalledWith({
          basic: expect.any(Object),
          reducedOutput: "Previous output",
          summariesBuffer: [
            { filename: "src/test.ts", summary: "Test summary" },
          ],
          userFeedback: prepRes.userFeedback,
        });

        expect(result.reducedOutput).toBe("Reduced with single item");
      });
    });

    describe("LLM integration", () => {
      test("should call LLM.reduceHistory with correct parameters", async () => {
        const prepRes = {
          summariesBuffer: [
            { filename: "file1.ts", summary: "Summary 1" },
            { filename: "file2.ts", summary: "Summary 2" },
            { filename: "file3.ts", summary: "Summary 3" },
            { filename: "file4.ts", summary: "Summary 4" },
          ],
          reducedOutput: "Existing reduced output",
          currentFile: {
            name: "src/current.ts",
            analysis: { summary: "Current file summary" },
          },
          userFeedback: {
            action: "refined" as const,
            userSummary: "User refined summary",
          },
          basic: {
            repoName: "test-repo",
            mainGoal: "test goal",
            files: [
              {
                path: "src/current.ts",
                status: "pending" as const,
                type: "file" as const,
              },
            ],
          },
          completed: false,
        };

        vi.mocked(mockLLM.reduceHistory).mockResolvedValue({
          reduced_output: "LLM processed output",
        });

        await node.exec(prepRes);

        expect(mockLLM.reduceHistory).toHaveBeenCalledWith({
          basic: {
            repoName: "test-repo",
            mainGoal: "test goal",
            files: [
              {
                path: "src/current.ts",
                status: "done",
                type: "file",
                summary: "User refined summary",
              },
            ],
          },
          reducedOutput: "Existing reduced output",
          summariesBuffer: [
            { filename: "file1.ts", summary: "Summary 1" },
            { filename: "file2.ts", summary: "Summary 2" },
            { filename: "file3.ts", summary: "Summary 3" },
            { filename: "file4.ts", summary: "Summary 4" },
            { filename: "src/current.ts", summary: "User refined summary" },
          ],
          userFeedback: prepRes.userFeedback,
        });
      });

      test("should return LLM response and clear buffer", async () => {
        const prepRes = {
          summariesBuffer: [
            { filename: "file1.ts", summary: "Summary 1" },
            { filename: "file2.ts", summary: "Summary 2" },
            { filename: "file3.ts", summary: "Summary 3" },
            { filename: "file4.ts", summary: "Summary 4" },
          ],
          reducedOutput: "Previous output",
          currentFile: {
            name: "src/test.ts",
            analysis: { summary: "Test summary" },
          },
          userFeedback: {
            action: "accept" as const,
          },
          basic: sharedStorage.basic,
          completed: false,
        };

        const mockLLMResponse = {
          reduced_output: "LLM generated reduced output",
        };

        vi.mocked(mockLLM.reduceHistory).mockResolvedValue(mockLLMResponse);

        const result = await node.exec(prepRes);

        expect(result).toEqual({
          reducedOutput: "LLM generated reduced output",
          summariesBuffer: [],
          updatedFiles: expect.any(Array),
        });
      });
    });
  });

  describe("post", () => {
    test("should update shared storage with exec results", async () => {
      const execRes = {
        reducedOutput: "New reduced output",
        summariesBuffer: [],
        updatedFiles: [
          {
            path: "src/test.ts",
            status: "done" as const,
            type: "file" as const,
            summary: "Test summary",
          },
        ],
      };

      const result = await node.post(sharedStorage, undefined, execRes);

      expect(sharedStorage.reducedOutput).toBe("New reduced output");
      expect(sharedStorage.summariesBuffer).toEqual([]);
      expect(sharedStorage.basic.files).toEqual(execRes.updatedFiles);
    });

    test("should return ALL_FILES_ANALYZED when completed is true", async () => {
      sharedStorage.completed = true;

      const execRes = {
        reducedOutput: "Final output",
        summariesBuffer: [],
        updatedFiles: [],
      };

      const result = await node.post(sharedStorage, undefined, execRes);

      expect(result).toBe(Actions.ALL_FILES_ANALYZED);
    });

    test("should return DO_ANALYZE when completed is false", async () => {
      sharedStorage.completed = false;

      const execRes = {
        reducedOutput: "Intermediate output",
        summariesBuffer: [],
        updatedFiles: [],
      };

      const result = await node.post(sharedStorage, undefined, execRes);

      expect(result).toBe(Actions.DO_ANALYZE);
    });
  });
});
