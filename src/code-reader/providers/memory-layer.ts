import {
  MemoryLayer,
  DEFAULT_MEMORY_CONFIG,
  SearchOptions,
  SearchResult,
  VectorStoreProvider,
  EmbeddingProvider,
} from "../utils/memory-layer";
import { ModelSet } from "../utils/llm";

export class CloudflareVectorizeProvider implements VectorStoreProvider {
  private vectorize: VectorizeIndex;

  constructor(vectorize: VectorizeIndex) {
    this.vectorize = vectorize;
  }

  async store<T = any>(
    id: string,
    vector: number[],
    metadata: T
  ): Promise<void> {
    try {
      await this.vectorize.upsert([
        {
          id,
          values: vector,
          metadata: metadata || {},
        },
      ]);
    } catch (error) {
      console.error(
        "[CloudflareVectorizeProvider] Error storing vector:",
        error
      );
      throw error;
    }
  }

  async search<T = any>(
    queryVector: number[],
    options: SearchOptions
  ): Promise<SearchResult<T>[]> {
    try {
      const searchOptions: VectorizeQueryOptions = {
        topK: options.topK,
        returnMetadata: true,
        returnValues: false,
      };

      // Apply metadata filters if provided
      if (options.where) {
        searchOptions.filter = options.where;
      }

      const response = await this.vectorize.query(queryVector, searchOptions);

      if (!response || !response.matches) {
        return [];
      }

      return response.matches.map((match: any) => ({
        id: match.id,
        score: match.score,
        metadata: match.metadata as T,
      }));
    } catch (error) {
      console.error(
        "[CloudflareVectorizeProvider] Error searching vectors:",
        error
      );
      throw error;
    }
  }

  async delete(id: string): Promise<void> {
    try {
      await this.vectorize.deleteByIds([id]);
    } catch (error) {
      console.error(
        "[CloudflareVectorizeProvider] Error deleting vector:",
        error
      );
      throw error;
    }
  }
}

// Helper function to create memory layer with production providers
export function createMemoryLayer(
  models: ModelSet,
  environment: CloudflareBindings
): MemoryLayer {
  // Create providers
  const embeddingProvider: EmbeddingProvider = {
    async embed(text) {
      const result = await models.embed.doEmbed({
        values: [text],
      });
      return result.embeddings[0];
    },
  };

  const vectorStoreProvider = new CloudflareVectorizeProvider(
    environment.VECTORIZE
  );

  return new MemoryLayer(
    embeddingProvider,
    vectorStoreProvider,
    DEFAULT_MEMORY_CONFIG
  );
}
