/**
 * libs/tools/repo/glob.ts
 *
 * 最小 glob 匹配：支持 *（单层）/ **（多层）/ ?（单字符）。
 *
 * 实现：glob → regex 转译，再走 JS RegExp。
 * 不引入 micromatch —— 24 行自写够 Day 10 用。
 *
 * 不支持：{} 字符集、[...] 字符类、+ 转义（Day 12 评估是否需要）。
 */

/** 把 glob 转成 anchored regex source */
function globToRegex(glob: string): string {
  let out = '^';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]!;
    if (c === '*') {
      // ** → 匹配任意（含 /）；* → 匹配任意（不含 /）
      if (glob[i + 1] === '*') {
        out += '.*';
        i++; // 跳过第二个 *
        // 跳过紧跟的 /（如 **/foo → .*/foo）
        if (glob[i + 1] === '/') i++;
      } else {
        out += '[^/]*';
      }
    } else if (c === '?') {
      out += '[^/]';
    } else {
      // 转义 regex 元字符
      out += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
  }
  out += '$';
  return out;
}

/** path 是否匹配 glob（POSIX 风格，/ 分隔） */
export function matchesGlob(path: string, pattern: string): boolean {
  // 简单优化：完全相等
  if (path === pattern) return true;
  // 转 regex
  const re = new RegExp(globToRegex(pattern));
  return re.test(path);
}