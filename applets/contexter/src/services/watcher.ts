import WebSocket from 'ws';
import { 
  FileChangedEvent, 
  WatcherOptions, 
  FileChangedHandler
} from '../types/watcher';


export class WatcherService {
  private ws: WebSocket | null = null;
  private options: Required<WatcherOptions>;
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private isConnecting = false;
  private isDestroyed = false;

  constructor(options: WatcherOptions = {}) {
    this.options = {
      host: options.host || 'localhost',
      port: options.port || 3000,
      protocol: options.protocol || 'ws',
      reconnectInterval: options.reconnectInterval || 1000,
      maxReconnectAttempts: options.maxReconnectAttempts || 10,
      onFileChanged: options.onFileChanged || (() => {}),
      onConnect: options.onConnect || (() => {}),
      onDisconnect: options.onDisconnect || (() => {}),
      onError: options.onError || ((error) => console.error('[WatcherService] Error:', error))
    };
  }

  async connect(): Promise<void> {
    if (this.isConnecting || this.isDestroyed) {
      return;
    }

    this.isConnecting = true;

    try {
      const wsUrl = `${this.options.protocol}://${this.options.host}:${this.options.port}/watcher/_sync`;
      console.log(`[WatcherService] Connecting to watcher at ${wsUrl}`);

      this.ws = new WebSocket(wsUrl);

      this.ws.on('open', () => {
        console.log('[WatcherService] Connected to watcher');
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        this.options.onConnect();
      });

      this.ws.on('message', (data: WebSocket.Data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleWatcherEvent(message);
        } catch (error) {
          console.error('[WatcherService] Failed to parse message:', error);
        }
      });

      this.ws.on('close', (code: number, reason: Buffer) => {
        console.log(`[WatcherService] Disconnected from watcher (${code}: ${reason.toString()})`);
        this.isConnecting = false;
        this.options.onDisconnect();
        
        if (!this.isDestroyed) {
          this.scheduleReconnect();
        }
      });

      this.ws.on('error', (error: Error) => {
        console.error('[WatcherService] WebSocket error:', error);
        this.isConnecting = false;
        this.options.onError(error);
        
        if (!this.isDestroyed) {
          this.scheduleReconnect();
        }
      });

    } catch (error) {
      this.isConnecting = false;
      this.options.onError(error as Error);
      this.scheduleReconnect();
    }
  }

  /**
   * Handle incoming watcher events - only process file_changed events
   */
  private handleWatcherEvent(message: any): void {
    if (!this.isValidFileChangedEvent(message)) {
      return;
    }

    const event = message as FileChangedEvent;
    console.log(`[WatcherService] File changed: ${event.filePath}`);
    this.options.onFileChanged(event);
  }

  /**
   * Validate that the message is a proper file_changed event
   */
  private isValidFileChangedEvent(message: any): message is FileChangedEvent {
    return (
      message &&
      typeof message === 'object' &&
      message.type === 'file_changed' &&
      typeof message.filePath === 'string' &&
      typeof message.timestamp === 'number'
    );
  }

  /**
   * Schedule reconnection attempt
   */
  private scheduleReconnect(): void {
    if (this.isDestroyed || this.reconnectAttempts >= this.options.maxReconnectAttempts) {
      console.log('[WatcherService] Max reconnection attempts reached or service destroyed');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.options.reconnectInterval * Math.pow(2, this.reconnectAttempts - 1); // Exponential backoff
    
    console.log(`[WatcherService] Scheduling reconnection attempt ${this.reconnectAttempts}/${this.options.maxReconnectAttempts} in ${delay}ms`);
    
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  /**
   * Update the file changed event handler
   */
  setFileChangedHandler(handler: FileChangedHandler): void {
    this.options.onFileChanged = handler;
  }

  /**
   * Check if the service is connected
   */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Disconnect from the watcher
   */
  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * Destroy the service and clean up resources
   */
  destroy(): void {
    this.isDestroyed = true;
    this.disconnect();
    console.log('[WatcherService] Service destroyed');
  }
}

export default WatcherService;