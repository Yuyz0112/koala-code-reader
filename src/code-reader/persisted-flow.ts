/**
 * --------------------------------------------------
 * Minimal PersistedFlow implementation backed by a pluggable KV store.
 *
 * Storage layout:
 *   flow:<runId>                -> { flowName, params, createdAt, completedAt }
 *   flow:<runId>:meta           -> { total, done, running, error }
 *   flow:<runId>:node:<index>   -> { nodeName, params, status, action, startedAt, completedAt }
 *
 * The KV store can be any system (PostgreSQL, Redis, S3, etc.) that implements
 * simple read / write semantics.
 * --------------------------------------------------
 */

import { BaseNode, Flow } from "pocketflow";

type Action = string;

//------------------------------------------------------------------------------------------
// KV Store abstraction
//------------------------------------------------------------------------------------------
export interface KVStore {
  read<T = any>(key: string): Promise<T | undefined>;
  write(key: string, value: any): Promise<void>;
}

//------------------------------------------------------------------------------------------
// PersistedFlow
//------------------------------------------------------------------------------------------
export class PersistedFlow<
  S = unknown,
  P extends Record<string, unknown> = Record<string, unknown>
> extends Flow<S, P> {
  private runId: string;
  private kv: KVStore;
  private nodeIndex = 0;

  constructor(start: BaseNode<S, P>, kv: KVStore, runId?: string) {
    super(start);
    this.kv = kv;
    this.runId = runId ?? crypto.randomUUID();
  }

  // ──────────────────────────────────────────────────────────────────────────────
  // Public API
  // ──────────────────────────────────────────────────────────────────────────────
  async run(shared: S): Promise<Action | undefined> {
    await this.beginRun();
    const res = await super.run(shared);
    await this.endRun();
    return res;
  }

  // ──────────────────────────────────────────────────────────────────────────────
  // Internal helpers
  // ──────────────────────────────────────────────────────────────────────────────
  private async beginRun() {
    await this.kv.write(`flow:${this.runId}`, {
      flowName: this.constructor.name,
      params: this._params,
      createdAt: new Date().toISOString(),
    });

    await this.kv.write(`flow:${this.runId}:meta`, {
      total: 0,
      done: 0,
      running: 0,
      error: 0,
    });
  }

  private async endRun() {
    const flow = await this.kv.read<any>(`flow:${this.runId}`);
    await this.kv.write(`flow:${this.runId}`, {
      ...flow,
      completedAt: new Date().toISOString(),
    });
  }

  private async recordNodeStart(node: BaseNode, params: P) {
    const meta = (await this.kv.read<any>(`flow:${this.runId}:meta`)) || {};
    meta.total++;
    meta.running++;
    await this.kv.write(`flow:${this.runId}:meta`, meta);

    await this.kv.write(`flow:${this.runId}:node:${this.nodeIndex}`, {
      nodeName: node.constructor.name,
      params,
      status: "running",
      startedAt: new Date().toISOString(),
    });
  }

  private async recordNodeEnd(
    status: "done" | "error",
    action: Action | undefined
  ) {
    const meta = (await this.kv.read<any>(`flow:${this.runId}:meta`)) || {};
    meta.running--;
    if (status === "done") meta.done++;
    if (status === "error") meta.error++;
    await this.kv.write(`flow:${this.runId}:meta`, meta);

    const nodeKey = `flow:${this.runId}:node:${this.nodeIndex}`;
    const node = await this.kv.read<any>(nodeKey);
    await this.kv.write(nodeKey, {
      ...node,
      status,
      action,
      completedAt: new Date().toISOString(),
    });

    this.nodeIndex++;
  }

  protected async _orchestrate(shared: S, params?: P): Promise<void> {
    let current: ReturnType<typeof this.start.clone> | undefined =
      this.start.clone();
    const p = params || this._params;

    while (current) {
      await this.recordNodeStart(current, p);
      let status: "done" | "error" = "done";
      let action: Action | undefined = "default";

      try {
        current.setParams(p);
        action = await current._run(shared);
      } catch (err) {
        status = "error";
        console.error(err);
      }

      await this.recordNodeEnd(status, action);
      current = current.getNextNode(action)?.clone();
    }
  }

  // ──────────────────────────────────────────────────────────────────────────────
  // Static helpers
  // ──────────────────────────────────────────────────────────────────────────────
  /** Return aggregated progress information */
  static async getProgress(kv: KVStore, runId: string) {
    const meta = await kv.read<any>(`flow:${runId}:meta`);
    if (!meta) throw new Error(`Flow ${runId} not found`);
    const { total, done, running, error } = meta;
    return { total, done, running, error, progress: total ? done / total : 0 };
  }

  /** Resume an interrupted flow (simplified demo implementation) */
  static async resume<
    S,
    P extends Record<string, unknown> = Record<string, unknown>
  >(kv: KVStore, runId: string, start: BaseNode<S, P>, shared: S) {
    const info = await kv.read<{ params: P }>(`flow:${runId}`);
    if (!info) throw new Error(`Flow ${runId} not found`);

    const pf = new PersistedFlow<S, P>(start, kv);
    pf.runId = runId; // override generated id
    pf.setParams(info.params);

    // find the first unfinished node
    let idx = 0;
    let cursor: BaseNode<S, P> | undefined = start;
    while (true) {
      const rec = await kv.read<any>(`flow:${runId}:node:${idx}`);
      if (!rec || rec.status !== "done") {
        break;
      }

      const act = (rec.action as Action) || "default";
      cursor = cursor?.getNextNode(act) as BaseNode<S, P> | undefined;
      idx++;
    }
    pf.nodeIndex = idx;
    if (cursor) pf.start = cursor;

    await pf._orchestrate(shared, info.params);
    await pf.endRun();
  }
}
