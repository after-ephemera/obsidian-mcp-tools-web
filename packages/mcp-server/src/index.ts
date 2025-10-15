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

    // Health check endpoint
    app.get("/health", (req, res) => {
      res.json({ status: "ok", version: getVersion() });
    });

    // SSE endpoint for establishing connections
    app.get("/sse", async (req, res) => {
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

    // POST endpoint for receiving messages
    app.post("/message", async (req, res) => {
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
