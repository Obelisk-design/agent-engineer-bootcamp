/**
 * libs/llm/message.ts
 *
 * ChatClient 抽象层的最小消息契约。
 *
 * 今天（Day 02）的边界：
 * - role 严格三值：system / user / assistant（其他 role 一律不加）
 * - content 严格 string（多模态 / part-array 不在今天讨论）
 * - 字段 readonly（消息发出即终态，调用方不许 mutate）
 * - 不加 name / timestamp / id / metadata / tool_* 等未来字段
 *
 * 渐进扩展路径（写在这里作 TODO，未来 day 才展开）：
 * - assistant 需要表达 refusal → 升级为判别联合，assistant case 加 refusal?: string
 * - content 多模态 → content: string | ContentPart[]
 * - 多说话人 → Message 加 name?: string
 */

export type Role = 'system' | 'user' | 'assistant';

export interface Message {
  readonly role: Role;
  readonly content: string;
}
