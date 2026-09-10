/**
 * libs/rag/index.ts — barrel
 *
 * 一次 import 拿全 RAG 工具链。
 */

export {
  chunkByHeading,
  chunkByParagraph,
  dropEmptyChunks,
  type Chunk,
  type SourceKind,
} from './chunk.js';

export {
  openVectorStore,
  memoryStore,
  type VectorStore,
  type VectorRecord,
  type SearchHit,
} from './store.js';

export {
  retrieve,
  retrieveRepeated,
  retrieveMerged,
  type RetrieveOptions,
  type RetrieveResult,
  type RetrieveMergedOptions,
  type RetrieveMergedResult,
  type ChunkStrategy,
} from './retrieve.js';

export { buildRagPrompt } from './prompt.js';

export {
  DEFAULT_EVAL_QUERIES,
  EVAL_QUERIES_V1,
  judgeHit,
  buildReport,
  formatReport,
  evaluateRerankRow,
  formatRerankReport,
  type EvalQuery,
  type EvalRow,
  type EvaluateReport,
  type RerankEvalRow,
} from './evaluate.js';

export {
  loadDocsCorpus,
  loadTestCorpus,
  loadAllCorpus,
  REPO_ROOT,
  type DocEntry,
} from './fixtures/docs-corpus.js';

export {
  incrementalIndex,
  incrementalIndexFromSources,
  diffDocs,
  hashText,
  openMetaStore,
  type DocMeta,
  type DocSource,
  type DiffResult,
  type IncrementalIndexReport,
  type IncrementalIndexOptions,
  type IncrementalIndexPhases,
} from './indexer.js';
