import type { NextFunction, Request, Response } from "express";

declare module "express-serve-static-core" {
  interface Request {
    intercomToken?: string;
  }
}

export interface BearerAuthOptions {
  /** Resource metadata URL advertised in the WWW-Authenticate header. */
  resourceMetadataUrl: string;
}

function quote(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export function buildChallenge(
  error: string,
  description: string,
  resourceMetadataUrl: string,
): string {
  return [
    `error=${quote(error)}`,
    `error_description=${quote(description)}`,
    `resource_metadata=${quote(resourceMetadataUrl)}`,
  ]
    .join(", ")
    .replace(/^/, "Bearer ");
}

export function requireBearerToken({ resourceMetadataUrl }: BearerAuthOptions) {
  return (req: Request, res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    if (!header) {
      res.set(
        "WWW-Authenticate",
        buildChallenge(
          "invalid_request",
          "No access token was provided in this request",
          resourceMetadataUrl,
        ),
      );
      res.status(401).type("text/plain").send("Missing required Authorization header");
      return;
    }
    const [scheme, token] = header.split(/\s+/, 2);
    if (!scheme || scheme.toLowerCase() !== "bearer" || !token) {
      res.set(
        "WWW-Authenticate",
        buildChallenge(
          "invalid_token",
          "Authorization header must use the Bearer scheme",
          resourceMetadataUrl,
        ),
      );
      res.status(401).type("text/plain").send("Invalid Authorization header");
      return;
    }
    req.intercomToken = token;
    next();
  };
}
