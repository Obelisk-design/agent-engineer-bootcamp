/**
 * examples/day01/ex_003_chat_with_compression.ts
 *
 * 演示「滑动窗口 + 结构化摘要压缩」的多轮对话管理策略：
 *   - system 永远保留
 *   - 旧对话超过阈值 → 触发摘要（用一次轻量 LLM 调用压缩为结构化 JSON）
 *   - 摘要以 system 后缀形式注入 + 最近 K 轮原文保留
 *
 * 结构化摘要字段：
 *   - user_facts:     用户的事实/偏好（持久跨多轮生效）
 *   - key_decisions:  对话中已做出的决定
 *   - open_questions: 尚未解决的问题
 *   - current_topic:  当前主题（一句话）
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
    // （用 require 形式避免 TS 在已安装但 API 形状变化时硬报错）
    const mod = await import('gpt-tokenizer');
    // gpt-tokenizer 3.x：直接 mod.encode(text) 即可，不再需要 encodingForModel
    return {
      count: (text: string) => mod.encode(text).length,
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

// ---------- 2. 配置与类型 ----------

const SUMMARY_TRIGGER_TOKENS = 120; // demo 用小阈值，便于触发（约 5-6 轮后）
const KEEP_RECENT_TURNS = 3; // 保留最近 3 轮原文

type Role = 'system' | 'user' | 'assistant';
interface Msg {
  role: Role;
  content: string;
}

/** 结构化摘要字段。每条 5-30 字，空字段为空数组 / 空串 */
interface Summary {
  user_facts: string[];
  key_decisions: string[];
  open_questions: string[];
  current_topic: string;
}

const EMPTY_SUMMARY: Summary = {
  user_facts: [],
  key_decisions: [],
  open_questions: [],
  current_topic: '',
};

// ---------- 3. 对话管理器 ----------

class ConversationManager {
  private history: Msg[] = [];
  private cachedSummary: Summary = { ...EMPTY_SUMMARY };

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

    const before = this.cachedSummary;
    this.cachedSummary = await this.summarize(toCompress);
    this.history = toKeep;

    console.log(`[compress] 完成。压缩后历史 token≈${this.countHistoryTokens()}`);
    console.log(`[compress] 摘要变化:`);
    console.log(`  before: ${this.renderSummary(before).replace(/\n/g, ' | ') || '(空)'}`);
    console.log(`  after:  ${this.renderSummary(this.cachedSummary).replace(/\n/g, ' | ')}\n`);
  }

  /** 用一次轻量 LLM 调用，把旧对话提炼为结构化 Summary */
  private async summarize(oldMessages: Msg[]): Promise<Summary> {
    const transcript = oldMessages.map((m) => `[${m.role}] ${m.content}`).join('\n');

    const previousBlock = this.hasSummary()
      ? `\n\n已有的旧摘要（请合并，不要丢弃其中的有效信息）：\n${JSON.stringify(this.cachedSummary, null, 2)}`
      : '';

    const userPrompt = `请把以下对话压缩为结构化摘要${this.hasSummary() ? '（含旧摘要合并）' : ''}。

输出必须是严格合法的 JSON，字段如下：
{
  "user_facts":     string[]  // 关于用户的事实/偏好（口味、身份、背景等），每条 5-30 字
  "key_decisions":  string[]  // 对话中已做出的具体决定，每条 5-30 字
  "open_questions": string[]  // 尚未解决的问题或待确认事项，每条 5-30 字
  "current_topic":  string    // 当前主题的一句话描述，不超过 30 字
}

要求：
- 没有的字段输出空数组或空字符串
- 严格输出合法 JSON，不要任何前言、解释或 markdown 代码块${previousBlock}

待摘要的对话：
${transcript}`;

    const res = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        {
          role: 'system',
          content: '你是一个对话摘要助手，严格输出合法 JSON，不要任何前言或解释。',
        },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' }, // 强制 JSON 输出
      temperature: 0.2, // 摘要要稳定
    });

    const raw = res.choices[0]?.message?.content ?? '{}';
    return this.parseSummary(raw);
  }

  /** 防御性解析：模型可能返回缺字段、错类型，全部兜底 */
  private parseSummary(raw: string): Summary {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed !== 'object' || parsed === null) return { ...EMPTY_SUMMARY };

      const obj = parsed as Record<string, unknown>;
      const asStringArray = (v: unknown): string[] =>
        Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

      return {
        user_facts: asStringArray(obj['user_facts']),
        key_decisions: asStringArray(obj['key_decisions']),
        open_questions: asStringArray(obj['open_questions']),
        current_topic: typeof obj['current_topic'] === 'string' ? obj['current_topic'] : '',
      };
    } catch {
      // 解析失败 → 返回空摘要（最坏情况：旧信息全丢，但不会崩）
      console.warn('[compress] 警告：摘要 JSON 解析失败，降级为空摘要');
      return { ...EMPTY_SUMMARY };
    }
  }

  /** Summary 是否非空（用于决定是否注入 system） */
  private hasSummary(): boolean {
    return (
      this.cachedSummary.user_facts.length > 0 ||
      this.cachedSummary.key_decisions.length > 0 ||
      this.cachedSummary.open_questions.length > 0 ||
      this.cachedSummary.current_topic !== ''
    );
  }

  /** 把 Summary 渲染成可注入 system 的多行文本 */
  private renderSummary(s: Summary): string {
    const lines: string[] = [];
    if (s.current_topic) lines.push(`- 当前主题：${s.current_topic}`);
    if (s.user_facts.length > 0) lines.push(`- 用户事实/偏好：${s.user_facts.join('；')}`);
    if (s.key_decisions.length > 0) lines.push(`- 关键决定：${s.key_decisions.join('；')}`);
    if (s.open_questions.length > 0) lines.push(`- 未解决问题：${s.open_questions.join('；')}`);
    return lines.join('\n');
  }

  private buildRequestMessages(newUserInput: string): Msg[] {
    const sysContent = this.hasSummary()
      ? `${this.systemPrompt}\n\n[对话历史摘要]\n${this.renderSummary(this.cachedSummary)}`
      : this.systemPrompt;

    const sys: Msg = { role: 'system', content: sysContent };

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

  /** 返回结构化摘要的字段计数（用于日志） */
  getSummaryStats(): { topic: string; facts: number; decisions: number; questions: number } {
    return {
      topic: this.cachedSummary.current_topic,
      facts: this.cachedSummary.user_facts.length,
      decisions: this.cachedSummary.key_decisions.length,
      questions: this.cachedSummary.open_questions.length,
    };
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
    `[config] 触发阈值=${SUMMARY_TRIGGER_TOKENS} tokens, 保留最近 ${KEEP_RECENT_TURNS} 轮`,
    `, 摘要模式=结构化 JSON (user_facts/key_decisions/open_questions/current_topic)\n`,
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

    const stats = cm.getSummaryStats();
    console.log(
      `[stats] history=${cm.getHistoryLength()} 条 | summary: topic="${stats.topic}", facts=${stats.facts}, decisions=${stats.decisions}, questions=${stats.questions}`,
    );
  }

  console.log('\n[done] 演示结束。观察上方"compress"日志可看到摘要结构与变化。');
}

await main();
