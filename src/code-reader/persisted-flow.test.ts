import { describe, it, expect, beforeEach, vi } from "vitest";
import { PersistedFlow, type KVStore } from "./persisted-flow";
import { BaseNode } from "pocketflow";

// Mock KVStore for testing
class MockKVStore implements KVStore {
  private data = new Map<string, any>();

  async read<T = any>(key: string): Promise<T | undefined> {
    return this.data.get(key);
  }

  async write(key: string, value: any): Promise<void> {
    this.data.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.data.delete(key);
  }

  async listKeys(prefix?: string): Promise<string[]> {
    if (!prefix) return Array.from(this.data.keys());
    return Array.from(this.data.keys()).filter((key) => key.startsWith(prefix));
  }

  clear() {
    this.data.clear();
  }

  getData() {
    return this.data;
  }
}

// Mock BaseNode implementations for testing
class MockStartNode extends BaseNode<any, any> {
  async post() {
    return "nextStep";
  }
}

class MockMiddleNode extends BaseNode<any, any> {
  async post() {
    return "finalStep";
  }
}

class MockEndNode extends BaseNode<any, any> {
  async post() {
    return undefined; // End of flow
  }
}

class MockErrorNode extends BaseNode<any, any> {
  async post() {
    throw new Error("Node execution failed");
    return "";
  }
}

