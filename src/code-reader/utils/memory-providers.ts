// Memory Layer Provider Interfaces

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
