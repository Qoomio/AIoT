export interface VectorRecord {
    id: string;
    vector: number[];
    payload?: RecordPayload;
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