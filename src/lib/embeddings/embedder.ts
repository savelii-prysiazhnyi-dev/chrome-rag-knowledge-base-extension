/** Minimal tensor shape returned by a feature-extraction pipeline. */
export interface EmbeddingTensor {
  data: ArrayLike<number>;
  dims: number[];
}

/** Injectable feature-extraction pipeline (mean pooling + normalize). */
export type FeatureExtractor = (
  texts: string[],
  options: { pooling: 'mean'; normalize: boolean },
) => Promise<EmbeddingTensor>;

export const MODEL_ID = 'Xenova/all-MiniLM-L6-v2';
export const EMBEDDING_DIM = 384;
export const DEFAULT_BATCH_SIZE = 8;

export class Embedder {
  private extractor: Promise<FeatureExtractor> | null = null;

  constructor(
    private readonly load: () => Promise<FeatureExtractor>,
    private readonly batchSize: number = DEFAULT_BATCH_SIZE,
  ) {}

  private getExtractor(): Promise<FeatureExtractor> {
    if (!this.extractor) {
      this.extractor = this.load().catch(err => {
        this.extractor = null; // allow retry after a failed load
        throw err;
      });
    }
    return this.extractor;
  }

  /** Embeds texts in small batches; returns one normalized vector per text. */
  async embed(texts: string[]): Promise<Float32Array[]> {
    const out: Float32Array[] = [];
    if (texts.length === 0) return out;
    const extractor = await this.getExtractor();
    const size = Math.max(1, this.batchSize);
    for (let i = 0; i < texts.length; i += size) {
      const batch = texts.slice(i, i + size);
      const t = await extractor(batch, { pooling: 'mean', normalize: true });
      const dim = t.dims[t.dims.length - 1] as number;
      if (t.data.length !== batch.length * dim) {
        throw new Error('Embedding output shape mismatch');
      }
      for (let j = 0; j < batch.length; j++) {
        const v = new Float32Array(dim);
        for (let k = 0; k < dim; k++) v[k] = t.data[j * dim + k] as number;
        out.push(v);
      }
    }
    return out;
  }

  async embedOne(text: string): Promise<Float32Array> {
    const [v] = await this.embed([text]);
    return v as Float32Array;
  }
}
