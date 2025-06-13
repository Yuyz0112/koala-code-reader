import { describe, test, expect, beforeEach, vi } from "vitest";
import {
  MemoryLayer,
  DEFAULT_MEMORY_CONFIG,
  StorageContext,
  MemoryConfig,
} from "./memory-layer";
import {
  EmbeddingProvider,
  VectorStoreProvider,
  SearchResult,
  SearchOptions,
} from "./memory-providers";

// ========== Test Mock Implementations ==========

class MockEmbeddingProvider implements EmbeddingProvider {
  public embedCalls: string[] = [];

  async embed(text: string): Promise<number[]> {
    this.embedCalls.push(text);
    // Generate deterministic embedding based on text content
    const hash = this.simpleHash(text);
    return new Array(128).fill(0).map((_, i) => Math.sin(hash + i) * 0.1);
  }

  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash;
  }

  reset() {
    this.embedCalls = [];
  }
}

class MockVectorStore implements VectorStoreProvider {
  public storeCalls: Array<{ id: string; vector: number[]; metadata: any }> =
    [];
  public searchCalls: Array<{ queryVector: number[]; options: SearchOptions }> =
    [];
  public deleteCalls: string[] = [];

  private vectors: Map<string, { vector: number[]; metadata: any }> = new Map();

  async store<T = any>(
    id: string,
    vector: number[],
    metadata: T
  ): Promise<void> {
    this.storeCalls.push({ id, vector, metadata });
    this.vectors.set(id, { vector, metadata });
  }

  async search<T = any>(
    queryVector: number[],
    options: SearchOptions
  ): Promise<SearchResult<T>[]> {
    this.searchCalls.push({ queryVector, options });

    const results: SearchResult<T>[] = [];

    for (const [id, data] of this.vectors) {
      // Apply metadata filter if specified
      if (options.where) {
        let matches = true;
        for (const [key, value] of Object.entries(options.where)) {
          if (data.metadata[key] !== value) {
            matches = false;
            break;
          }
        }
        if (!matches) continue;
      }

      const score = this.cosineSimilarity(queryVector, data.vector);
      results.push({ id, score, metadata: data.metadata });
    }

    return results.sort((a, b) => b.score - a.score).slice(0, options.topK);
  }

  async delete(id: string): Promise<void> {
    this.deleteCalls.push(id);
    this.vectors.delete(id);
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const norm = Math.sqrt(normA) * Math.sqrt(normB);
    return norm === 0 ? 0 : dotProduct / norm;
  }

  reset() {
    this.storeCalls = [];
    this.searchCalls = [];
    this.deleteCalls = [];
    this.vectors.clear();
  }
}

// ========== Test Helpers ==========

function createStorageContext(
  files: Array<{
    path: string;
    status: "done" | "pending" | "ignored";
    understanding?: string;
  }>
): StorageContext {
  return {
    files: files.map((f) => ({
      path: f.path,
      status: f.status,
      type: "file" as const,
      understanding: f.understanding,
    })),
  };
}

// ========== Tests ==========

