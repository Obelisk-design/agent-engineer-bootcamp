/**
 * apps — 端到端应用包
 *
 * 业务编排层，调用 libs/ 里的可复用组件完成具体功能。
 *
 * 子目录规划：
 * - apps/chat/             — 对话应用
 * - apps/rag/              — RAG 应用
 * - apps/agent_research/   — 研究型 Agent
 *
 * 每个 app 必须有：
 * - main.ts 入口
 * - README.md
 * - config/ 分离配置
 * - tests/ 集成测试
 */

export const APPS_VERSION = '0.1.0';
