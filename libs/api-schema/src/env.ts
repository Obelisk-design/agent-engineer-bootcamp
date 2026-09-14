import { z } from 'zod';

/** 单个 namespace 的健康状态。 */
export const NamespaceHealth = z.object({
  ready: z.boolean(),
  missing: z.array(z.string()),
});
export type NamespaceHealth = z.infer<typeof NamespaceHealth>;

/** /api/health 响应。Day 24：namespaces 用 Record 通用化（统一库后只需 corpus）。 */
export const HealthResponse = z.object({
  ok: z.boolean(),
  namespaces: z.record(z.string(), NamespaceHealth),
});
export type HealthResponse = z.infer<typeof HealthResponse>;
