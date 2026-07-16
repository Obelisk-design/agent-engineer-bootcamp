/**
 * examples/day01/ex_003_chat_with_compression.ts
 *
 * 演示「滑动窗口 + 摘要压缩」的多轮对话管理策略：
 *   - system 永远保留
 *   - 旧对话超过阈值 → 触发摘要（用一次轻量 LLM 调用压缩）
 *   - 摘要以 system 后缀形式注入 + 最近 K 轮原文保留
 *
 * 用法：
 *   1. 复制 .env.example 到 .env，填入 OPENAI_API_KEY
 *   2. pnpm exec tsx examples/day01/ex_003_chat_with_compression.ts
 *
 * 进阶：如需更精确的 token 计数（而非字符估算），安装：
 *   pnpm add gpt-tokenizer
 *   代码会自动检测并切换到精确模式。
 */

import 'dotenv/config';

import OpenAI from 'openai';

// ---------- 1. Token 计数（自动降级：精确 → 字符估算） ----------

interface TokenCounter {
  count: (text: string) => number;
  label: string;
}

async function buildTokenCounter(): Promise<TokenCounter> {
  try {
    // gpt-tokenizer 是可选依赖；未安装时自动降级到字符估算
    // @ts-expect-error - 可选依赖，未安装时走 catch 分支
    const mod = await import('gpt-tokenizer');
    const enc = mod.encodingForModel('gpt-4o');
    return {
      count: (text) => enc.encode(text).length,
      label: 'gpt-tokenizer (precise)',
    };
  } catch {
    // 字符 / 4 ≈ token 数，对中文 / emoji 偏粗，但能跑
    return {
      count: (text: string) => Math.ceil(text.length / 4),
      label: 'char/4 (fallback, install gpt-tokenizer for precision)',
    };
  }
}

// ---------- 2. 摘要触发器 ----------

const SUMMARY_TRIGGER_TOKENS = 120; // demo 用小阈值，便于触发（约 5-6 轮后）
const KEEP_RECENT_TURNS = 3; // 保留最近 3 轮原文

type Role = 'system' | 'user' | 'assistant';
interface Msg {
  role: Role;
  content: string;
}

// ---------- 3. 对话管理器 ----------

class ConversationManager {
  private history: Msg[] = [];
  private cachedSummary: string | null = null;

  constructor(
    private readonly client: OpenAI,
    private readonly model: string,
    private readonly systemPrompt: string,
    private readonly counter: TokenCounter,
  ) {}

  /** 调一次对话 */
  async chat(userInput: string): Promise<string> {
    await this.maybeCompress();

    const reqMessages = this.buildRequestMessages(userInput);

    const completion = await this.client.chat.completions.create({
      model: this.model,
      messages: reqMessages,
      temperature: 0.7,
    });

    const reply = completion.choices[0]?.message;
    const text = reply?.content ?? '';

    this.history.push({ role: 'user', content: userInput });
    this.history.push({ role: 'assistant', content: text });

    return text;
  }

  /** 当历史超过阈值，触发摘要 */
  private async maybeCompress(): Promise<void> {
    const total = this.countHistoryTokens();
    if (total < SUMMARY_TRIGGER_TOKENS) return;

    const recentCount = KEEP_RECENT_TURNS * 2; // user + assistant 各一条
    const toCompress = this.history.slice(0, -recentCount);
    const toKeep = this.history.slice(-recentCount);

    if (toCompress.length === 0) return;

    console.log(
      `\n[compress] 历史 token≈${total} 超过阈值 ${SUMMARY_TRIGGER_TOKENS}，压缩 ${toCompress.length} 条 → 保留 ${toKeep.length} 条`,
    );

    this.cachedSummary = await this.summarize(toCompress);
    this.history = toKeep;
    console.log(
      `[compress] 完成。压缩后历史 token≈${this.countHistoryTokens()}，摘要长度=${this.cachedSummary.length} 字\n`,
    );
  }

