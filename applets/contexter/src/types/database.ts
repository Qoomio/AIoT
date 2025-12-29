import { QueryResult } from "./qdrant";

export interface QueryDatabaseRequest {
    collectionName: string;
    query: string;
    limit?: number;
    scoreThreshold?: number;
    includePayload?: boolean;
}

export interface QueryDatabaseResponse {
    results: QueryResult[];
}