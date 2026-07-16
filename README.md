# Agent Engineer Bootcamp

> **65 天 AI Agent 工程师训练营 — TypeScript (Node.js) 工程化驱动的 Agent / RAG / LLM 应用仓库**
>
> **Day 01 – Day 20**：TypeScript / Node.js
> **Day 21 – Day 65**：待定

[![Node](https://img.shields.io/badge/node-%3E%3D22-brightgreen)](https://nodejs.org/)
[![pnpm](https://img.shields.io/badge/pnpm-managed-blueviolet)](https://pnpm.io/)
[![TypeScript](https://img.shields.io/badge/typescript-5.7+-blue)](https://www.typescriptlang.org/)
[![ESLint](https://img.shields.io/badge/eslint-9.x-4b32c3)](https://eslint.org/)
[![Vitest](https://img.shields.io/badge/vitest-2.x-6e9f18)](https://vitest.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![CI](https://github.com/Obelisk-design/agent-engineer-bootcamp/actions/workflows/ci.yml/badge.svg)](https://github.com/Obelisk-design/agent-engineer-bootcamp/actions)

## 定位

本仓库**不是 Demo 集合**，而是 65 天训练营的**工程交付物**：

- 每个 `apps/` 都是可独立部署 / 演示的完整应用
- 每个 `libs/` 都是可复用、可测试、有类型注解的 SDK
- 每个 PR 都过本地门（Husky + lint-staged）+ 远端门（GitHub Actions CI）
- 每个阶段都有对应的设计文档、测试、踩坑记录

**适合作为 AI Agent / LLM 应用工程师的面试展示仓库**——展示的不是"我会调 API"，而是"我能交付一个能持续演进的生产级 AI 工程"。

## 目录结构

```
agent-engineer-bootcamp/
├── docs/           # 学习文档、架构设计、ADR
├── notes/          # 踩坑记录、cheat sheet、心路历程
├── prompts/        # Prompt 模板库（system / few-shot / eval）
├── examples/       # 独立可运行的最小示例
├── apps/           # 端到端应用（Chat / RAG / Agent）
├── libs/           # 自研 SDK / Memory / Tool / RAG 通用组件
├── tests/          # 单元测试 + 集成测试
├── scripts/        # 工程脚本（迁移 / 种子 / 基准 / 发布）
├── resources/      # 资源（数据集、模型权重、缓存；gitignored）
├── .github/        # GitHub Actions CI 配置
├── node_modules/   # 依赖（gitignored）
├── package.json    # 依赖 + scripts + 工具配置
├── pnpm-lock.yaml  # 锁文件（必须 commit）
├── tsconfig.json   # TypeScript 配置（strict）
├── eslint.config.js
├── vitest.config.ts
├── .husky/         # Git hooks
└── README.md
```

每个目录的**存在原因**见各自目录内的 `.gitkeep` 注释，或翻到文末 [目录详解](#目录详解)。

## 快速开始

```bash
# 1. 安装 pnpm（如果还没装）
corepack enable
corepack prepare pnpm@latest --activate

# 2. 克隆 + 装依赖
git clone https://github.com/Obelisk-design/agent-engineer-bootcamp.git
cd agent-engineer-bootcamp
pnpm install

# 3. 装 Git hooks
pnpm prepare

# 4. 跑质量门
pnpm typecheck      # TypeScript 类型检查
pnpm lint           # ESLint
pnpm format:check   # Prettier
pnpm test           # Vitest
pnpm build          # tsc 编译

# 5. 跑一个示例
pnpm exec tsx examples/ex_001_hello.ts  # 或 node examples/ex_001_hello.js
```

## 技术栈

| 维度        | 选型                                         | 理由                                   |
| ----------- | -------------------------------------------- | -------------------------------------- |
| 包管理      | **pnpm**                                     | disk-efficient、快、原生 monorepo 支持 |
| 语言        | **TypeScript 5.7 strict**                    | 类型即契约                             |
| Lint        | **ESLint 9 flat config** + typescript-eslint | 标准、规则全                           |
| Format      | **Prettier 3**                               | 事实标准                               |
| 测试        | **Vitest 2**                                 | 原生 TS、快、Vite 生态                 |
| Git hooks   | **Husky 9** + lint-staged                    | commit 前只跑变更文件                  |
| Commit 规范 | **commitlint** + Conventional Commits        | 自动化版本管理                         |
| CI          | **GitHub Actions** Node 20 + 22 matrix       | 兼容性验证                             |

## 开发规范

- **Node 版本**：`>= 22`（nvm 自动切换：`.nvmrc`）
- **Commit 风格**：[Conventional Commits](https://www.conventionalcommits.org/)（commitlint 强制）
- **代码入仓门槛**：pre-commit 全绿 + CI 全绿
- **lib 编写原则**：必须有 `index.ts` 导出公共 API，必须有 test，必须有 type hint
- **app 编写原则**：必须有 `main.ts` 入口、`README.md`、`config` 分离

## 训练营进度

### Day 01 – Day 20：TypeScript / Node.js

- [x] Day 01 — 工程脚手架与开发环境（pnpm + TS + ESLint + Prettier + Vitest + Husky + CI）
- [ ] Day 02 — TypeScript 工程化进阶（types / generics / module system / async）
- [ ] Day 03 — Node.js 进阶（HTTP / streaming / worker threads）
- [ ] ...

### Day 21 – Day 65：待定

根据前 20 天进展决定（候选：Python 切换 / 继续 TS / 混合 monorepo）。

## 贡献

本仓库为**个人训练营记录**，欢迎 issue 讨论 / 提问，但不接受外部 PR（保持 commit author 单一）。

如果你也在做类似的训练营，欢迎 fork 走自己的版本。

## License

[MIT](LICENSE) © 2026 zihai

---

## 目录详解

> 每个目录为什么存在、什么时候往里放什么——避免"先建了再说"造成的目录污染。

### `docs/` — 长期沉淀的设计与决策

放**写给别人看**的文档：每日学习笔记、架构设计文档、ADR（Architecture Decision Records）。
**不**放：debug 过程、临时想法（那些去 `notes/`）。

### `notes/` — 短期、零碎、个人

放**写给自己看**的内容：踩坑记录、命令 cheat sheet、灵感片段、待整理的 todo。
不强制格式、不要求完整、定期整理后转 `docs/`。

### `prompts/` — Prompt 资产

system prompt / few-shot examples / prompt eval 集合都放这里。
**不**在代码里硬编码 prompt——全部抽成文件，便于版本管理、A/B 测试、跨项目复用。

### `examples/` — 教学性最小代码

每个 `.ts` 一个例子，专注展示某个 API 或模式，**不**做工程化封装。
命名：`ex_NNN_<topic>.ts`，可独立 `pnpm exec ts-node examples/ex_NNN_xxx.ts` 跑通。

### `apps/` — 端到端应用

业务编排层。**调用 `libs/`** 完成具体功能，**不**自己实现核心逻辑。
每个 app 子目录至少包含：`main.ts` 入口、`README.md`、`config/`、`tests/`。

### `libs/` — 复用资产

monorepo 的**核心复用层**。所有可跨 app 复用的代码都进 `libs/`。
强制要求：有 `index.ts` 导出公共 API、有 type hint、有对应测试。
按领域分子目录：`llm/`、`memory/`、`tools/`、`agent/`、`rag/`。

### `tests/` — 测试代码

结构镜像源码（`tests/libs/` ↔ `libs/`，`tests/apps/` ↔ `apps/`）。
全局 fixture 放 `tests/setup.ts`，共享测试数据放 `tests/fixtures/`。
测试分层：`unit`（默认跑）/ `integration`（CI 跑，本地用 mock）/ `slow`（CI 跳过）。

### `scripts/` — 一次性 / 工具脚本

不属于应用代码、不进入 `libs/` 的脚本：数据迁移、种子数据、性能基准、发布辅助。
**不**放长期运行的 daemon / service（那些进 `apps/`）。

### `resources/` — 大文件 / 运行时数据

数据集、模型权重、运行时缓存。**gitignored**——按需下载，不污染仓库。
唯一入 git 的是 `resources/samples/` 之类的小样例输入输出。
