import { apiBaseUrl, type Config } from "./config.js";

export class IntercomApiError extends Error {
  constructor(
    public status: number,
    public statusText: string,
    public body: unknown,
  ) {
    const detail =
      typeof body === "object" && body && "errors" in body
        ? JSON.stringify((body as { errors: unknown }).errors)
        : typeof body === "string"
          ? body
          : JSON.stringify(body);
    super(`Intercom API ${status} ${statusText}: ${detail}`);
    this.name = "IntercomApiError";
  }
}

export interface IntercomRequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  query?: Record<string, string | number | boolean | undefined | null>;
  body?: unknown;
}

export class IntercomClient {
  private readonly baseUrl: string;
  private readonly apiVersion: string;
  private readonly accessToken: string;

  constructor(config: Pick<Config, "region" | "apiVersion">, accessToken: string) {
    this.baseUrl = apiBaseUrl(config.region);
    this.apiVersion = config.apiVersion;
    this.accessToken = accessToken;
  }

  async request<T = unknown>({ method = "GET", path, query, body }: IntercomRequestOptions): Promise<T> {
    const url = new URL(path.startsWith("/") ? path : `/${path}`, this.baseUrl);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== null && value !== "") {
          url.searchParams.set(key, String(value));
        }
      }
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.accessToken}`,
      Accept: "application/json",
      "Intercom-Version": this.apiVersion,
    };
    let payload: string | undefined;
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      payload = JSON.stringify(body);
    }

    const res = await fetch(url, { method, headers, body: payload });

    const text = await res.text();
    let parsed: unknown = text;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        // leave as text
      }
    }

    if (!res.ok) {
      throw new IntercomApiError(res.status, res.statusText, parsed);
    }
    return parsed as T;
  }
}
