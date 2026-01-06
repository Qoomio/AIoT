import express from 'express';
import { api } from './app.js';

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Mount routes from API definition
for (const route of api.routes) {
  const method = route.method.toLowerCase() as 'get' | 'post' | 'patch' | 'put' | 'delete';
  const fullPath = api.prefix + route.path;

  // Combine global and route-specific middleware
  const middleware = [
    ...(api.middleware || []),
    ...(route.middleware || [])
  ];

  app[method](fullPath, ...middleware, route.handler);
}

app.listen(3001, () => {
  console.log('Contexter test server is running on port 3001');
  console.log('Routes:');
  for (const route of api.routes) {
    console.log(`  ${route.method} ${api.prefix}${route.path}`);
  }
});