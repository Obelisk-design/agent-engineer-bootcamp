/**
 * libs/embedding/index.ts — barrel
 *
 * 一次 import 拿全 embedding 工具链。fixtures 也走这条路径。
 */

export { embed, type EmbedRequest, type EmbedResult, type EmbedDimensions } from './embed.js';

export { cosineSimilarity, cosineDistance, euclideanDistance } from './distance.js';

export { pca2d, type Point2D } from './pca.js';

export { distanceMatrixHTML, scatterSVG } from './visualize.js';

export {
  ANIMAL_WORDS,
  FRUIT_WORDS,
  ABSTRACT_WORDS,
  SAMPLE_CORPUS,
  QUERY_WITH_PREFIXES,
} from './fixtures/sample-corpus.js';
