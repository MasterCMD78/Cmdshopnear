import type { Response } from "express";

export type UserEvent = {
  type: string;
  entityType?: string;
  entityId?: string;
  conversationId?: string;
  userId?: string;
  typing?: boolean;
};

const streams = new Map<string, Set<Response>>();

export function publishUserEvent(userId: string, event: UserEvent) {
  const clients = streams.get(userId);
  if (!clients) return;
  const frame = `event: update\ndata: ${JSON.stringify(event)}\n\n`;
  for (const response of clients) {
    if (!response.writableEnded && !response.destroyed) response.write(frame);
  }
}

export function attachUserEventStream(userId: string, response: Response) {
  const clients = streams.get(userId) ?? new Set<Response>();
  clients.add(response);
  streams.set(userId, clients);
  response.write("retry: 4000\nevent: connected\ndata: {}\n\n");

  const heartbeat = setInterval(() => {
    if (!response.writableEnded && !response.destroyed) response.write(": keep-alive\n\n");
  }, 25_000);
  response.on("close", () => {
    clearInterval(heartbeat);
    clients.delete(response);
    if (!clients.size) streams.delete(userId);
  });
}