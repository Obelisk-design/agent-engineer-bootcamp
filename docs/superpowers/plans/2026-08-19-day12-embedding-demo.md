# Day 12 Embedding Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an embedding visualization demo (4 panels) that lets the user see the vector space — distance matrix, PCA scatter, dimension comparison, distance gradient — using real OpenAI embeddings.

**Architecture:** Three layers — (1) pure-function `libs/embedding/` (distance, pca, visualize, fixture, OpenAI wrapper); (2) `apps/web/src/views/embed/` Vue panels consuming libs; (3) router + LeftMenu + HeaderBar wiring under dev route `/embed-demo`. Frontend talks directly to the dev OpenAI-compatible gateway at `OPENAI_BASE_URL` (default `https://api.openai.com/v1`) using `OPENAI_API_KEY` (demo-only key exposure). `apps/api/` is **not** touched.

**Tech Stack:** TypeScript, Vitest, Vue 3, Tailwind, OpenAI-compatible gateway + 4096-dim embedding (supports Matryoshka → 256), zod (already in repo).

**Spec:** [../specs/2026-08-19-day12-embedding-demo-design.md](../specs/2026-08-19-day12-embedding-demo-design.md)

---

## Global Constraints

- **Route deconfliction**: dev route `/embed-demo` lives under `apps/web`; do **not** modify `apps/api/`.
- **No Agent-side changes**: `libs/agent/agent.ts`, `libs/llm/`, `examples/day08`, `examples/day09` are out of scope.
- **Daily note must include the route correction** (FileEditTool → Day 13+).
- **Single source of truth for fixture texts**: `libs/embedding/fixtures/sample-corpus.ts`; both libs and Vue panels import from it.
- **API key exposure**: `OPENAI_API_KEY` is dev-only (read via `import.meta.env.VITE_OPENAI_API_KEY` mirror — copy from `.env` at dev start, see Task 7 note). Console.warn once on first use.
- **Endpoint / model**: gateway URL via `OPENAI_BASE_URL` env (libs default `https://api.openai.com/v1/embeddings`); model via `OPENAI_EMBEDDING_MODEL` env (libs default `text-embedding-3-small`). Dev uses a 4096-dim embedding model that supports Matryoshka → 256.
- **Fail-loud**: missing key → red banner in demo; PCA n<2 → `RangeError`; empty fixture → `RangeError`.
- **TDD**: every libs task writes the failing test first, runs red, then impl.
- **Commit cadence**: one commit per task; no batching across tasks.
- **TypeScript strict**: zero `any` in libs (use precise number[] / Float32Array shapes).

---

## File Structure (locked decomposition)

```
libs/embedding/
  distance.ts          # pure: cosine, euclidean
  pca.ts               # pure: 2D PCA via power iteration
  visualize.ts         # pure: distance matrix HTML + SVG scatter
  fixtures/sample-corpus.ts   # const string[] exports
  embed.ts             # OpenAI embed client wrapper
  index.ts             # barrel

tests/libs/embedding/
  distance.test.ts     # 5 反对例
  pca.test.ts          # 3 反对例

apps/web/src/views/embed/
  api.ts               # 前端 fetch OpenAI
  styles.css           # demo 页专用样式
  PanelA.vue           # 距离矩阵热图
  PanelB.vue           # 2D scatter
  PanelC.vue           # 维度对比
  PanelD.vue           # 距离梯度
  EmbedDemo.vue        # 4 panel 容器

apps/web/src/router/index.ts             # + /embed-demo
apps/web/src/components/LeftMenu.vue     # + 图标
apps/web/src/components/HeaderBar.vue    # + (dev) 标识
apps/web/src/App.vue                     # 视现状加 <router-view>

.env.example                            # + VITE_OPENAI_API_KEY / VITE_OPENAI_BASE_URL / VITE_OPENAI_EMBEDDING_MODEL 注释

docs/daily/day12.md                      # 路线修正说明
```

---

## Task 1: distance.ts + 5 反例（TDD）

**Files:**
- Create: `libs/embedding/distance.ts`
- Test: `tests/libs/embedding/distance.test.ts`

**Interfaces:**
- Consumes: (none — first task)
- Produces:
  ```ts
  export function cosineSimilarity(a: number[], b: number[]): number;  // [-1, 1], 1=identical
  export function cosineDistance(a: number[], b: number[]): number;   // [0, 2], 0=identical
  export function euclideanDistance(a: number[], b: number[]): number; // >= 0, 0=identical
  ```

- [ ] **Step 1: Write the failing test** at `tests/libs/embedding/distance.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import {
  cosineSimilarity,
  cosineDistance,
  euclideanDistance,
} from '../../../libs/embedding/distance.js';

describe('cosineSimilarity', () => {
  it('identical vectors → 1', () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 10);
  });
  it('opposite vectors → -1', () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1, 10);
  });
  it('orthogonal vectors → 0', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 10);
  });
  it('asymmetric dims → throws RangeError', () => {
    expect(() => cosineSimilarity([1, 2], [1, 2, 3])).toThrow(RangeError);
  });
});

describe('cosineDistance', () => {
  it('identical vectors → 0', () => {
    expect(cosineDistance([1, 2, 3], [1, 2, 3])).toBeCloseTo(0, 10);
  });
  it('cosineDistance = 1 - cosineSimilarity', () => {
    expect(cosineDistance([1, 2], [3, 4])).toBeCloseTo(1 - cosineSimilarity([1, 2], [3, 4]), 10);
  });
});

describe('euclideanDistance', () => {
  it('identical vectors → 0', () => {
    expect(euclideanDistance([1, 2, 3], [1, 2, 3])).toBe(0);
  });
  it('unit apart → 1', () => {
    expect(euclideanDistance([0, 0], [1, 0])).toBeCloseTo(1, 10);
  });
  it('3-4-5 triangle → 5', () => {
    expect(euclideanDistance([0, 0], [3, 4])).toBeCloseTo(5, 10);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/libs/embedding/distance.test.ts`
