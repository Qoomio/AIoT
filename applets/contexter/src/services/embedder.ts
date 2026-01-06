import { Result, err, ok } from 'neverthrow';
import { BM25Vector } from '../types/qdrant';
import murmurhash from 'murmurhash';

export default class EmbedderService {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, baseUrl: string = 'https://www.qoom.ai/v1') {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  async embed(texts: string[]): Promise<Result<number[][], Error>> {
    try {
      const response = await fetch(`${this.baseUrl}/embeddings`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          input: texts,
          model: 'mlx-community/all-MiniLM-L6-v2-4bit'
        })
      });

      if (!response.ok) {
        return err(new Error(`HTTP ${response.status}: ${response.statusText}`));
      }

      const data = await response.json();
      const embeddings = data.data.map((item: any) => item.embedding);
      return ok(embeddings);
    } catch (error) {
      return err(error as Error);
    }
  }

  async embedSingle(text: string): Promise<Result<number[], Error>> {
    const result = await this.embed([text]);
    if (result.isErr()) {
      return err(result.error);
    }
    const embedding = result.value[0];
    if (!embedding) {
      return err(new Error('No embedding returned'));
    }
    return ok(embedding);
  }

  async embedBM25(texts: string[]): Promise<Result<BM25Vector[], Error>> {
    try {
      const embeddings: BM25Vector[] = [];
      for (const text of texts) {
        const result = await this.embedBM25Single(text);
        if (result.isErr()) {
          return err(result.error);
        }
        embeddings.push(result.value);
      }
      return ok(embeddings);
    } catch (error) {
      return err(error as Error);
    }
  }

  async embedBM25Single(text: string): Promise<Result<BM25Vector, Error>> {
    const words = text.toLowerCase().match(/\b\w+\b/g);
    if (!words) {
      return ok({indices: [], values: []});
    }
    const hashValues = words.map(word => murmurhash.v3(word, 0));
    const dictionary = new Map<number, number>();
    for (const hashValue of hashValues) {
      dictionary.set(hashValue, (dictionary.get(hashValue) || 0) + 1);
    }
    
    return ok({indices: Array.from(dictionary.keys()), values: Array.from(dictionary.values())});
  }
}
