/**
 * scripts/with-ports.ts
 *
 * 端口初始化封装 —— dev:web / dev:rag（package.json 通用入口）以及
 * scripts/dev-day08.ts / dev-day09.ts（day 编排脚本）都直接调用它。
 *
 * 跟 pnpm script 配合：
 *   pnpm exec tsx scripts/with-ports.ts web 5173 -- vite --config apps/web/vite.config.ts --host 127.0.0.1
 *   pnpm exec tsx scripts/with-ports.ts api 3000 -- tsx examples/day08/agent_server.ts
 *   pnpm exec tsx scripts/with-ports.ts rag 3100 -- tsx apps/api/src/rag-server-entry.ts
 *
 * 行为：
 *   1. 用 scripts/ports.ts claim 端口；
 *   2. 把端口放到对应 env（web → VITE_PORT, api/rag → PORT）；
 *   3. 如果环境已有 api=<url>（由 scripts/dev-day08.ts 注入），转写到 VITE_API_TARGET；
 *   4. spawn argv 中 `--` 之后的命令，把 stdout/stderr 透传，子进程用我们 fork 出去而非 exec，
 *      这样 Ctrl-C 还能传到子进程。
 *
 * 这层存在的唯一原因：pnpm script 在 Windows 上用 cmd.exe，跨平台 shell 截取 env 行为差异大；
 * 把 shell 截取工作移到 Node，dev 脚本只看一行命令即可。
 */

import { spawn } from 'node:child_process';
import { execSync } from 'node:child_process';
import path from 'node:path';

function claimFromPortsTs(args: string[]): string {
  const raw = execSync(`pnpm exec tsx scripts/ports.ts ${args.join(' ')}`, {
    encoding: 'utf8',
  });
  return raw;
}

interface PortEnv {
  readonly env: NodeJS.ProcessEnv;
  readonly port: number;
}

function parseClaim(raw: string, name: string): PortEnv {
  const re = new RegExp(`^${name}=(\\d+)$`, 'm');
  const m = raw.match(re);
  if (!m || m[1] === undefined) {
    throw new Error(`[with-ports] could not parse "${name}=<port>" from ports.ts output:\n${raw}`);
  }
  const port = Number(m[1]);
  return { env: {}, port };
}

function main(): void {
  const argv = process.argv.slice(2);
  const dashIdx = argv.indexOf('--');
  if (dashIdx < 0 || dashIdx < 2) {
    throw new Error('usage: tsx scripts/with-ports.ts <name> <port> -- <command> [args...]');
  }
  const name = argv[0];
  const preferredRaw = argv[1];
  const childCmd = argv.slice(dashIdx + 1);
  if (name === undefined || preferredRaw === undefined || childCmd.length === 0) {
    throw new Error('usage: tsx scripts/with-ports.ts <name> <port> -- <command> [args...]');
  }

  // scripts/dev-day08.ts / dev-day09.ts 上层已 claim 过端口，把结果通过 PORT / VITE_PORT 注入；
  // 若环境已有对应 env，就直接复用，避免二次 claim 抢到不同端口
  const envKey = name === 'api' || name === 'rag' ? 'PORT' : name === 'web' ? 'VITE_PORT' : null;
  const inherited = envKey !== null ? process.env[envKey] : undefined;
  let port: number;
  if (inherited !== undefined && inherited !== '' && Number.isFinite(Number(inherited))) {
    port = Number(inherited);
    console.log(`[with-ports] reusing ${envKey}=${String(port)} from parent env`);
  } else {
    const raw = claimFromPortsTs([name, preferredRaw]);
    const claim = parseClaim(raw, name);
    port = claim.port;
  }

  const childEnv: NodeJS.ProcessEnv = { ...process.env };
  if (name === 'web') {
    childEnv['VITE_PORT'] = String(port);
    // scripts/dev-day08.ts / dev-day09.ts 会注入 api_url=http://127.0.0.1:<api-port>
    if (process.env['api_url'] !== undefined && process.env['api_url'] !== '') {
      childEnv['VITE_API_TARGET'] = process.env['api_url'];
    }
  } else if (name === 'api') {
    childEnv['PORT'] = String(port);
  } else if (name === 'rag') {
    childEnv['PORT'] = String(port);
  }

  console.log(`[with-ports] spawning ${childCmd.join(' ')} with ${name}=${String(port)}`);
  // vite 需要 cwd 在 apps/web（index.html / src 在那里）。
  // dev:web / scripts/dev-day08.ts / dev-day09.ts 都从仓库根启动 → with-ports 强制子进程 cwd 到 apps/web。
  // api 路径 cwd 不敏感（tsx 走 __dirname / import.meta），保持 process.cwd()。
  const childCwd = name === 'web' ? path.resolve(process.cwd(), 'apps', 'web') : process.cwd();
  // vite 必须显式 --port 才会用 claim 到的端口；否则会被 strictPort:false 静默迁走
  const finalCmd =
    name === 'web'
      ? [...childCmd.slice(0, 1), '--port', String(port), ...childCmd.slice(1)]
      : childCmd;
  const child = spawn(finalCmd[0] as string, finalCmd.slice(1), {
    env: childEnv,
    cwd: childCwd,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (child.stdout === null && child.stderr === null) {
    // noop — stdio:'inherit' should already cover it
  }
  child.on('exit', (code) => process.exit(code ?? 0));
  // 透传 SIGINT / SIGTERM 到子进程（concurrently 的 --kill-others 就是靠这个）
  for (const sig of ['SIGINT', 'SIGTERM'] as const) {
    process.on(sig, () => {
      if (!child.killed) child.kill(sig);
    });
  }
}

main();
