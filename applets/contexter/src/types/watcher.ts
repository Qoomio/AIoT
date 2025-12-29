export interface FileChangedEvent {
    type: 'file_changed';
    filePath: string;
    timestamp: number;
}

export type FileChangedHandler = (event: FileChangedEvent) => void | Promise<void>;

export interface WatcherOptions {
    host?: string;
    port?: number;
    protocol?: 'ws' | 'wss';
    reconnectInterval?: number;
    maxReconnectAttempts?: number;
    onFileChanged?: FileChangedHandler;
    onConnect?: () => void;
    onDisconnect?: () => void;
    onError?: (error: Error) => void;
}
  