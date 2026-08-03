/**
 * tests/libs/tools/tool-contract.test.ts
 *
 * Day 11 契约层反例（spec §4.1）。
 *
 * 这组测试的对象不是某个 tool 的功能，而是**参数契约本身**：
 *   - 反例 1/2 是 Day 10 两个已复现 bug 的回归锁
 *   - 反例 3-6 是 zod 边界（含两个实测出来的坑）
 *   - 反例 7 是**防复发结构性测试** —— 它直接断言发给 LLM 的 JSON Schema 里
 *     类型是真的，这是「schema 骗 LLM」这类 bug 唯一的结构性防线
 */

import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

import { repoIndexTool, repoSearchTool } from '../../../libs/tools/repo/index.js';
import { runTool } from '../../../libs/tools/tool.js';
import { ToolRegistry } from '../../../libs/tools/tool-registry.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..', '..');
const FIXTURE = path.resolve(REPO_ROOT, 'tests', 'fixtures', 'sample-repo');

describe('Day 10 bug 回归锁', () => {
  // 反例 1 —— bug A
  it('includeContent:"false"（字符串）必须真的关掉 content', async () => {
    const result = await runTool(repoSearchTool, {
      rootPath: FIXTURE,
      pattern: 'export',
      includeContent: 'false',
      maxResults: 3,
    });

    expect(result.matches.length).toBeGreaterThan(0);
    for (const m of result.matches) {
      expect(m.content).toBe('');
    }
  });

  it('includeContent:"true" 仍返回 content（防止过度修复）', async () => {
    const result = await runTool(repoSearchTool, {
      rootPath: FIXTURE,
      pattern: 'export',
      includeContent: 'true',
      maxResults: 3,
    });

    expect(result.matches.length).toBeGreaterThan(0);
    expect(result.matches[0]?.content).not.toBe('');
  });

  // 反例 2 —— bug B
  it('ignorePatterns 传字符串必须明确报错，不静默回落默认值', async () => {
    await expect(
      runTool(repoIndexTool, { rootPath: FIXTURE, ignorePatterns: 'src' }),
    ).rejects.toThrow(/repo_index: invalid arguments — ignorePatterns/);
  });

  it('ignorePatterns 传数组正常生效', async () => {
    const all = await runTool(repoIndexTool, { rootPath: FIXTURE, maxDepth: 5 });
    const filtered = await runTool(repoIndexTool, {
      rootPath: FIXTURE,
      maxDepth: 5,
      ignorePatterns: ['src'],
    });

    expect(all.files.some((f) => f.startsWith('src/'))).toBe(true);
    expect(filtered.files.some((f) => f.startsWith('src/'))).toBe(false);
  });

  // Day 11 跑真实 LLM demo 时发现的第三个同族问题：
  // z.stringbool() 单用会**拒绝原生布尔** —— 越聪明的模型越容易踩。
  it('includeContent 收原生 boolean false（不只是字符串 "false"）', async () => {
    const result = await runTool(repoSearchTool, {
      rootPath: FIXTURE,
      pattern: 'export',
      includeContent: false,
      maxResults: 3,
    });

    expect(result.matches.length).toBeGreaterThan(0);
    for (const m of result.matches) {
      expect(m.content).toBe('');
    }
  });

  it('includeContent 收原生 boolean true', async () => {
    const result = await runTool(repoSearchTool, {
      rootPath: FIXTURE,
      pattern: 'export',
      includeContent: true,
      maxResults: 3,
    });

    expect(result.matches[0]?.content).not.toBe('');
  });
});

describe('zod 边界（含两个实测坑）', () => {
  // 反例 3
  it('maxDepth:"1"（字符串数字）无损转换，不报错', async () => {
    const result = await runTool(repoIndexTool, { rootPath: FIXTURE, maxDepth: '1' });
    expect(result.total).toBeGreaterThanOrEqual(0);
  });

  // 反例 4
  it('maxDepth:"abc" 报错，且信息含参数名', async () => {
    await expect(runTool(repoIndexTool, { rootPath: FIXTURE, maxDepth: 'abc' })).rejects.toThrow(
      /repo_index: invalid arguments — maxDepth/,
    );
  });

  // 反例 5 —— 坑：z.coerce.number().parse("") === 0
  it('maxDepth:"" 报错（空串会被 coerce 成 0，靠 .min(1) 拦住）', async () => {
    await expect(runTool(repoIndexTool, { rootPath: FIXTURE, maxDepth: '' })).rejects.toThrow(
      /repo_index: invalid arguments — maxDepth/,
    );
  });

  // 反例 6
  it('maxDepth:100 上限守卫仍在（下沉到 zod 后没丢）', async () => {
    await expect(runTool(repoIndexTool, { rootPath: FIXTURE, maxDepth: 100 })).rejects.toThrow(
      /Too big/,
    );
  });

  // 坑：z.coerce.boolean().parse("false") === true，所以必须用 z.stringbool()
  it('includeContent:"abc" 报错，不静默当成 true', async () => {
    await expect(
      runTool(repoSearchTool, { rootPath: FIXTURE, pattern: 'export', includeContent: 'abc' }),
    ).rejects.toThrow(/repo_search: invalid arguments — includeContent/);
  });
});

