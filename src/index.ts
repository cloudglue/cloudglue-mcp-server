#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Cloudglue } from "@cloudglue/cloudglue-js";
import * as dotenv from "dotenv";
import { parseArgs } from "node:util";

// Import tool registrations
import { registerListCollections } from "./tools/list-collections.js";
import { registerListVideos } from "./tools/list-videos.js";
import { registerDescribeVideo } from "./tools/describe-video.js";
import { registerExtractVideoEntities } from "./tools/extract-video-entities.js";
import { registerSearchVideoMoments } from "./tools/search-video-moments.js";
import { registerSearchVideoSummaries } from "./tools/search-video-summaries.js";
import { registerGetVideoMetadata } from "./tools/get-video-metadata.js";
import { registerRetrieveSummaries } from "./tools/retrieve-summaries.js";
import { registerSegmentVideoCameraShots } from "./tools/segment-video-camera-shots.js";
import { registerSegmentVideoChapters } from "./tools/segment-video-chapters.js";

// Parse command line arguments
const { values: args } = parseArgs({
  options: {
    "api-key": {
      type: "string",
    },
    "base-url": {
      type: "string",
    },
  },
});

// Load environment variables from .env file
dotenv.config();

const apiKey = args["api-key"] || process.env.CLOUDGLUE_API_KEY;
const baseUrl = args["base-url"] || process.env.CLOUDGLUE_BASE_URL;

const cgClient = new Cloudglue({
  apiKey,
  baseUrl,
});

// Create server instance
const server = new McpServer({
  name: "cloudglue-mcp-server",
  version: "0.2.3",
});

// Register all tools
registerListCollections(server, cgClient);
registerListVideos(server, cgClient);
registerDescribeVideo(server, cgClient);
registerExtractVideoEntities(server, cgClient);
registerRetrieveSummaries(server, cgClient);
registerSearchVideoMoments(server, cgClient);
registerSearchVideoSummaries(server, cgClient);
registerGetVideoMetadata(server, cgClient);
registerSegmentVideoCameraShots(server, cgClient);
registerSegmentVideoChapters(server, cgClient);

// Run server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Cloudglue MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
