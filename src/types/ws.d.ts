declare module 'ws' {
  import { EventEmitter } from 'events';
  import type { IncomingMessage } from 'http';
  import type { Server as HttpServer } from 'http';

  export class WebSocket extends EventEmitter {
    static readonly OPEN: number;
    static readonly CLOSED: number;
    readonly readyState: number;
    send(data: string | Buffer): void;
    close(): void;
    on(event: 'message', listener: (data: Buffer) => void): this;
    on(event: 'close', listener: () => void): this;
    on(event: 'error', listener: (err: Error) => void): this;
    on(event: string, listener: (...args: unknown[]) => void): this;
  }

  export class WebSocketServer extends EventEmitter {
    constructor(options: { server?: HttpServer; path?: string; port?: number });
    on(event: 'connection', listener: (ws: WebSocket, req: IncomingMessage) => void): this;
    on(event: string, listener: (...args: unknown[]) => void): this;
  }
}
