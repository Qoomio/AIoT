import WatcherService from "../services/watcher"
import { FileChangedEvent } from "../types/watcher";
import { updateDatabaseHelper, safeCreateDatabase } from "./database";
import os from 'os';
import path from "path"
const username = os.userInfo().username; // Using username as collection name

const watcherService: WatcherService = new WatcherService({
    host: 'localhost',
    port: 3000,
    protocol: 'ws',
    reconnectInterval: 1000,
    maxReconnectAttempts: 10,
    onFileChanged: async (event: FileChangedEvent)=>{
        const rootDir = process.cwd();
        const parts = rootDir.split(path.sep);
        // TODO: Removing last two sections of directory as the contexter process is ran independently
        // remove this when integrating with api.js
        const transformed = parts.slice(0, -2).join('/')
        
        const updateResult = await updateDatabaseHelper(username, transformed + "/" + event.filePath);  
        console.log(updateResult) 
    },
    // onConnect
    // onDisconnect
    // onError
})

export async function initializeWatcher(): Promise<void> {
    await safeCreateDatabase(username)

    try {
        watcherService.connect();
        console.log('[Contexter] Watcher service initialized');
    } catch (error) {
        console.error('[Contexter] Failed to initialize watcher service:', error);
    }
}

export function shutdownWatcher(): void {
  if (watcherService) {
    watcherService.destroy();
    console.log('[Contexter] Watcher service shutdown');
  }
}