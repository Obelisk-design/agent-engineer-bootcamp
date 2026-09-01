import { describe, it, expect } from 'vitest';
import { spawnMain } from '../apps/api/src/spawn-main.js';

// spawnMain 的测试对象是 spawn→parse→exit 契约，不是真实 Notion/MD 导入：
// 真实 CLI 的 dry-run 仍打 api.notion.com（网络天气驱动：断网快失败"假通过"，
// 通网真实递归导入 >180s 超时），所以指向本地 fixture（打印 4 个 phase marker
// 后 exit 0，无网络、无 lancedb）。真实 CLI 集成验证见 docs/daily/day14.md。
const FIXTURE = 'tests/fixtures/fake-import.ts';

// spawn 真起 tsx 子进程，Windows 上 pnpm.cmd 启动 + tsx cold start 远 > 5s 默认 vitest timeout。
describe('spawnMain', { timeout: 60_000 }, () => {
  it('spawns fixture and parses 4 phase events', { timeout: 120_000 }, async () => {
    const phases: string[] = [];
    const result = await spawnMain({
      namespace: 'notion',
      dryRun: true,
      scriptPath: FIXTURE,
      onPhase: (e) => phases.push(e.name),
      onStderr: () => {},
      signal: new AbortController().signal,
    });
    // 断言收紧：fixture 确定性输出 4 个 marker，name 序列必须精确匹配。
    expect(result.exitCode).toBe(0);
    expect(result.aborted).toBe(false);
    expect(result.timedOut).toBe(false);
    expect(phases).toEqual(['fetch', 'diff', 'embed', 'write']);
  });

  it('aborts child on signal', async () => {
    const ac = new AbortController();
    // 50ms abort 落在 tsx cold start 期间（child 尚未 exit），保证 kill 路径被执行。
    setTimeout(() => ac.abort(), 50);
    const result = await spawnMain({
      namespace: 'notion',
      dryRun: true,
      scriptPath: FIXTURE,
      onPhase: () => {},
      onStderr: () => {},
      signal: ac.signal,
    });
    // abort 后必须看到 aborted === true（显式断言）。
    // exitCode 检查保留作为 defense-in-depth，但 abort 测试的核心契约是 aborted flag。
    expect(result.aborted).toBe(true);
    expect(result.exitCode).not.toBe(0);
  });
});
