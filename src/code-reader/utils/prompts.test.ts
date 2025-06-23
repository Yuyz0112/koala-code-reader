import { describe, it, expect } from "vitest";
import {
  getEntryFilePrompt,
  analyzeFilePrompt,
  reduceHistoryPrompt,
} from "./prompts";
import type { SharedStorage } from "./storage";

describe("Prompts", () => {
  describe("getEntryFilePrompt", () => {
    it("should generate basic entry file prompt", () => {
      const prompt = getEntryFilePrompt({
        basic: {
          repoName: "test-repo",
          mainGoal: "Understand auth",
          specificAreas: undefined,
          files: [],
        },
      });
      expect(prompt).toMatchSnapshot();
    });

    it("should include specific areas when provided", () => {
      const prompt = getEntryFilePrompt({
        basic: {
          repoName: "test-repo",
          mainGoal: "Understand auth",
          specificAreas: "JWT handling",
          files: [],
        },
      });
      expect(prompt).toMatchSnapshot();
    });

    it("should include file structure", () => {
      const prompt = getEntryFilePrompt({
        basic: {
          repoName: "test-repo",
          mainGoal: "Understand auth",
          specificAreas: undefined,
          files: [
            { path: "src/index.ts", status: "pending", type: "file" },
            {
              path: "src/auth.ts",
              status: "done",
              type: "file",
              understanding: "Auth logic",
            },
          ],
        },
      });
      expect(prompt).toMatchSnapshot();
    });
  });

  describe("analyzeFilePrompt", () => {
    it("should generate prompt without user feedback", () => {
      const prompt = analyzeFilePrompt(
        {
          basic: {
            repoName: "test",
            mainGoal: "Learn",
            specificAreas: undefined,
            files: [],
          },
          nextFile: { name: "index.ts", reason: "Entry point" },
          currentFile: undefined,
          userFeedback: undefined,
        },
        {
          name: "index.ts",
          content: "const x = 1;",
        },
        [] // No relevant contexts
      );
      expect(prompt).toMatchSnapshot();
    });

    it("should handle accept feedback", () => {
      const prompt = analyzeFilePrompt(
        {
          basic: {
            repoName: "test",
            mainGoal: "Learn",
            specificAreas: undefined,
            files: [],
          },
          nextFile: { name: "next.ts", reason: "Next step" },
          currentFile: {
            name: "current.ts",
            analysis: { understanding: "Current analysis" },
          },
          userFeedback: { action: "accept" },
        },
        {
          name: "next.ts",
          content: "const y = 2;",
        },
        [] // No relevant contexts
      );
      expect(prompt).toMatchSnapshot();
    });

    it("should handle reject feedback", () => {
      const prompt = analyzeFilePrompt(
        {
          basic: {
            repoName: "test",
            mainGoal: "Learn",
            specificAreas: undefined,
            files: [],
          },
          nextFile: { name: "next.ts", reason: "Next step" },
          currentFile: {
            name: "current.ts",
            analysis: { understanding: "Wrong analysis" },
          },
          userFeedback: { action: "reject", reason: "Missing key points" },
        },
        {
          name: "next.ts",
          content: "const z = 3;",
        },
        [] // No relevant contexts
      );
      expect(prompt).toMatchSnapshot();
    });

    it("should handle refine feedback", () => {
      const prompt = analyzeFilePrompt(
        {
          basic: {
            repoName: "test",
            mainGoal: "Learn",
            specificAreas: undefined,
            files: [],
          },
          nextFile: { name: "next.ts", reason: "Next step" },
          currentFile: {
            name: "current.ts",
            analysis: { understanding: "Old analysis" },
          },
          userFeedback: {
            action: "refine",
            userUnderstanding: "Better analysis",
            reason: "More accurate",
          },
        },
        {
          name: "next.ts",
          content: "const a = 4;",
        },
        [] // No relevant contexts
      );
      expect(prompt).toMatchSnapshot();
    });

    it("should include analysis history", () => {
      const prompt = analyzeFilePrompt(
        {
          basic: {
            repoName: "test",
            mainGoal: "Learn",
            specificAreas: undefined,
            files: [
              {
                path: "done.ts",
                status: "done",
                type: "file",
                understanding: "Completed",
              },
            ],
          },
          nextFile: { name: "next.ts", reason: "Next step" },
          currentFile: undefined,
          userFeedback: undefined,
        },
        {
          name: "next.ts",
          content: "const b = 5;",
        },
        [] // No relevant contexts
      );
      expect(prompt).toMatchSnapshot();
    });

    it("should handle empty file content", () => {
      const prompt = analyzeFilePrompt(
        {
          basic: {
            repoName: "test",
            mainGoal: "Learn",
            specificAreas: undefined,
            files: [],
          },
          nextFile: { name: "empty.ts", reason: "Check empty" },
          currentFile: undefined,
          userFeedback: undefined,
        },
        {
          name: "empty.ts",
          content: "",
        },
        [] // No relevant contexts
      );
      expect(prompt).toMatchSnapshot();
    });

    it("should include relevant contexts when provided", () => {
      const prompt = analyzeFilePrompt(
        {
          basic: {
            repoName: "test",
            mainGoal: "Learn",
            specificAreas: undefined,
            files: [],
          },
          nextFile: { name: "target.ts", reason: "Analyze target" },
          currentFile: undefined,
          userFeedback: undefined,
        },
        {
          name: "target.ts",
          content: "const target = true;",
        },
        [
          "File: related1.ts\nThis file handles authentication logic",
          "File: related2.ts\nThis file manages user sessions",
        ]
      );
      expect(prompt).toMatchSnapshot();
    });

    it("should handle empty relevant contexts array", () => {
      const prompt = analyzeFilePrompt(
        {
          basic: {
            repoName: "test",
            mainGoal: "Learn",
            specificAreas: undefined,
            files: [],
          },
          nextFile: { name: "standalone.ts", reason: "Analyze standalone" },
          currentFile: undefined,
          userFeedback: undefined,
        },
        {
          name: "standalone.ts",
          content: "const standalone = 'test';",
        },
        []
      );
      expect(prompt).toMatchSnapshot();
    });
  });

  describe("reduceHistoryPrompt", () => {
    it("should generate first reduction prompt", () => {
      const prompt = reduceHistoryPrompt({
        basic: {
          repoName: "test",
          mainGoal: "Learn",
          specificAreas: undefined,
          files: [],
        },
        reducedOutput: "",
        understandingsBuffer: [
          { filename: "file1.ts", understanding: "First file" },
        ],
        userFeedback: undefined,
      });
      expect(prompt).toMatchSnapshot();
    });

    it("should handle existing reduced output", () => {
      const prompt = reduceHistoryPrompt({
        basic: {
          repoName: "test",
          mainGoal: "Learn",
          specificAreas: undefined,
          files: [],
        },
        reducedOutput: "Previous analysis content",
        understandingsBuffer: [
          { filename: "file2.ts", understanding: "Second file" },
        ],
        userFeedback: undefined,
      });
      expect(prompt).toMatchSnapshot();
    });

    it("should include user feedback", () => {
      const prompt = reduceHistoryPrompt({
        basic: {
          repoName: "test",
          mainGoal: "Learn",
          specificAreas: undefined,
          files: [],
        },
        reducedOutput: "Previous content",
        understandingsBuffer: [
          { filename: "file3.ts", understanding: "Third file" },
        ],
        userFeedback: {
          action: "refine",
          userUnderstanding: "Better",
          reason: "More precise",
        },
      });
      expect(prompt).toMatchSnapshot();
    });

    it("should show all analyzed files", () => {
      const prompt = reduceHistoryPrompt({
        basic: {
          repoName: "test",
          mainGoal: "Learn",
          specificAreas: undefined,
          files: [
            {
              path: "analyzed1.ts",
              status: "done",
              type: "file",
              understanding: "First done",
            },
            {
              path: "analyzed2.ts",
              status: "done",
              type: "file",
              understanding: "Second done",
            },
          ],
        },
        reducedOutput: "Analysis so far",
        understandingsBuffer: [
          { filename: "new.ts", understanding: "New analysis" },
        ],
        userFeedback: undefined,
      });
      expect(prompt).toMatchSnapshot();
    });
  });

  describe("Edge cases", () => {
    it("should handle empty repo name", () => {
      const prompt = getEntryFilePrompt({
        basic: {
          repoName: "",
          mainGoal: "Learn",
          specificAreas: undefined,
          files: [],
        },
      });
      expect(prompt).toMatchSnapshot();
    });
  });
});
