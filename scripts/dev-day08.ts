/**
 * scripts/dev-day08.ts
 *
 * 一次性 claim api + web 两个端口，透传 PORT / VITE_PORT / VITE_API_TARGET 后，
 * 并发跑 examples/day08/agent_server.ts + dev:web。
 *
 * 不走 pnpm script 内嵌 shell 拼接 env（跨平台隐患），
 * 也不引 cross-env-shell（核心链路不变更依赖）。
 *
 * 用 execSync(concurrently, { stdio: 'inherit' }) 而非 spawn：
 *   - 同步等待 Ctrl-C / concurrently 自然退出，前端和用户感知一致；
 *   - Windows shell:true 下 spawn pnpm 会被 cmd.exe 吃 PATH，
 *     execSync 让 npm 自己直接执行（一致行为）。
 *
 * 用法：pnpm exec tsx scripts/dev-day08.ts
 */

import { execSync } from 'node:child_process';

function claimBoth(): { apiPort: number; webPort: number } {
  const raw = execSync('pnpm exec tsx scripts/ports.ts api 3000 web 5173', {
    encoding: 'utf8',
  });
  const get = (re: RegExp): number => {
    const m = raw.match(re);
    if (!m || m[1] === undefined) {
      throw new Error(`[dev-day08] could not parse ${String(re)} from:\n${raw}`);
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
  console.log(`[dev-day08] api=${String(apiPort)} web=${String(webPort)} api_url=${apiUrl}`);

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
        '"pnpm exec tsx scripts/with-ports.ts api 3000 -- tsx examples/day08/agent_server.ts" ' +
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
