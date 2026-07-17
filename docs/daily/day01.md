# Day 01 — TypeScript 工程脚手架 + OpenAI 兼容 API + nodemon 热更新

> 65 天 AI Agent 工程师训练营 · Day 01 / 65
> 主题：把项目骨架立起来，跑通第一个 LLM 调用，建立"边写边跑"的工作流

---

## 🎯 今日目标

1. ✅ 建立可演进 65 天的 TypeScript monorepo
2. ✅ 配置完整的开发工具链（pnpm + TS strict + ESLint + Prettier + Vitest + Husky）
3. ✅ 跑通第一个 OpenAI 兼容 API 调用 demo
4. ✅ 装好 nodemon 热更新，建立"改一行看效果"的工作流

## 📦 今日产出物

```
agent-engineer-bootcamp/
├── .github/workflows/ci.yml       # Node 22/24 matrix CI
├── .husky/                         # pre-commit + commit-msg
├── docs/daily/day01.md             # 你正在看的就是
├── examples/day01/
│   ├── ex_001_chat_completion.ts   # OpenAI 兼容 API 调用
│   └── ex_002_nodemon_smoke.ts     # nodemon 热更新 smoke 测试
├── libs/index.ts                   # 复用层占位
├── apps/index.ts                   # 业务编排层占位
├── tests/smoke.test.ts             # CI 兜底
├── package.json                    # 依赖 + scripts
├── tsconfig.json                   # strict + NodeNext + ES2023
├── tsconfig.build.json             # tsc build 配置
├── tsconfig.test.json              # tsc test 配置
├── eslint.config.js                # ESLint 9 flat config
├── vitest.config.ts                # Vitest 2 配置
├── nodemon.json                    # 热更新 watch 规则
├── commitlint.config.js            # Conventional Commits 强制
├── .nvmrc                          # Node 22
├── .env / .env.example             # gitignored / commit 模板
└── README.md                       # TS 视角重写
```

## 🔧 关键命令速查

```bash
# === 一次性安装 ===
corepack enable
corepack prepare pnpm@latest --activate
pnpm install
pnpm prepare            # 装 husky hooks

# === 日常开发 ===
pnpm dev:smoke          # 跑 smoke（不调 API，看 nodemon）
pnpm dev:example        # 跑 chat demo（调 API，~500 tokens/次）

# === 质量门 ===
pnpm typecheck          # tsc --noEmit
pnpm lint               # eslint
pnpm format:check       # prettier
pnpm test               # vitest run
pnpm build              # tsc -p tsconfig.build.json

# === nodemon 触发重启 ===
# 编辑 libs/apps/examples/scripts 下任一 .ts 文件 → 自动 restart
# 手动重启：在 nodemon 终端输入 rs 回车
# 手动重启（外部）：kill -HUP <pid>
```

## 📚 知识点

### 1. 为什么用 pnpm 而不是 npm / yarn？

| 维度          | npm                             | yarn            | **pnpm**                       |
| ------------- | ------------------------------- | --------------- | ------------------------------ |
| 磁盘占用      | 大（每个项目独立 node_modules） | 大              | **小（全局 store + 硬链接）**  |
| 安装速度      | 慢                              | 中              | **快 2-3x**                    |
| Monorepo 支持 | workspaces (简陋)               | workspaces (OK) | **原生（filter / recursive）** |
| 严格性        | 平铺（可访问未声明依赖）        | 平铺            | **符号链接（强制声明依赖）**   |
| Node 内置     | 是                              | 否              | 否（corepack 启用）            |

**结论**：pnpm 是当前 Node 生态最优解，单一工具替代 npm + yarn。

### 2. TypeScript strict 配置的含义

```json
{
  "strict": true, // 打开下面所有
  "noUncheckedIndexedAccess": true, // arr[0] 类型是 T | undefined
  "exactOptionalPropertyTypes": true, // {x?: T} ≠ {x: T | undefined}
  "verbatimModuleSyntax": true // import type 必须显式
}
```

`strict: true` 实际打开 8 个开关：

- `noImplicitAny` —— 必须显式标类型
- `strictNullChecks` —— `null` / `undefined` 必须显式处理
- `strictFunctionTypes` —— 函数参数逆变检查
- `strictBindCallApply` —— `bind` / `call` / `apply` 类型严格
- `strictPropertyInitialization` —— class 属性必须初始化
- `alwaysStrict` —— 输出 JS 用 strict mode
- `useUnknownInCatchVariables` —— `catch (e)` 的 `e` 是 `unknown`
- `noImplicitThis` —— `this` 必须有类型

**严格性的代价**：写代码更慢（要补类型）。  
**严格性的收益**：运行时 bug 大幅减少，重构信心大幅提升。

### 3. OpenAI SDK 兼容任意 /v1 接口

```ts
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: 'http://10.230.10.242:8000/v1', // ← 任意 OpenAI 兼容服务
});
```

