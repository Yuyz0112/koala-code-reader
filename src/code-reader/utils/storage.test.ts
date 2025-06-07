import { expect, test, describe } from "vitest";
import { generateFileStructureWithStatus, FileItem } from "./storage";

describe("generateFileStructureWithStatus", () => {
  test("should return 'No files available' when files array is empty", () => {
    const result = generateFileStructureWithStatus([]);
    expect(result).toBe("No files available");
  });

  test("should return 'No files available' when files array is undefined", () => {
    const result = generateFileStructureWithStatus(undefined as any);
    expect(result).toBe("No files available");
  });

  test("should return 'No visible files available' when all files are ignored", () => {
    const files: FileItem[] = [
      { path: "src/index.ts", status: "ignored", type: "file" },
      { path: "src/utils.ts", status: "ignored", type: "file" },
    ];
    const result = generateFileStructureWithStatus(files);
    expect(result).toBe("No visible files available");
  });

  test("should generate structure for a single file", () => {
    const files: FileItem[] = [
      { path: "index.ts", status: "pending", type: "file" },
    ];
    const result = generateFileStructureWithStatus(files);
    expect(result).toBe("- [ ] 📄 index.ts");
  });

  test("should generate structure for a single completed file", () => {
    const files: FileItem[] = [
      { path: "index.ts", status: "done", type: "file" },
    ];
    const result = generateFileStructureWithStatus(files);
    expect(result).toBe("- [x] 📄 index.ts");
  });

  test("should generate structure for files in nested directories", () => {
    const files: FileItem[] = [
      { path: "src/index.ts", status: "pending", type: "file" },
      { path: "src/utils/helper.ts", status: "done", type: "file" },
    ];
    const result = generateFileStructureWithStatus(files);
    expect(result).toBe(
      "📁 src/\n" +
        "  📁 utils/\n" +
        "    - [x] 📄 helper.ts\n" +
        "  - [ ] 📄 index.ts"
    );
  });

  test("should handle explicit directories with status", () => {
    const files: FileItem[] = [
      { path: "src", status: "pending", type: "directory" },
      { path: "src/index.ts", status: "done", type: "file" },
    ];
    const result = generateFileStructureWithStatus(files);
    expect(result).toBe("- [ ] 📁 src/\n" + "  - [x] 📄 index.ts");
  });

  test("should sort directories before files alphabetically", () => {
    const files: FileItem[] = [
      { path: "z-file.ts", status: "pending", type: "file" },
      { path: "a-dir/file.ts", status: "pending", type: "file" },
      { path: "b-file.ts", status: "done", type: "file" },
      { path: "b-dir/file.ts", status: "pending", type: "file" },
    ];
    const result = generateFileStructureWithStatus(files);
    expect(result).toBe(
      "📁 a-dir/\n" +
        "  - [ ] 📄 file.ts\n" +
        "📁 b-dir/\n" +
        "  - [ ] 📄 file.ts\n" +
        "- [x] 📄 b-file.ts\n" +
        "- [ ] 📄 z-file.ts"
    );
  });

  test("should handle complex nested structure with mixed statuses", () => {
    const files: FileItem[] = [
      { path: "package.json", status: "done", type: "file" },
      { path: "src/index.ts", status: "pending", type: "file" },
      { path: "src/components/Button.tsx", status: "done", type: "file" },
      { path: "src/components/Modal.tsx", status: "pending", type: "file" },
      { path: "src/utils/helper.ts", status: "done", type: "file" },
      { path: "tests/unit/helper.test.ts", status: "pending", type: "file" },
    ];
    const result = generateFileStructureWithStatus(files);
    expect(result).toBe(
      "📁 src/\n" +
        "  📁 components/\n" +
        "    - [x] 📄 Button.tsx\n" +
        "    - [ ] 📄 Modal.tsx\n" +
        "  📁 utils/\n" +
        "    - [x] 📄 helper.ts\n" +
        "  - [ ] 📄 index.ts\n" +
        "📁 tests/\n" +
        "  📁 unit/\n" +
        "    - [ ] 📄 helper.test.ts\n" +
        "- [x] 📄 package.json"
    );
  });

  test("should filter out ignored files but keep their parent directories if other files exist", () => {
    const files: FileItem[] = [
      { path: "src/index.ts", status: "pending", type: "file" },
      { path: "src/ignored.ts", status: "ignored", type: "file" },
      { path: "src/utils/helper.ts", status: "done", type: "file" },
    ];
    const result = generateFileStructureWithStatus(files);
    expect(result).toBe(
      "📁 src/\n" +
        "  📁 utils/\n" +
        "    - [x] 📄 helper.ts\n" +
        "  - [ ] 📄 index.ts"
    );
  });

  test("should handle root level files and directories mixed", () => {
    const files: FileItem[] = [
      { path: "README.md", status: "done", type: "file" },
      { path: "src", status: "pending", type: "directory" },
      { path: "package.json", status: "pending", type: "file" },
    ];
    const result = generateFileStructureWithStatus(files);
    expect(result).toBe(
      "- [ ] 📁 src/\n" + "- [ ] 📄 package.json\n" + "- [x] 📄 README.md"
    );
  });

  test("should handle deep nesting correctly", () => {
    const files: FileItem[] = [
      { path: "a/b/c/d/e/file.ts", status: "done", type: "file" },
    ];
    const result = generateFileStructureWithStatus(files);
    expect(result).toBe(
      "📁 a/\n" +
        "  📁 b/\n" +
        "    📁 c/\n" +
        "      📁 d/\n" +
        "        📁 e/\n" +
        "          - [x] 📄 file.ts"
    );
  });

  test("should handle files with same directory prefix but different paths", () => {
    const files: FileItem[] = [
      { path: "src", status: "pending", type: "directory" },
      { path: "src-backup/file.ts", status: "done", type: "file" },
      { path: "src/index.ts", status: "pending", type: "file" },
    ];
    const result = generateFileStructureWithStatus(files);
    expect(result).toBe(
      "- [ ] 📁 src/\n" +
        "  - [ ] 📄 index.ts\n" +
        "📁 src-backup/\n" +
        "  - [x] 📄 file.ts"
    );
  });

  test("should handle empty path segments gracefully", () => {
    const files: FileItem[] = [
      { path: "src//utils//file.ts", status: "pending", type: "file" },
    ];
    const result = generateFileStructureWithStatus(files);
    expect(result).toBe("📁 src/\n" + "  📁 utils/\n" + "    - [ ] 📄 file.ts");
  });
});
