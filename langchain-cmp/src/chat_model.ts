/**
 * langchain-cmp/src/chat_model.ts
 *
 * 真实 ChatOpenAI 工厂。
 *
 * 通过仓库根 .env 读取 OPENAI_API_KEY / OPENAI_BASE_URL / MODEL_NAME，
 * 默认 dev 网关 OpenAI 兼容 provider。temperature=0 保证工具调度可重复。
 *
 * 跑场景前需要 .env 含上述三个变量；缺一不可（与 examples/langchain-side/ 一致）。
 */

import 'dotenv/config';
import { ChatOpenAI } from '@langchain/openai';

export function createChatModel() {
  return new ChatOpenAI({
    model: process.env.MODEL_NAME ?? 'gpt-4o-mini',
    configuration: {
      baseURL: process.env.OPENAI_BASE_URL,
    },
    apiKey: process.env.OPENAI_API_KEY,
    temperature: 0,
  });
}
