/**
 * libs/embedding/fixtures/sample-corpus.ts
 *
 * 单一事实源：所有 panel 共享这套 fixture。测试 + Vue 都 import 这份。
 * Panel A/B 用 SAMPLE_CORPUS；Panel D 用 QUERY_WITH_PREFIXES。
 */

export const ANIMAL_WORDS: readonly string[] = ['cat', 'dog', 'tiger', 'elephant'] as const;

export const FRUIT_WORDS: readonly string[] = ['apple', 'banana', 'orange'] as const;

export const ABSTRACT_WORDS: readonly string[] = ['freedom', 'justice', 'happiness'] as const;

export const SAMPLE_CORPUS: readonly string[] = [
  ...ANIMAL_WORDS,
  ...FRUIT_WORDS,
  ...ABSTRACT_WORDS,
] as const;

export const QUERY_WITH_PREFIXES: readonly { name: string; text: string }[] = [
  { name: 'short prefix', text: 'The cat sat on the mat' },
  { name: 'medium prefix', text: 'Yesterday the cat sat on the mat in the living room' },
  {
    name: 'long prefix',
    text: 'According to the ancient fable, the cat sat on the mat because the mat was warm and comfortable',
  },
  { name: 'unrelated', text: 'Quantum mechanics predicts electron behavior in magnetic fields' },
];
