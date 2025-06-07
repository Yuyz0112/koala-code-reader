/**
 * Cloudflare R2 implementation of KVStore interface
 * Stores data as JSON objects in R2 bucket
 */

import { KVStore } from "../persisted-flow";

export class R2KVStore implements KVStore {
  constructor(private r2: R2Bucket) {}

  async read<T = unknown>(key: string): Promise<T | undefined> {
    try {
      const object = await this.r2.get(key);
      if (!object) {
        return undefined;
      }
      const data = await object.json<T>();
      return data;
    } catch (error) {
      console.error(`Failed to read key ${key} from R2:`, error);
      return undefined;
    }
  }

  async write(key: string, value: unknown): Promise<void> {
    try {
      const jsonData = JSON.stringify(value);
      await this.r2.put(key, jsonData, {
        httpMetadata: {
          contentType: "application/json",
        },
      });
    } catch (error) {
      console.error(`Failed to write key ${key} to R2:`, error);
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.r2.delete(key);
    } catch (error) {
      console.error(`Failed to delete key ${key} from R2:`, error);
      throw error;
    }
  }

  async listKeys(prefix?: string): Promise<string[]> {
    try {
      const result = await this.r2.list({ prefix });
      return result.objects.map((obj) => obj.key);
    } catch (error) {
      console.error(
        `Failed to list keys with prefix ${prefix} from R2:`,
        error
      );
      return [];
    }
  }
}
