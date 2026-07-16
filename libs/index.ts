/**
 * libs — 自研 SDK / Memory / Tool / RAG 通用组件包
 *
 * monorepo 的核心复用层。所有可跨 app 复用的代码都进 libs/。
 *
 * 子目录规划：
 * - libs/llm/     — LLM 客户端封装（OpenAI / Anthropic / ...）
 * - libs/memory/  — Memory 实现（短期 / 长期 / 向量记忆）
 * - libs/tools/   — Tool 实现（搜索 / 代码执行 / 文件操作）
 * - libs/agent/   — Agent 核心抽象（BaseAgent / State / Graph）
 * - libs/rag/     — RAG 通用组件（chunker / retriever / reranker）
 *
 * 每个子模块必须有：
 * - 公共 API 在 index.ts 显式导出
 * - 完整 type hint
 * - 对应单元测试（tests/libs/<module>/）
 */

export const LIBS_VERSION = '0.1.0';