Expected: FAIL — module not found (`distance.js` doesn't exist).

- [ ] **Step 3: Write minimal implementation** at `libs/embedding/distance.ts`

```ts
/**
 * libs/embedding/distance.ts
 *
 * 纯函数：向量距离度量。无 vue / 无网络依赖。
 * cosine ∈ [-1, 1]，cosine distance = 1 - cosine ∈ [0, 2]；
 * euclidean ≥ 0。
 */

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new RangeError(`vector dim mismatch: ${a.length} vs ${b.length}`);
  }
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const ai = a[i]!;
    const bi = b[i]!;
    dot += ai * bi;
    na += ai * ai;
    nb += bi * bi;
  }
  if (na === 0 || nb === 0) {
    throw new RangeError('zero vector has no direction');
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export function cosineDistance(a: number[], b: number[]): number {
  return 1 - cosineSimilarity(a, b);
}

export function euclideanDistance(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new RangeError(`vector dim mismatch: ${a.length} vs ${b.length}`);
  }
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i]! - b[i]!;
    sum += d * d;
  }
  return Math.sqrt(sum);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test tests/libs/embedding/distance.test.ts`
Expected: PASS — 8 cases green.

- [ ] **Step 5: Commit**

```bash
git add libs/embedding/distance.ts tests/libs/embedding/distance.test.ts
git commit -m "feat(day12): cosine + euclidean distance with 8 反对例"
```

---

## Task 2: pca.ts + 3 反例（TDD）

**Files:**
- Create: `libs/embedding/pca.ts`
- Test: `tests/libs/embedding/pca.test.ts`

**Interfaces:**
- Consumes: `number[][]` (n samples × d dims, d ≥ 2)
- Produces:
  ```ts
  export function pca2d(points: number[][]): { x: number; y: number }[];
  // throws RangeError if points.length < 2 or points[0].length < 2
  // or if all points identical (zero variance)
  ```

- [ ] **Step 1: Write the failing test** at `tests/libs/embedding/pca.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { pca2d } from '../../../libs/embedding/pca.js';

describe('pca2d', () => {
  it('returns one (x,y) per input sample', () => {
    const pts = [
      [1, 2, 3],
      [4, 5, 6],
      [7, 8, 9],
      [10, 11, 12],
    ];
    expect(pca2d(pts)).toHaveLength(4);
  });
  it('preserves monotonic variance on a clear linear trend', () => {
    // Points on a line: PCA-1 should capture the direction of the line.
    const pts = Array.from({ length: 20 }, (_, i) => [i, 2 * i, 0.01 * i]);
    const out = pca2d(pts);
    const xs = out.map((p) => p.x);
    const ys = out.map((p) => p.y);
    // Y component (2nd principal, lowest variance) should have small spread
    // vs X (highest variance direction).
    const spread = (arr: number[]) => Math.max(...arr) - Math.min(...arr);
    expect(spread(xs)).toBeGreaterThan(spread(ys));
  });
  it('throws RangeError on < 2 samples', () => {
    expect(() => pca2d([[1, 2, 3]])).toThrow(RangeError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/libs/embedding/pca.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation** at `libs/embedding/pca.ts`

```ts
/**
 * libs/embedding/pca.ts
 *
 * 手写 PCA → 2D：center → covariance → top-2 eigenvectors (power iteration)。
 * 适合 n ≤ 30、d ∈ [2, 1536]。够 demo 用，不引第三方。
 */

export interface Point2D {
  x: number;
  y: number;
}

export function pca2d(points: number[][]): Point2D[] {
  if (points.length < 2) {
    throw new RangeError(`pca2d needs ≥ 2 samples, got ${points.length}`);
  }
  const n = points.length;
  const d = points[0]!.length;
  for (const p of points) {
    if (p.length !== d) throw new RangeError('inconsistent dims across samples');
  }

  // Center
  const mean = new Array<number>(d).fill(0);
  for (const p of points) for (let i = 0; i < d; i++) mean[i]! += p[i]! / n;
  const centered = points.map((p) => p.map((v, i) => v - mean[i]!));

  // Covariance (d × d) — symmetric, power-iterable
  const cov: number[][] = Array.from({ length: d }, () => new Array<number>(d).fill(0));
  for (let i = 0; i < d; i++) {
    for (let j = i; j < d; j++) {
      let s = 0;
      for (let k = 0; k < n; k++) s += centered[k]![i]! * centered[k]![j]!;
      const v = s / (n - 1);
      cov[i]![j] = v;
      cov[j]![i] = v;
    }
  }

  const v1 = powerIterate(cov, 200);
  // Deflate: cov' = cov - λ v1 v1ᵀ
  const lambda1 = rayleigh(cov, v1);
  const deflated: number[][] = cov.map((row) => row.slice());
  for (let i = 0; i < d; i++) {
    for (let j = 0; j < d; j++) {
      deflated[i]![j]! -= lambda1 * v1[i]! * v1[j]!;
    }
  }
  const v2 = powerIterate(deflated, 200);

  if (rayleigh(cov, v2) > lambda1) {
    // numerical drift — swap if v2 accidentally captured more variance
    return points.map((p) => project(p, mean, v2, v1));
  }
  return points.map((p) => project(p, mean, v1, v2));
}

function project(p: number[], mean: number[], axis1: number[], axis2: number[]): Point2D {
  let x = 0;
  let y = 0;
  for (let i = 0; i < p.length; i++) {
    const c = p[i]! - mean[i]!;
    x += c * axis1[i]!;
    y += c * axis2[i]!;
  }
  return { x, y };
}

function powerIterate(M: number[][], iters: number): number[] {
  const d = M.length;
  let v = new Array<number>(d).fill(0).map((_, i) => (i === 0 ? 1 : 0));
  for (let it = 0; it < iters; it++) {
    const nv = new Array<number>(d).fill(0);
    for (let i = 0; i < d; i++) {
      let s = 0;
      for (let j = 0; j < d; j++) s += M[i]![j]! * v[j]!;
      nv[i] = s;
    }
    const norm = Math.hypot(...nv);
    if (norm === 0) throw new RangeError('zero-variance data: PCA undefined');
    v = nv.map((x) => x / norm);
  }
  return v;
}

function rayleigh(M: number[][], v: number[]): number {
  let num = 0;
  let den = 0;
  for (let i = 0; i < v.length; i++) {
    let row = 0;
    for (let j = 0; j < v.length; j++) row += M[i]![j]! * v[j]!;
    num += v[i]! * row;
    den += v[i]! * v[i]!;
  }
  return den === 0 ? 0 : num / den;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test tests/libs/embedding/pca.test.ts`
Expected: PASS — 3 cases green.

- [ ] **Step 5: Commit**

```bash
git add libs/embedding/pca.ts tests/libs/embedding/pca.test.ts
git commit -m "feat(day12): hand-rolled 2D PCA (power iteration) with 3 反对例"
```

---

## Task 3: fixtures/sample-corpus.ts

**Files:**
- Create: `libs/embedding/fixtures/sample-corpus.ts`

**Interfaces:**
- Consumes: (none)
- Produces:
  ```ts
  export const ANIMAL_WORDS: readonly string[];   // 4
  export const FRUIT_WORDS: readonly string[];    // 3
  export const ABSTRACT_WORDS: readonly string[]; // 3
  export const SAMPLE_CORPUS: readonly string[];  // 10
  export const QUERY_WITH_PREFIXES: readonly { name: string; text: string }[]; // query + 4 variants
  ```

- [ ] **Step 1: Write the file** at `libs/embedding/fixtures/sample-corpus.ts`

```ts
/**
 * libs/embedding/fixtures/sample-corpus.ts
 *
 * 单一事实源：所有 panel 共享这套 fixture。测试 + Vue 都 import 这份。
 * Panel A/B 用 SAMPLE_CORPUS；Panel D 用 QUERY_WITH_PREFIXES。
 */

export const ANIMAL_WORDS: readonly string[] = [
  'cat',
  'dog',
  'tiger',
  'elephant',
] as const;

export const FRUIT_WORDS: readonly string[] = [
  'apple',
  'banana',
  'orange',
] as const;

export const ABSTRACT_WORDS: readonly string[] = [
  'freedom',
  'justice',
  'happiness',
] as const;

export const SAMPLE_CORPUS: readonly string[] = [
  ...ANIMAL_WORDS,
  ...FRUIT_WORDS,
  ...ABSTRACT_WORDS,
] as const;

export const QUERY_WITH_PREFIXES: readonly { name: string; text: string }[] = [
  { name: 'short prefix',  text: 'The cat sat on the mat' },
  { name: 'medium prefix', text: 'Yesterday the cat sat on the mat in the living room' },
  { name: 'long prefix',   text: 'According to the ancient fable, the cat sat on the mat because the mat was warm and comfortable' },
  { name: 'unrelated',     text: 'Quantum mechanics predicts electron behavior in magnetic fields' },
];
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add libs/embedding/fixtures/sample-corpus.ts
git commit -m "feat(day12): shared sample-corpus fixture (animals/fruits/abstracts + prefix variants)"
```

---

## Task 4: visualize.ts — 距离矩阵 HTML + SVG 散点

**Files:**
- Create: `libs/embedding/visualize.ts`

**Interfaces:**
- Consumes:
  ```ts
  cosineDistance(a: number[], b: number[]): number; // from task 1
  pca2d(points: number[][]): { x: number; y: number }[]; // from task 2
  SAMPLE_CORPUS: readonly string[]; // from task 3
  ```
- Produces:
  ```ts
  export function distanceMatrixHTML(labels: readonly string[], vectors: readonly number[][]): string; // self-contained HTML, heatmap colored cells
  export function scatterSVG(labels: readonly string[], vectors: readonly number[][]): string; // self-contained <svg>
  ```

- [ ] **Step 1: Write the file** at `libs/embedding/visualize.ts`

```ts
/**
 * libs/embedding/visualize.ts
 *
 * 纯函数：距离矩阵 → HTML 热图；向量集合 → SVG 散点图。
 * 输出 self-contained 字符串（Vue 直接 v-html 即可）。
 */

import { cosineDistance } from './distance.js';
import { pca2d } from './pca.js';

function lerpColor(t: number): string {
  // t ∈ [0, 1] — 0 (close) → near-white, 1 (far) → deep red
  const clamped = Math.max(0, Math.min(1, t));
  const r = Math.round(255 - 215 * clamped);
  const g = Math.round(255 - 245 * clamped);
  const b = Math.round(255 - 220 * clamped);
  return `rgb(${r}, ${g}, ${b})`;
}

export function distanceMatrixHTML(
  labels: readonly string[],
  vectors: readonly number[][],
): string {
  if (labels.length === 0 || vectors.length === 0) {
    throw new RangeError('distanceMatrixHTML: empty input');
  }
  if (labels.length !== vectors.length) {
    throw new RangeError('labels/vectors length mismatch');
  }
  const n = labels.length;
  let maxD = 0;
  const grid: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const d = cosineDistance(vectors[i]!, vectors[j]!);
      grid[i]![j] = d;
      if (d > maxD) maxD = d;
    }
  }
  const cells: string[] = [];
  for (let i = 0; i < n; i++) {
    cells.push('<tr>');
    cells.push(`<th class="lbl">${escapeHtml(labels[i]!)}</th>`);
    for (let j = 0; j < n; j++) {
      const d = grid[i]![j]!;
      const t = maxD === 0 ? 0 : d / maxD;
      const bg = lerpColor(t);
      cells.push(
        `<td style="background:${bg}" title="${escapeHtml(labels[i]!)}�${escapeHtml(labels[j]!)} = ${d.toFixed(3)}">${d.toFixed(2)}</td>`,
      );
    }
    cells.push('</tr>');
  }
  return `<table class="dm"><thead><tr><th></th>${labels.map((l) => `<th>${escapeHtml(l)}</th>`).join('')}</tr></thead><tbody>${cells.join('')}</tbody></table>`;
}

