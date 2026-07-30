/**
 * scripts/dev-day09.ts
 *
 * dev:day09 的真正入口 —— 一次性 claim api + web 两个端口，
 * 透传 PORT / VITE_PORT / VITE_API_TARGET 后，并发跑 dev:api:day09 + dev:web。
 *
 * 跟 scripts/dev-day08.ts 的区别：调 dev:api:day09 而非 dev:api，
 * 这样 examples/day09/agent_server.ts 是 API 入口（而不是 day08 的）。
 *
 * 后端代码完全相同（Day 09 的 server.ts 改动向后兼容 day08 example），
 * 但 dev:day09 让你验证的是"前端 Day 09 多轮 UI 对应哪个后端 example"——
 * 名实一致，避免"用 day08 后端验 Day 09 前端"的混淆。
 *
 * 用法：pnpm run dev:day09
 */

import { execSync } from 'node:child_process';

function claimBoth(): { apiPort: number; webPort: number } {
  const raw = execSync('pnpm exec tsx scripts/ports.ts api 3000 web 5173', {
    encoding: 'utf8',
  });
  const get = (re: RegExp): number => {
    const m = raw.match(re);
    if (!m || m[1] === undefined) {
      throw new Error(`[dev-day09] could not parse ${String(re)} from:\n${raw}`);
    }
    return Number(m[1]);
  };
  return {
    apiPort: get(/^api=(\d+)$/m),
    webPort: get(/^web=(\d+)$/m),
  };
}

function main(): void {
  const { apiPort, webPort } = claimBoth();
  const apiUrl = `http://127.0.0.1:${String(apiPort)}`;
  console.log(`[dev-day09] api=${String(apiPort)} web=${String(webPort)} api_url=${apiUrl}`);

  const childEnv: NodeJS.ProcessEnv = {
    ...process.env,
    PORT: String(apiPort),
    VITE_PORT: String(webPort),
    VITE_API_TARGET: apiUrl,
    api_url: apiUrl,
  };

  try {
    execSync(
      'pnpm exec concurrently -n api,web -c blue,green --kill-others --success first ' +
        '"pnpm run dev:api:day09" ' +
        '"pnpm run dev:web"',
      { env: childEnv, stdio: 'inherit' },
    );
  } catch (err) {
    // concurrently Ctrl-C 退出码非 0；认为是 0/130 的任意都视作正常退出
    const status =
      typeof err === 'object' && err !== null && 'status' in err
        ? (err as { status: number | null }).status
        : null;
    if (status !== null && (status === 130 || status === 143 || status === 0)) {
      process.exit(0);
    }
    process.exit(status ?? 1);
  }
}

main();
