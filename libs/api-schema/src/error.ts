import { z } from 'zod';

/**
 * 全局 API 错误返回体。
 * - `error`: 人读 message
 * - `code`:  程序读枚举
 * - `details`: 可选补充信息（如缺失的 env key 列表）
 */
export const ApiError = z.object({
  error: z.string(),
  code: z.enum([
    'bad_request',
    'unauthorized',
    'not_found',
    'env_missing',
    'ingest_failed',
    'lance_error',
    'embed_error',
  ]),
  details: z.record(z.string(), z.unknown()).optional(),
});

export type ApiError = z.infer<typeof ApiError>;
