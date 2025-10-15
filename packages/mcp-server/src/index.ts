#!/usr/bin/env bun
import { logger } from "$/shared";
import { ObsidianMcpServer } from "./features/core";
import { getVersion } from "./features/version" with { type: "macro" };
import express from "express";
import cors from "cors";

async function main() {
  try {
    // Verify required environment variables
    const API_KEY = process.env.OBSIDIAN_API_KEY;
    if (!API_KEY) {
      throw new Error("OBSIDIAN_API_KEY environment variable is required");
    }

    const PORT = parseInt(process.env.PORT || "3000", 10);

    logger.debug("Starting MCP Tools for Obsidian HTTP server...");

    const app = express();
    const mcpServer = new ObsidianMcpServer();

    // Enable CORS for all routes
    app.use(cors());

    // API key authentication middleware
    const authenticateApiKey: express.RequestHandler = (req, res, next) => {
      // Check for API key in multiple locations
      const providedKey =
        req.headers.authorization?.replace(/^Bearer\s+/i, '') ||
        req.headers['x-api-key'] ||
        req.query.api_key;

      if (!providedKey || providedKey !== API_KEY) {
        logger.warn("Unauthorized request - invalid or missing API key", {
          path: req.path,
          hasAuth: !!req.headers.authorization,
          hasApiKeyHeader: !!req.headers['x-api-key'],
          hasApiKeyQuery: !!req.query.api_key
        });
        res.status(401).json({ error: "Unauthorized - Invalid or missing API key" });
        return;
      }

      next();
    };

    // Health check endpoint (no authentication required)
    app.get("/health", (req, res) => {
      res.json({ status: "ok", version: getVersion() });
    });

    // SSE endpoint for establishing connections (protected)
    app.get("/sse", authenticateApiKey, async (req, res) => {
      try {
        await mcpServer.handleSSEConnection(req, res);
      } catch (error) {
        logger.error("SSE connection error", { error });
        if (!res.headersSent) {
          res.status(500).json({
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    });

    // POST endpoint for receiving messages (protected)
    app.post("/message", authenticateApiKey, async (req, res) => {
      console.log("Message received", req.body);
      try {
        await mcpServer.handlePostMessage(req, res);
      } catch (error) {
        logger.error("Message handling error", { error });
        if (!res.headersSent) {
          res.status(500).json({
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    });

    app.listen(PORT, () => {
      logger.info(`MCP Tools for Obsidian HTTP server running on port ${PORT}`);
      console.log(`Server running at http://localhost:${PORT}`);
      console.log(`SSE endpoint: http://localhost:${PORT}/sse`);
      console.log(`Health check: http://localhost:${PORT}/health`);
    });
  } catch (error) {
    logger.fatal("Failed to start server", {
      error: error instanceof Error ? error.message : String(error),
    });
    await logger.flush();
    throw error;
  }
}

if (process.argv.includes("--version")) {
  try {
    console.log(getVersion());
  } catch (error) {
    console.error(`Error getting version: ${error}`);
    process.exit(1);
  }
} else {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
