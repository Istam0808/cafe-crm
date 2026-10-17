import type { Server } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { userByToken } from './auth.ts';

export type RealtimeEvent =
  | { type: 'floor' }
  | { type: 'order'; orderId: number }
  | { type: 'print'; jobId: number; status: string; printer: string; error?: string };

const clients = new Set<WebSocket>();

export function attachRealtime(server: Server) {
  const wss = new WebSocketServer({ server, path: '/ws' });
  wss.on('connection', (socket, req) => {
    const token = new URL(req.url ?? '', 'http://x').searchParams.get('token') ?? undefined;
    if (!userByToken(token)) {
      socket.close(4401, 'unauthorized');
      return;
    }
    clients.add(socket);
    socket.on('close', () => clients.delete(socket));
    socket.on('error', () => clients.delete(socket));
  });

  // keep connections alive through Wi-Fi routers that drop idle sockets
  setInterval(() => {
    for (const socket of clients) socket.ping();
  }, 25_000).unref();
}

export function broadcast(event: RealtimeEvent) {
  const message = JSON.stringify(event);
  for (const socket of clients) {
    if (socket.readyState === socket.OPEN) socket.send(message);
  }
}
