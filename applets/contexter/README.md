# Contexter Applet

## Start Qdrant DB
```
docker run -p 6333:6333 qdrant/qdrant
```
### For starting db to specific paths
```
docker run -p 6333:6333 -v /path/to/your/data:/qdrant/storage qdrant/qdrant
```

## Start Service
```
npm run test
```

## Endpoint curls
#### create/initialize
```
curl -X POST http://localhost:3000/database/create \
  -H "Content-Type: application/json" \
  -d '{
    "collectionName": "my_code_collection"
  }'
```
#### query
```
curl -X POST http://localhost:3000/database/query \
  -H "Content-Type: application/json" \
  -d '{
    "collectionName": "my_code_collection",
    "query": "function to handle user authentication"
  }'
```

#### Update
```
curl -X PATCH http://localhost:3000/database/update \
  -H "Content-Type: application/json" \
  -d '{
    "collectionName": "my_code_collection",
    "filePath": "/absolute/path/to/your/code/file.ts"
  }'
```