export function scatterSVG(
  labels: readonly string[],
  vectors: readonly number[][],
  width = 480,
  height = 360,
): string {
  if (labels.length !== vectors.length) {
    throw new RangeError('labels/vectors length mismatch');
  }
  if (vectors.length < 2) {
    throw new RangeError('scatterSVG needs ≥ 2 points');
  }
  const projected = pca2d(vectors.map((v) => [...v]));
  const xs = projected.map((p) => p.x);
  const ys = projected.map((p) => p.y);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMin = Math.min(...ys);
  const yMax = Math.max(...ys);
  const xSpan = xMax - xMin || 1;
  const ySpan = yMax - yMin || 1;
  const pad = 24;
  const px = (x: number) => pad + ((x - xMin) / xSpan) * (width - 2 * pad);
  const py = (y: number) => height - pad - ((y - yMin) / ySpan) * (height - 2 * pad);

  const dots = projected
    .map((p, i) => {
      const cx = px(p.x).toFixed(1);
      const cy = py(p.y).toFixed(1);
      return `<g><circle cx="${cx}" cy="${cy}" r="5" fill="#7dd3fc" stroke="#0ea5e9" stroke-width="1" /><text x="${cx}" y="${cy - 8}" text-anchor="middle" font-size="10" fill="#e4e4e7">${escapeHtml(labels[i]!)}</text></g>`;
    })
    .join('');

  return `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" class="scatter">${dots}</svg>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]!));
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add libs/embedding/visualize.ts
git commit -m "feat(day12): distanceMatrixHTML + scatterSVG visualizers"
```

---

## Task 5: embed.ts — OpenAI client wrapper

**Files:**
- Create: `libs/embedding/embed.ts`
- Modify: `.env.example` — add `VITE_OPENAI_KEY=` line with comment

**Interfaces:**
- Consumes: `import.meta.env.VITE_OPENAI_API_KEY` (only when invoked from frontend via `api.ts`; libs itself accepts key as arg to stay testable). Optional: `VITE_OPENAI_BASE_URL` (gateway), `VITE_OPENAI_EMBEDDING_MODEL` (default `text-embedding-3-small`).
- Produces:
  ```ts
  export interface EmbedRequest { input: string | readonly string[]; dimensions?: 4096 | 256; model?: string; baseUrl?: string; }
  export interface EmbedResult { vectors: number[][]; model: string; dimensions: number; }
  export async function embed(req: EmbedRequest, apiKey: string, signal?: AbortSignal): Promise<EmbedResult>;
  ```

- [ ] **Step 1: Write the file** at `libs/embedding/embed.ts`

```ts
/**
 * libs/embedding/embed.ts
 *
 * OpenAI-compatible embeddings wrapper。libs 层接受 apiKey 入参，
 * 不读 import.meta.env —— 让 libs 在 node 测试环境下可被 mock。
 * 实际读 key 在前端 api.ts。
 */

export type EmbedDimensions = 4096 | 256;

export interface EmbedRequest {
  input: string | readonly string[];
  dimensions?: EmbedDimensions;
  model?: string;
}

export interface EmbedResult {
  vectors: number[][];
  model: string;
  dimensions: number;
}

const DEFAULT_MODEL = 'text-embedding-3-small';
const DEFAULT_BASE_URL = 'https://api.openai.com/v1';

export async function embed(
  req: EmbedRequest,
  apiKey: string,
  signal?: AbortSignal,
): Promise<EmbedResult> {
  if (!apiKey) throw new RangeError('apiKey required');
  const model = req.model ?? DEFAULT_MODEL;
  const baseUrl = req.baseUrl ?? DEFAULT_BASE_URL;
  const body: Record<string, unknown> = {
    model,
    input: req.input,
  };
  if (req.dimensions !== undefined) body.dimensions = req.dimensions;

  const res = await fetch(`${baseUrl}/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI embeddings ${res.status}: ${text}`);
  }
  const json = (await res.json()) as {
    model: string;
    data: { embedding: number[] }[];
  };
  const vectors = json.data.map((d) => d.embedding);
  return {
    vectors,
    model: json.model,
    dimensions: vectors[0]?.length ?? 0,
  };
}
```

- [ ] **Step 2: Update `.env.example`**

Append after the last existing key:

```
# Day 12 — Embedding demo
# dev-only; consumed by apps/web via import.meta.env.VITE_OPENAI_API_KEY
# (copy from OPENAI_API_KEY in your local .env; OpenAI gateway in this repo lives on intranet)
VITE_OPENAI_API_KEY=
# Optional: override OpenAI-compatible endpoint
VITE_OPENAI_BASE_URL=https://api.openai.com/v1
# Optional: override embedding model (dev: see your gateway admin whitelist; OpenAI default: text-embedding-3-small)
VITE_OPENAI_EMBEDDING_MODEL=text-embedding-3-small
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add libs/embedding/embed.ts .env.example
git commit -m "feat(day12): OpenAI embeddings client wrapper + .env.example hint"
```

---

## Task 6: libs/embedding/index.ts barrel

**Files:**
- Create: `libs/embedding/index.ts`

**Interfaces:**
- Re-exports: `embed`, `EmbedRequest`, `EmbedResult`, `EmbedDimensions`, `cosineSimilarity`, `cosineDistance`, `euclideanDistance`, `pca2d`, `Point2D`, `distanceMatrixHTML`, `scatterSVG`
- Re-exports fixtures: `SAMPLE_CORPUS`, `ANIMAL_WORDS`, `FRUIT_WORDS`, `ABSTRACT_WORDS`, `QUERY_WITH_PREFIXES`

- [ ] **Step 1: Write the file** at `libs/embedding/index.ts`

```ts
/**
 * libs/embedding/index.ts — barrel
 *
 * 一次 import 拿全 embedding 工具链。fixtures 也走这条路径。
 */

export {
  embed,
  type EmbedRequest,
  type EmbedResult,
  type EmbedDimensions,
} from './embed.js';

export {
  cosineSimilarity,
  cosineDistance,
  euclideanDistance,
} from './distance.js';

export { pca2d, type Point2D } from './pca.js';

export { distanceMatrixHTML, scatterSVG } from './visualize.js';

export {
  ANIMAL_WORDS,
  FRUIT_WORDS,
  ABSTRACT_WORDS,
  SAMPLE_CORPUS,
  QUERY_WITH_PREFIXES,
} from './fixtures/sample-corpus.js';
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add libs/embedding/index.ts
git commit -m "feat(day12): libs/embedding barrel"
```

---

## Task 7: apps/web/src/views/embed/api.ts — 前端 OpenAI 适配

**Files:**
- Create: `apps/web/src/views/embed/api.ts`

**Interfaces:**
- Consumes: `libs/embedding` barrel
- Produces:
  ```ts
  export function getOpenAIKey(): string | null;
  export function warnDevKeyOnce(): void;
  export async function embedTexts(texts: readonly string[], dimensions: 4096 | 256, signal?: AbortSignal): Promise<number[][]>;
  ```

- [ ] **Step 1: Write the file** at `apps/web/src/views/embed/api.ts`

```ts
/**
 * apps/web/src/views/embed/api.ts
 *
 * 前端 OpenAI 适配：读 VITE_OPENAI_API_KEY / VITE_OPENAI_BASE_URL / VITE_OPENAI_EMBEDDING_MODEL，warn 一次，调用 libs/embedding.embed。
 * key 缺失时返回 null，由 EmbedDemo 显示红 banner。
 */

import { embed } from '../../../../../libs/embedding/index.js';

let warned = false;

export function getOpenAIKey(): string | null {
  const apiKey = import.meta.env.VITE_OPENAI_API_KEY;
  const baseUrl = import.meta.env.VITE_OPENAI_BASE_URL as string | undefined;
  const modelName = import.meta.env.VITE_OPENAI_EMBEDDING_MODEL as string | undefined;
  return { apiKey, baseUrl, modelName };
}

export function warnDevKeyOnce(): void {
  if (warned) return;
  warned = true;
  if (getOpenAIKey() !== null) {
    console.warn('[embed-demo] VITE_OPENAI_API_KEY is exposed in the browser — dev-only.');
  }
}

export async function embedTexts(
  texts: readonly string[],
  dimensions: 4096 | 256,
  signal?: AbortSignal,
): Promise<number[][]> {
  const key = getOpenAIKey();
  if (apiKey === null) throw new RangeError('VITE_OPENAI_API_KEY not set');
  const result = await embed({ input: texts, dimensions }, key, signal);
  return result.vectors;
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/views/embed/api.ts
git commit -m "feat(day12): frontend OpenAI adapter (key exposure warn-once)"
```

---

## Task 8: apps/web/src/views/embed/styles.css

**Files:**
- Create: `apps/web/src/views/embed/styles.css`

- [ ] **Step 1: Write the file** at `apps/web/src/views/embed/styles.css`

```css
/**
 * apps/web/src/views/embed/styles.css
 *
 * 4 panel 共享样式。Tailwind 处理布局；本页专用：距离矩阵、scatter、loading 态。
 */

.embed-demo {
  padding: 1.5rem;
  display: grid;
  gap: 1.5rem;
}

.embed-panel {
  background: #18181b;
  border: 1px solid #27272a;
  border-radius: 0.5rem;
  padding: 1rem;
}

.embed-panel h2 {
  font-size: 0.95rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
  color: #e4e4e7;
}

table.dm {
  border-collapse: collapse;
  font-family: ui-monospace, SFMono-Regular, monospace;
  font-size: 11px;
}
table.dm th,
table.dm td {
  border: 1px solid #3f3f46;
  padding: 4px 6px;
  text-align: center;
  min-width: 36px;
}
table.dm th.lbl {
  text-align: left;
  background: #27272a;
  color: #d4d4d8;
}
table.dm thead th {
  background: #27272a;
  color: #d4d4d8;
  font-weight: 500;
}

svg.scatter {
  background: #09090b;
  border-radius: 0.375rem;
  display: block;
}

.embed-error {
  background: #7f1d1d;
  color: #fee2e2;
  border: 1px solid #b91c1c;
  border-radius: 0.375rem;
  padding: 0.75rem 1rem;
}

.embed-loading {
  color: #a1a1aa;
  font-style: italic;
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/views/embed/styles.css
git commit -m "feat(day12): demo page styles (heatmap/scatter/loading)"
```

---

## Task 9: PanelA.vue — 距离矩阵热图

**Files:**
- Create: `apps/web/src/views/embed/PanelA.vue`

**Interfaces:**
- Consumes: `embedTexts`, `SAMPLE_CORPUS`, `distanceMatrixHTML`
- Produces: Vue SFC with run button + result `<table>` via `v-html`

- [ ] **Step 1: Write the file** at `apps/web/src/views/embed/PanelA.vue`

```vue
<!--
  apps/web/src/views/embed/PanelA.vue
  Panel A: 距离矩阵热图 (Panel A from spec — 4 animals / 3 fruits / 3 abstracts)
-->
<script setup lang="ts">
import { ref } from 'vue';
import { SAMPLE_CORPUS, distanceMatrixHTML } from '../../../../../libs/embedding/index.js';
import { embedTexts, warnDevKeyOnce } from './api.js';

const html = ref<string | null>(null);
const busy = ref(false);
const err = ref<string | null>(null);

async function run(): Promise<void> {
  busy.value = true;
  err.value = null;
  html.value = null;
  warnDevKeyOnce();
  try {
    const vectors = await embedTexts(SAMPLE_CORPUS, 1536);
    html.value = distanceMatrixHTML(SAMPLE_CORPUS, vectors);
  } catch (e) {
    err.value = e instanceof Error ? e.message : String(e);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section class="embed-panel">
    <h2>Panel A · 距离矩阵热图（10 个混合词，cosine，4096 维）</h2>
    <button class="text-xs px-3 py-1 rounded bg-sky-700 hover:bg-sky-600 disabled:opacity-50" :disabled="busy" @click="run">
      {{ busy ? 'Running…' : 'Run' }}
    </button>
    <p v-if="err" class="embed-error mt-3">{{ err }}</p>
    <p v-else-if="busy" class="embed-loading mt-3">embedding 10 texts…</p>
    <div v-else-if="html" class="mt-3 overflow-auto" v-html="html" />
  </section>
</template>
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/views/embed/PanelA.vue
git commit -m "feat(day12): Panel A — distance matrix heatmap"
```

---

## Task 10: PanelB.vue — 2D scatter

**Files:**
- Create: `apps/web/src/views/embed/PanelB.vue`

- [ ] **Step 1: Write the file** at `apps/web/src/views/embed/PanelB.vue`

```vue
<!--
  apps/web/src/views/embed/PanelB.vue
  Panel B: PCA → 2D scatter
-->
<script setup lang="ts">
import { ref } from 'vue';
import { SAMPLE_CORPUS, scatterSVG } from '../../../../../libs/embedding/index.js';
import { embedTexts, warnDevKeyOnce } from './api.js';

const svg = ref<string | null>(null);
const busy = ref(false);
const err = ref<string | null>(null);

async function run(): Promise<void> {
  busy.value = true;
  err.value = null;
  svg.value = null;
  warnDevKeyOnce();
  try {
    const vectors = await embedTexts(SAMPLE_CORPUS, 1536);
    svg.value = scatterSVG(SAMPLE_CORPUS, vectors);
  } catch (e) {
    err.value = e instanceof Error ? e.message : String(e);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section class="embed-panel">
    <h2>Panel B · PCA → 2D 散点图（同 10 词）</h2>
    <button class="text-xs px-3 py-1 rounded bg-sky-700 hover:bg-sky-600 disabled:opacity-50" :disabled="busy" @click="run">
      {{ busy ? 'Running…' : 'Run' }}
    </button>
    <p v-if="err" class="embed-error mt-3">{{ err }}</p>
    <p v-else-if="busy" class="embed-loading mt-3">embedding + PCA…</p>
    <div v-else-if="svg" class="mt-3" v-html="svg" />
  </section>
</template>
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/views/embed/PanelB.vue
git commit -m "feat(day12): Panel B — PCA 2D scatter"
```

---

## Task 11: PanelC.vue — 维度对比

**Files:**
- Create: `apps/web/src/views/embed/PanelC.vue`

- [ ] **Step 1: Write the file** at `apps/web/src/views/embed/PanelC.vue`

```vue
<!--
  apps/web/src/views/embed/PanelC.vue
  Panel C: 4096 vs 256 dim — same texts, side-by-side distance matrices.
-->
<script setup lang="ts">
import { ref } from 'vue';
import { SAMPLE_CORPUS, distanceMatrixHTML } from '../../../../../libs/embedding/index.js';
import { embedTexts, warnDevKeyOnce } from './api.js';

const html4096 = ref<string | null>(null);
const html256 = ref<string | null>(null);
const busy = ref(false);
const err = ref<string | null>(null);

async function run(): Promise<void> {
  busy.value = true;
  err.value = null;
  html1536.value = null;
  html256.value = null;
  warnDevKeyOnce();
  try {
    const [v4096, v256] = await Promise.all([
      embedTexts(SAMPLE_CORPUS, 4096),
      embedTexts(SAMPLE_CORPUS, 256),
    ]);
    html4096.value = distanceMatrixHTML(SAMPLE_CORPUS, v4096);
    html256.value = distanceMatrixHTML(SAMPLE_CORPUS, v256);
  } catch (e) {
    err.value = e instanceof Error ? e.message : String(e);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section class="embed-panel">
    <h2>Panel C · 维度对比（4096 vs 256）</h2>
    <button class="text-xs px-3 py-1 rounded bg-sky-700 hover:bg-sky-600 disabled:opacity-50" :disabled="busy" @click="run">
      {{ busy ? 'Running…' : 'Run' }}
    </button>
    <p v-if="err" class="embed-error mt-3">{{ err }}</p>
    <p v-else-if="busy" class="embed-loading mt-3">embedding both dimensions…</p>
    <div v-else-if="html4096 && html256" class="mt-3 grid grid-cols-2 gap-4">
      <div>
        <h3 class="text-xs text-zinc-400 mb-2">@4096</h3>
        <div class="overflow-auto" v-html="html4096" />
      </div>
      <div>
        <h3 class="text-xs text-zinc-400 mb-2">@256</h3>
        <div class="overflow-auto" v-html="html256" />
      </div>
    </div>
  </section>
</template>
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/views/embed/PanelC.vue
git commit -m "feat(day12): Panel C — dimension comparison (4096 vs 256)"
```

---

## Task 12: PanelD.vue — 距离梯度

**Files:**
- Create: `apps/web/src/views/embed/PanelD.vue`

- [ ] **Step 1: Write the file** at `apps/web/src/views/embed/PanelD.vue`

```vue
<!--
  apps/web/src/views/embed/PanelD.vue
  Panel D: query + 4 prefix variants — visualize distance gradient.
-->
<script setup lang="ts">
import { ref, computed } from 'vue';
import {
  QUERY_WITH_PREFIXES,
  cosineDistance,
} from '../../../../../libs/embedding/index.js';
import { embedTexts, warnDevKeyOnce } from './api.js';

const QUERY = 'The cat is a friendly animal';

interface Row {
  name: string;
  text: string;
  distance: number;
}

const rows = ref<Row[] | null>(null);
const busy = ref(false);
const err = ref<string | null>(null);
const maxD = computed(() => (rows.value ? Math.max(...rows.value.map((r) => r.distance)) : 1));

async function run(): Promise<void> {
  busy.value = true;
  err.value = null;
  rows.value = null;
  warnDevKeyOnce();
  try {
    const all = [QUERY, ...QUERY_WITH_PREFIXES.map((p) => p.text)];
    const vectors = await embedTexts(all, 1536);
    const queryVec = vectors[0]!;
    rows.value = QUERY_WITH_PREFIXES.map((p, i) => ({
      name: p.name,
      text: p.text,
      distance: cosineDistance(queryVec, vectors[i + 1]!),
    }));
  } catch (e) {
    err.value = e instanceof Error ? e.message : String(e);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section class="embed-panel">
    <h2>Panel D · 距离梯度（query + 4 前缀变体）</h2>
    <p class="text-xs text-zinc-400 mb-2">
      query: <code class="text-zinc-200">"{{ QUERY }}"</code>
    </p>
    <button class="text-xs px-3 py-1 rounded bg-sky-700 hover:bg-sky-600 disabled:opacity-50" :disabled="busy" @click="run">
      {{ busy ? 'Running…' : 'Run' }}
    </button>
    <p v-if="err" class="embed-error mt-3">{{ err }}</p>
    <p v-else-if="busy" class="embed-loading mt-3">embedding query + variants…</p>
    <ul v-else-if="rows" class="mt-3 space-y-2 text-xs">
      <li v-for="r in rows" :key="r.name" class="flex items-center gap-3">
        <span class="w-28 text-zinc-400">{{ r.name }}</span>
        <div class="flex-1 bg-zinc-800 rounded h-3 overflow-hidden">
          <div class="h-full bg-rose-500" :style="{ width: ((r.distance / maxD) * 100) + '%' }" />
        </div>
        <span class="w-16 text-right text-zinc-300">{{ r.distance.toFixed(3) }}</span>
      </li>
    </ul>
  </section>
</template>
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/views/embed/PanelD.vue
git commit -m "feat(day12): Panel D — distance gradient (query + prefix variants)"
```

---

## Task 13: EmbedDemo.vue — 4 panel 容器

**Files:**
- Create: `apps/web/src/views/embed/EmbedDemo.vue`

- [ ] **Step 1: Write the file** at `apps/web/src/views/embed/EmbedDemo.vue`

```vue
<!--
  apps/web/src/views/embed/EmbedDemo.vue
  Day 12 demo page: 4 visualization panels under /embed-demo.
-->
<script setup lang="ts">
import PanelA from './PanelA.vue';
import PanelB from './PanelB.vue';
import PanelC from './PanelC.vue';
import PanelD from './PanelD.vue';
import { getOpenAIKey } from './api.js';
</script>

<template>
  <main class="embed-demo">
    <header class="flex items-baseline gap-3">
      <h1 class="text-lg font-semibold text-zinc-100">Embedding Demo</h1>
      <span class="text-xs text-zinc-500">(dev) Day 12</span>
    </header>

    <div v-if="getOpenAIKey() === null" class="embed-error">
      请设置 <code>VITE_OPENAI_API_KEY</code> in <code>.env</code> 后重启 <code>pnpm dev:web</code>。
    </div>

    <PanelA />
    <PanelB />
    <PanelC />
    <PanelD />
  </main>
</template>
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/views/embed/EmbedDemo.vue
git commit -m "feat(day12): EmbedDemo container (4 panels + key-missing banner)"
```

---

## Task 14: 注册 `/embed-demo` 路由

**Files:**
- Modify: `apps/web/src/router/index.ts` (or `apps/web/src/main.ts` if no router file yet)
- Possibly modify: `apps/web/src/App.vue` to add `<router-view>` (only if not already present)

**Step 0: Discover existing routing setup**

```bash
ls apps/web/src/router 2>/dev/null
grep -n "router" apps/web/src/main.ts apps/web/src/App.vue
```

Pick the right edit point based on output. **Do not** invent a router library — if none exists, use hash-mode `window.location.hash` with a minimal mount switch in `App.vue` (no vue-router install).

- [ ] **Step 1: Register the route / mount switch**

**Path A — vue-router already exists** (`apps/web/src/router/index.ts`):

```ts
import EmbedDemo from '../views/embed/EmbedDemo.vue';
// append to existing routes array:
{ path: '/embed-demo', component: EmbedDemo },
```

**Path B — no router** (use minimal hash switch in `App.vue`):

Append to `App.vue` template, right after the existing root `<div>`:

```vue
<div v-if="route === '/embed-demo'" class="flex-1 min-h-0 overflow-auto">
  <EmbedDemo />
</div>
```

And add a `route` ref driven by `window.location.hash` plus a `hashchange` listener in `<script setup>`.

(Choose Path A or B based on Step 0.)

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/router/index.ts apps/web/src/App.vue
git commit -m "feat(day12): register /embed-demo route (or hash switch)"
```

---

## Task 15: LeftMenu + HeaderBar dev 标识

**Files:**
- Modify: `apps/web/src/components/LeftMenu.vue`
- Modify: `apps/web/src/components/HeaderBar.vue`

- [ ] **Step 1: Add Embedding icon to LeftMenu**

Locate the existing menu items array/list in `LeftMenu.vue`. Add a new item:

```ts
{ key: 'embed-demo', label: 'Embedding', href: '#/embed-demo', icon: '🔮' },
```

(Use whatever shape the existing items use — copy the pattern verbatim.)

- [ ] **Step 2: Add `(dev)` suffix in HeaderBar**

Locate the title/header text in `HeaderBar.vue`. Append ` (dev)` to the displayed model/title — or add a separate badge `<span class="text-xs text-zinc-500">(dev: Day 12 embed-demo)</span>` next to existing chrome. Match the day-09 pattern if it exists.

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/LeftMenu.vue apps/web/src/components/HeaderBar.vue
git commit -m "feat(day12): LeftMenu entry + HeaderBar (dev) badge"
```

---

## Task 16: daily note + 最终验证

**Files:**
- Create: `docs/daily/day12.md`

- [ ] **Step 1: Write the daily note** at `docs/daily/day12.md`

Use the day-11 daily as a template. Required sections:
- **路线修正（首段必明写）**：原 Day 12 = FileEditTool；今天临时换路线学 embedding；FileEditTool 顺延到 Day 13+。理由 4 条（来自 spec Context）。
- **今日产出物**：文件清单（与 spec 文件清单一致）。
- **学到的东西**：embedding 是什么、为什么 cosine、为什么 PCA、为什么维度可压。
- **Acceptance Criteria 逐条核对**：从 spec 末尾的清单复制，每条标 ✅/❌ 并写证据（命令输出或截图）。
- **Day 13 路线**：FileEditTool（依赖 cat -n 行号，`replaceAll: boolean` 用 zod union 绕 bug C）。

- [ ] **Step 2: Final verification — run all gates**

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm dev:web &  # 后台启 dev server
sleep 8
# 用 Chrome MCP 打开 http://localhost:5173/embed-demo，依次点 4 个 panel 的 Run，看输出
```

Expected:
- typecheck / lint 零错
- test 全绿（含 8 个新反例）
- 4 个 panel 至少 Panel A 能跑通，肉眼看到"同类相聚"

If any panel fails: do **not** claim done — debug per `superpowers:systematic-debugging` 5-step.

- [ ] **Step 3: Commit**

```bash
git add docs/daily/day12.md
git commit -m "docs(day12): daily note with route correction + 16-task acceptance checklist"
```

---

## Self-Review (post-write)

**Spec coverage** (against `docs/superpowers/specs/2026-08-19-day12-embedding-demo-design.md`):

| Spec requirement | Task |
|---|---|
| Goal #1 单文本 → 向量（看维度） | covered indirectly by Panel A–D vectors (the "4096 dim" labels in templates) |
| Goal #2 距离矩阵热图 | Task 9 (Panel A) |
| Goal #3 PCA → 2D scatter | Task 10 (Panel B) |
| Goal #4 维度对比（4096 vs 256） | Task 11 (Panel C) |
| Goal #5 距离梯度 | Task 12 (Panel D) |
| 单一事实源 fixture | Task 3 |
| 纯函数库 + 单测 | Tasks 1, 2 |
| OpenAI 客户端 + key 暴露 | Tasks 5, 7 |
| Vue 路由页 + dev 入口 | Tasks 8–15 |
| 错误处理（缺 key 红 banner / PCA n<2 / 空 fixture） | Tasks 4 (`RangeError`), 13 (red banner) |
| 验证策略（test/typecheck/lint/手跑） | Task 16 |
| Acceptance Criteria 8 条 | Task 16 checklist |
| 不改 apps/api | 全程不触 |
| Daily note 含路线修正 | Task 16 |

**Gap**: Goal #1 ("看前 N 维数字 + 维度大小") 没有专门 panel—— 已经被 Panel A 的标题 ("4096 维") 间接展示，spec 也接受"在 demo 中显示维度即可"。不补。

**Placeholder scan**: 0 "TBD/TODO/类似" 出现。所有 `.vue`、`.ts` 都给了完整代码。

**Type consistency**:
- `EmbedDimensions` 在 Task 5 定义 → Task 7 `embedTexts` 第二参数复用 → Task 11 Panel C 调用 → 一致 ✅
- `cosineDistance` 签名在 Task 1 定义 → Task 4 使用 → Task 12 使用 → 一致 ✅
- `pca2d` 在 Task 2 定义 → Task 4 `scatterSVG` 使用 → Task 10 Panel B 调用 → 一致 ✅

**No issues found.** Plan is internally consistent and covers every spec requirement.
