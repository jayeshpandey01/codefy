import type { ControllerHmacHeaders } from "@whoami/types";

export interface GenerateHmacOptions {
  method: string;
  path: string;
  body?: unknown;
  secret: string;
  timestamp?: number;
  nonce?: string;
}

interface NodeCryptoLike {
  createHash: (alg: string) => HashLike;
  createHmac: (alg: string, key: string) => HashLike;
  randomBytes: (n: number) => { toString: (enc: string) => string };
}

interface HashLike {
  update(data: string | Uint8Array): HashLike;
  digest(encoding?: string): string;
}

// Dynamically obtain Node crypto without causing static bundler resolution failures in browser/worker targets
function getNodeCrypto(): NodeCryptoLike | undefined {
  try {
    const nodeReq =
      typeof globalThis !== "undefined" && (globalThis as Record<string, unknown>)["require"]
        ? (globalThis as Record<string, unknown>)["require"] as NodeRequire
        : typeof require !== "undefined"
          ? require
          : undefined;
    if (typeof nodeReq === "function") {
      return (nodeReq("node:crypto") || nodeReq("crypto")) as NodeCryptoLike;
    }
  } catch {
    // Non-node runtime
  }
  return undefined;
}

/**
 * Controller signing needs Node's synchronous crypto. Outside Node (a
 * webview or Worker) there is no synchronous SHA-256/HMAC, so fail loudly
 * rather than send an empty signature the controller would reject with a
 * confusing 401.
 */
function missingNodeCryptoError(fn: string): Error {
  return new Error(
    `[hmac] ${fn} requires Node's crypto module, which isn't available in this runtime. ` +
      "Controller-signed endpoints can only be called from a Node host (e.g. the VS Code extension host).",
  );
}

/**
 * Generates a random alphanumeric nonce between 16 and 80 characters (32 chars default).
 */
export function generateControllerNonce(length = 32): string {
  const boundedLen = Math.max(16, Math.min(80, length));
  const nodeCrypto = getNodeCrypto();
  if (nodeCrypto?.randomBytes) {
    return nodeCrypto.randomBytes(boundedLen).toString("hex").slice(0, boundedLen);
  }
  const bytes = new Uint8Array(Math.ceil(boundedLen / 2));
  if (typeof globalThis !== "undefined" && globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, boundedLen);
}

/**
 * Computes the SHA-256 hex digest of a request payload.
 * If body is undefined or empty, returns sha256 of empty string (b"").
 */
export function sha256Hex(content: string | Uint8Array | undefined | null): string {
  const nodeCrypto = getNodeCrypto();
  if (nodeCrypto?.createHash) {
    const hash = nodeCrypto.createHash("sha256");
    if (content) hash.update(content);
    return hash.digest("hex");
  }
  if (!content) {
    return "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
  }
  throw missingNodeCryptoError("sha256Hex");
}

/**
 * Signs a controller request using HMAC-SHA256 according to the Axiom Controller Protocol:
 * message = f"{method}\n{path}\n{timestamp}\n{nonce}\n{sha256(body).hexdigest()}"
 * signature = hmac.new(secret.encode(), message.encode(), hashlib.sha256).hexdigest()
 */
export function signControllerMessage(
  method: string,
  path: string,
  timestamp: number,
  nonce: string,
  bodyContent: string,
  secret: string,
): string {
  const normalizedMethod = method.toUpperCase();
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const bodyHash = sha256Hex(bodyContent);
  const message = `${normalizedMethod}\n${normalizedPath}\n${timestamp}\n${nonce}\n${bodyHash}`;

  const nodeCrypto = getNodeCrypto();
  if (nodeCrypto?.createHmac) {
    return nodeCrypto.createHmac("sha256", secret).update(message).digest("hex");
  }
  throw missingNodeCryptoError("signControllerMessage");
}

/**
 * Produces the full set of signed headers for an internal controller request.
 */
export function generateControllerHmacHeaders(
  options: GenerateHmacOptions,
): ControllerHmacHeaders {
  const timestamp = options.timestamp ?? Math.floor(Date.now() / 1000);
  const nonce = options.nonce ?? generateControllerNonce(32);
  const bodyContent =
    options.body !== undefined && options.body !== null
      ? typeof options.body === "string"
        ? options.body
        : JSON.stringify(options.body)
      : "";

  const signature = signControllerMessage(
    options.method,
    options.path,
    timestamp,
    nonce,
    bodyContent,
    options.secret,
  );

  return {
    "X-Controller-Timestamp": String(timestamp),
    "X-Controller-Nonce": nonce,
    "X-Controller-Signature": signature,
    "Content-Type": "application/json",
  };
}
