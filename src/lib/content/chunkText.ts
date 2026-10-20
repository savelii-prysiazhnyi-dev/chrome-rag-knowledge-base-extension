export interface TextChunk {
  chunkIndex: number;
  text: string;
}

export interface ChunkOptions {
  targetWords?: number;
  overlapWords?: number;
}

function splitSentences(text: string): string[] {
  return (
    text.match(/[^.!?\n]+(?:[.!?]+["')\]]*|$)|\n+/g)?.filter(s => s.trim()) ??
    []
  );
}

/**
 * Sentence-aware sliding-window chunker. Chunks are ~targetWords words and each
 * chunk starts with the last `overlapWords` words of the previous one.
 */
export function chunkText(
  text: string,
  options: ChunkOptions = {},
): TextChunk[] {
  const target = Math.max(1, options.targetWords ?? 160);
  const overlap = Math.min(Math.max(0, options.overlapWords ?? 30), target - 1);

  const sentences: string[][] = [];
  for (const s of splitSentences(text.trim())) {
    const words = s.split(/\s+/).filter(Boolean);
    // Hard-split very long sentences.
    for (let i = 0; i < words.length; i += target) {
      sentences.push(words.slice(i, i + target));
    }
  }

  const chunks: TextChunk[] = [];
  let current: string[] = [];
  let newWords = 0;

  const emit = () => {
    chunks.push({ chunkIndex: chunks.length, text: current.join(' ') });
    current = overlap > 0 ? current.slice(-overlap) : [];
    newWords = 0;
  };

  for (const words of sentences) {
    if (newWords > 0 && current.length + words.length > target) emit();
    current.push(...words);
    newWords += words.length;
  }
  if (newWords > 0) emit();
  return chunks;
}
