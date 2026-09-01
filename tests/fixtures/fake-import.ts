/**
 * tests/fixtures/fake-import.ts
 *
 * spawnMain 测试的本地 fixture：打印与真实 importer 对齐的 4 个 phase marker 后 exit 0。
 *
 * 为什么需要它：真实 CLI（notion_import / md_import）的 dry-run 仍会打 api.notion.com
 * 或开 lancedb native binding —— 网络天气驱动：断网时快速失败"假通过"，通网时真实
 * 递归导入 >180s 超时。spawnMain 的测试对象是 spawn→parse→exit 契约，不需要真实
 * 导入。真实 CLI 的集成验证在 Day14 手动跑（见 docs/daily/day14.md 验收记录）。
 */
console.log('>>> Notion import: seedPages=1, childPages=0, total=1 pages in 5ms');
console.log('>>> Diff: +1 added, +0 modified, -0 removed, 0 unchanged');
console.log('>>> Embed: heading=1 paragraph=2 (fallback: {})');
console.log('>>> Write: 3 chunks in 7ms');
