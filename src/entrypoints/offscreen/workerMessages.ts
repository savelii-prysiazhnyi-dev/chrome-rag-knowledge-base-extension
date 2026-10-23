import type { SearchResultItem } from '../../types/messages';

/**
 * Message protocol between Offscreen Document (main.ts) and
 * its Dedicated Web Worker (worker.ts).
 */

export interface EmbedArticlePayload {
  articleId: string;
  textChunks: string[];
}

export interface SearchPayload {
  query: string;
  topK?: number;
  domainFilter?: string;
  starredOnly?: boolean;
}

export interface FindRelatedPayload {
  text: string;
  excludeArticleId?: string;
  topK?: number;
}

export type MainToWorkerMessage =
  | {
      type: 'INIT';
      payload: {
        wasmPaths?: string;
      };
    }
  | {
      type: 'EMBED_ARTICLE';
      id: string;
      payload: EmbedArticlePayload;
    }
  | {
      type: 'SEARCH';
      id: string;
      payload: SearchPayload;
    }
  | {
      type: 'FIND_RELATED';
      id: string;
      payload: FindRelatedPayload;
    };

export type WorkerToMainMessage =
  | {
      type: 'INIT_OK';
    }
  | {
      type: 'ARTICLE_INDEXED';
      id: string;
      payload: {
        articleId: string;
        url: string;
      };
    }
  | {
      type: 'ARTICLE_FAILED';
      id: string;
      payload: {
        articleId: string;
        error: string;
      };
    }
  | {
      type: 'SEARCH_RESULTS';
      id: string;
      payload: {
        results: SearchResultItem[];
      };
    }
  | {
      type: 'ERROR';
      id: string;
      payload: {
        error: string;
      };
    };
