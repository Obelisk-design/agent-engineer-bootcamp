/**
 * apps/api/src/spawn-main.ts
 *
 * spawn `tsx examples/<ns>_import/main.ts` 子进程，把 stdout 的 phase 行
 * 解析成 PhaseEvent，stderr 累积为 tail（最后 500 字符）。
 *
 * 约束：
 * - 5 分钟硬超时（300_000 ms），超时 SIGTERM
 * - 监听外部 AbortSignal，abort 时 SIGTERM
 * - 不抛错：所有错误返回到 result（让调用方决定怎么 emit SSE error）
 */

import { spawn } from 'node:child_process';
import { parsePhaseLine } from './parse-phase.js';
import type { PhaseEvent } from '../../../libs/api-schema/src/index.js';

const HARD_TIMEOUT_MS = 5 * 60 * 1000;
const STDERR_TAIL_BYTES = 500;
const REPO_ROOT = process.cwd();

/**
 * lancedb native binding + arrow schema 在 Windows + Node 22 下需要 ~1.5GB 堆
 * 才能跑完 14 篇 md 的 meta scan；Node 默认上限在 Windows 下受 native 段限制
 * 会被 early-OOM kill（`Committing semi space failed` JS stacktrace 全空）。
 * 子进程独立堆 —— 把 NODE_OPTIONS 显式拉到 4GB。父进程 3100 rag server 不受影响。
 */
const CHILD_NODE_OPTIONS = '--max-old-space-size=4096';

export interface SpawnMainOptions {
  readonly namespace: 'notion' | 'md';
  readonly dryRun: boolean;
  readonly onPhase: (event: PhaseEvent) => void;
  readonly onStderr: (chunk: string) => void;
  readonly signal: AbortSignal;
  /** 测试接缝：覆盖脚本路径（默认按 namespace 映射到 examples/<ns>_import/main.ts）。 */
  readonly scriptPath?: string;
}

export interface SpawnMainResult {
  readonly exitCode: number;
  readonly stderrTail: string;
  readonly timedOut: boolean;
  readonly aborted: boolean;
}

export function spawnMain(opts: SpawnMainOptions): Promise<SpawnMainResult> {
  return new Promise((resolve) => {
    const scriptPath =
      opts.scriptPath ??
      (opts.namespace === 'notion'
        ? 'examples/notion_import/main.ts'
        : 'examples/md_import/main.ts');

    const args = ['tsx', scriptPath];
    if (opts.dryRun) args.push('--dry-run');

    // Windows 上 spawn 默认不解析 .cmd，需要打开 shell 让 Node 找 cmd shim；
    // macOS/Linux 直接 spawn pnpm 即可。
    const pnpmBin = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
    const child = spawn(pnpmBin, args, {
      cwd: REPO_ROOT,
      env: { ...process.env, NODE_OPTIONS: CHILD_NODE_OPTIONS },
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    });

    let stderrBuf = '';
    let stdoutBuf = '';

    child.stdout.on('data', (chunk: Buffer) => {
      stdoutBuf += chunk.toString('utf8');
      let idx: number;
      while ((idx = stdoutBuf.indexOf('\n')) >= 0) {
        const line = stdoutBuf.slice(0, idx);
        stdoutBuf = stdoutBuf.slice(idx + 1);
        const ev = parsePhaseLine(line);
        if (ev !== null) opts.onPhase(ev);
      }
    });

    child.stderr.on('data', (chunk: Buffer) => {
      const s = chunk.toString('utf8');
      stderrBuf = (stderrBuf + s).slice(-STDERR_TAIL_BYTES);
      opts.onStderr(s);
    });

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, HARD_TIMEOUT_MS);

    // 抽成具名 const：同一 AbortSignal 被复用时，老 listener 会留在 signal 上
    // 对一个已经退出的 child 触发 SIGTERM。removeEventListener 在 exit handler 中清理。
    const onAbort = () => {
      child.kill('SIGTERM');
    };
    opts.signal.addEventListener('abort', onAbort);

    child.on('exit', (code) => {
      clearTimeout(timer);
      opts.signal.removeEventListener('abort', onAbort);
      // flush 残余 stdout
      if (stdoutBuf.length > 0) {
        const ev = parsePhaseLine(stdoutBuf);
        if (ev !== null) opts.onPhase(ev);
      }
      resolve({
        exitCode: code ?? -1,
        stderrTail: stderrBuf,
        timedOut,
        aborted: opts.signal.aborted,
      });
    });
  });
}
