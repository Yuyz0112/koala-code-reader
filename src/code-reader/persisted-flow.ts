import { BaseNode, Flow } from "pocketflow";

export interface KVStore {
  read<T = any>(key: string): Promise<T | undefined>;
  write(key: string, value: any): Promise<void>;
  delete?(key: string): Promise<void>;
  listKeys?(prefix?: string): Promise<string[]>;
}

type Action = string;

interface NodeRecord {
  nodeName: string;
  action?: string;
  error?: string;
}

interface FlowRecord {
  flowName: string;
  params: Record<string, unknown>;
  shared: Record<string, unknown>;
  createdAt: string;
  nodes: NodeRecord[];
}

export class PersistedFlow<
  S extends Record<string, unknown> = Record<string, unknown>,
  P extends Record<string, unknown> = Record<string, unknown>
> extends Flow<S, P> {
  private readonly runId: string;
  private readonly kv: KVStore;

  constructor(start: BaseNode<any, any>, kv: KVStore, runId?: string) {
    super(start);
    this.kv = kv;
    this.runId = runId ?? crypto.randomUUID();
  }

  async run(shared: S): Promise<Action | undefined> {
    await this.ensureRecord(shared);
    while (await this.step()) {}
    const flow = await this.kv.read<FlowRecord>(`flow:${this.runId}`);
    return flow?.nodes.at(-1)?.action as Action | undefined;
  }

  async step(): Promise<boolean> {
    const key = `flow:${this.runId}`;
    const flow = (await this.kv.read<FlowRecord>(key))!;

    let cursor: BaseNode<any, any> | undefined = this.start;
    for (const n of flow.nodes)
      cursor = cursor?.getNextNode((n.action as Action) || "default");
    if (!cursor) return false;

    const params = flow.params as P;
    const shared = flow.shared as S;

    let action: Action | undefined = "default";
    let error: string | undefined;

    try {
      cursor.setParams(params as any);
      action = await cursor._run(shared);
    } catch (e) {
      error = (e as Error).message;
    }

    flow.nodes.push({ nodeName: cursor.constructor.name, action, error });
    flow.shared = shared;
    await this.kv.write(key, flow);
    return true;
  }

  static async attach<S extends Record<string, unknown>>(
    kv: KVStore,
    runId: string,
    start: BaseNode<any, any>
  ): Promise<PersistedFlow<S>> {
    const flow = await kv.read<FlowRecord>(`flow:${runId}`);
    if (!flow) throw new Error("flow not found");
    const pf = new PersistedFlow<S>(start, kv, runId);
    pf.setParams(flow.params);
    return pf;
  }

  async getShared(): Promise<S | undefined> {
    const flow = await this.kv.read<FlowRecord>(`flow:${this.runId}`);
    return flow?.shared as S | undefined;
  }

  async setShared(newShared: S): Promise<void> {
    const key = `flow:${this.runId}`;
    const flow = (await this.kv.read<FlowRecord>(key))!;
    flow.shared = structuredClone(newShared);
    await this.kv.write(key, flow);
  }

  getRunId(): string {
    return this.runId;
  }

  async init(shared: S): Promise<void> {
    await this.ensureRecord(shared);
  }

  private async ensureRecord(shared: S): Promise<void> {
    const key = `flow:${this.runId}`;
    const exists = await this.kv.read(key);
    if (exists) return;

    const record: FlowRecord = {
      flowName: "koala-code-reader",
      params: this._params as Record<string, unknown>,
      shared: structuredClone(shared),
      createdAt: new Date().toISOString(),
      nodes: [],
    };
    await this.kv.write(key, record);
  }
}
