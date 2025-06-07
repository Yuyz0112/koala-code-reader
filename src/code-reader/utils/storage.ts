import { LanguageModelV1 } from "ai";

export type SharedStorage = {
  basic: {
    repoName: string;
    mainGoal: string;
    specificAreas?: string;
    fileStructure: string; // tree-like structure of the codebase
    githubUrl?: string; // GitHub repository URL for file reading
    githubRef?: string; // GitHub branch/tag/ref for file reading

    askUser?: string; // if current input is not enough to get entry file, ask user for more information
  };

  currentFile?: {
    name: string;
    analysis?: {
      summary: string;
    };
  };

  nextFile?: {
    name: string;
    reason: string;
  };

  userFeedback?:
    | {
        action: "accept";
        reason?: string;
      }
    | {
        action: "reject";
        reason: string;
      }
    | {
        action: "refined";
        userSummary: string;
        reason?: string;
      };

  allSummaries: Array<{
    filename: string;
    summary: string;
  }>;

  summariesBuffer: Array<{
    filename: string;
    summary: string;
  }>;

  reducedOutput: string;

  completed: boolean;

  __ctx: {
    models: {
      default: LanguageModelV1;
    };
  };
};

export type Listener<Payload> = (payload: Payload) => void;

export class EventBus<Events extends Record<string, any>> {
  private listeners: {
    [K in keyof Events]?: Set<Listener<Events[K]>>;
  } = {};

  on<K extends keyof Events>(
    event: K,
    listener: Listener<Events[K]>
  ): () => void {
    (this.listeners[event] ??= new Set()).add(listener);
    return () => this.off(event, listener);
  }

  once<K extends keyof Events>(
    event: K,
    listener: Listener<Events[K]>
  ): () => void {
    const wrapper: Listener<Events[K]> = (payload) => {
      this.off(event, wrapper);
      listener(payload);
    };
    return this.on(event, wrapper);
  }

  off<K extends keyof Events>(event: K, listener: Listener<Events[K]>): void {
    this.listeners[event]?.delete(listener);
    if (this.listeners[event]?.size === 0) delete this.listeners[event];
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    const snapshot = this.listeners[event] ? [...this.listeners[event]!] : [];
    for (const l of snapshot) l(payload);
  }

  clear(): void {
    this.listeners = {};
  }
}

export const eventBus = new EventBus<{
  send: string;
  generateText: string;
  readFile: string;
  improveBasicInput: string;
  userFeedback: string;
}>();