  private async summarize(oldMessages: Msg[]): Promise<string> {
    const transcript = oldMessages.map((m) => `[${m.role}] ${m.content}`).join('\n');

    const prompt = this.cachedSummary
      ? `你之前对历史的摘要：\n${this.cachedSummary}\n\n新增对话：\n${transcript}\n\n请输出更新后的整体摘要（≤200 字），保留关键事实、用户偏好、未解决问题。`
      : `请把以下对话浓缩成一段摘要（≤200 字），保留关键事实、用户偏好、未解决问题：\n\n${transcript}`;

    const res = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        {
          role: 'system',
          content: '你是一个对话摘要助手，只输出摘要本身，不要任何前言或解释。',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.2, // 摘要要稳定
    });

    return res.choices[0]?.message?.content?.trim() ?? '';
  }

  private buildRequestMessages(newUserInput: string): Msg[] {
    const sys: Msg = {
      role: 'system',
      content: this.cachedSummary
        ? `${this.systemPrompt}\n\n[对话历史摘要]\n${this.cachedSummary}`
        : this.systemPrompt,
    };

    const recent = this.history.slice(-KEEP_RECENT_TURNS * 2);
    return [sys, ...recent, { role: 'user', content: newUserInput }];
  }

  private countHistoryTokens(): number {
    return this.history.reduce((sum, m) => sum + 4 + this.counter.count(m.content), 0);
  }

  // ---------- 调试探针 ----------
  getHistoryLength(): number {
    return this.history.length;
  }
  getSummaryLength(): number {
    return this.cachedSummary?.length ?? 0;
  }
}

// ---------- 4. 脚本化多轮演示（不读 stdin，可直接 tsx 跑） ----------

async function main(): Promise<void> {
  const apiKey: string = process.env.OPENAI_API_KEY ?? '';
  const baseURL: string = process.env.OPENAI_BASE_URL ?? 'http://10.230.10.242:8000/v1';
  const model: string = process.env.MODEL_NAME ?? 'ai-coding';

  if (!apiKey) throw new Error('OPENAI_API_KEY is required');

  const counter = await buildTokenCounter();
  console.log(`[config] baseURL=${baseURL} model=${model}`);
  console.log(`[config] tokenizer=${counter.label}`);
  console.log(
    `[config] 触发阈值=${SUMMARY_TRIGGER_TOKENS} tokens, 保留最近 ${KEEP_RECENT_TURNS} 轮\n`,
  );

  const client = new OpenAI({ apiKey, baseURL });
  const cm = new ConversationManager(
    client,
    model,
    '你是一个会做家常菜的大厨，回答简洁、口语化，不超过 80 字。',
    counter,
  );

  const script = [
    '番茄炒蛋怎么做好吃？',
    '要放糖吗？放多少？',
    '糖可以用生抽代替吗？',
    '鸡蛋要打散到什么程度？',
    '我只有 2 个鸡蛋，够几个人吃？',
    '番茄要先去皮吗？',
    '做失败了翻车了怎么办？',
    '不想吃番茄炒蛋了，教我做可乐鸡翅',
    '鸡翅要提前腌制吗？腌多久？',
    '可乐可以用雪碧代替吗？',
  ];

  for (let i = 0; i < script.length; i++) {
    const userInput = script[i];
    if (!userInput) continue; // satisfies noUncheckedIndexedAccess
    const turn = i + 1;
    console.log(`\n========== 第 ${turn} 轮 ==========`);
    console.log(`[user] ${userInput}`);

    const reply = await cm.chat(userInput);
    console.log(`[assistant] ${reply}`);
    console.log(`[stats] history=${cm.getHistoryLength()} 条, summary=${cm.getSummaryLength()} 字`);
  }

  console.log('\n[done] 演示结束。观察上方"compress"日志可看到摘要触发时机。');
}

await main();
