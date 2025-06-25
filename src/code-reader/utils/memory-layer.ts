import { FileItem } from "./storage";

// ========== Embedding Provider ==========
export interface EmbeddingProvider {
  /**
   * Generate embedding for a single text
   */
  embed(text: string): Promise<number[]>;
}

// ========== Vector Store Provider ==========
export interface SearchResult<T = any> {
  id: string;
  score: number;
  metadata: T;
}

export interface SearchOptions {
  topK: number;
  where?: Record<string, any>; // Simple equality filter: { field: value }
}

export interface VectorStoreProvider {
  /**
   * Store a vector with metadata
   */
  store<T = any>(id: string, vector: number[], metadata: T): Promise<void>;

  /**
   * Search for similar vectors
   */
  search<T = any>(
    queryVector: number[],
    options: SearchOptions
  ): Promise<SearchResult<T>[]>;

  /**
   * Delete a specific vector
   */
  delete(id: string): Promise<void>;
}

// ========== Memory Layer Configuration ==========
export interface RecentStrategy {
  type: "recent";
  count: number; // Keep recent N files
  priority: number; // Base priority for this strategy
}

export interface SemanticStrategy {
  type: "semantic";
  count: number; // Max results from semantic search
  priority: number; // Base priority for this strategy
  minScore: number; // Minimum similarity threshold (0.0 - 1.0)
}

export type MemoryStrategy = RecentStrategy | SemanticStrategy;

export interface MemoryConfig {
  strategies: MemoryStrategy[]; // Enabled strategies with their parameters
  maxTokens: number; // Total context token limit
}

// ========== Context Source for Storage Integration ==========
export interface StorageContext {
  files: FileItem[];
}

// ========== Default Configuration ==========
export const DEFAULT_MEMORY_CONFIG: MemoryConfig = {
  strategies: [
    { type: "recent", count: 3, priority: 1000 }, // Higher priority
    { type: "semantic", count: 5, priority: 500, minScore: 0.1 }, // Lower priority
  ],
  maxTokens: 20000,
};

// ========== Memory Layer Implementation ==========
export class MemoryLayer {
  constructor(
    private embeddingProvider: EmbeddingProvider,
    private vectorStore: VectorStoreProvider,
    private config: MemoryConfig = DEFAULT_MEMORY_CONFIG
  ) {}

  /**
   * Store file understanding in memory
   */
  async set(
    filePath: string,
    understanding: string,
    metadata: Record<string, any> = {}
  ): Promise<void> {
    console.log(
      `[MemoryLayer] Storing understanding for: ${filePath}`,
      metadata
    );

    // Only store in vector store for semantic search
    try {
      const embedding = await this.embeddingProvider.embed(understanding);
      await this.vectorStore.store(filePath, embedding, {
        filePath,
        understanding,
        timestamp: Date.now(),
        tokenCount: this.estimateTokens(understanding),
        ...metadata, // Include session isolation metadata (runId, etc.)
      });
      console.log(`[MemoryLayer] Successfully stored vector for: ${filePath}`);
    } catch (error) {
      console.warn(
        `[MemoryLayer] Failed to store vector for ${filePath}:`,
        error
      );
      // Continue - this is not critical
    }
  }

  /**
   * Perform semantic search in memory
   */
  async search(
    query: string,
    options: {
      maxResults?: number;
      minScore?: number;
      excludeFile?: string;
      sessionMetadata?: Record<string, any>;
    } = {}
  ): Promise<
    {
      filePath: string;
      understanding: string;
      score: number;
      timestamp: number;
    }[]
  > {
    const {
      maxResults = 5,
      minScore = 0.1,
      excludeFile,
      sessionMetadata = {},
    } = options;

    // Generate embedding for the query
    const queryEmbedding = await this.embeddingProvider.embed(query);

    // Search in vector store
    const searchResults = await this.vectorStore.search(queryEmbedding, {
      topK: maxResults * 2, // Get more to filter properly
      where: sessionMetadata,
    });

    // Filter and format results
    return searchResults
      .filter((result) => {
        // Filter by minimum score
        if (result.score < minScore) return false;

        // Filter out excluded file
        if (excludeFile && result.metadata.filePath === excludeFile)
          return false;

        return true;
      })
      .slice(0, maxResults)
      .map((result) => ({
        filePath: result.metadata.filePath,
        understanding: result.metadata.understanding,
        score: result.score,
        timestamp: result.metadata.timestamp,
      }));
  }

