import { z } from 'zod';

/** 单个 namespace 的健康状态。 */
export const NamespaceHealth = z.object({
  ready: z.boolean(),
  missing: z.array(z.string()),
});
export type NamespaceHealth = z.infer<typeof NamespaceHealth>;

/** /api/health 响应。 */
export const HealthResponse = z.object({
  ok: z.boolean(),
  namespaces: z.object({
    notion: NamespaceHealth,
    md: NamespaceHealth,
  }),
});
export type HealthResponse = z.infer<typeof HealthResponse>;
