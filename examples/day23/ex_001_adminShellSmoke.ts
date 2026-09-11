/**
 * examples/day23/ex_001_adminShellSmoke.ts
 *
 * Day 23 真活验证 —— admin 壳 9 路由 smoke test。
 *
 * 流程：
 *   1. fetch apps/web dev 服务（默认 http://127.0.0.1:5173）的 10 个关键路由（含 hash）
 *   2. 验证 10/10 全 200 OK
 *   3. 抓 index.html 验证关键 DOM 元素存在（#app + /src/main.ts）
 *   4. 输出汇总表
 *
 * Why 这条 demo 重要：
 *   - Day 23 重构从「单 hash 路由」变「9 路由 + Layout 壳」
 *   - hash 模式兼容 Day 12 旧链接（createWebHashHistory + redirect / → /eval/overview）
 *   - 路由全 200 = admin 壳没破业务（apps/api 不变 → 前端不会因 server down 报 5xx）
 *
 * 前置：必须先 `pnpm dev:web` 启 vite（默认端口 5173）
 *
 * 跑法：
 *   pnpm exec tsx examples/day23/ex_001_adminShellSmoke.ts
 *
 * 不做：
 *   - 不抓 Vue runtime 渲染后 DOM（hash 路由服务端不渲染，curl 拿到的是 index.html 模板）
 *   - 不跑 Chrome MCP（[issue] 已存档，由 Task 4/5 owner 验）
 *   - 不测 api/* 后端契约（apps/api 不变，dev 网关可能不一致；Day 22 已独立验）
 */

const BASE = process.env.WEB_TARGET ?? 'http://127.0.0.1:5173';

interface RouteCheck {
  readonly path: string;
  readonly desc: string;
}

const ROUTES: ReadonlyArray<RouteCheck> = [
  { path: '/', desc: 'root redirect to /eval/overview (hash 守卫)' },
  { path: '/#/eval/overview', desc: 'Eval 总览（ECharts 柱状图）' },
  { path: '/#/eval/runner', desc: '评测运行（corpus 状态 + run 触发）' },
  { path: '/#/eval/query', desc: '查询详情（runId 前缀匹配）' },
  { path: '/#/eval/probe', desc: '库探针（CorpusStats）' },
  { path: '/#/eval/bias', desc: '偏差分析（LLM Judge 三件套）' },
  { path: '/#/rag', desc: 'RAG playground（SearchView + IngestView）' },
  { path: '/#/embed-demo', desc: 'Embed Demo（Panel A/B/C/D + canvas 数据色板）' },
  { path: '/#/embed-compare', desc: 'Embed Compare（多 prompt 对比 + cosine 矩阵）' },
  { path: '/#/agent', desc: 'Agent Console（暗色 IDE 风格，4 件套）' },
];

interface ProbeResult {
  readonly path: string;
  readonly desc: string;
  readonly status: number;
  readonly ok: boolean;
}

async function probe(check: RouteCheck): Promise<ProbeResult> {
  try {
    const res = await fetch(`${BASE}${check.path}`, { method: 'GET' });
    return { path: check.path, desc: check.desc, status: res.status, ok: res.status === 200 };
  } catch {
    return { path: check.path, desc: check.desc, status: 0, ok: false };
  }
}

async function probeIndex(): Promise<{
  status: number;
  hasApp: boolean;
  hasMain: boolean;
  ok: boolean;
}> {
  try {
    const res = await fetch(`${BASE}/`, { method: 'GET' });
    const html = await res.text();
    const hasApp = html.includes('id="app"');
    const hasMain = html.includes('/src/main.ts');
    return {
      status: res.status,
      hasApp,
      hasMain,
      ok: res.status === 200 && hasApp && hasMain,
    };
  } catch {
    return { status: 0, hasApp: false, hasMain: false, ok: false };
  }
}

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + ' '.repeat(n - s.length);
}

async function main(): Promise<void> {
  console.log(`=== Day 23 admin 壳 smoke test ===`);
  console.log(`target: ${BASE}`);
  console.log(`routes: ${String(ROUTES.length)}`);
  console.log('');

  const results = await Promise.all(ROUTES.map(probe));
  const indexProbe = await probeIndex();

  // 打印每条路由
  console.log('--- route probe ---');
  for (const r of results) {
    const mark = r.ok ? '✅' : '❌';
    console.log(`${mark} ${pad(String(r.status), 5)} ${pad(r.path, 22)} ${r.desc}`);
  }

  // 打印 index.html 关键 DOM
  console.log('');
  console.log('--- index.html probe ---');
  const indexMark = indexProbe.ok ? '✅' : '❌';
  console.log(
    `${indexMark} status=${String(indexProbe.status)} #app=${String(indexProbe.hasApp)} /src/main.ts=${String(indexProbe.hasMain)}`,
  );

  // 汇总
  const okCount = results.filter((r) => r.ok).length;
  const allOk = okCount === results.length && indexProbe.ok;

  console.log('');
  console.log(
    `=== summary: ${String(okCount)}/${String(results.length)} routes 200, index.html ${indexProbe.ok ? 'OK' : 'FAIL'} ===`,
  );
  console.log(allOk ? '✅ ALL PASS' : '❌ FAILED');

  if (!allOk) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
