import { Result, err, ok } from 'neverthrow';

export default class EmbedderService {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, baseUrl: string = 'https://api.openai.com/v1') {
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
          model: 'text-embedding-ada-002'
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
}
