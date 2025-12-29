import { Request, Response } from 'express';
import QdrantService from '../services/qdrant';
import { z } from 'zod';
import EmbedderService from '../services/embedder';
import { CodeChunkMetadata, QueryOptions, VectorRecord } from '../types/qdrant';
import TreeSitterCodeChunker from '../services/chunker';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { Result, err, ok} from 'neverthrow'

const qdrantService = new QdrantService(process.env.QDRANT_URL);
const embedderService = new EmbedderService(process.env.OPENAI_API_KEY!);
const chunkerService = new TreeSitterCodeChunker();

const createDatabaseSchema = z.object({
  collectionName: z.string(),
});

export const safeCreateDatabase = async (collectionName : string) : Promise<Result<void, Error>> => {
  const exists = await qdrantService.collectionExists(collectionName);
  if(exists) {
    return err(Error('Collection exists'))
  }

  const createResult = await qdrantService.createCollection(collectionName);
  if (createResult.isErr()) {
    return err(Error('Failed to create database'));
  }

  return ok()
}

export const createDatabaseHandler = async (req: Request, res: Response)=>{
  const {success, data, error} = createDatabaseSchema.safeParse(req.body);
  if (!success) {
    return res.status(400).json({error: 'Invalid request body'});
  }
  const {collectionName} = data;

  const createResult = await qdrantService.createCollection(collectionName);
  if (createResult.isErr()) {
    console.error(createResult.error);
    return res.status(500).json({error: 'Failed to create database'});
  }

  const createPayloadIndexResult = await qdrantService.createPayloadIndex(collectionName, 'metadata.filePath');
  if (createPayloadIndexResult.isErr()) {
    console.error(createPayloadIndexResult.error);
    return res.status(500).json({error: 'Failed to create payload index'});
  }

  return res.json({message: 'Database created'});
};

const queryDatabaseSchema = z.object({
  collectionName: z.string(),
  query: z.string(),
  limit: z.number().optional(),
  scoreThreshold: z.number().optional(),
  includePayload: z.boolean().optional(),
  filter: z.object({
    filePath: z.string().optional(),
    fileName: z.string().optional(),
    fileExtension: z.string().optional(),
  }).optional(),
});

export const queryDatabaseHandler = async (req: Request, res: Response)=>{
    const { success, data, error } = queryDatabaseSchema.safeParse(req.body);
    if (!success) {
        return res.status(400).json({error: 'Invalid request body'});
    }
    const {collectionName, query, limit, scoreThreshold, includePayload, filter} = data;

    const embedResult = await embedderService.embedSingle(query);
    if (embedResult.isErr()) {
        return res.status(500).json({error: 'Failed to embed query'});
    }

    const queryOptions: QueryOptions = {
      limit: limit,
      scoreThreshold: scoreThreshold,
      includePayload: includePayload,
      filter: filter 
    };

    const results = await qdrantService.query(embedResult.value, collectionName, queryOptions);
    if (results.isErr()) {
        return res.status(500).json({error: 'Failed to query database'});
    }

    return res.json(results.value);
};

const updateDatabaseSchema = z.object({
  collectionName: z.string(),
  filePath: z.string()
});

export const updateDatabaseHelper = async (collectionName : string, filePath : string) : Promise<Result<void, Error>>=>{
  const collectionInfo = await qdrantService.getCollectionInfo(collectionName);
  if (collectionInfo.isErr()) {
    return err(Error(`Collection '${collectionName}' does not exist`));
  }

  //TODO: implement better error handling
  const fileContent = fs.readFileSync(filePath, 'utf8');
  if(fileContent.length === 0) {
    return ok()
  }
  let chunks = null;
  try {
    chunks = chunkerService.chunkCode(fileContent);
  } catch(e) {
    return err(Error(`Failed to chunk: ${e}`))
  }

  const embedResults = await embedderService.embed(chunks.map(chunk => chunk.content));
  if (embedResults.isErr()) {
    return err(Error('Failed to embed chunks'));
  }

  const stats = fs.statSync(filePath);
  const metadata: CodeChunkMetadata = {
    filePath: filePath,
    fileName: path.basename(filePath),
    fileExtension: path.extname(filePath),
    fileSize: stats.size,
    fileLastModified: stats.mtime.toISOString()
  };

  const vectorRecords: VectorRecord[] = embedResults.value.map((vector, index) => ({
    id: uuidv4(),
    vector: vector,
    payload: {
      codeString: chunks[index]?.content ?? '',
      metadata: metadata
    }
  }));

  const getPointsResult = await qdrantService.getPointsByFilter(collectionName, {filePath})
  if(getPointsResult.isErr()) {
    return err(Error('Failed to get points'))
  }
  
  const deletePointsResult = await qdrantService.deleteVectorBatch(getPointsResult.value, collectionName)
  if(deletePointsResult.isErr()) {
    return deletePointsResult
  }

  const insertResults = await qdrantService.insertBatch(vectorRecords, collectionName);
  if (insertResults.isErr()) {
    return insertResults
  }

  return ok()
}

export const updateDatabaseHandler = async (req: Request, res: Response)=>{
  const {success, data, error} = updateDatabaseSchema.safeParse(req.body);
  if (!success) {
    return res.status(400).json({error: 'Invalid request body'});
  }

  const {collectionName, filePath} = data;

  const updateResult = await updateDatabaseHelper(collectionName, filePath)
  if(updateResult.isErr()) {
    return res.status(500).json({error: updateResult.error})
  }

  return res.json({message: 'Database updated'});
};