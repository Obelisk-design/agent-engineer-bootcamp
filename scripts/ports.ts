/**
 * scripts/ports.ts
 *
 * 端口申领工具 —— 给 dev:api / dev:web / dev:day08 共享。
 *
 * 策略：
 *   - 优先 preferred；被占就杀掉占用进程，再试 +1 / +2；
 *   - 最多尝试 3 次，3 次都失败 → 抛错（不要静默迁到用户找不到的地方）；
 *   - 杀进程是为了清理"上次 dev 中断留下的孤儿 vite / tsx"；
 *     正常开发同时开两个项目占住同一端口的概率极低，体验损失可接受。
 *
 * 职责边界：
 *   - 只负责"找到一个能用的端口、清理孤儿"。
 *   - 杀完端口后，由调用方把端口号通过 env 喂给子进程（api 吃 PORT，vite 吃 --port）。
 *   - 不参与启动 api/web 本身 —— 那是 dev:api / dev:web 的事。
 *
 * 使用：
 *   tsx scripts/ports.ts <name> <preferred>            # 单端口（如 dev:api 单跑场景）
 *   tsx scripts/ports.ts <api-name> <api-port> <web-name> <web-port>  # 双端口（dev:day08）
 *
 *   退出后 stdout 是「<name>=<port>」一行，供 shell 捕获：
 *     PORT=$(tsx scripts/ports.ts api 3000 | tail -n1 | cut -d= -f2)
 */

import { execSync } from 'node:child_process';

const MAX_TRIES = 3;

interface ClaimResult {
  readonly name: string;
  readonly port: number;
}

function killPid(pid: number, port: number): void {
  if (process.platform === 'win32') {
    // Windows：taskkill /F /PID 才能干掉孤儿 vite（pid 22560 这种）
    try {
      execSync(`taskkill /F /PID ${String(pid)}`, { stdio: 'ignore' });
    } catch {
      // 进程可能在探测 → 杀之间已退出，吞掉
    }
    return;
  }
  // POSIX 兜底（CI / WSL 用）
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    /* 同上 */
  }
  console.warn(`[${port}] note: kill attempt on non-Windows may need manual cleanup`);
}

function findPidsOnPort(port: number): number[] {
  if (process.platform === 'win32') {
    // PowerShell 的 Get-NetTCPConnection 比 netstat 在 Git Bash 下稳定：
    // - netstat 输出是 GBK / 含中文标头，在 bash pipe 里会被截断
    // - Get-NetTCPConnection 输出结构化对象，可以 -LocalPort 过滤
    // 用 powershell.exe -NoProfile -Command ... 跑一行查询，stdout 是 PID 列表
    const escapedPort = Number(port).toString();
    const cmd =
      `powershell -NoProfile -Command "` +
      `(Get-NetTCPConnection -LocalPort ${escapedPort} -State Listen -EA SilentlyContinue).OwningProcess` +
      `"`;
    let raw = '';
    try {
      raw = execSync(cmd, { encoding: 'utf8' });
    } catch {
      // 没有匹配行时 PowerShell 会以非 0 退出；返回空即可
      return [];
    }
    const pids = new Set<number>();
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (trimmed === '') continue;
      const pid = Number(trimmed);
      if (Number.isFinite(pid) && pid > 0 && pid !== process.pid) pids.add(pid);
    }
    return [...pids];
  }
  // POSIX 兜底（CI / WSL 用）：lsof -ti :<port>
  try {
    const raw = execSync(`lsof -ti :${String(port)}`, { encoding: 'utf8' });
    return raw
      .split(/\r?\n/)
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n > 0 && n !== process.pid);
  } catch {
    return [];
  }
}

function isPortFree(port: number): boolean {
  return findPidsOnPort(port).length === 0;
}

function killOccupants(port: number): number {
  const pids = findPidsOnPort(port);
  for (const pid of pids) killPid(pid, port);
  return pids.length;
}

function claimPort(name: string, preferred: number): ClaimResult {
  for (let i = 0; i < MAX_TRIES; i++) {
    const port = preferred + i;
    if (isPortFree(port)) {
      console.log(`[${name}] using port ${String(port)} (preferred ${String(preferred)})`);
      return { name, port };
    }
    const killed = killOccupants(port);
    if (killed > 0) {
      console.log(
        `[${name}] port ${String(port)} was occupied; killed ${String(killed)} stale process(es), retrying…`,
      );
      // taskkill /F 后 Windows 释放 TCP 监听端口通常需要 1~3s；
      // 给 2s 让 OS 真正回收（同步 busy-wait 已足够，脚本寿命短）
      const until = Date.now() + 2000;
      while (Date.now() < until) {
        /* spin to yield */
      }
      // 杀完直接 claim preferred；若还忙才让 for-loop +1
      if (isPortFree(port)) {
        console.log(`[${name}] using port ${String(port)} (preferred ${String(preferred)})`);
        return { name, port };
      }
    } else {
      // 没找到 PID，但端口仍不可用 —— race 或 IPv6。直接试 +1。
      console.log(
        `[${name}] port ${String(port)} busy (no owning PID); trying ${String(port + 1)}`,
      );
    }
  }
  throw new Error(
    `[${name}] could not claim port ${String(preferred)}..${String(preferred + MAX_TRIES - 1)}; all occupied`,
  );
}

function main(): void {
  const argv = process.argv.slice(2);
  if (argv.length === 2) {
    const [name, preferredRaw] = argv;
    if (name === undefined || preferredRaw === undefined) {
      throw new Error('usage: tsx scripts/ports.ts <name> <preferred>');
    }
    const { port } = claimPort(name, Number(preferredRaw));
    // 最后一行裸值，方便 shell cut / pipe
    console.log(`${name}=${String(port)}`);
    return;
  }
  if (argv.length === 4) {
    const [apiName, apiPortRaw, webName, webPortRaw] = argv;
    if (
      apiName === undefined ||
      apiPortRaw === undefined ||
      webName === undefined ||
      webPortRaw === undefined
    ) {
      throw new Error('usage: tsx scripts/ports.ts <api-name> <api-port> <web-name> <web-port>');
    }
    const api = claimPort(apiName, Number(apiPortRaw));
    const web = claimPort(webName, Number(webPortRaw));
    console.log(`${api.name}=${String(api.port)}`);
    console.log(`${web.name}=${String(web.port)}`);
    // 额外：让 Vite proxy 能拿到最终的 api 地址（dev:day08 跑时）
    console.log(`api_url=http://127.0.0.1:${String(api.port)}`);
    return;
  }
  throw new Error('usage: see header comment (2 or 4 positional args)');
}

main();
