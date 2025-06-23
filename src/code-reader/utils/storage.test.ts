import { expect, test, describe } from "vitest";
import {
  generateFileStructureWithStatus,
  getAnalyzedUnderstandings,
  type FileItem,
} from "./storage";

describe("generateFileStructureWithStatus", () => {
  test("should return 'No files available' for empty array", () => {
    const result = generateFileStructureWithStatus([]);
    expect(result).toBe("No files available");
  });

  test("should return 'No files available' for null/undefined input", () => {
    const result1 = generateFileStructureWithStatus(null as any);
    const result2 = generateFileStructureWithStatus(undefined as any);
    expect(result1).toBe("No files available");
    expect(result2).toBe("No files available");
  });

  test("should return 'No visible files available' when all files are ignored", () => {
    const files: FileItem[] = [
      { path: "src/test.ts", status: "ignored", type: "file" },
      { path: "dist", status: "ignored", type: "directory" },
    ];
    const result = generateFileStructureWithStatus(files);
    expect(result).toBe("No visible files available");
  });

  test("should display files with correct status indicators", () => {
    const files: FileItem[] = [
      { path: "src/index.ts", status: "done", type: "file" },
      { path: "src/utils.ts", status: "pending", type: "file" },
      { path: "package.json", status: "done", type: "file" },
    ];

    const result = generateFileStructureWithStatus(files);

    expect(result).toContain("✓ [FILE] src/index.ts (ANALYZED)");
    expect(result).toContain("○ [FILE] src/utils.ts (PENDING)");
    expect(result).toContain("✓ [FILE] package.json (ANALYZED)");
    expect(result).toContain("Available Files and Directories:");
    expect(result).toContain("Legend:");
  });

  test("should display directories with correct type indicators", () => {
    const files: FileItem[] = [
      { path: "src", status: "pending", type: "directory" },
      { path: "dist", status: "done", type: "directory" },
    ];

    const result = generateFileStructureWithStatus(files);

    expect(result).toContain("○ [DIR] src (PENDING)");
    expect(result).toContain("✓ [DIR] dist (ANALYZED)");
  });

  test("should sort directories before files, both alphabetically", () => {
    const files: FileItem[] = [
      { path: "z-file.txt", status: "pending", type: "file" },
      { path: "a-dir", status: "pending", type: "directory" },
      { path: "m-file.js", status: "pending", type: "file" },
      { path: "b-dir", status: "pending", type: "directory" },
    ];

    const result = generateFileStructureWithStatus(files);
    const lines = result.split("\n");

    // Find the content lines (skip header and empty lines)
    const contentLines = lines.filter(
      (line) => line.includes("[DIR]") || line.includes("[FILE]")
    );

    expect(contentLines[0]).toContain("a-dir");
    expect(contentLines[1]).toContain("b-dir");
    expect(contentLines[2]).toContain("m-file.js");
    expect(contentLines[3]).toContain("z-file.txt");
  });

  test("should filter out ignored files but show other statuses", () => {
    const files: FileItem[] = [
      { path: "src/main.ts", status: "done", type: "file" },
      { path: "src/test.ts", status: "ignored", type: "file" },
      { path: "src/utils.ts", status: "pending", type: "file" },
      { path: "node_modules", status: "ignored", type: "directory" },
    ];

    const result = generateFileStructureWithStatus(files);

    expect(result).toContain("src/main.ts");
    expect(result).toContain("src/utils.ts");
    expect(result).not.toContain("src/test.ts");
    expect(result).not.toContain("node_modules");
  });

  test("should include legend section", () => {
    const files: FileItem[] = [
      { path: "test.ts", status: "pending", type: "file" },
    ];

    const result = generateFileStructureWithStatus(files);

    expect(result).toContain("Legend:");
    expect(result).toContain("✓ = Already analyzed");
    expect(result).toContain("○ = Available for analysis");
    expect(result).toContain("[DIR] = Directory");
    expect(result).toContain("[FILE] = File");
  });

  test("should handle mixed file and directory structure", () => {
    const files: FileItem[] = [
      { path: "src", status: "pending", type: "directory" },
      { path: "src/index.ts", status: "done", type: "file" },
      { path: "src/utils", status: "pending", type: "directory" },
      { path: "src/utils/helper.ts", status: "pending", type: "file" },
      { path: "package.json", status: "done", type: "file" },
    ];

    const result = generateFileStructureWithStatus(files);

    // Should contain all non-ignored files
    expect(result).toContain("○ [DIR] src (PENDING)");
    expect(result).toContain("○ [DIR] src/utils (PENDING)");
    expect(result).toContain("✓ [FILE] src/index.ts (ANALYZED)");
    expect(result).toContain("○ [FILE] src/utils/helper.ts (PENDING)");
    expect(result).toContain("✓ [FILE] package.json (ANALYZED)");
  });
});

describe("getAnalyzedUnderstandings", () => {
  test("should return empty array for empty input", () => {
    const result = getAnalyzedUnderstandings([]);
    expect(result).toEqual([]);
  });

  test("should return only files with 'done' status and understanding", () => {
    const files: FileItem[] = [
      {
        path: "src/index.ts",
        status: "done",
        type: "file",
        understanding: "Main entry point",
      },
      {
        path: "src/utils.ts",
        status: "pending",
        type: "file",
        understanding: "Utility functions",
      },
      {
        path: "src/test.ts",
        status: "done",
        type: "file",
        // No understanding
      },
      {
        path: "src/helper.ts",
        status: "done",
        type: "file",
        understanding: "Helper functions",
      },
    ];

    const result = getAnalyzedUnderstandings(files);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      filename: "src/index.ts",
      understanding: "Main entry point",
    });
    expect(result[1]).toEqual({
      filename: "src/helper.ts",
      understanding: "Helper functions",
    });
  });

  test("should filter out files without understanding even if status is done", () => {
    const files: FileItem[] = [
      { path: "src/index.ts", status: "done", type: "file" },
      { path: "src/utils.ts", status: "done", type: "file", understanding: "" },
      {
        path: "src/test.ts",
        status: "done",
        type: "file",
        understanding: "Test file",
      },
    ];

    const result = getAnalyzedUnderstandings(files);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      filename: "src/test.ts",
      understanding: "Test file",
    });
  });

  test("should filter out ignored and pending files regardless of understanding", () => {
    const files: FileItem[] = [
      {
        path: "src/index.ts",
        status: "ignored",
        type: "file",
        understanding: "Should be ignored",
      },
      {
        path: "src/utils.ts",
        status: "pending",
        type: "file",
        understanding: "Should be pending",
      },
      {
        path: "src/main.ts",
        status: "done",
        type: "file",
        understanding: "Should be included",
      },
    ];

    const result = getAnalyzedUnderstandings(files);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      filename: "src/main.ts",
      understanding: "Should be included",
    });
  });

  test("should preserve order of files", () => {
    const files: FileItem[] = [
      { path: "c.ts", status: "done", type: "file", understanding: "Third" },
      { path: "a.ts", status: "done", type: "file", understanding: "First" },
      { path: "b.ts", status: "done", type: "file", understanding: "Second" },
    ];

    const result = getAnalyzedUnderstandings(files);

    expect(result).toHaveLength(3);
    expect(result[0].filename).toBe("c.ts");
    expect(result[1].filename).toBe("a.ts");
    expect(result[2].filename).toBe("b.ts");
  });
});
