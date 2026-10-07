import assert from "node:assert/strict";
import test from "node:test";
import {
  isCrossOriginMutation,
  isSafeSignedObjectUrl,
  parsePrivateObjectPath,
  setApiSecurityHeaders,
} from "../src/lib/http-security.mjs";

test("only same-host unsafe requests pass the browser origin check", () => {
  assert.equal(isCrossOriginMutation({ method: "GET", origin: "https://attacker.example", host: "shop.example" }), false);
  assert.equal(isCrossOriginMutation({ method: "POST", origin: "https://shop.example", host: "shop.example" }), false);
  assert.equal(isCrossOriginMutation({ method: "POST", origin: "https://attacker.example", host: "shop.example" }), true);
  assert.equal(isCrossOriginMutation({ method: "POST", secFetchSite: "cross-site" }), true);
  assert.equal(isCrossOriginMutation({ method: "POST", origin: "null", host: "shop.example" }), true);
});

test("signed object URLs must use HTTPS and cannot contain embedded credentials", () => {
  assert.equal(isSafeSignedObjectUrl("https://storage.googleapis.com/object?signature=abc"), true);
  assert.equal(isSafeSignedObjectUrl("https://storage.example/object?signature=abc"), false);
  assert.equal(isSafeSignedObjectUrl("http://storage.example/object"), false);
  assert.equal(isSafeSignedObjectUrl("https://user:pass@storage.googleapis.com/object"), false);
  assert.equal(isSafeSignedObjectUrl("javascript:alert(1)"), false);
  assert.equal(isSafeSignedObjectUrl("https://bucket.storage.googleapis.com/object?signature=abc"), true);
  assert.equal(isSafeSignedObjectUrl("https://evil.example/object"), false);
});

test("private object paths must contain exactly an owner UUID and object UUID", () => {
  assert.deepEqual(
    parsePrivateObjectPath("uploads/123e4567-e89b-12d3-a456-426614174000/123e4567-e89b-12d3-a456-426614174001"),
    { ownerId: "123e4567-e89b-12d3-a456-426614174000", objectId: "123e4567-e89b-12d3-a456-426614174001" },
  );
  assert.equal(parsePrivateObjectPath("uploads/123e4567-e89b-12d3-a456-426614174000/../other"), null);
  assert.equal(parsePrivateObjectPath("uploads/owner/object/extra"), null);
});

test("API security headers are consistently applied", () => {
  const headers = new Map();
  setApiSecurityHeaders({ setHeader: (name, value) => headers.set(name, value) }, true);
  assert.equal(headers.get("X-Content-Type-Options"), "nosniff");
  assert.equal(headers.get("X-Frame-Options"), "DENY");
  assert.match(headers.get("Content-Security-Policy"), /frame-ancestors 'none'/);
  assert.equal(headers.get("Strict-Transport-Security"), "max-age=31536000");
});
