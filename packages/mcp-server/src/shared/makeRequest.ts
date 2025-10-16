import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { type, type Type } from "arktype";
import { logger } from "./logger";
import { createOAuthManagerFromEnv } from "./oauth";

// Default to HTTPS port, fallback to HTTP if specified
const USE_HTTP = process.env.OBSIDIAN_USE_HTTP === "true";
const PORT = USE_HTTP ? 27123 : 27124;
const PROTOCOL = USE_HTTP ? "http" : "https";
const HOST = process.env.OBSIDIAN_HOST || "127.0.0.1";
export const BASE_URL = `${PROTOCOL}://${HOST}:${PORT}`;

// Disable TLS certificate validation for local self-signed certificates
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

// Initialize OAuth manager if credentials are provided
const oauthManager = createOAuthManagerFromEnv();

/**
 * Makes a request to the Obsidian Local REST API with the provided path and optional request options.
 * Automatically adds the required authentication (API key or OAuth token) to the request headers.
 * Throws an `McpError` if the API response is not successful.
 *
 * @param path - The path to the Obsidian API endpoint.
 * @param init - Optional request options to pass to the `fetch` function.
 * @returns The response from the Obsidian API.
 */

export async function makeRequest<
  T extends
  | Type<{}, {}>
  | Type<null | undefined, {}>
  | Type<{} | null | undefined, {}>,
>(schema: T, path: string, init?: RequestInit): Promise<T["infer"]> {
  // Get authentication token - prefer OAuth, fallback to API key
  let authToken: string;

  if (oauthManager) {
    try {
      authToken = await oauthManager.getToken();
      logger.debug("Using OAuth token for authentication");
    } catch (error) {
      logger.error("Failed to get OAuth token, falling back to API key", { error });
      const API_KEY = process.env.OBSIDIAN_API_KEY;
      if (!API_KEY) {
        throw new Error("OAuth token fetch failed and no OBSIDIAN_API_KEY fallback available");
      }
      authToken = API_KEY;
    }
  } else {
    const API_KEY = process.env.OBSIDIAN_API_KEY;
    if (!API_KEY) {
      logger.error("No authentication method available (neither OAuth nor API key)", {
        env: process.env,
      });
      throw new Error("Either OBSIDIAN_API_KEY or OAuth credentials must be provided");
    }
    authToken = API_KEY;
  }

  const url = `${BASE_URL}${path}`;
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${authToken}`,
      "Content-Type": "text/markdown",
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    const message = `${init?.method ?? "GET"} ${path} ${response.status}: ${error}`;
    throw new McpError(ErrorCode.InternalError, message);
  }

  const isJSON = !!response.headers.get("Content-Type")?.includes("json");
  const data = isJSON ? await response.json() : await response.text();
  // 204 No Content responses should be validated as undefined
  const validated = response.status === 204 ? undefined : schema(data);
  if (validated instanceof type.errors) {
    const stackError = new Error();
    Error.captureStackTrace(stackError, makeRequest);
    logger.error("Invalid response from Obsidian API", {
      status: response.status,
      error: validated.summary,
      stack: stackError.stack,
      data,
    });
    throw new McpError(
      ErrorCode.InternalError,
      `${init?.method ?? "GET"} ${path} ${response.status}: ${validated.summary}`,
    );
  }

  return validated;
}
