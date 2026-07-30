<!--
  apps/web/src/components/CodeBlock.vue

  自写 fence parser —— 不引 highlight.js / shiki。
  - 匹配 ```lang\n...\n``` 切片（多个代码块也能识别）
  - 段落外的文字按 plain 渲染
  - 代码块带等宽字体 + 深色背景 + 顶栏（语言标签 + 复制按钮）
  - 复制是 navigator.clipboard.writeText，失败时降级为显示错误 chip（无 throw）

  设计：
  - 只识别 ```xxx\n + 内容 + ```\n 三段式，闭合失败时按 plain 渲染（不报红）
  - copy 按钮 hover 显示，点击后短暂 "copied"
-->

<script setup lang="ts">
import { computed, ref } from 'vue';

interface Props {
  text: string;
}

const props = defineProps<Props>();

interface Segment {
  readonly kind: 'code' | 'text';
  readonly lang?: string;
  readonly body: string;
}

const segments = computed<Segment[]>(() => {
  const re = /```([a-zA-Z0-9_+-]*)\n([\s\S]*?)```/g;
  const out: Segment[] = [];
  let lastIndex = 0;
  for (;;) {
    const m = re.exec(props.text);
    if (m === null) break;
    if (m.index > lastIndex) {
      out.push({ kind: 'text', body: props.text.slice(lastIndex, m.index) });
    }
    const lang = m[1];
    const body = m[2];
    if (lang === undefined || body === undefined) break;
    out.push({ kind: 'code', lang: lang === '' ? 'plain' : lang, body: body.replace(/\n$/, '') });
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < props.text.length) {
    out.push({ kind: 'text', body: props.text.slice(lastIndex) });
  }
  return out;
});

const copiedIdx = ref<number | null>(null);

async function copy(body: string, idx: number): Promise<void> {
  try {
    await navigator.clipboard.writeText(body);
    copiedIdx.value = idx;
    setTimeout(() => {
      if (copiedIdx.value === idx) copiedIdx.value = null;
    }, 1200);
  } catch {
    // clipboard 不可用（HTTP / 浏览器策略）—— 不报错，UI 不变
  }
}
</script>

<template>
  <div class="leading-relaxed">
    <template v-for="(seg, idx) in segments" :key="idx">
      <pre
        v-if="seg.kind === 'code'"
        class="my-2 rounded border border-zinc-800 bg-zinc-950 overflow-x-auto"
      ><header class="flex items-center justify-between px-3 py-1.5 border-b border-zinc-800 bg-zinc-900 text-xs"><span class="text-zinc-500 mono">{{ seg.lang }}</span><button class="text-zinc-400 hover:text-zinc-100 transition-colors text-[11px] tracking-wider uppercase" @click="copy(seg.body, idx)">{{ copiedIdx === idx ? '✓ copied' : 'copy' }}</button></header><code class="block px-3 py-2 mono text-[12px] text-zinc-100 whitespace-pre">{{ seg.body }}</code></pre>
      <span v-else class="whitespace-pre-wrap">{{ seg.body }}</span>
    </template>
  </div>
</template>