只要服务实现了 OpenAI 的 `/v1/chat/completions` 协议，就可以直接用 OpenAI SDK：

- OpenAI 官方
- Anthropic（部分兼容）
- 通义千问 / 智谱 GLM / DeepSeek / 月之暗面（都有 OpenAI 兼容端点）
- 自部署 vLLM / Ollama / LM Studio

### 4. nodemon + tsx 的组合

| 工具        | 角色                                            |
| ----------- | ----------------------------------------------- |
| **tsx**     | 直接跑 `.ts` 文件（无需编译步骤，esbuild 内核） |
| **nodemon** | watch 文件变化，自动重启进程                    |

组合：`nodemon --exec tsx xxx.ts` = "改 .ts 立即看效果"。

为什么不直接用 `tsx watch`？

- nodemon 的 ignore / delay / restartable / verbose 控制更精细
- nodemon 用 10 年验证过的 fs.watch 机制
- 大型项目（几千文件）nodemon 比 tsx watch 更稳

## ❓ 思考题

1. `tsconfig.json` 里 `module: "NodeNext"` 和 `moduleResolution: "NodeNext"` 是什么含义？跟 `"ESNext"` 的区别？
2. `pnpm` 严格依赖检查（hoisted 不存在）vs npm 平铺依赖，对代码质量有什么影响？
3. 为什么 `verbatimModuleSyntax: true` 重要？不打开会怎样？
4. OpenAI 兼容接口的"兼容性"是有限的——比如 Anthropic 的 prompt caching、function calling 参数可能不完全一样。怎么验证某个服务真的兼容？

## ⚠️ 今日踩坑

### 1. classifier 拦截 key 泄露

**症状**：跑 `pnpm add openai` 时被 classifier deny（OpenAI key 进 transcript 触发）。
**修法**：把 key 写进 `.env`（gitignored），用 `dotenv` 库加载。
**Why**：任何包含 key 的命令都会进 transcript，必须用文件 + 库加载。

### 2. CI matrix 选了 Node 20

**症状**：CI 失败 `ERR_UNKNOWN_BUILTIN_MODULE: node:sqlite`。
**根因**：pnpm 11.6.0 需要 Node ≥22.13，Node 20 不够新。
**修法**：CI matrix 改成 Node 22 + 24（Node 20 已被 GitHub Actions deprecate）。
**Why**：早期写 CI 时贪多（Node 20/22 都测），但 Node 20 即将退役，pnpm 已不兼容。

### 3. `package.json` 里 `packageManager` 和 CI workflow `version: 11` 冲突

**症状**：`Multiple versions of pnpm specified`。
**修法**：删 CI 的 `version: 11`，让 action 自动从 `package.json` 读。
**Why**：单一事实源原则——版本号只在一处定义。

### 4. `examples/index.ts` 和 `examples/day01/` 共存

**问题**：`examples/` 下既有占位 `index.ts`，又有 day01/ 子目录。
**修法**：保留 `examples/index.ts` 作为公共导出点；Day 内的 demo 放 `examples/dayNN/`。
**设计意图**：未来 `examples/day02/` `examples/day03/` 平铺，按时间维度组织。

## 📋 验收清单

- [x] `node --version` ≥ 22
- [x] `pnpm --version` 输出
- [x] `pnpm install` 成功
- [x] `pnpm typecheck` 通过（strict 模式）
- [x] `pnpm lint` 通过（0 errors）
- [x] `pnpm format:check` 通过
- [x] `pnpm test` 通过（smoke test）
- [x] `pnpm build` 通过（输出 dist/）
- [x] `pnpm dev:example` 跑通（通义千问 Qwen）
- [x] `pnpm dev:smoke` 跑通（nodemon 热重启验证）
- [x] CI Node 22 + 24 全绿
- [x] `.env` 在 .gitignore 里（key 安全）
- [x] Conventional Commits 通过 commitlint

## 🚀 Day 02 预告

**TypeScript 工程化进阶 + libs/llm/ 第一个正式组件**

具体内容：

1. 把 `examples/day01/ex_001_chat_completion.ts` 重构进 `libs/llm/`：
   - `libs/llm/client.ts` — OpenAI 客户端封装（环境变量加载 + 重试 + 超时）
   - `libs/llm/types.ts` — 类型定义（ChatMessage / ChatOptions）
   - `libs/llm/index.ts` — 公共 API 导出
2. 配套测试 `tests/libs/llm/`（用 MSW 或 vi.mock 模拟 HTTP）
3. 在 `examples/day02/` 加更复杂的 demo（streaming / function calling）
4. CI 加 typecheck 严格度升级（开 `noUncheckedIndexedAccess` 的子集检查）

**今日产出**：`pnpm dev:example` 一跑就通，libs/llm 是后续所有 Agent / RAG 项目的底座。
