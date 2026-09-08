/**
 * 3 个反例验证：
 * 1. 相对路径 → file_edit: path must be absolute
 * 2. multi-match + replaceAll=false → throw + 原文件 byte-equal 不变
 * 3. binary 文件（NUL>10%）→ file_edit: binary file not supported + 原文件不变
 */
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ToolRegistry } from '../libs/tools/index.js';
import { fileEditTool } from '../libs/tools/repo/file-edit-tool.js';

async function reverseExample1() {
  console.log('\n=== 反例 1：相对路径 ===');
  const registry = new ToolRegistry();
  registry.register(fileEditTool);
  try {
    await registry.execute('file_edit', {
      path: 'relative/path.ts',
      oldString: 'a',
      newString: 'b',
    });
    console.log('FAIL：没有抛错');
    process.exit(1);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/file_edit: (invalid arguments|.*absolute)/.test(msg)) {
      console.log(`OK：${msg}`);
    } else {
      console.log(`FAIL：错误消息不符合预期: ${msg}`);
      process.exit(1);
    }
  }
}

async function reverseExample2() {
  console.log('\n=== 反例 2：multi-match + replaceAll=false ===');
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'reverse-multi-'));
  try {
    const f = path.join(tmp, 'x.ts');
    const original = 'foo\nfoo\nbar\n';
    await fs.writeFile(f, original, 'utf8');
    const registry = new ToolRegistry();
    registry.register(fileEditTool);
    try {
      await registry.execute('file_edit', {
        path: f,
        oldString: 'foo',
        newString: 'baz',
        replaceAll: false,
      });
      console.log('FAIL：没有抛错');
      process.exit(1);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/matched 2 times/.test(msg)) {
        const after = await fs.readFile(f, 'utf8');
        if (after === original) {
          console.log(`OK：throw + 原文件 byte-equal 不变 (${msg})`);
        } else {
          console.log(`FAIL：原文件被改了: ${after}`);
          process.exit(1);
        }
      } else {
        console.log(`FAIL：错误消息不符合预期: ${msg}`);
        process.exit(1);
      }
    }
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
}

async function reverseExample3() {
  console.log('\n=== 反例 3：binary 文件 ===');
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'reverse-binary-'));
  try {
    const f = path.join(tmp, 'blob.bin');
    const buf = Buffer.concat([
      Buffer.from([0x00, 0xff, 0xfe, 0x41, 0x42, 0x43, 0x00, 0x00, 0x00]),
      Buffer.alloc(200, 0x00),
    ]);
    await fs.writeFile(f, buf);
    const registry = new ToolRegistry();
    registry.register(fileEditTool);
    try {
      await registry.execute('file_edit', {
        path: f,
        oldString: 'ABC',
        newString: 'XYZ',
      });
      console.log('FAIL：没有抛错');
      process.exit(1);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/file_edit: binary file not supported/.test(msg)) {
        const after = await fs.readFile(f);
        if (after.equals(buf)) {
          console.log(`OK：throw + 原文件 byte-equal 不变 (${msg})`);
        } else {
          console.log('FAIL：原文件被改了');
          process.exit(1);
        }
      } else {
        console.log(`FAIL：错误消息不符合预期: ${msg}`);
        process.exit(1);
      }
    }
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
}

(async () => {
  await reverseExample1();
  await reverseExample2();
  await reverseExample3();
  console.log('\n=== 全部 3 个反例通过 ===');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
