export interface EmbeddingJob {
  id: string;
  articleId: string;
  textChunks: string[];
  batchSize?: number;
  embedBatch: (batch: string[]) => Promise<Float32Array[]>;
  onComplete: (vectors: Float32Array[]) => Promise<void>;
  onError: (error: unknown) => Promise<void>;
}

export interface HighPriorityJob<T = unknown> {
  id: string;
  execute: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

export interface JobQueueOptions {
  defaultBatchSize?: number;
  yieldFn?: () => Promise<void>;
}

export interface QueueStatus {
  highPriorityCount: number;
  normalPriorityCount: number;
  isProcessing: boolean;
}

/**
 * Cooperative priority & FIFO Job Queue for embedding and vector search.
 *
 * Ensures:
 * 1. Single-session ONNX execution: avoids concurrent inference calls that cause session corruptions.
 * 2. Background embedding jobs yield every batch slice, permitting high-priority interactive search
 *    queries to execute with sub-second latency even during massive 50+ chunk document indexing.
 * 3. Robust error recovery: failures in individual batches or search tasks do not deadlock the queue.
 */
export class JobQueue {
  private readonly highPriorityQueue: Array<HighPriorityJob<unknown>> = [];
  private readonly normalPriorityQueue: EmbeddingJob[] = [];
  private isProcessing = false;
  private readonly defaultBatchSize: number;
  private readonly yieldFn: () => Promise<void>;

  constructor(options: JobQueueOptions = {}) {
    this.defaultBatchSize = Math.max(1, options.defaultBatchSize ?? 8);
    this.yieldFn =
      options.yieldFn ??
      (() =>
        new Promise<void>(resolve => {
          setTimeout(resolve, 0);
        }));
  }

  /**
   * Enqueues a high-priority interactive task (e.g., search query or find related articles).
   * Executes immediately if the worker is idle, or at the next batch boundary of an in-flight embedding job.
   */
  async enqueueHighPriority<T>(
    id: string,
    execute: () => Promise<T>,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.highPriorityQueue.push({
        id,
        execute: execute as () => Promise<unknown>,
        resolve: resolve as (value: unknown) => void,
        reject,
      });
      void this.process();
    });
  }

  /**
   * Enqueues a normal-priority document embedding job.
   * Multiple articles are executed in FIFO order without concurrent ONNX calls.
   */
  enqueueEmbeddingJob(job: EmbeddingJob): void {
    this.normalPriorityQueue.push(job);
    void this.process();
  }

  /**
   * Returns current queue diagnostics.
   */
  getQueueStatus(): QueueStatus {
    return {
      highPriorityCount: this.highPriorityQueue.length,
      normalPriorityCount: this.normalPriorityQueue.length,
      isProcessing: this.isProcessing,
    };
  }

  /**
   * Resolves when the queue becomes completely idle (no jobs in progress or queued).
   */
  async waitForIdle(): Promise<void> {
    while (
      this.isProcessing ||
      this.highPriorityQueue.length > 0 ||
      this.normalPriorityQueue.length > 0
    ) {
      await this.yieldFn();
    }
  }

  private async drainHighPriority(): Promise<void> {
    while (this.highPriorityQueue.length > 0) {
      const job = this.highPriorityQueue.shift();
      if (!job) break;
      try {
        const result = await job.execute();
        job.resolve(result);
      } catch (err) {
        job.reject(err);
      }
    }
  }

  private async process(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      while (
        this.highPriorityQueue.length > 0 ||
        this.normalPriorityQueue.length > 0
      ) {
        // 1. Drain high-priority jobs first
        await this.drainHighPriority();

        // 2. Pick next normal-priority job
        const job = this.normalPriorityQueue.shift();
        if (!job) continue;

        await this.executeEmbeddingJob(job);
      }
    } finally {
      this.isProcessing = false;
    }
  }

  private async executeEmbeddingJob(job: EmbeddingJob): Promise<void> {
    const { textChunks, embedBatch, onComplete, onError } = job;
    const batchSize = Math.max(1, job.batchSize ?? this.defaultBatchSize);
    const vectors: Float32Array[] = [];

    try {
      if (textChunks.length === 0) {
        await onComplete([]);
        return;
      }

      for (let i = 0; i < textChunks.length; i += batchSize) {
        const slice = textChunks.slice(i, i + batchSize);
        const sliceVectors = await embedBatch(slice);
        for (const v of sliceVectors) {
          vectors.push(v);
        }

        // Yield between batch slices to allow incoming events on the worker thread
        await this.yieldFn();

        // Drain any high-priority jobs that arrived while embedding or during yield
        if (this.highPriorityQueue.length > 0) {
          await this.drainHighPriority();
        }
      }

      await onComplete(vectors);
    } catch (err) {
      try {
        await onError(err);
      } catch (handlerErr) {
        console.error('[JobQueue] Error in onError handler:', handlerErr);
      }
    }
  }
}
