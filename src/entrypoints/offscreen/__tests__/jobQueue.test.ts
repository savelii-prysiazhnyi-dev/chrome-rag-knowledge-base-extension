import { describe, it, expect, vi } from 'vitest';
import { JobQueue } from '../jobQueue';

describe('JobQueue — Non-Blocking Cooperative Job Queue', () => {
  it('executes high-priority jobs immediately when idle', async () => {
    const queue = new JobQueue();
    const result = await queue.enqueueHighPriority('search-1', async () => {
      return { answer: 42 };
    });
    expect(result).toEqual({ answer: 42 });
    expect(queue.getQueueStatus().isProcessing).toBe(false);
  });

  it('executes embedding jobs in batches and yields between slices', async () => {
    const yieldCalls: number[] = [];
    const queue = new JobQueue({
      defaultBatchSize: 2,
      yieldFn: async () => {
        yieldCalls.push(Date.now());
      },
    });

    const chunks = ['c1', 'c2', 'c3', 'c4', 'c5'];
    const batchesSeen: string[][] = [];
    const completedVectors: Float32Array[][] = [];

    await new Promise<void>(resolve => {
      queue.enqueueEmbeddingJob({
        id: 'job-1',
        articleId: 'art-1',
        textChunks: chunks,
        embedBatch: async batch => {
          batchesSeen.push(batch);
          return batch.map(() => new Float32Array([1, 2, 3]));
        },
        onComplete: async vectors => {
          completedVectors.push(vectors);
          resolve();
        },
        onError: async () => {},
      });
    });

    // 5 chunks with batchSize 2 => 3 batches: [c1, c2], [c3, c4], [c5]
    expect(batchesSeen).toEqual([['c1', 'c2'], ['c3', 'c4'], ['c5']]);
    expect(yieldCalls.length).toBe(3);
    expect(completedVectors[0]?.length).toBe(5);
  });

  it('executes multiple embedding jobs in FIFO order', async () => {
    const queue = new JobQueue({ defaultBatchSize: 10 });
    const order: string[] = [];

    const job1Promise = new Promise<void>(resolve => {
      queue.enqueueEmbeddingJob({
        id: 'job-1',
        articleId: 'art-1',
        textChunks: ['a1', 'a2'],
        embedBatch: async batch => {
          order.push('embed-art-1');
          return batch.map(() => new Float32Array([0]));
        },
        onComplete: async () => {
          order.push('complete-art-1');
          resolve();
        },
        onError: async () => {},
      });
    });

    const job2Promise = new Promise<void>(resolve => {
      queue.enqueueEmbeddingJob({
        id: 'job-2',
        articleId: 'art-2',
        textChunks: ['b1', 'b2'],
        embedBatch: async batch => {
          order.push('embed-art-2');
          return batch.map(() => new Float32Array([0]));
        },
        onComplete: async () => {
          order.push('complete-art-2');
          resolve();
        },
        onError: async () => {},
      });
    });

    await Promise.all([job1Promise, job2Promise]);

    expect(order).toEqual([
      'embed-art-1',
      'complete-art-1',
      'embed-art-2',
      'complete-art-2',
    ]);
  });

  it('prioritizes search queries between batch slices of an in-flight embedding job', async () => {
    const executionOrder: string[] = [];
    let queueRef: JobQueue;

    const queue = new JobQueue({
      defaultBatchSize: 2,
      yieldFn: async () => {
        // Yield hook: simulate search arrival right after the first batch slice finishes
        if (
          executionOrder.includes('batch-1') &&
          !executionOrder.includes('search-query')
        ) {
          void queueRef.enqueueHighPriority('search-req', async () => {
            executionOrder.push('search-query');
            return 'search-done';
          });
        }
      },
    });
    queueRef = queue;

    const chunks = ['c1', 'c2', 'c3', 'c4'];
    let batchIndex = 0;

    await new Promise<void>(resolve => {
      queue.enqueueEmbeddingJob({
        id: 'job-slice',
        articleId: 'art-slice',
        textChunks: chunks,
        embedBatch: async batch => {
          batchIndex++;
          executionOrder.push(`batch-${batchIndex}`);
          return batch.map(() => new Float32Array([1]));
        },
        onComplete: async () => {
          executionOrder.push('job-complete');
          resolve();
        },
        onError: async () => {},
      });
    });

    // Verification: search-query jumped in between batch-1 and batch-2!
    expect(executionOrder).toEqual([
      'batch-1',
      'search-query',
      'batch-2',
      'job-complete',
    ]);
  });

  it('handles empty textChunks gracefully', async () => {
    const queue = new JobQueue();
    let completed = false;

    await new Promise<void>(resolve => {
      queue.enqueueEmbeddingJob({
        id: 'job-empty',
        articleId: 'art-empty',
        textChunks: [],
        embedBatch: async () => [],
        onComplete: async vectors => {
          expect(vectors).toEqual([]);
          completed = true;
          resolve();
        },
        onError: async () => {},
      });
    });

    expect(completed).toBe(true);
  });

  it('handles error in an embedding job without stalling the queue for subsequent jobs', async () => {
    const queue = new JobQueue();
    const errorFn = vi.fn();
    const successFn = vi.fn();

    const job1Promise = new Promise<void>(resolve => {
      queue.enqueueEmbeddingJob({
        id: 'job-fail',
        articleId: 'art-fail',
        textChunks: ['f1', 'f2'],
        embedBatch: async () => {
          throw new Error('ONNX inference failed');
        },
        onComplete: async () => {},
        onError: async err => {
          errorFn(err);
          resolve();
        },
      });
    });

    const job2Promise = new Promise<void>(resolve => {
      queue.enqueueEmbeddingJob({
        id: 'job-after',
        articleId: 'art-after',
        textChunks: ['s1'],
        embedBatch: async batch => batch.map(() => new Float32Array([1])),
        onComplete: async () => {
          successFn();
          resolve();
        },
        onError: async () => {},
      });
    });

    await Promise.all([job1Promise, job2Promise]);
    await queue.waitForIdle();

    expect(errorFn).toHaveBeenCalledTimes(1);
    const calledError = errorFn.mock.calls[0]?.[0] as Error | undefined;
    expect(calledError?.message).toBe('ONNX inference failed');
    expect(successFn).toHaveBeenCalledTimes(1);
    expect(queue.getQueueStatus().isProcessing).toBe(false);
  });

  it('handles error in high-priority job without stalling normal jobs', async () => {
    const queue = new JobQueue();
    let normalJobCompleted = false;

    const highPriorityPromise = queue.enqueueHighPriority(
      'bad-search',
      async () => {
        throw new Error('Search failed');
      },
    );

    const normalJobPromise = new Promise<void>(resolve => {
      queue.enqueueEmbeddingJob({
        id: 'normal-job',
        articleId: 'art-normal',
        textChunks: ['ok'],
        embedBatch: async batch => batch.map(() => new Float32Array([1])),
        onComplete: async () => {
          normalJobCompleted = true;
          resolve();
        },
        onError: async () => {},
      });
    });

    await expect(highPriorityPromise).rejects.toThrow('Search failed');
    await normalJobPromise;

    expect(normalJobCompleted).toBe(true);
  });
});
