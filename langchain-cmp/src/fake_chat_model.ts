/**
 * langchain-cmp/src/fake_chat_model.ts
 *
 * Fake ChatModel —— 用于单元测试 / CI 验证工具调度，不依赖真实 LLM。
 *
 * v1.x 推荐 SimpleChatModel：只需实现 _call，内部自动桥接 _generate / _stream。
 * 给一段预设的 AIMessage 序列，模型会按顺序消费；耗尽则抛错（避免静默返回最后一条）。
 *
 * 给类一个名字（FakeChatModel），避免导出匿名类 + TS4094（private inherited
 * members may not be private/protected on exported anonymous class）。
 */

import { SimpleChatModel } from '@langchain/core/language_models/chat_models';
import type { BaseMessage, AIMessage } from '@langchain/core/messages';

class FakeChatModel extends SimpleChatModel {
  private cursor = 0;

  constructor(private readonly responses: AIMessage[]) {
    super({});
  }

  async _call(_messages: BaseMessage[], _options: this['ParsedCallOptions']): Promise<string> {
    const ai = this.responses[this.cursor++];
    if (!ai) throw new Error('fake chat exhausted');
    return typeof ai.content === 'string' ? ai.content : '';
  }

  _llmType() {
    return 'fake';
  }
}

export function createFakeChatModel(responses: AIMessage[]) {
  return new FakeChatModel(responses);
}
