export interface VectorRecord {
    id: string;
    vector: QueryVectors;
    payload?: RecordPayload;
}

export interface QueryVectors {
    dense: number[]
    bm25: BM25Vector
}

export interface BM25Vector {
    indices: number[],
    values: number[]
}

export interface RecordPayload {
    codeString: string;
    metadata: CodeChunkMetadata;
}

export interface CodeChunkMetadata {
    filePath: string;
    fileName: string;
    fileExtension: string;
    fileSize: number;
    fileLastModified: string;
    startLine: number;
    endLine: number;
}
  
export interface QueryResult {
    id: string;
    score: number;
    payload?: RecordPayload;
}

export interface QueryFilters {
    filePath?: string | undefined;
    fileName?: string | undefined;
    fileExtension?: string | undefined;
}

export interface QueryOptions {
    limit?: number | undefined;
    scoreThreshold?: number | undefined;
    includePayload?: boolean | undefined;
    filter?: QueryFilters | undefined;
}