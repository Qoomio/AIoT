import { QdrantClient } from '@qdrant/js-client-rest';
import { Result, err, ok } from 'neverthrow';
import { VectorRecord, QueryResult, QueryOptions, QueryFilters} from '../types/qdrant';

const buildFilterConditions = (filter: QueryFilters | undefined) => {
  if (!filter) return undefined;
  
  const conditions = Object.entries({
    filePath: 'metadata.filePath',
    fileName: 'metadata.fileName',
    fileExtension: 'metadata.fileExtension'
  })
    .filter(([filterKey]) => filter[filterKey as keyof QueryFilters])
    .map(([filterKey, metadataKey]) => ({
      key: metadataKey,
      match: { value: filter[filterKey as keyof QueryFilters] }
    }));
  
  return conditions.length > 0 ? { must: conditions } : undefined;
};

export default class QdrantService {
  private client: QdrantClient;

  constructor(url?: string) {
    this.client = new QdrantClient({ url: url || 'http://localhost:6333' });
  }

  async query(
    queryVector: number[],
    collectionName: string,
    options: QueryOptions = {}
  ): Promise<Result<QueryResult[], Error>> {
    try {
      const {
        limit = 10,
        scoreThreshold = 0.0,
        includePayload = true,
        filter
      } = options;

      const filterConditions = buildFilterConditions(filter);

      const searchParams: any = {
        vector: queryVector,
        limit: limit,
        score_threshold: scoreThreshold,
        with_payload: includePayload
      };

      if (filterConditions) {
        searchParams.filter = filterConditions;
      }

      const searchResult = await this.client.search(collectionName, searchParams);

      const results = searchResult.map((result: any) => ({
        id: result.id as string,
        score: result.score,
        payload: result.payload
      }));

      return ok(results);
    } catch (error) {
      return err(error as Error);
    }
  }

  async insert(record: VectorRecord, collectionName: string): Promise<Result<void, Error>> {
    return this.upsert(record, collectionName);
  }

  async insertBatch(records: VectorRecord[], collectionName: string): Promise<Result<void, Error>> {
    return this.upsertBatch(records, collectionName);
  }

  async upsert(record: VectorRecord, collectionName: string): Promise<Result<void, Error>> {
    try {
      await this.client.upsert(collectionName, {
        points: [{
          id: record.id,
          vector: record.vector,
          payload: { ...record.payload }
        }]
      });

      return ok(undefined);
    } catch (error) {
      return err(error as Error);
    }
  }

  async upsertBatch(records: VectorRecord[], collectionName: string): Promise<Result<void, Error>> {
    try {
      const points = records.map((record) => ({
        id: record.id,
        vector: record.vector,
        payload: { ...record.payload }
      }));

      await this.client.upsert(collectionName, {
        points: points
      });

      return ok(undefined);
    } catch (error) {
      return err(error as Error);
    }
  }

  async collectionExists(collectionName: string): Promise<boolean> {
   const exists = await this.client.collectionExists(collectionName);

   return exists.exists
  }

  async createCollection(collectionName: string): Promise<Result<void, Error>> {
    try {
      await this.client.createCollection(collectionName, {
        vectors: {
          size: 1536,
          distance: 'Cosine',
          on_disk: true
        }
      });

      return ok(undefined);
    } catch (error) {
      return err(error as Error);
    }
  }

  async createPayloadIndex(collectionName: string, fieldName: string): Promise<Result<void, Error>> {
    try {
      await this.client.createPayloadIndex(collectionName, {
        field_name: fieldName,
        field_schema: 'keyword'
      });

      return ok(undefined);
    } catch (error) {
      return err(error as Error);
    }
  }

  async getCollectionInfo(collectionName: string): Promise<Result<any, Error>> {
    try {
      const info = await this.client.getCollection(collectionName);
      return ok(info);
    } catch (error) {
      return err(error as Error);
    }
  }

  async getPointsByFilter(collectionName: string, filter: QueryFilters) : Promise<Result<string[], Error>> {
    const filterConditions = buildFilterConditions(filter);

    if(!filterConditions){
      return err(Error('Failed to build filter condition'))
    }

    let res = await this.client.scroll(collectionName, {
      filter: filterConditions,
      limit: 100
    });

    const allPoints: any[] = [...res.points];

    while (res.next_page_offset) {
      const params: any = {
        filter: filterConditions,
        limit: 100,
        offset: res.next_page_offset
      };
      res = await this.client.scroll(collectionName, params);
      allPoints.push(...res.points);
    }

    const results = allPoints.map((result: any) => (result.id as string));

    return ok(results);
  }

  async deleteVector(id: string, collectionName: string): Promise<Result<void, Error>> {
    try {
      await this.client.delete(collectionName, {
        points: [id]
      });

      return ok(undefined);
    } catch (error) {
      return err(error as Error);
    }
  }

  async deleteVectorBatch(ids: string[], collectionName: string): Promise<Result<void, Error>> {
    if(ids.length == 0) {
      return ok()
    }

    try {
      await this.client.delete(collectionName, {
        points: ids
      });

      return ok();
    } catch (error) {
      return err(error as Error);
    }
  }

  async clearCollection(collectionName: string): Promise<Result<void, Error>> {
    try {
      await this.client.deleteCollection(collectionName);
      await this.client.createCollection(collectionName, {
        vectors: {
          size: 1536,
          distance: 'Cosine'
        }
      });

      return ok(undefined);
    } catch (error) {
      return err(error as Error);
    }
  }
}
