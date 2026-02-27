import { z } from "zod";
import { Cloudglue } from "@cloudglue/cloudglue-js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export const schema = {
  collection_id: z
    .string()
    .describe(
      "Collection ID from list_collections without the 'cloudglue://collections/' prefix (e.g., use 'abc123' not 'cloudglue://collections/abc123'). Works with rich-transcripts and media-descriptions collections.",
    ),
  query: z
    .string()
    .describe(
      "Natural language search query to find relevant videos. Examples: 'Find videos about pricing strategies', 'Show me customer complaint videos', 'Locate product demo videos', 'Find videos mentioning specific competitors'. Be specific about what you're looking for.",
    ),
};

export function registerSearchVideoSummaries(
  server: McpServer,
  cgClient: Cloudglue,
) {
  server.tool(
    "search_video_summaries",
    "AI-powered semantic search to find relevant videos within a collection. Uses Cloudglue's search API to locate videos based on their content, summaries, and metadata. Works with rich-transcripts and media-descriptions collections. Returns structured search results with video information and relevance scores. Perfect for discovering videos by topic, theme, or content similarity.",
    schema,
    {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    async ({ collection_id, query }) => {
      try {
        const response = await cgClient.search.searchContent({
          collections: [collection_id],
          query: query,
          limit: 20,
          scope: "file",
        });

        // Format the response with search results
        const result = {
          query: query,
          collection_id: collection_id,
          videos_found: response.results || [],
          total_results: response.results?.length || 0,
        };

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  query: query,
                  collection_id: collection_id,
                  error: `Failed to search videos: ${error instanceof Error ? error.message : "Unknown error"}`,
                  videos_found: null,
                  total_results: 0,
                },
                null,
                2,
              ),
            },
          ],
        };
      }
    },
  );
}