describe('反例 7 —— 防复发：发给 LLM 的 JSON Schema 必须说真话', () => {
  /**
   * Day 10 根因：schema 声明 `type: 'string'`，execute 却期望 number/array。
   * LLM 老实按 schema 传字符串 → 静默失败。
   *
   * 这个测试不测功能，只测**契约的诚实性**。若哪天有人把 schema 写回 z.string()，
   * 它会立刻红。
   */
  it('数字参数在 JSON Schema 中必须是 integer，不能是 string', () => {
    const registry = new ToolRegistry();
    registry.register(repoIndexTool);
    registry.register(repoSearchTool);

    const defs = registry.toProviderTools();
    const index = defs.find((d) => d.name === 'repo_index');
    const search = defs.find((d) => d.name === 'repo_search');

    const indexProps = index?.parameters.properties as
      Record<string, { type?: string }> | undefined;
    const searchProps = search?.parameters.properties as
      Record<string, { type?: string }> | undefined;

    expect(indexProps?.maxDepth?.type).toBe('integer');
    expect(searchProps?.maxResults?.type).toBe('integer');
    expect(searchProps?.contextBefore?.type).toBe('integer');
    expect(searchProps?.contextAfter?.type).toBe('integer');
  });

  it('数组参数在 JSON Schema 中必须是 array', () => {
    const registry = new ToolRegistry();
    registry.register(repoIndexTool);

    const def = registry.toProviderTools()[0];
    const props = def?.parameters.properties as
      Record<string, { type?: string; items?: { type?: string } }> | undefined;

    expect(props?.ignorePatterns?.type).toBe('array');
    expect(props?.ignorePatterns?.items?.type).toBe('string');
  });

  /**
   * 这条是跑真实 LLM demo 时补上的 —— 原来的反例 7 只查了 integer / array，
   * 漏了 boolean，于是没抓到「z.stringbool() 单用时 JSON Schema 仍是 string」。
   * 教训：结构性测试要覆盖**所有非-string 语义类型**，漏一个就漏一类 bug。
   */
  it('布尔参数在 JSON Schema 中必须出现 boolean 分支，不能只是 string', () => {
    const registry = new ToolRegistry();
    registry.register(repoSearchTool);

    const def = registry.toProviderTools()[0];
    const props = def?.parameters.properties as
      Record<string, { type?: string; anyOf?: { type?: string }[] }> | undefined;
    const includeContent = props?.includeContent;

    const branches = includeContent?.anyOf?.map((b) => b.type) ?? [includeContent?.type];
    expect(branches).toContain('boolean');
  });

  it('带 default 的参数不进 required（LLM 可以不传）', () => {
    const registry = new ToolRegistry();
    registry.register(repoIndexTool);

    const def = registry.toProviderTools()[0];
    expect(def?.parameters.required).toContain('rootPath');
    expect(def?.parameters.required ?? []).not.toContain('maxDepth');
  });

  it('直接对 schema 求 JSON Schema 与 registry 派生结果一致（单一事实源）', () => {
    const registry = new ToolRegistry();
    registry.register(repoIndexTool);

    const fromRegistry = registry.toProviderTools()[0]?.parameters;
    const fromSchema = z.toJSONSchema(repoIndexTool.schema, { target: 'draft-7', io: 'input' });

    expect(fromRegistry).toEqual(fromSchema);
  });
});

describe('ToolRegistry.execute 作为校验唯一入口', () => {
  it('未注册的 tool 抛 not found', async () => {
    const registry = new ToolRegistry();
    await expect(registry.execute('nope', {})).rejects.toThrow(/tool "nope" not found/);
  });

  it('registry.execute 与 runTool 走同一套校验', async () => {
    const registry = new ToolRegistry();
    registry.register(repoIndexTool);

    await expect(
      registry.execute('repo_index', { rootPath: FIXTURE, maxDepth: 'abc' }),
    ).rejects.toThrow(/repo_index: invalid arguments — maxDepth/);
  });
});
