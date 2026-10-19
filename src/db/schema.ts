import type { DBSchema } from 'idb';
import type {
  ArticleRecord,
  ArticleContentRecord,
  ChunkRecord,
} from '../types/messages';

export const DB_NAME = 'second_brain_db';
export const DB_VERSION = 1;

export interface SecondBrainDB extends DBSchema {
  articles: {
    key: string;
    value: ArticleRecord;
    indexes: {
      by_url: string;
      by_siteName: string;
      by_savedAt: number;
      by_isStarred: number;
    };
  };
  article_contents: {
    key: string;
    value: ArticleContentRecord;
  };
  chunks: {
    key: string;
    value: ChunkRecord;
    indexes: {
      by_articleId: string;
    };
  };
}
