/**
 * apps/api/src/env.ts
 *
 * .env 校验：读 process.env，返回每个 namespace 的就绪状态 + 缺失 key 列表。
 *
 * 约束：
 * - 启动时打 .env 校验（不静默 fail）
 * - notion 需要 NOTION_TOKEN + OPENAI_API_KEY
 * - md     需要 OPENAI_API_KEY
 * - search 需要 OPENAI_API_KEY（任意 namespace 搜索都需要 embedding）
 */

import type { NamespaceHealth } from '../../../libs/api-schema/src/index.js';

const REQUIRED: Record<'notion' | 'md', readonly string[]> = {
  notion: ['NOTION_TOKEN', 'OPENAI_API_KEY'],
  md: ['OPENAI_API_KEY'],
};

function checkNamespace(keys: readonly string[]): NamespaceHealth {
  const missing = keys.filter((k) => {
    const v = process.env[k];
    return v === undefined || v.length === 0;
  });
  return { ready: missing.length === 0, missing };
}

export function getNamespaceHealth(): { notion: NamespaceHealth; md: NamespaceHealth } {
  return {
    notion: checkNamespace(REQUIRED.notion),
    md: checkNamespace(REQUIRED.md),
  };
}

export function isSearchReady(): boolean {
  const v = process.env['OPENAI_API_KEY'];
  return v !== undefined && v.length > 0;
}
