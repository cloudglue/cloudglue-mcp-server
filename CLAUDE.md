# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Cloudglue MCP Server - A Model Context Protocol server that bridges AI assistants (Claude, Cursor) with Cloudglue's video analysis platform. Enables AI to analyze videos, extract transcripts, identify entities, segment content, and search across video collections.

## Common Commands

```bash
# Build the project (TypeScript compilation + MCP packaging)
npm run build

# Watch mode for development
npm run watch

# Format code with Prettier
npm run format
```

No dedicated test or lint commands are currently defined.

## Architecture

**Entry Point:** `src/index.ts` initializes the McpServer, creates the Cloudglue client (via `@cloudglue/cloudglue-js` SDK), registers all tools, and connects via stdio transport.

**Tool Pattern:** Each tool in `src/tools/` is a self-contained module that exports:
- A Zod `schema` for input validation
- A `register[ToolName](server, cgClient)` function that registers the tool with its handler

**10 Tools Available:**
- `list-collections`, `list-videos` - Browse collections and videos
- `describe-video`, `get-video-metadata` - Video details and transcripts
- `extract-video-entities` - Structured entity extraction
- `retrieve-summaries` - Bulk summary retrieval
- `search-video-moments`, `search-video-summaries` - Semantic search
- `segment-video-camera-shots`, `segment-video-chapters` - Video segmentation

## Key Patterns

**Pagination:** Most tools return paginated results (25 items or 5-minute segments per page). Response includes `page` and `total_pages` fields.

**Cost Optimization:** Tools like `describe_video` check for existing results in collections and jobs before creating new ones.

**URL Formats:** Tools accept Cloudglue URLs (`cg://`), YouTube, HTTP, Dropbox, Google Drive, and Zoom URLs.

**Error Handling:** Consistent JSON error responses with `error` and `details` fields.

**Tool Hints:** Tools declare `readOnlyHint`, `idempotentHint`, and `openWorldHint` for MCP clients.

## Environment Setup

Requires `CLOUDGLUE_API_KEY` environment variable or `--api-key` CLI flag. See `.env.example` for template.

## Build Output

TypeScript compiles to `build/` directory. The `mcpb pack` command creates Claude Desktop extension bundles.
