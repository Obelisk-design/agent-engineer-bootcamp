export interface ConversationItem {
  readonly role: 'user' | 'assistant' | 'thinking' | 'error';
  readonly text: string;
  readonly streaming: boolean;
}

export interface TimelineItem {
  readonly id: number;
  readonly title: string;
  readonly detail: string | null;
  readonly status: 'done' | 'active' | 'error';
  readonly kind: string;
  readonly meta?: Record<string, unknown> | null;
}

export interface ContextRow {
  readonly iteration: number;
  readonly promptTokens: number;
  readonly limit: number;
}

export interface RunSummary {
  readonly totalPromptTokens: number;
  readonly totalCompletionTokens: number;
  readonly peakPromptTokens: number;
  readonly iterations: number;
}

export interface LatestUsage {
  readonly iteration: number;
  readonly promptTokens: number;
  readonly completionTokens: number;
}
