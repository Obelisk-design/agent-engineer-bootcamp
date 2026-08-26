/**
 * examples/md_import/collect.ts
 *
 * md 文件的纯函数 orchestrator（无 IO 副作用，只读取）。
 * 镜像 examples/notion_import/collect.ts 的形状。
 */

import { readFileSync } from 'node:fs';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { hashText } from '../../libs/rag/index.js';

export interface MdDoc {
  readonly path: string; // 相对 sourceDir 的路径
  readonly content: string;
  readonly mtimeMs: number;
  readonly contentHash: string;
}

/** 递归列目录里的所有 .md 文件（绝对路径）。 */
export function listMdFiles(sourceDir: string): string[] {
  const out: string[] = [];
  const stack = [sourceDir];
  while (stack.length > 0) {
    const dir = stack.pop()!;
    const entries = readdirSync(dir);
    for (const name of entries) {
      const full = join(dir, name);
      const st = statSync(full);
      if (st.isDirectory()) stack.push(full);
      else if (st.isFile() && name.endsWith('.md')) out.push(full);
    }
  }
  return out.sort();
}

/** 读单个 md 文件，返回结构化 MdDoc。 */
export function readMdFile(absPath: string, sourceDir: string): MdDoc {
  const content = readFileSync(absPath, 'utf8');
  const st = statSync(absPath);
  return {
    path: absPath.slice(sourceDir.length + 1),
    content,
    mtimeMs: st.mtimeMs,
    contentHash: hashText(content),
  };
}
