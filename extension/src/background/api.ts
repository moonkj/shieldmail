// Typed API client for the ShieldMail email-router worker.
// All methods: 10s AbortController timeout, safe JSON parsing, typed errors.
// PRIVACY: never log response bodies (they may contain OTPs).

import type { AliasMode, AliasRecord, ExtractedMessage } from "../lib/types.js";

const DEFAULT_TIMEOUT_MS = 10_000;

/* ---------------------------- Error classes ---------------------------- */

export class ApiError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = "ApiError";
  }
}
export class RateLimitError extends ApiError {
  constructor(public readonly retryAfterMs?: number) {
    super("rate_limited", 429);
    this.name = "RateLimitError";
  }
}
export class TokenRevokedError extends ApiError {
  constructor() {
    super("token_revoked", 401);
    this.name = "TokenRevokedError";
  }
}
export class AliasExpiredError extends ApiError {
  constructor() {
    super("alias_expired", 410);
    this.name = "AliasExpiredError";
  }
}
export class NetworkError extends ApiError {
  constructor(message = "network_unavailable") {
    super(message);
    this.name = "NetworkError";
  }
}

/* ------------------------------- Helpers ------------------------------- */

async function safeJson<T>(res: Response): Promise<T> {
  try {
    return (await res.json()) as T;
  } catch {
    throw new ApiError("invalid_json", res.status);
  }
}

interface FetchOpts {
  method?: "GET" | "POST" | "DELETE";
  token?: string;
  body?: unknown;
  timeoutMs?: number;
}

/* -------------------------------- Client ------------------------------- */

export class ApiClient {
  constructor(private baseUrl: string) {}

  setBaseUrl(url: string): void {
    this.baseUrl = url.replace(/\/+$/, "");
  }

  private async request<T>(path: string, opts: FetchOpts = {}): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    );
    const headers: Record<string, string> = { accept: "application/json" };
    if (opts.token) headers["authorization"] = `Bearer ${opts.token}`;
    if (opts.body !== undefined) headers["content-type"] = "application/json";

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        method: opts.method ?? "GET",
        headers,
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timeout);
      if ((err as { name?: string }).name === "AbortError") {
        throw new NetworkError("timeout");
      }
      throw new NetworkError();
    }
    clearTimeout(timeout);

    if (res.status === 429) {
      const retryHeader = res.headers.get("retry-after");
      const retryAfterMs = retryHeader
        ? Number.parseInt(retryHeader, 10) * 1000
        : undefined;
      throw new RateLimitError(retryAfterMs);
    }
    if (res.status === 401) throw new TokenRevokedError();
    if (res.status === 410) throw new AliasExpiredError();
    if (!res.ok) {
      throw new ApiError(`http_${res.status}`, res.status);
    }
    // 204 no content
    if (res.status === 204) return undefined as unknown as T;
    return await safeJson<T>(res);
  }

  async generateAlias(mode: AliasMode, label?: string): Promise<AliasRecord> {
    interface GenResp {
      aliasId: string;
      address: string;
      expiresAt: number | null;
      pollToken: string;
    }
    const body: { mode: AliasMode; label?: string } = { mode };
    if (label) body.label = label;
    const resp = await this.request<GenResp>("/alias/generate", {
      method: "POST",
      body,
    });
    const now = Date.now();
    return {
      aliasId: resp.aliasId,
      address: resp.address,
      // Server returns seconds; normalize to ms for extension.
      expiresAt:
        resp.expiresAt !== null && resp.expiresAt !== undefined
          ? resp.expiresAt * 1000
          : null,
      pollToken: resp.pollToken,
      mode,
      label,
      createdAt: now,
    };
  }

  async getMessages(
    aliasId: string,
    pollToken: string,
    since?: number,
  ): Promise<{ messages: ExtractedMessage[]; expired: boolean }> {
    interface MsgResp {
      messages: ExtractedMessage[];
      expired: boolean;
    }
    const qs = since ? `?since=${encodeURIComponent(since)}` : "";
    try {
      const resp = await this.request<MsgResp>(
        `/alias/${encodeURIComponent(aliasId)}/messages${qs}`,
        { token: pollToken },
      );
      return {
        messages: Array.isArray(resp.messages) ? resp.messages : [],
        expired: Boolean(resp.expired),
      };
    } catch (err) {
      if (err instanceof AliasExpiredError) {
        return { messages: [], expired: true };
      }
      throw err;
    }
  }

  async ackMessage(
    aliasId: string,
    pollToken: string,
    _messageId: string,
  ): Promise<void> {
    // Server-side ack flushes DO storage; messageId is reserved for future granular ack.
    await this.request<unknown>(
      `/alias/${encodeURIComponent(aliasId)}/ack`,
      { method: "POST", token: pollToken },
    );
  }

  async deleteAlias(aliasId: string, pollToken: string): Promise<void> {
    await this.request<unknown>(`/alias/${encodeURIComponent(aliasId)}`, {
      method: "DELETE",
      token: pollToken,
    });
  }
}
