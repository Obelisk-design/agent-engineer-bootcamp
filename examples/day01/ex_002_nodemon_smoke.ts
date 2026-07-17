/**
 * examples/_smoke.ts
 *
 * 临时 smoke 脚本：每秒打印一次 tick 时间戳。
 * 用于验证 nodemon 热重启（不会消耗 API token）。
 */

import 'dotenv/config';

let count = 0;
const tick = (): void => {
  count += 1;
  console.log(`[tick #${count}] ${new Date().toISOString()}`);
  console.log(`[config] baseURL=${process.env.OPENAI_BASE_URL ?? '(unset)'}`);
  console.log(`[config] model=${process.env.MODEL_NAME ?? '(unset)'}`);
};
tick();
setInterval(tick, 1000);
