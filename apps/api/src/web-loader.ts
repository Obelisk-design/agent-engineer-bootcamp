/**
 * apps/api/src/web-loader.ts
 *
 * 找到 web/index.html 并加载成字符串。
 *
 * 路径策略：用 import.meta.url 拿当前文件所在目录，向上找 web/index.html。
 * 当前 tsx 直接跑源文件（不打包），所以 __dirname 指向 apps/api/src/，HTML 在同目录 web/ 下。
 *
 * 已知限制：如果未来要 `tsc` 编译后跑 dist/server.js，需要把 web/index.html 复制到 dist/web/。
 * Day 06 YAGNI：不做打包，Day 06+ 真要打包时再加 copy 步骤。
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const htmlPath = join(here, 'web/index.html');

/**
 * 加载并返回 Web UI 的 HTML 内容。
 * 文件缺失时抛错（fail-fast，避免线上静默返回空 HTML）。
 */
export function loadWebIndexHtml(): string {
  return readFileSync(htmlPath, 'utf-8');
}
