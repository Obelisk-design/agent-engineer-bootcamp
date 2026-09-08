# langchain-cmp —— LangChain 编辑回环对照实验

## 项目目标

用 LangChain 全量套件 + dev 网关实现与子系统 A 同等能力的 file_read → file_edit → file_read 闭环；作为 bootcamp 自研 Agent loop 的对照实验。

不复用 `examples/langchain-side/` 任何文件，也不直接 import 主线 `libs/tools/`。仅在行为契约层对齐（绝对路径、错误前缀、原子写入）。

## 与 examples/langchain-side/ 的关系

副线 step 1–5 关注「单次 chat / chain / RAG / chunk / Tool 抽象」，尚未涉及「tool loop / agent 多轮反馈」。本项目与副线平行，单独承载该对照实验，避免与副线 stepN 编号风格冲突。

## 目录结构

```
langchain-cmp/
├── package.json
├── tsconfig.json
├── README.md
├── tools/
│   ├── file_read_tool.ts   # 复刻主线 file_read
│   └── file_edit_tool.ts   # 复刻主线 file_edit
├── src/
│   ├── chat_model.ts       # ChatOpenAI 工厂
│   └── fake_chat_model.ts  # 单元测试用 fake 模型
└── scenarios/
    ├── happy_path.ts                 # 真实 dev 网关：file_read → file_edit → file_read
    ├── multi_match_failure.ts        # replaceAll=false + 多匹配 → file_edit: 错误
    └── relative_path_rejected.ts     # 相对路径被拒绝 + 错误前缀统一
```

## 运行说明

依赖 LangChain 全量套件仅在仓库根 `devDependencies`（不进 `dependencies`，不污染 libs/apps）。

```bash
# 一次性安装（仓库根）
pnpm add -D @langchain/core @langchain/openai @langchain/community langchain

# 跑场景
pnpm exec tsx langchain-cmp/scenarios/happy_path.ts
pnpm exec tsx langchain-cmp/scenarios/multi_match_failure.ts
pnpm exec tsx langchain-cmp/scenarios/relative_path_rejected.ts
```

跑前需要仓库根 `.env` 含 `OPENAI_API_KEY` / `OPENAI_BASE_URL` / `MODEL_NAME`；dev 网关白名单仅允许 `ai-coding` / `qwen3-embedding-8b`（见 memory `dev-gateway-embedding-whitelist`）。

CI 默认不跑 happy_path（依赖 dev 网关 + 真实模型）；multi_match / relative_path 只调本地工具，可直接进 CI。

## 复盘摘要（runbook 后填）

- 代码量对比（langchain vs bootcamp 手写）
- tool 调度细节（LangChain createAgent 内部 vs bootcamp AgentEvent 14 kind）
- 错误前缀一致性问题
- dev 网关白名单 / 超时 / 重试表现
- 与副线 step 1–5 的一致性 / 差异

## 待办（runbook 后续填）