describe("MemoryLayer", () => {
  let mockEmbedding: MockEmbeddingProvider;
  let mockVectorStore: MockVectorStore;
  let memoryLayer: MemoryLayer;

  beforeEach(() => {
    mockEmbedding = new MockEmbeddingProvider();
    mockVectorStore = new MockVectorStore();
    memoryLayer = new MemoryLayer(
      mockEmbedding,
      mockVectorStore,
      DEFAULT_MEMORY_CONFIG
    );
  });

  describe("set() method", () => {
    test("should store understanding in vector store", async () => {
      await memoryLayer.set("src/auth.ts", "Authentication module", {
        runId: "test-run",
      });

      expect(mockEmbedding.embedCalls).toEqual(["Authentication module"]);
      expect(mockVectorStore.storeCalls).toHaveLength(1);

      const storeCall = mockVectorStore.storeCalls[0];
      expect(storeCall.id).toBe("src/auth.ts");
      expect(storeCall.metadata).toMatchObject({
        filePath: "src/auth.ts",
        understanding: "Authentication module",
        runId: "test-run",
      });
    });

    test("should handle embedding failures gracefully", async () => {
      mockEmbedding.embed = vi
        .fn()
        .mockRejectedValue(new Error("Embedding failed"));

      // Should not throw
      await expect(
        memoryLayer.set("test.ts", "content")
      ).resolves.toBeUndefined();

      // Should not call vector store if embedding fails
      expect(mockVectorStore.storeCalls).toHaveLength(0);
    });

    test("should include default metadata fields", async () => {
      await memoryLayer.set("test.ts", "test content");

      const metadata = mockVectorStore.storeCalls[0].metadata;
      expect(metadata).toHaveProperty("filePath", "test.ts");
      expect(metadata).toHaveProperty("understanding", "test content");
      expect(metadata).toHaveProperty("timestamp");
      expect(metadata).toHaveProperty("tokenCount");
    });
  });

  describe("retrieve() method - Recent Strategy", () => {
    const recentConfig: MemoryConfig = {
      strategies: [{ type: "recent", count: 2, priority: 1000 }],
      maxTokens: 10000,
    };

    beforeEach(() => {
      memoryLayer = new MemoryLayer(
        mockEmbedding,
        mockVectorStore,
        recentConfig
      );
    });

    test("should retrieve recent files from storage context", async () => {
      const storageContext = createStorageContext([
        {
          path: "src/old.ts",
          status: "done",
          understanding: "Old file understanding",
        },
        {
          path: "src/auth.ts",
          status: "done",
          understanding: "Auth module understanding",
        },
        {
          path: "src/user.ts",
          status: "done",
          understanding: "User module understanding",
        },
        { path: "src/current.ts", status: "pending" }, // Should be excluded (not done)
      ]);

      const contexts = await memoryLayer.retrieve(
        "src/new.ts",
        "new file content",
        storageContext
      );

      // Should get recent 2 files (excluding current file), most recent first
      expect(contexts).toHaveLength(2);
      expect(contexts[0]).toContain("User module understanding");
      expect(contexts[1]).toContain("Auth module understanding");
    });

    test("should exclude current file from recent results", async () => {
      const storageContext = createStorageContext([
        {
          path: "src/auth.ts",
          status: "done",
          understanding: "Auth understanding",
        },
        {
          path: "src/user.ts",
          status: "done",
          understanding: "User understanding",
        },
      ]);

      const contexts = await memoryLayer.retrieve(
        "src/user.ts", // Same as one in storage
        "current content",
        storageContext
      );

      // Should only get auth.ts, not user.ts (current file)
      expect(contexts).toHaveLength(1);
      expect(contexts[0]).toContain("Auth understanding");
      expect(contexts[0]).not.toContain("User understanding");
    });

    test("should respect count limit", async () => {
      const storageContext = createStorageContext([
        { path: "file1.ts", status: "done", understanding: "File 1" },
        { path: "file2.ts", status: "done", understanding: "File 2" },
        { path: "file3.ts", status: "done", understanding: "File 3" },
        { path: "file4.ts", status: "done", understanding: "File 4" },
      ]);

      const contexts = await memoryLayer.retrieve(
        "current.ts",
        "content",
        storageContext
      );

      // Should only get 2 files (count limit)
      expect(contexts).toHaveLength(2);
    });
  });

  describe("retrieve() method - Semantic Strategy", () => {
    const semanticConfig: MemoryConfig = {
      strategies: [
        { type: "semantic", count: 3, priority: 500, minScore: 0.1 },
      ],
      maxTokens: 10000,
    };

    beforeEach(async () => {
      memoryLayer = new MemoryLayer(
        mockEmbedding,
        mockVectorStore,
        semanticConfig
      );

      // Pre-populate vector store
      await memoryLayer.set("src/auth.ts", "Authentication and login system", {
        runId: "test",
      });
      await memoryLayer.set("src/user.ts", "User profile management", {
        runId: "test",
      });
      await memoryLayer.set("src/payment.ts", "Payment processing", {
        runId: "test",
      });
    });

    test("should perform semantic search", async () => {
      const storageContext = createStorageContext([]);

      await memoryLayer.retrieve(
        "src/login.ts",
        "user authentication logic",
        storageContext,
        { runId: "test" }
      );

      expect(mockEmbedding.embedCalls).toContain("user authentication logic");
      expect(mockVectorStore.searchCalls).toHaveLength(1);

      const searchCall = mockVectorStore.searchCalls[0];
      expect(searchCall.options.topK).toBe(6); // count * 2 for filtering
      expect(searchCall.options.where).toEqual({ runId: "test" });
    });

    test("should filter by session metadata", async () => {
      await memoryLayer.set("src/other.ts", "Other session file", {
        runId: "other-session",
      });

      const storageContext = createStorageContext([]);
      const contexts = await memoryLayer.retrieve(
        "src/test.ts",
        "test content",
        storageContext,
        { runId: "test" }
      );

      // Should only find files from the same session
      expect(contexts.every((c) => !c.includes("Other session file"))).toBe(
        true
      );
    });

    test("should handle search failures gracefully", async () => {
      mockVectorStore.search = vi
        .fn()
        .mockRejectedValue(new Error("Search failed"));

      const storageContext = createStorageContext([]);
      const contexts = await memoryLayer.retrieve(
        "test.ts",
        "content",
        storageContext
      );

      expect(contexts).toEqual([]);
    });
  });

  describe("retrieve() method - Combined Strategies", () => {
    const combinedConfig: MemoryConfig = {
      strategies: [
        { type: "recent", count: 2, priority: 1000 },
        { type: "semantic", count: 2, priority: 500, minScore: 0.1 },
      ],
      maxTokens: 10000,
    };

    beforeEach(async () => {
      memoryLayer = new MemoryLayer(
        mockEmbedding,
        mockVectorStore,
        combinedConfig
      );

      // Pre-populate vector store for semantic search
      await memoryLayer.set("src/auth.ts", "Authentication system", {
        runId: "test",
      });
      await memoryLayer.set("src/payment.ts", "Payment processing", {
        runId: "test",
      });
    });

    test("should combine results from multiple strategies", async () => {
      const storageContext = createStorageContext([
        {
          path: "src/recent1.ts",
          status: "done",
          understanding: "Recent file 1",
        },
        {
          path: "src/recent2.ts",
          status: "done",
          understanding: "Recent file 2",
        },
      ]);

      const contexts = await memoryLayer.retrieve(
        "src/new.ts",
        "authentication logic",
        storageContext,
        { runId: "test" }
      );

      // Should have results from both strategies
      expect(contexts.length).toBeGreaterThan(0);

      // Check for recent results
      const hasRecentResults = contexts.some((c) => c.includes("Recent file"));
      expect(hasRecentResults).toBe(true);
    });

    test("should deduplicate overlapping results", async () => {
      // Same file in both storage and vector store
      const storageContext = createStorageContext([
        {
          path: "src/auth.ts",
          status: "done",
          understanding: "Authentication system",
        },
      ]);

      const contexts = await memoryLayer.retrieve(
        "src/new.ts",
        "authentication logic",
        storageContext,
        { runId: "test" }
      );

      // Should not duplicate the same file
      const authCount = contexts.filter((c) =>
        c.includes("Authentication system")
      ).length;
      expect(authCount).toBe(1);
    });

    test("should respect priority ordering", async () => {
      const storageContext = createStorageContext([
        {
          path: "src/recent.ts",
          status: "done",
          understanding: "Recent file with priority 1000",
        },
      ]);

      const contexts = await memoryLayer.retrieve(
        "src/new.ts",
        "test content",
        storageContext,
        { runId: "test" }
      );

      if (contexts.length > 1) {
        // Recent strategy (priority 1000) should come before semantic (priority 500)
        const recentIndex = contexts.findIndex((c) =>
          c.includes("Recent file")
        );
        const semanticIndex = contexts.findIndex((c) =>
          c.includes("Authentication system")
        );

        if (recentIndex !== -1 && semanticIndex !== -1) {
          expect(recentIndex).toBeLessThan(semanticIndex);
        }
      }
    });
  });

  describe("retrieve() method - Token Limits", () => {
    const tokenLimitConfig: MemoryConfig = {
      strategies: [{ type: "recent", count: 10, priority: 1000 }],
      maxTokens: 50, // Very small limit
    };

    test("should respect token limits", async () => {
      const memoryLayerWithLimits = new MemoryLayer(
        mockEmbedding,
        mockVectorStore,
        tokenLimitConfig
      );

      const storageContext = createStorageContext([
        {
          path: "file1.ts",
          status: "done",
          understanding: "Short understanding",
        },
        {
          path: "file2.ts",
          status: "done",
          understanding:
            "This is a much longer understanding that contains many more words and tokens",
        },
        {
          path: "file3.ts",
          status: "done",
          understanding: "Another understanding",
        },
      ]);

      const contexts = await memoryLayerWithLimits.retrieve(
        "current.ts",
        "content",
        storageContext
      );

      // Calculate total tokens (rough estimation: length / 4)
      const totalTokens = contexts.reduce(
        (sum, context) => sum + Math.ceil(context.length / 4),
        0
      );
      expect(totalTokens).toBeLessThanOrEqual(50);
    });
  });

  describe("Configuration and Edge Cases", () => {
    test("should handle empty storage context", async () => {
      const emptyStorage = createStorageContext([]);

      const contexts = await memoryLayer.retrieve(
        "test.ts",
        "content",
        emptyStorage
      );

      expect(contexts).toEqual([]);
    });

    test("should handle unknown strategy types gracefully", async () => {
      const invalidConfig: MemoryConfig = {
        strategies: [{ type: "unknown" } as any],
        maxTokens: 10000,
      };

      const memoryLayerWithInvalidConfig = new MemoryLayer(
        mockEmbedding,
        mockVectorStore,
        invalidConfig
      );
      const storageContext = createStorageContext([]);

      // Should not throw
      const contexts = await memoryLayerWithInvalidConfig.retrieve(
        "test.ts",
        "content",
        storageContext
      );
      expect(contexts).toEqual([]);
    });

    test("should use default config when none provided", () => {
      const defaultMemoryLayer = new MemoryLayer(
        mockEmbedding,
        mockVectorStore
      );

      // Should not throw on construction
      expect(defaultMemoryLayer).toBeDefined();
    });
  });
});
