import { z } from "zod";
import { Cloudglue } from "@cloudglue/cloudglue-js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export const schema = {
  collection_id: z
    .string()
    .describe(
      "Collection ID from list_collections. Works with both rich-transcripts and media-descriptions collections.",
    ),
  page: z
    .number()
    .int()
    .min(0)
    .describe(
      "Page number for paginated results. Each page contains 25 summaries. Defaults to 0 (first page). Use this to retrieve summaries for specific pages. Increase the page number to get the next 25 summaries.",
    )
    .optional()
    .default(0),
  created_after: z
    .string()
    .describe(
      "Only include summaries created after this date (YYYY-MM-DD format, e.g., '2024-01-15'). Useful for analyzing recent additions to a collection.",
    )
    .optional(),
  created_before: z
    .string()
    .describe(
      "Only include summaries created before this date (YYYY-MM-DD format, e.g., '2024-01-15'). Useful for analyzing historical content.",
    )
    .optional(),
};

export function registerRetrieveSummaries(
  server: McpServer,
  cgClient: Cloudglue,
) {
  server.tool(
    "retrieve_summaries",
    "Bulk retrieve video summaries and titles from a collection to quickly understand its content and themes. Works with both rich-transcripts and media-descriptions collections. Use this as your first step when analyzing a collection - it's more efficient than retrieving full descriptions and helps you determine if you need more detailed information. Perfect for getting a high-level overview of what's in a collection, identifying common topics, or determining if a collection contains relevant content for a specific query. For single videos, use describe_video instead. For targeted content discovery, consider using search_video_summaries (for relevant videos) or search_video_moments (for specific segments) instead of browsing through all summaries. Results are paginated in 25 summaries per page - use the 'page' parameter to retrieve specific pages (page 0 = first 25 summaries, page 1 = next 25 summaries, etc.). Each response includes `page` and `total_pages` fields. For comprehensive collection analysis, paginate through all summaries by incrementing the `page` parameter.",
    schema,
    {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    async ({ collection_id, page = 0, created_after, created_before }) => {
      const SUMMARIES_PER_PAGE = 25;
      const limit = SUMMARIES_PER_PAGE;
      const offset = page * SUMMARIES_PER_PAGE;

      // Helper function to format error response
      const formatErrorResponse = (
        error: string,
        collection_type?: string | null,
      ) => {
        const errorObj: any = {
          error,
          collection_id,
          summaries: [],
          page: page,
          total_pages: 0,
        };
        if (collection_type !== undefined && collection_type !== null) {
          errorObj.collection_type = collection_type;
        }
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(errorObj, null, 2),
            },
          ],
        };
      };

      // First get the collection to determine its type
      let collection;
      try {
        collection = await cgClient.collections.getCollection(collection_id);
      } catch (error) {
        return formatErrorResponse(
          `Error fetching collection: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
      }

      if (!collection || !collection.collection_type) {
        return formatErrorResponse(
          "Collection not found or invalid collection ID",
        );
      }

      if (
        collection.collection_type !== "rich-transcripts" &&
        collection.collection_type !== "media-descriptions"
      ) {
        return formatErrorResponse(
          `Collection type '${collection.collection_type}' is not supported. This tool works with rich-transcripts and media-descriptions collections only.`,
          collection.collection_type,
        );
      }

      // Get all descriptions first to apply our own filtering
      // Note: The API may not support date filtering natively, so we'll get more and filter
      const fetchLimit = Math.min(limit + offset + 50, 100); // Get extra for filtering

      let descriptions;
      try {
        if (collection.collection_type === "rich-transcripts") {
          descriptions = await cgClient.collections.listRichTranscripts(
            collection_id,
            { limit: fetchLimit, offset: 0 },
          );
        } else {
          descriptions = await cgClient.collections.listMediaDescriptions(
            collection_id,
            { limit: fetchLimit, offset: 0 },
          );
        }
      } catch (error) {
        return formatErrorResponse(
          `Error fetching descriptions: ${error instanceof Error ? error.message : "Unknown error"}`,
          collection.collection_type,
        );
      }

      let filteredDescriptions = descriptions.data || [];

      // Apply date filtering if requested
      if (created_after || created_before) {
        filteredDescriptions = filteredDescriptions.filter(
          (description: any) => {
            const descriptionDate = new Date(
              description.created_at || description.added_at || 0,
            );

            if (created_after) {
              const afterDate = new Date(created_after + "T00:00:00.000Z");
              if (descriptionDate <= afterDate) return false;
            }

            if (created_before) {
              const beforeDate = new Date(created_before + "T23:59:59.999Z");
              if (descriptionDate >= beforeDate) return false;
            }

            return true;
          },
        );
      }

      // Apply pagination
      const paginatedDescriptions = filteredDescriptions.slice(
        offset,
        offset + limit,
      );

      // Extract only title and summary information
      const summaries = paginatedDescriptions.map((description: any) => ({
        title:
          description.data.title || description.data.filename || "Untitled",
        summary: description.data.summary || "No summary available",
        file_id: description.file_id,
      }));

      // Calculate total pages based on filtered descriptions count
      const filteredTotal = filteredDescriptions.length;
      const totalPages =
        filteredTotal > 0 ? Math.ceil(filteredTotal / SUMMARIES_PER_PAGE) : 1;

      const result = {
        summaries,
        collection_type: collection.collection_type,
        page: page,
        total_pages: totalPages,
        collection_id,
        ...(created_after && { filtered_after: created_after }),
        ...(created_before && { filtered_before: created_before }),
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
