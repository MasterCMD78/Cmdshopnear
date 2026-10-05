import { db } from "@workspace/db";
import { analyticsEvents } from "@workspace/db/schema";
import type { Request, Response, NextFunction } from "express";

type EventShape = { eventType: string; entityType?: string };

function classifyRequest(method: string, path: string): EventShape | null {
  if (method === "GET" && ["/api/marketplace/search", "/api/marketplace/nearby", "/api/marketplace/catalog"].includes(path)) {
    return { eventType: "search" };
  }
  if (method === "POST" && path === "/api/ai/search") return { eventType: "ai_search" };
  if (method === "POST" && path === "/api/favorites") return { eventType: "favorite" };
  if (method === "POST" && path === "/api/chat/conversations") return { eventType: "chat" };
  if (method === "POST" && /^\/api\/chat\/conversations\/[^/]+\/messages$/.test(path)) return { eventType: "chat" };
  if (method === "POST" && path === "/api/reviews") return { eventType: "review" };
  if (method === "GET" && path === "/api/notifications") return { eventType: "notification" };
  return null;
}

export function analyticsTracking(req: Request, res: Response, next: NextFunction) {
  const event = classifyRequest(req.method, req.path);
  if (event) {
    res.once("finish", () => {
      if (res.statusCode < 200 || res.statusCode >= 300) return;
      void db.insert(analyticsEvents).values({
        userId: req.user?.id ?? null,
        eventType: event.eventType,
        entityType: event.entityType ?? null,
      }).catch((error: unknown) => {
        req.log.warn({ err: error, eventType: event.eventType }, "Could not record platform analytics event");
      });
    });
  }
  next();
}