  /**
   * Retrieve relevant context for analysis
   */
  async retrieve(
    currentFile: string,
    currentContent: string,
    storageContext: StorageContext,
    sessionMetadata: Record<string, any> = {}
  ): Promise<string[]> {
    console.log(
      `[MemoryLayer] Retrieving context for: ${currentFile}`,
      sessionMetadata
    );

    const contexts: {
      source: string;
      content: string;
      tokens: number;
      priority: number;
    }[] = [];

    // Process each enabled strategy
    for (const strategy of this.config.strategies) {
      switch (strategy.type) {
        case "recent": {
          const recentContexts = this.getRecentContextsFromStorage(
            currentFile,
            storageContext,
            strategy.count
          );
          recentContexts.forEach((context, index) => {
            contexts.push({
              source: "recent",
              content: context,
              tokens: this.estimateTokens(context),
              priority: strategy.priority - index, // Use strategy priority, subtract index for ordering
            });
          });
          break;
        }

        case "semantic": {
          try {
            const semanticContexts = await this.getSemanticContexts(
              currentContent,
              currentFile,
              strategy.count,
              strategy.minScore,
              sessionMetadata
            );
            semanticContexts.forEach((context, index) => {
              contexts.push({
                source: "semantic",
                content: context,
                tokens: this.estimateTokens(context),
                priority: strategy.priority - index, // Use strategy priority, subtract index for ordering
              });
            });
          } catch (error) {
            console.warn(`[MemoryLayer] Semantic search failed:`, error);
            // Continue without semantic results
          }
          break;
        }

        default: {
          console.warn(
            `[MemoryLayer] Unknown strategy type: ${(strategy as any).type}`
          );
          break;
        }
      }
    }

    // Merge, deduplicate, and prioritize
    const uniqueContexts = this.deduplicateContexts(contexts);
    const selectedContexts = this.selectContextsByTokenLimit(
      uniqueContexts,
      this.config.maxTokens
    );

    console.log(
      `[MemoryLayer] Retrieved ${
        selectedContexts.length
      } contexts (${this.getTotalTokens(selectedContexts)} tokens)`
    );
    return selectedContexts.map((c) => c.content);
  }

  // ========== Private Helper Methods ==========

  private getRecentContextsFromStorage(
    excludeFile: string,
    storageContext: StorageContext,
    count: number
  ): string[] {
    // Get files with understanding (analyzed files), preserving order
    const analyzedFiles = storageContext.files
      .filter(
        (file) =>
          file.status === "done" &&
          file.understanding &&
          file.path !== excludeFile
      )
      .slice(-count) // Take last N files (most recent)
      .reverse(); // Most recent first

    return analyzedFiles.map(
      (file) => `File: ${file.path}\n${file.understanding}`
    );
  }

  private async getSemanticContexts(
    queryContent: string,
    excludeFile: string,
    count: number,
    minScore: number,
    sessionMetadata: Record<string, any> = {}
  ): Promise<string[]> {
    // Use the public search method for consistency
    const searchResults = await this.search(queryContent, {
      maxResults: count,
      minScore: minScore,
      excludeFile: excludeFile,
      sessionMetadata: sessionMetadata,
    });

    return searchResults.map(
      (result) => `File: ${result.filePath}\n${result.understanding}`
    );
  }

  private deduplicateContexts(
    contexts: {
      source: string;
      content: string;
      tokens: number;
      priority: number;
    }[]
  ): { source: string; content: string; tokens: number; priority: number }[] {
    const seen = new Set<string>();
    return contexts.filter((context) => {
      const key = context.content;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  private selectContextsByTokenLimit(
    contexts: {
      source: string;
      content: string;
      tokens: number;
      priority: number;
    }[],
    maxTokens: number
  ): { source: string; content: string; tokens: number; priority: number }[] {
    // Sort by priority (highest first)
    const sorted = contexts.sort((a, b) => b.priority - a.priority);

    const selected = [];
    let totalTokens = 0;

    for (const context of sorted) {
      if (totalTokens + context.tokens <= maxTokens) {
        selected.push(context);
        totalTokens += context.tokens;
      }
    }

    return selected;
  }

  private getTotalTokens(contexts: { tokens: number }[]): number {
    return contexts.reduce((sum, c) => sum + c.tokens, 0);
  }

  private estimateTokens(text: string): number {
    // Simple token estimation: ~4 characters per token for English
    return Math.ceil(text.length / 4);
  }
}
