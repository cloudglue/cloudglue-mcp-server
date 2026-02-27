import { z } from "zod";
import { Cloudglue } from "@cloudglue/cloudglue-js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export const schema = {
  collection_id: z
    .string()
    .describe(
      "Collection ID from list_collections without the 'cloudglue://collections/' prefix (e.g., use 'abc123' not 'cloudglue://collections/abc123'). Works with both rich-transcripts and entities collections.",
    ),
  query: z
    .string()
    .describe(
      "Natural language search query to find relevant video moments. Examples: 'Find discussions about pricing strategies', 'Show me customer complaint segments', 'Locate product demo portions', 'Find mentions of specific competitors'. Be specific about what you're looking for.",
    ),
};

export function registerSearchVideoMoments(
  server: McpServer,
  cgClient: Cloudglue,
) {
  server.tool(
    "search_video_moments",
    "AI-powered semantic search to find specific video segments within a collection. Uses Cloudglue's search API to locate relevant moments across speech, on-screen text, and visual descriptions. Returns structured search results with timestamps and metadata. Perfect for finding needle-in-haystack spoken and visual content, specific discussions, or thematic analysis.",
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
          scope: "segment",
        });

        // Format the response with search results
        const result = {
          query: query,
          collection_id: collection_id,
          moments_found: response.results || [],
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
                  error: `Failed to search collection: ${error instanceof Error ? error.message : "Unknown error"}`,
                  moments_found: null,
                  citations: [],
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
