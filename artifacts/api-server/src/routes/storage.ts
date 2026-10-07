import { randomUUID } from "node:crypto";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { Router, type IRouter } from "express";
import { RequestUploadUrlBody, RequestUploadUrlResponse } from "@workspace/api-zod";
import { audit } from "../lib/audit";
import { requireAuth } from "../lib/auth";
import { isSafeSignedObjectUrl, parsePrivateObjectPath } from "../lib/http-security.mjs";

const router: IRouter = Router();
const SIDECAR_ENDPOINT = "http://127.0.0.1:1106";
const MAX_OBJECT_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function objectParts(relativePath: string) {
  const full = `${process.env.PRIVATE_OBJECT_DIR ?? ""}/${relativePath}`.replace(/\/+/g, "/");
  const parts = full.split("/").filter(Boolean);
  const bucketName = parts.shift();
  if (!bucketName || parts.length === 0) throw new Error("PRIVATE_OBJECT_DIR is not configured");
  return { bucketName, objectName: parts.join("/") };
}

async function signObjectUrl(bucketName: string, objectName: string, method: "GET" | "PUT") {
  const response = await fetch(`${SIDECAR_ENDPOINT}/object-storage/signed-object-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(8_000),
    body: JSON.stringify({
      bucket_name: bucketName,
      object_name: objectName,
      method,
      expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    }),
  });
  if (!response.ok) throw new Error("Could not sign object URL");
  const body = await response.json() as { signed_url?: unknown };
  if (!isSafeSignedObjectUrl(body.signed_url)) throw new Error("Storage returned an invalid signed URL");
  return body.signed_url;
}

router.post("/storage/uploads/request-url", requireAuth, async (req, res) => {
  const parsed = RequestUploadUrlBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Only JPEG, PNG, or WebP images up to 5 MB are allowed" });
    return;
  }
  try {
    const relativePath = `uploads/${req.user!.id}/${randomUUID()}`;
    const { bucketName, objectName } = objectParts(relativePath);
    const uploadURL = await signObjectUrl(bucketName, objectName, "PUT");
    const objectPath = `/objects/${relativePath}`;
    await audit(req, "storage.upload_url.created", "object", objectPath, parsed.data);
    res.json(RequestUploadUrlResponse.parse({ uploadURL, objectPath, metadata: parsed.data }));
  } catch (error) {
    req.log.error({ err: error }, "Upload URL generation failed");
    res.status(503).json({ error: "Object storage is unavailable" });
  }
});

router.get("/storage/objects/*path", requireAuth, async (req, res) => {
  try {
    const raw = req.params.path;
    const relativePath = Array.isArray(raw) ? raw.join("/") : raw;
    const objectPath = parsePrivateObjectPath(relativePath);
    if (!objectPath) {
      res.status(404).json({ error: "Object not found" });
      return;
    }
    if (objectPath.ownerId !== req.user!.id.toLowerCase() && req.user!.accountType !== "admin") {
      res.status(403).json({ error: "Insufficient permissions" });
      return;
    }
    const { bucketName, objectName } = objectParts(relativePath);
    const signedUrl = await signObjectUrl(bucketName, objectName, "GET");
    const upstream = await fetch(signedUrl, {
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
    if (!upstream.ok || !upstream.body) {
      await upstream.body?.cancel();
      res.status(upstream.status === 404 ? 404 : 503).json({
        error: upstream.status === 404 ? "Object not found" : "Object storage is unavailable",
      });
      return;
    }

    const contentType = upstream.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
    if (!contentType || !ALLOWED_IMAGE_TYPES.has(contentType)) {
      await upstream.body.cancel();
      res.status(415).json({ error: "Unsupported object type" });
      return;
    }
    const contentLength = Number(upstream.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > MAX_OBJECT_BYTES) {
      await upstream.body.cancel();
      res.status(413).json({ error: "Object exceeds the 5 MB limit" });
      return;
    }

    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    let bytes = 0;
    const limitSize = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        bytes += chunk.byteLength;
        if (bytes > MAX_OBJECT_BYTES) callback(new Error("Stored image exceeds the 5 MB limit"));
        else callback(null, chunk);
      },
    });
    await pipeline(
      Readable.fromWeb(upstream.body as import("node:stream/web").ReadableStream<Uint8Array>),
      limitSize,
      res,
    );
  } catch (error) {
    req.log.error({ err: error }, "Object URL generation failed");
    if (res.headersSent) {
      res.destroy(error instanceof Error ? error : undefined);
      return;
    }
    res.status(503).json({ error: "Object storage is unavailable" });
  }
});

export default router;