import type { Config } from 'tailwindcss';

/**
 * apps/web/tailwind.config.ts
 *
 * Tailwind CSS 配置 —— 仅供 @tailwindcss/vite 插件读取 content 路径。
 *
 * Day 08 决策：使用 Tailwind 默认调色板和 spacing，不引入自定义 theme tokens。
 * 理由：项目本身有 --bg/--fg 等 :root 变量（Conversation / Timeline 等旧组件用），新组件
 *       用 Tailwind utility 即可，零额外设计 token。
 */
export default {
  content: ['./index.html', './src/**/*.{vue,ts}'],
  theme: { extend: {} },
  plugins: [],
} satisfies Config;
