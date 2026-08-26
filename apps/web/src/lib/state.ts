/**
 * apps/web/src/lib/state.ts
 *
 * UI 5 态状态机：
 *   idle       初始 / 重置
 *   loading    请求中（搜索阶段）
 *   streaming  SSE 流式接收（入库阶段）
 *   done       完成
 *   error      错误（含 abort / network err）
 *
 * 转换图（spec §3.5）：
 *   idle → loading → done
 *      → streaming → done
 *               ↘ error
 *   done → idle（重置）
 *   error → idle（重置）
 */

export type UiState = 'idle' | 'loading' | 'streaming' | 'done' | 'error';

export interface UiStateMachine {
  readonly state: UiState;
  readonly error: string | null;
  reset(): void;
  startLoading(): void;
  startStreaming(): void;
  finish(): void;
  fail(message: string): void;
}

export function createUiState(): UiStateMachine {
  let state: UiState = 'idle';
  let error: string | null = null;

  return {
    get state() {
      return state;
    },
    get error() {
      return error;
    },
    reset() {
      state = 'idle';
      error = null;
    },
    startLoading() {
      state = 'loading';
      error = null;
    },
    startStreaming() {
      state = 'streaming';
      error = null;
    },
    finish() {
      state = 'done';
      error = null;
    },
    fail(message: string) {
      state = 'error';
      error = message;
    },
  };
}