describe("PersistedFlow", () => {
  let mockKV: MockKVStore;
  let startNode: MockStartNode;
  let middleNode: MockMiddleNode;
  let endNode: MockEndNode;
  let errorNode: MockErrorNode;

  beforeEach(() => {
    mockKV = new MockKVStore();
    startNode = new MockStartNode();
    middleNode = new MockMiddleNode();
    endNode = new MockEndNode();
    errorNode = new MockErrorNode();

    // Setup node connections
    startNode.on("nextStep", middleNode);
    middleNode.on("finalStep", endNode);
    startNode.on("error", errorNode);
  });

  describe("initialization (init/ensureRecord)", () => {
    it("should create new record when flow doesn't exist", async () => {
      const flow = new PersistedFlow(startNode, mockKV, "test-run-id");
      const sharedState = { data: "test" };

      await flow.init(sharedState);

      const record = await mockKV.read(`flow:test-run-id`);
      expect(record).toBeDefined();
      expect(record.flowName).toBe("koala-code-reader");
      expect(record.shared).toEqual(sharedState);
      expect(record.nodes).toEqual([]);
      expect(record.createdAt).toBeDefined();
    });

    it("should skip creation when record already exists", async () => {
      const existingRecord = {
        flowName: "existing-flow",
        params: {},
        shared: { existing: true },
        createdAt: "2025-01-01T00:00:00.000Z",
        nodes: [{ action: "existing" }],
      };
      await mockKV.write("flow:test-run-id", existingRecord);

      const flow = new PersistedFlow(startNode, mockKV, "test-run-id");
      await flow.init({ data: "new" });

      const record = await mockKV.read(`flow:test-run-id`);
      expect(record).toEqual(existingRecord); // Should remain unchanged
    });

    it("should use structuredClone for shared state", async () => {
      const flow = new PersistedFlow(startNode, mockKV, "test-run-id");
      const sharedState = { nested: { data: "test" } };

      await flow.init(sharedState);

      const record = await mockKV.read(`flow:test-run-id`);
      expect(record.shared).toEqual(sharedState);
      expect(record.shared).not.toBe(sharedState); // Should be a copy
    });
  });

  describe("step execution", () => {
    describe("path rebuilding", () => {
      it("should correctly rebuild path from empty nodes", async () => {
        const flow = new PersistedFlow(startNode, mockKV, "test-run-id");
        await flow.init({ data: "test" });

        const result = await flow.step();

        expect(result).toBe(true);
        const record = await mockKV.read(`flow:test-run-id`);
        expect(record.nodes).toHaveLength(1);
        expect(record.nodes[0].action).toBe("nextStep");
      });

      it("should correctly rebuild path from existing nodes", async () => {
        // Pre-populate with one step
        await mockKV.write("flow:test-run-id", {
          flowName: "test",
          params: {},
          shared: { data: "test" },
          createdAt: new Date().toISOString(),
          nodes: [{ action: "nextStep" }],
        });

        const flow = new PersistedFlow(startNode, mockKV, "test-run-id");
        const result = await flow.step();

        expect(result).toBe(true);
        const record = await mockKV.read(`flow:test-run-id`);
        expect(record.nodes).toHaveLength(2);
        expect(record.nodes[1].action).toBe("finalStep");
      });

      it("should handle complex path with multiple steps", async () => {
        // Create a more complex node setup
        const nodeA = new MockStartNode();
        const nodeB = new MockMiddleNode();
        const nodeC = new MockEndNode();

        nodeA.on("stepB", nodeB);
        nodeB.on("stepC", nodeC);

        // Mock node behaviors
        vi.spyOn(nodeA, "post").mockResolvedValue("stepB");
        vi.spyOn(nodeB, "post").mockResolvedValue("stepC");
        vi.spyOn(nodeC, "post").mockResolvedValue(undefined);

        // Pre-populate with existing path: A -> B
        await mockKV.write("flow:test-run-id", {
          flowName: "test",
          params: {},
          shared: { data: "test" },
          createdAt: new Date().toISOString(),
          nodes: [{ action: "stepB" }, { action: "stepC" }],
        });

        const flow = new PersistedFlow(nodeA, mockKV, "test-run-id");
        const result = await flow.step();

        expect(result).toBe(true);
        const record = await mockKV.read(`flow:test-run-id`);
        expect(record.nodes).toHaveLength(3);
        expect(nodeC.post).toHaveBeenCalled();
      });

      it("should return false when no next node exists", async () => {
        // Pre-populate to end state
        await mockKV.write("flow:test-run-id", {
          flowName: "test",
          params: {},
          shared: { data: "test" },
          createdAt: new Date().toISOString(),
          nodes: [
            { action: "nextStep" },
            { action: "finalStep" },
            { action: undefined }, // End node returns undefined
          ],
        });

        const flow = new PersistedFlow(startNode, mockKV, "test-run-id");
        const result = await flow.step();

        expect(result).toBe(false);
      });
    });

    describe("node execution", () => {
      it("should call node._run with correct shared state", async () => {
        const flow = new PersistedFlow(startNode, mockKV, "test-run-id");
        const sharedState = { data: "test", count: 42 };
        await flow.init(sharedState);

        const runSpy = vi.spyOn(startNode, "_run");
        await flow.step();

        expect(runSpy).toHaveBeenCalledWith(sharedState);
      });

      it("should call setParams with flow params", async () => {
        const flow = new PersistedFlow(startNode, mockKV, "test-run-id");
        flow.setParams({ param1: "value1", param2: 123 });
        await flow.init({ data: "test" });

        const setParamsSpy = vi.spyOn(startNode, "setParams");
        await flow.step();

        expect(setParamsSpy).toHaveBeenCalledWith({
          param1: "value1",
          param2: 123,
        });
      });
    });

    describe("state persistence", () => {
      it("should save action and updated shared state", async () => {
        const flow = new PersistedFlow(startNode, mockKV, "test-run-id");
        const sharedState = { data: "test" };
        await flow.init(sharedState);

        // Modify shared state during execution
        vi.spyOn(startNode, "_run").mockImplementation(async (shared) => {
          shared.modified = true;
          return "nextStep";
        });

        await flow.step();

        const record = await mockKV.read(`flow:test-run-id`);
        expect(record.nodes[0].action).toBe("nextStep");
        expect(record.shared.modified).toBe(true);
      });

      it("should handle undefined action correctly", async () => {
        const flow = new PersistedFlow(endNode, mockKV, "test-run-id");
        await flow.init({ data: "test" });

        await flow.step();

        const record = await mockKV.read(`flow:test-run-id`);
        expect(record.nodes[0].action).toBeUndefined();
      });
    });

    describe("error handling", () => {
      it("should throw error when node execution fails", async () => {
        const flow = new PersistedFlow(errorNode, mockKV, "test-run-id");
        await flow.init({ data: "test" });

        await expect(flow.step()).rejects.toThrow("Node execution failed");

        // Verify no data was written when execution failed
        const record = await mockKV.read(`flow:test-run-id`);
        expect(record.nodes).toHaveLength(0); // No nodes should be added
      });

      it("should not modify shared state when node execution fails", async () => {
        const flow = new PersistedFlow(errorNode, mockKV, "test-run-id");
        const initialState = { data: "test", count: 42 };
        await flow.init(initialState);

        await expect(flow.step()).rejects.toThrow("Node execution failed");

        // Verify shared state remains unchanged
        const record = await mockKV.read(`flow:test-run-id`);
        expect(record.shared).toEqual(initialState);
      });
    });
  });

  describe("complete flow execution (run)", () => {
    it("should execute complete flow until termination", async () => {
      const flow = new PersistedFlow(startNode, mockKV, "test-run-id");
      const sharedState = { data: "test" };

      const result = await flow.run(sharedState);

      expect(result).toBeUndefined(); // Last action from endNode
      const record = await mockKV.read(`flow:test-run-id`);
      expect(record.nodes).toHaveLength(3);
      expect(record.nodes[0].action).toBe("nextStep");
      expect(record.nodes[1].action).toBe("finalStep");
      expect(record.nodes[2].action).toBeUndefined();
    });

    it("should return last action when flow ends with action", async () => {
      // Create a flow that ends with an action
      const lastNode = new MockStartNode();
      vi.spyOn(lastNode, "post").mockResolvedValue("finalAction");
      middleNode.on("finalStep", lastNode);

      const flow = new PersistedFlow(startNode, mockKV, "test-run-id");
      const result = await flow.run({ data: "test" });

      expect(result).toBe("finalAction");
    });

    it("should handle empty flow (immediate termination)", async () => {
      const immediateEndNode = new MockEndNode();
      const flow = new PersistedFlow(immediateEndNode, mockKV, "test-run-id");

      const result = await flow.run({ data: "test" });

      expect(result).toBeUndefined();
      const record = await mockKV.read(`flow:test-run-id`);
      expect(record.nodes).toHaveLength(1);
    });
  });

  describe("state management", () => {
    describe("getShared", () => {
      it("should return current shared state", async () => {
        const flow = new PersistedFlow(startNode, mockKV, "test-run-id");
        const sharedState = { data: "test", count: 42 };
        await flow.init(sharedState);

        const result = await flow.getShared();

        expect(result).toEqual(sharedState);
      });

      it("should return undefined when flow doesn't exist", async () => {
        const flow = new PersistedFlow(startNode, mockKV, "nonexistent-id");

        const result = await flow.getShared();

        expect(result).toBeUndefined();
      });
    });

    describe("setShared", () => {
      it("should update shared state with structuredClone", async () => {
        const flow = new PersistedFlow(startNode, mockKV, "test-run-id");
        await flow.init({ data: "initial" });

        const newShared = { data: "updated", nested: { value: 123 } };
        await flow.setShared(newShared);

        const record = await mockKV.read(`flow:test-run-id`);
        expect(record.shared).toEqual(newShared);
        expect(record.shared).not.toBe(newShared); // Should be a copy
      });

      it("should preserve other record fields when updating shared", async () => {
        const flow = new PersistedFlow(startNode, mockKV, "test-run-id");
        await flow.init({ data: "initial" });

        // Add some execution history
        await flow.step();

        const originalRecord = await mockKV.read(`flow:test-run-id`);
        await flow.setShared({ data: "updated" });

        const updatedRecord = await mockKV.read(`flow:test-run-id`);
        expect(updatedRecord.flowName).toBe(originalRecord.flowName);
        expect(updatedRecord.nodes).toEqual(originalRecord.nodes);
        expect(updatedRecord.createdAt).toBe(originalRecord.createdAt);
        expect(updatedRecord.shared).toEqual({ data: "updated" });
      });
    });

    describe("getRunId", () => {
      it("should return the correct runId", () => {
        const flow = new PersistedFlow(startNode, mockKV, "test-run-id");
        expect(flow.getRunId()).toBe("test-run-id");
      });
    });
  });

  describe("flow recovery (attach)", () => {
    it("should successfully attach to existing flow", async () => {
      // Create initial flow record
      const existingRecord = {
        flowName: "test-flow",
        params: { param1: "value1" },
        shared: { data: "existing" },
        createdAt: new Date().toISOString(),
        nodes: [{ action: "nextStep" }],
      };
      await mockKV.write("flow:existing-id", existingRecord);

      const attachedFlow = await PersistedFlow.attach(
        mockKV,
        "existing-id",
        startNode
      );

      expect(attachedFlow).toBeInstanceOf(PersistedFlow);
      expect(attachedFlow.getRunId()).toBe("existing-id");
    });

    it("should restore params from existing flow", async () => {
      const existingRecord = {
        flowName: "test-flow",
        params: { param1: "value1", param2: 42 },
        shared: { data: "existing" },
        createdAt: new Date().toISOString(),
        nodes: [],
      };
      await mockKV.write("flow:existing-id", existingRecord);

      const attachedFlow = await PersistedFlow.attach(
        mockKV,
        "existing-id",
        startNode
      );

      // Verify params were set (we'll test this by checking if setParams was called)
      const setParamsSpy = vi.spyOn(startNode, "setParams");
      await attachedFlow.step();

      expect(setParamsSpy).toHaveBeenCalledWith(existingRecord.params);
    });

    it("should continue execution from correct position after attach", async () => {
      // Setup existing flow that has executed one step
      const existingRecord = {
        flowName: "test-flow",
        params: {},
        shared: { data: "existing" },
        createdAt: new Date().toISOString(),
        nodes: [{ action: "nextStep" }], // Already executed startNode
      };
      await mockKV.write("flow:existing-id", existingRecord);

      const attachedFlow = await PersistedFlow.attach(
        mockKV,
        "existing-id",
        startNode
      );

      // Next step should execute middleNode (because startNode -> nextStep -> middleNode)
      const middleNodeSpy = vi.spyOn(middleNode, "_run");
      await attachedFlow.step();

      expect(middleNodeSpy).toHaveBeenCalled();

      const record = await mockKV.read(`flow:existing-id`);
      expect(record.nodes).toHaveLength(2);
      expect(record.nodes[1].action).toBe("finalStep");
    });

    it("should throw error when flow doesn't exist", async () => {
      await expect(
        PersistedFlow.attach(mockKV, "nonexistent-id", startNode)
      ).rejects.toThrow("flow not found");
    });

    it("should handle attach with complex existing path", async () => {
      // Setup existing flow with multiple steps
      const existingRecord = {
        flowName: "test-flow",
        params: {},
        shared: { data: "existing", step: 2 },
        createdAt: new Date().toISOString(),
        nodes: [
          { action: "nextStep" }, // startNode -> middleNode
          { action: "finalStep" }, // middleNode -> endNode
        ],
      };
      await mockKV.write("flow:existing-id", existingRecord);

      const attachedFlow = await PersistedFlow.attach(
        mockKV,
        "existing-id",
        startNode
      );

      // Next step should execute endNode
      const endNodeSpy = vi.spyOn(endNode, "_run");
      await attachedFlow.step();

      expect(endNodeSpy).toHaveBeenCalled();

      const record = await mockKV.read(`flow:existing-id`);
      expect(record.nodes).toHaveLength(3);
      expect(record.nodes[2].action).toBeUndefined(); // endNode returns undefined
    });
  });

  describe("edge cases and error handling", () => {
    it("should handle KV read failure gracefully", async () => {
      const failingKV = {
        read: vi.fn().mockRejectedValue(new Error("KV read failed")),
        write: vi.fn(),
        delete: vi.fn(),
        listKeys: vi.fn(),
      };

      const flow = new PersistedFlow(startNode, failingKV, "test-run-id");

      await expect(flow.step()).rejects.toThrow("KV read failed");
    });

    it("should handle KV write failure gracefully", async () => {
      const flow = new PersistedFlow(startNode, mockKV, "test-run-id");
      await flow.init({ data: "test" });

      // Mock write failure after successful read
      vi.spyOn(mockKV, "write").mockRejectedValue(new Error("KV write failed"));

      await expect(flow.step()).rejects.toThrow("KV write failed");
    });

    it("should handle corrupted flow record", async () => {
      // Write invalid record
      await mockKV.write("flow:test-run-id", { invalid: "record" });

      const flow = new PersistedFlow(startNode, mockKV, "test-run-id");

      // Should handle gracefully by treating missing fields as undefined/empty
      await expect(flow.step()).rejects.toThrow();
    });

    it("should handle action with 'default' fallback", async () => {
      // Create node that returns undefined action but has default path
      const actionlessNode = new MockStartNode();
      vi.spyOn(actionlessNode, "post").mockResolvedValue(undefined as any);
      actionlessNode.on("default", endNode);

      await mockKV.write("flow:test-run-id", {
        flowName: "test",
        params: {},
        shared: { data: "test" },
        createdAt: new Date().toISOString(),
        nodes: [{ action: undefined }],
      });

      const flow = new PersistedFlow(actionlessNode, mockKV, "test-run-id");
      const result = await flow.step();

      expect(result).toBe(true);
      // Should have found endNode via "default" path
      const record = await mockKV.read(`flow:test-run-id`);
      expect(record.nodes).toHaveLength(2);
    });

    it("should handle missing shared state gracefully", async () => {
      await mockKV.write("flow:test-run-id", {
        flowName: "test",
        params: {},
        // shared missing
        createdAt: new Date().toISOString(),
        nodes: [],
      });

      const flow = new PersistedFlow(startNode, mockKV, "test-run-id");

      // Should handle undefined shared state
      await expect(flow.step()).rejects.toThrow();
    });
  });
});
