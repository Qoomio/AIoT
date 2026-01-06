import WatcherService from "../services/watcher"
import { FileChangedEvent } from "../types/watcher";
import { updateDatabaseHelper, safeCreateDatabase } from "./database";
import os from 'os';
import path from "path"
const username = os.userInfo().username; // Using username as collection name

function isHiddenPath(filePath: string): boolean {
    const pathComponents = filePath.split(path.sep);
    return pathComponents.some(component => component.startsWith('.') && component !== '.' && component !== '..');
}

const watcherService: WatcherService = new WatcherService({
    host: 'localhost',
    port: 3000,
    protocol: 'ws',
    reconnectInterval: 1000,
    maxReconnectAttempts: 10,
    onFileChanged: async (event: FileChangedEvent)=>{
        if (isHiddenPath(event.filePath)) {
            return;
        }

        const updateResult = await updateDatabaseHelper(username, event.filePath);
        if (updateResult.isErr()) {
            console.error("[Contexter:watcherService] Failed to update database:", updateResult.error);
            console.error("[Contexter:watcherService] File path:", event.filePath);
        }
    },
    // onConnect
    // onDisconnect
    // onError
})

export async function initializeWatcher(): Promise<void> {
    try {
        console.log('[Contexter] Initializing watcher')
        await safeCreateDatabase(username)
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