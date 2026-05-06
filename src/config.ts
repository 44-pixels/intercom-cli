export type Region = "us" | "eu" | "au";

export interface Config {
  port: number;
  publicUrl: string;
  resourceUrl: string;
  resourceName: string;
  authorizationServers: string[];
  scopesSupported: string[];
  region: Region;
  apiVersion: string;
}

const REGION_HOSTS: Record<Region, string> = {
  us: "https://api.intercom.io",
  eu: "https://api.eu.intercom.io",
  au: "https://api.au.intercom.io",
};

const DEFAULT_INTERCOM_AUTH_SERVER = "https://app.intercom.com/oauth";

const DEFAULT_SCOPES = [
  "read",
  "write",
  "read_admins",
  "read_conversations",
  "write_conversations",
  "read_users",
  "write_users",
  "read_companies",
  "write_companies",
  "read_articles",
  "write_articles",
  "read_tags",
  "write_tags",
];

export function apiBaseUrl(region: Region): string {
  return REGION_HOSTS[region];
}

function parseRegion(value: string | undefined): Region {
  const v = (value ?? "us").toLowerCase();
  if (v === "us" || v === "eu" || v === "au") return v;
  throw new Error(`Invalid INTERCOM_REGION: ${value} (expected us, eu, or au)`);
}

function parseList(value: string | undefined, fallback: string[]): string[] {
  if (!value) return fallback;
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const port = Number(env.PORT ?? "3000");
  if (!Number.isFinite(port) || port <= 0) {
    throw new Error(`Invalid PORT: ${env.PORT}`);
  }

  const publicUrl = (env.PUBLIC_URL ?? `http://localhost:${port}`).replace(/\/+$/, "");
  const resourceUrl = (env.MCP_RESOURCE_URL ?? `${publicUrl}/mcp`).replace(/\/+$/, "") || `${publicUrl}/mcp`;
  const resourceName = env.MCP_RESOURCE_NAME ?? "Intercom MCP Server";
  const authorizationServers = parseList(env.MCP_AUTHORIZATION_SERVERS, [DEFAULT_INTERCOM_AUTH_SERVER]);
  const scopesSupported = parseList(env.MCP_SCOPES_SUPPORTED, DEFAULT_SCOPES);
  const region = parseRegion(env.INTERCOM_REGION);
  const apiVersion = env.INTERCOM_API_VERSION ?? "2.13";

  return {
    port,
    publicUrl,
    resourceUrl,
    resourceName,
    authorizationServers,
    scopesSupported,
    region,
    apiVersion,
  };
}
