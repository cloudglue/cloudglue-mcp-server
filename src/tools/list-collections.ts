import { z } from "zod";
import { Cloudglue } from "@cloudglue/cloudglue-js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export const schema = {
  page: z
    .number()
    .int()
    .min(0)
    .describe(
      "Page number for paginated results. Each page contains 25 collections. Defaults to 0 (first page). Use this to retrieve collections for specific pages. Increase the page number to get the next 25 collections.",
    )
    .optional()
    .default(0),
  collection_type: z
    .string()
    .describe(
      "Filter by collection type: 'media-descriptions' or 'entities'. Leave empty to see all types.",
    )
    .optional(),
};

export function registerListCollections(
  server: McpServer,
  cgClient: Cloudglue,
) {
  server.tool(
    "list_collections",
    "Discover available video collections and their basic metadata. Use this first to understand what video collections exist before using other collection-specific tools. Shows collection IDs needed for other tools, video counts, and collection types. For collections with type 'media-descriptions', use `describe_video` with the collection_id parameter to fetch previously extracted descriptions for a given Cloudglue file. For collections with type 'entities', use `extract_video_entities` with the collection_id parameter to fetch previously extracted entities for a given Cloudglue file. Results are paginated in 25 collections per page - use the 'page' parameter to retrieve specific pages (page 0 = first 25 collections, page 1 = next 25 collections, etc.). Each response includes `page` and `total_pages` fields.",
    schema,
    {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    async ({ page = 0, collection_type }) => {
      const COLLECTIONS_PER_PAGE = 25;
      const limit = COLLECTIONS_PER_PAGE;
      const offset = page * COLLECTIONS_PER_PAGE;

      const collections = await cgClient.collections.listCollections({
        limit: limit,
        offset: offset,
        ...(collection_type && {
          collection_type: collection_type as "media-descriptions" | "entities",
        }),
      });

      // Process each collection to get video counts and selective fields
      const processedCollections = await Promise.all(
        collections.data.map(async (collection) => {
          // Get all videos in the collection to count completed ones
          const videos = await cgClient.collections.listVideos(collection.id, {
            limit: 100, // TODO: paginate for very large collections
          });

          const completedVideoCount = videos.data.filter(
            (video) => video.status === "completed",
          ).length;

          return {
            id: collection.id,
            name: collection.name,
            collection_type: collection.collection_type,
            created_at: collection.created_at,
            completed_video_count: completedVideoCount,
            description: collection.description ?? undefined,
          };
        }),
      );

      const totalPages =
        collections.total > 0
          ? Math.ceil(collections.total / COLLECTIONS_PER_PAGE)
          : 1;

      const result = {
        collections: processedCollections,
        page: page,
        total_pages: totalPages,
      };

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    },
  );
}
