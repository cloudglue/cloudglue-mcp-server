# Cloudglue MCP Server

[![NPM Version](https://img.shields.io/npm/v/%40cloudglue%2Fcloudglue-mcp-server)](https://www.npmjs.com/package/@cloudglue/cloudglue-mcp-server)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE.md)
![MCP](https://badge.mcpx.dev?status=on 'MCP Enabled')
[![Discord](https://img.shields.io/discord/1366541583272382536?logo=discord&label=Discord)](https://discord.gg/QD5KWFVner)

Connect Cloudglue to Cursor, Claude Desktop, and other AI assistants to unlock the power of video collection understanding. Cloudglue helps turn your videos into structured data ready for LLMs.

# 📖 Resources

- [Model Context Protocol](https://modelcontextprotocol.io/introduction)
- [Cloudglue API Docs](https://docs.cloudglue.dev)
- [Terms of Service](https://cloudglue.dev/terms)
- [Privacy Policy](https://cloudglue.dev/privacy)
- [Pricing](https://cloudglue.dev/pricing)

> By using the Cloudglue SDK and/or the MCP server, you agree to the [Cloudglue Terms of Service](https://cloudglue.dev/terms) and acknowledge our [Privacy Policy](https://cloudglue.dev/privacy).

# Usage

## Prerequisites

First, get a Cloudglue API Key from [cloudglue.dev](http://cloudglue.dev), this will be used to authenticate the MCP server with your Cloudglue account.

### A. On any MCP client using a JSON configuration

Most MCP clients store their configuration as JSON. For `cloudglue-mcp-server` this would look like the following:

```json
{
  "mcpServers": {
    "cloudglue": {
      "command": "npx",
      "args": [
        "-y",
        "@cloudglue/cloudglue-mcp-server@latest",
        "--api-key",
        "<CLOUDGLUE-YOUR-API-KEY>"
      ]
    }
  }
}
```

Replace `<CLOUDGLUE-YOUR-API-KEY>` with the API Key created earlier.

### B. On Claude Desktop using Desktop Extensions

<div style="display: flex; gap: 10px; align-items: center;">
  <img src="./assets/claude-desktop-1.png" width="40%" alt="Claude Desktop Extension Installation Step 1">
  <img src="./assets/claude-desktop-2.png" width="40%" alt="Claude Desktop Extension Installation Step 2">
</div>

1. Download the latest Cloudglue Claude Desktop Extension from [the releases page](https://github.com/cloudglue/cloudglue-mcp-server/releases/latest/download/cloudglue-mcp-server.mcpb)
2. Double click to open with Claude Desktop (you need to have Claude Desktop running prior to this)
3. Click 'Install'
4. When prompted, enter your API key
5. Enable the extension

# Local Development

## Prerequisites

First, get a Cloudglue API Key from [cloudglue.dev](http://cloudglue.dev), this will be used to authenticate the MCP server with your Cloudglue account.

## Build the server

1. Clone the repo
2. Install dependencies using `npm install`
3. Build the server + Claude Desktop Extension using `npm build`

## Configure your MCP client

Next, configure your MCP client (such as Cursor) to use this server. Most MCP clients store the configuration as JSON in the following format:

```json
{
  "mcpServers": {
    "cloudglue-mcp-server": {
      "command": "node",
      "args": [
        "/ABSOLUTE/PATH/TO/PARENT/FOLDER/cloudglue-mcp-server/build/index.js",
        "--api-key",
        "<CLOUDGLUE-YOUR-API-KEY>"
      ]
    }
  }
}
```

# Documentation

## Supported URL Formats

The Cloudglue MCP Server supports multiple URL formats for video analysis:

### **Cloudglue Platform (Default)**
- **Format**: `cloudglue://files/file-id`
- **Usage**: Use file ID from `list_videos` tool
- **Best for**: Videos already uploaded to Cloudglue

### **YouTube URLs**
- **Formats**: 
  - `https://www.youtube.com/watch?v=...`
  - `https://youtu.be/...`
- **Supported tools**: `describe_video`, `extract_video_entities`, `segment_video_chapters`
- **Note**: Not supported for `segment_video_camera_shots`

### **Public HTTP Video URLs**
- **Format**: Direct links to MP4 files (e.g., `https://example.com/video.mp4`)
- **Best for**: Publicly accessible video files

### **Data Connector URLs**
*Requires setup in Cloudglue account - see [Data Connectors Documentation](https://docs.cloudglue.dev/data-connectors/overview)*

- **Dropbox**:
  - Shareable links: `https://www.dropbox.com/scl/fo/SOME_ID/SOME_OTHER_ID?rlkey=SOME_KEY&st=SOME_TIME&dl=0`
  - Direct path: `dropbox://<path>/<to>/<file>`

- **Google Drive**:
  - Format: `gdrive://file/<file_id>`

- **Zoom**:
  - Meeting UUID: `zoom://uuid/QFwZYEreTl2e6MBFSslXjQ%3D%3D`
  - Meeting ID: `zoom://id/81586198865`

## Tools

The following Cloudglue tools are available to LLMs through this MCP server:

### **Discovery & Navigation**

- **`list_collections`**: Discover available video collections and their basic metadata. Use this first to understand what video collections exist before using other collection-specific tools. Shows collection IDs needed for other tools, video counts, and collection types. For collections with type 'media-descriptions', use `describe_video` with the collection_id parameter to fetch previously extracted descriptions for a given Cloudglue file. For collections with type 'entities', use `extract_video_entities` with the collection_id parameter to fetch previously extracted entities for a given Cloudglue file. **Pagination**: Results are paginated in 25 collections per page using the `page` parameter (page 0 = first 25 collections, page 1 = next 25 collections, etc.). Each response includes `page` and `total_pages` fields. For comprehensive exploration, paginate through all collections by incrementing the `page` parameter until you've retrieved all pages.

- **`list_videos`**: Browse and search video metadata with powerful filtering options. Use this to explore available videos, find specific content by date, or see what's in a collection. Returns essential video info like duration, filename, and IDs needed for other tools. **Pagination**: Results are paginated in 25 videos per page using the `page` parameter (page 0 = first 25 videos, page 1 = next 25 videos, etc.). Each response includes `page` and `total_pages` fields. Use date filtering to focus on specific time periods, then paginate within those results.

### **Individual Video Analysis**

- **`describe_video`**: Get comprehensive transcripts and descriptions from individual videos with intelligent cost optimization and pagination support. Automatically checks for existing transcripts before creating new ones. Supports all URL formats: Cloudglue URLs, YouTube URLs, public HTTP video URLs, and data connector URLs (Dropbox, Google Drive, Zoom). **Pagination**: Results are paginated in 5-minute segments using the `page` parameter (page 0 = first 5 minutes, page 1 = next 5 minutes, etc.). Use `start_time_seconds` to begin pagination from a specific time index (defaults to 0). Combined with `page`, this allows precise navigation: `start_time_seconds` sets the base offset, and `page` increments in 5-minute segments from that offset (e.g., `start_time_seconds=600` with `page=0` returns 10-15 minutes, `page=1` returns 15-20 minutes). Each response includes `page`, `total_pages`, and `description` fields in JSON format. Use pagination to efficiently process longer videos by retrieving descriptions in manageable chunks or target specific time ranges. Pagination works consistently for both collection descriptions (when using `collection_id`) and individual video descriptions.

- **`extract_video_entities`**: Extract structured data and entities from videos using custom prompts with intelligent cost optimization and pagination support. Automatically checks for existing extractions before creating new ones. Supports all URL formats: Cloudglue URLs, YouTube URLs, public HTTP video URLs, and data connector URLs (Dropbox, Google Drive, Zoom). The quality of results depends heavily on your prompt specificity. **Pagination**: Segment-level entities are paginated (25 segments per page) using the `page` parameter. Each response includes `video_level_entities` and `segment_level_entities` with `entities`, `page`, and `total_pages` fields in JSON format.

- **`get_video_metadata`**: Get comprehensive technical metadata about a Cloudglue video file including duration, resolution, file size, processing status, and computed statistics. Returns structured JSON results with complete file metadata, video information (resolution, fps, codec, etc.), processing timestamps, and computed fields. Use this when you need video specifications, file details, or processing information rather than content analysis. Different from content-focused tools like describe_video.

- **`segment_video_camera_shots`**: Segment videos into camera shots with intelligent cost optimization. Automatically checks for existing shot segmentation jobs before creating new ones. Returns structured JSON results with segments array containing timestamps, formatted times, and duration for each camera shot detected. Supports Cloudglue URLs, public HTTP video URLs, and data connector URLs (Dropbox, Google Drive, Zoom). Note: YouTube URLs are not supported for camera shot segmentation.

- **`segment_video_chapters`**: Segment videos into chapters with intelligent cost optimization. Automatically checks for existing chapter segmentation jobs before creating new ones. Returns structured JSON results with chapters array containing timestamps, formatted times, and descriptions for each chapter detected. Supports optional custom prompt parameter to guide chapter detection. Supports all URL formats: Cloudglue URLs, YouTube URLs, public HTTP video URLs, and data connector URLs (Dropbox, Google Drive, Zoom).

### **Collection Analysis**

- **`retrieve_summaries`**: Bulk retrieve video summaries and titles from a collection to quickly understand its content and themes. Works with both rich-transcripts and media-descriptions collections. Perfect for getting a high-level overview of what's in a collection, identifying common topics, or determining if a collection contains relevant content for a specific query. Use this as your first step when analyzing a collection - it's more efficient than retrieving full descriptions and helps you determine if you need more detailed information. For targeted content discovery, consider using search_video_summaries or search_video_moments instead of browsing through all summaries. **Pagination**: Results are paginated in 25 summaries per page using the `page` parameter (page 0 = first 25 summaries, page 1 = next 25 summaries, etc.). Each response includes `page` and `total_pages` fields. For comprehensive collection analysis, paginate through all summaries by incrementing the `page` parameter until you've retrieved all pages.

- **`search_video_moments`**: AI-powered semantic search to find specific video segments within a collection. Uses Cloudglue's search API to locate relevant moments across speech, on-screen text, and visual descriptions. Returns structured search results with timestamps and metadata. Perfect for finding needle-in-haystack spoken and visual content, specific discussions, or thematic analysis. Returns up to 20 relevant video moments per query.

- **`search_video_summaries`**: AI-powered semantic search to find relevant videos within a collection. Uses Cloudglue's search API to locate videos based on their content, summaries, and metadata. Works with rich-transcripts and media-descriptions collections. Returns structured search results with video information and relevance scores. Perfect for discovering videos by topic, theme, or content similarity. Returns up to 20 relevant videos per query.

### **Pagination Strategy**

**When to Paginate Exhaustively:**

- User asks for "all" or "complete" analysis of collections/videos
- User wants comprehensive coverage or exhaustive exploration
- User requests data mining, dataset building, or complete entity extraction
- User asks for "everything" in a collection or time period

**How to Paginate:**

All tools use page-based pagination (`list_collections`, `list_videos`, `describe_video`, `extract_video_entities`, `retrieve_summaries`):
1. Start with initial request (page=0)
2. Check response `total_pages` field
3. If `page < total_pages - 1`, increment `page` and repeat
4. Continue until you've retrieved all pages or have sufficient data

**Page sizes by tool:**
- `list_collections`: 25 collections per page
- `list_videos`: 25 videos per page
- `describe_video`: 5 minutes per page
- `extract_video_entities`: 25 segment entities per page
- `retrieve_summaries`: 25 summaries per page

### **When to Use Which Tool**

- **Start exploring**: Use `list_collections` and `list_videos` to explore available content
- **For single videos**: Use `describe_video`, `extract_video_entities`, `segment_video_camera_shots`, or `segment_video_chapters`
- **For collection overview**: Always start with `retrieve_summaries` to efficiently understand what's in a collection
- **For detailed analysis**: Use `describe_video` for specific videos that need full multimodal context, identified through summaries
- **For structured data**: Use `extract_video_entities` for entity extraction from individual videos
- **For specific content**: Use `search_video_moments` for targeted segment search, `search_video_summaries` for video-level search
- **For technical specs**: Use `get_video_metadata`

All tools include intelligent features like cost optimization, automatic fallbacks, and comprehensive error handling.

## Contact

- [Open an Issue](https://github.com/cloudglue/cloudglue-mcp-server/issues/new)
- [Email](mailto:support@cloudglue.dev)
