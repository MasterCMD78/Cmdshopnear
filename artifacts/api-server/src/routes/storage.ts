import { randomUUID } from "node:crypto";
import { Router, type IRouter } from "express";
import { RequestUploadUrlBody, RequestUploadUrlResponse } from "@workspace/api-zod";
import { audit } from "../lib/audit";
import { requireAuth } from "../lib/auth";

const router: IRouter = Router();
const SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

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
    body: JSON.stringify({
      bucket_name: bucketName,
      object_name: objectName,
      method,
      expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    }),
  });
  if (!response.ok) throw new Error("Could not sign object URL");
  return (await response.json() as { signed_url: string }).signed_url;
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
    res.status(500).json({ error: "Unable to prepare upload" });
  }
});

router.get("/storage/objects/*path", requireAuth, async (req, res) => {
  try {
    const raw = req.params.path;
    const relativePath = Array.isArray(raw) ? raw.join("/") : raw;
    if (!relativePath.startsWith(`uploads/${req.user!.id}/`) && req.user!.accountType !== "admin") {
      res.status(403).json({ error: "Insufficient permissions" });
      return;
    }
    const { bucketName, objectName } = objectParts(relativePath);
    res.redirect(await signObjectUrl(bucketName, objectName, "GET"));
  } catch (error) {
    req.log.error({ err: error }, "Object URL generation failed");
    res.status(404).json({ error: "Object not found" });
  }
});

export default router;