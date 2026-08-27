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
 *
 * 🆕 Day 14 fix: 顶部 import 'dotenv/config' 让所有 import 此模块的进程自动加载仓库根 .env
 * - 之前 examples/* 都显式 import dotenv，但 apps/api/src/ 漏了，导致 dev:rag 后端读不到 OPENAI_API_KEY
 * - dotenv 默认从 cwd 找 .env，仓库根 cwd = 后端能找到 .env（scripts/with-ports.ts 拉起 tsx 时 cwd 是仓库根）
 * - 顶层 import 副作用：第一次 import env.ts 就触发 dotenv.config()，无需在每个 handler 重复
 */

import 'dotenv/config';
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
