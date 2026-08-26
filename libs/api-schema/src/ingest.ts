import { z } from 'zod';

/** 入库请求：namespace + 可选 dry-run。 */
export const IngestRequest = z.object({
  namespace: z.enum(['notion', 'md']),
  dryRun: z.boolean().default(false),
});
export type IngestRequest = z.infer<typeof IngestRequest>;

/** 阶段名：4 种 phase。 */
export const PhaseName = z.enum(['fetch', 'diff', 'embed', 'write']);
export type PhaseName = z.infer<typeof PhaseName>;

/** phase 事件：从 main.ts stdout parse 出来的结构化数据。 */
export const PhaseEvent = z.object({
  name: PhaseName,
  ms: z.number(),
  payload: z.record(z.string(), z.unknown()),
});
export type PhaseEvent = z.infer<typeof PhaseEvent>;

/** 终态事件：子进程 exit 0。 */
export const DoneEvent = z.object({
  namespace: z.enum(['notion', 'md']),
  dryRun: z.boolean(),
  added: z.number(),
  modified: z.number(),
  removed: z.number(),
  totalMs: z.number(),
});
export type DoneEvent = z.infer<typeof DoneEvent>;

/** 错误事件：子进程 exit ≠ 0 / spawn 失败 / 超时。 */
export const ErrorEvent = z.object({
  message: z.string(),
  exitCode: z.number().int().optional(),
  stderrTail: z.string().optional(),
});
export type ErrorEvent = z.infer<typeof ErrorEvent>;
