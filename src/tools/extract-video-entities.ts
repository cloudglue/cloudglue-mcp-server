import { z } from "zod";
import { Cloudglue } from "@cloudglue/cloudglue-js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export const schema = {
  url: z
    .string()
    .describe(
      "Video URL to extract entities from. Supports multiple formats:\n\n• **Cloudglue platform (default)**: `cloudglue://files/file-id` - Use file ID from list_videos\n• **YouTube URLs**: `https://www.youtube.com/watch?v=...` or `https://youtu.be/...`\n• **Public HTTP video URLs**: Direct links to MP4 files (e.g., `https://example.com/video.mp4`)\n• **Data connector URLs** (requires setup in Cloudglue account):\n  - **Dropbox**: Shareable links (`https://www.dropbox.com/scl/fo/...`) or `dropbox://<path>/<to>/<file>`\n  - **Google Drive**: `gdrive://file/<file_id>`\n  - **Zoom**: Meeting UUID (`zoom://uuid/QFwZYEreTl2e6MBFSslXjQ%3D%3D`) or Meeting ID (`zoom://id/81586198865`)\n\nSee https://docs.cloudglue.dev/data-connectors/overview for data connector setup.",
    ),
  prompt: z
    .string()
    .describe(
      "Detailed extraction prompt that guides what entities to find. Examples: 'Extract speaker names, key topics, and action items', 'Find product names, prices, and features mentioned', 'Identify companies, people, and technologies discussed'. Be specific about the data structure you want. Required when collection_id is not provided.",
    )
    .optional(),
  collection_id: z
    .string()
    .describe(
      "Optional collection ID to fetch previously extracted entities from an entities collection (saves time and cost). Use collection ID from list_collections. When provided with a Cloudglue URL, this tool retrieves existing entity extractions that were previously extracted and stored in the specified collection. Only works with Cloudglue URLs. When provided, prompt is not required and entities are fetched from the collection.",
    )
    .optional(),
  page: z
    .number()
    .int()
    .min(0)
    .describe(
      "Page number for paginated segment-level entities. Each page contains 25 segment entities. Defaults to 0 (first page). Use this to retrieve segment entities for specific pages of longer videos.",
    )
    .optional()
    .default(0),
};

// Helper function to extract file ID from Cloudglue URL
function extractFileIdFromUrl(url: string): string | null {
  const match = url.match(/cloudglue:\/\/files\/(.+)/);
  return match ? match[1] : null;
}

export function registerExtractVideoEntities(
  server: McpServer,
  cgClient: Cloudglue,
) {
  server.tool(
    "extract_video_entities",
    "Extract structured data and entities from videos with intelligent cost optimization and pagination support. Two modes: (1) Fetch existing entities from an entities collection by providing collection_id (prompt not required) - retrieves previously extracted entities stored in that collection for the given Cloudglue file, returns error if not found, (2) Extract new entities by providing prompt (collection_id optional) - automatically checks for existing extractions before creating new ones. Supports YouTube URLs, Cloudglue URLs, and direct HTTP video URLs. The quality of results depends heavily on your prompt specificity. Pagination is supported - use the 'page' parameter to retrieve specific pages of segment-level entities. Use this for individual video analysis.",
    schema,
    {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    async ({ url, prompt, collection_id, page = 0 }) => {
      // Validate that either collection_id or prompt is provided
      if (!collection_id && !prompt) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  video_level_entities: {},
                  segment_level_entities: {
                    entities: [],
                    page: page,
                    total_pages: 0,
                  },
                  error: "Either 'collection_id' or 'prompt' must be provided",
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      const fileId = extractFileIdFromUrl(url);
      const SEGMENTS_PER_PAGE = 25;

      // Helper function to format paginated entity response
      const formatPaginatedEntityResponse = (
        videoLevelEntities: any,
        segmentEntities: any[],
        currentPage: number,
        totalPages: number,
      ) => {
        const doc = {
          video_level_entities: videoLevelEntities || {},
          segment_level_entities: {
            entities: segmentEntities || [],
            page: currentPage,
            total_pages: totalPages,
          },
        };
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(doc, null, 2),
            },
          ],
        };
      };

      // Step 1: Check if we have a collection_id and file_id, get from collection
      if (collection_id && fileId) {
        try {
          // Calculate pagination parameters for segment entities
          const limit = SEGMENTS_PER_PAGE;
          const offset = page * SEGMENTS_PER_PAGE;

          const entities = await cgClient.collections.getEntities(
            collection_id,
            fileId,
            {
              limit,
              offset,
            },
          );

          if (
            entities &&
            (entities.entities ||
              (entities.segment_entities &&
                entities.segment_entities.length > 0))
          ) {
            // Calculate total pages based on total segment entities count
            const totalPages =
              entities.total > 0
                ? Math.ceil(entities.total / SEGMENTS_PER_PAGE)
                : 1;

            return formatPaginatedEntityResponse(
              entities.entities || {},
              entities.segment_entities || [],
              page,
              totalPages,
            );
          } else {
            // Entities not found in collection
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(
                    {
                      video_level_entities: {},
                      segment_level_entities: {
                        entities: [],
                        page: page,
                        total_pages: 0,
                      },
                      error: `No entities found for video in collection. The video may not have been processed yet or may not exist in the specified collection.`,
                    },
                    null,
                    2,
                  ),
                },
              ],
            };
          }
        } catch (error) {
          // Return error if collection lookup fails
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    video_level_entities: {},
                    segment_level_entities: {
                      entities: [],
                      page: page,
                      total_pages: 0,
                    },
                    error: `Error fetching entities from collection: ${error instanceof Error ? error.message : "Unknown error"}`,
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        }
      }

      // If collection_id was provided but fileId is missing, return error
      if (collection_id && !fileId) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  video_level_entities: {},
                  segment_level_entities: {
                    entities: [],
                    page: page,
                    total_pages: 0,
                  },
                  error:
                    "collection_id requires a Cloudglue URL (cloudglue://files/file-id). Other URL formats are not supported for collection entity retrieval.",
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      // Step 2: Check for existing individual extracts for this URL with matching prompt
      // At this point, if collection_id was provided we would have already returned or errored
      // So prompt must be defined (validated at function start)
      if (!prompt) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  video_level_entities: {},
                  segment_level_entities: {
                    entities: [],
                    page: page,
                    total_pages: 0,
                  },
                  error:
                    "prompt is required when collection_id is not provided",
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      // Step 2: Check for existing individual extracts for this URL with matching prompt
      try {
        const existingExtracts = await cgClient.extract.listExtracts({
          limit: 1,
          status: "completed",
          url: url,
        });

        if (existingExtracts.data && existingExtracts.data.length > 0) {
          const extract = existingExtracts.data[0];
          // Only reuse if the prompt matches
          if (
            extract.extract_config?.prompt === prompt &&
            extract.extract_config?.enable_video_level_entities === true &&
            extract.extract_config?.enable_segment_level_entities === true
          ) {
            // Calculate pagination parameters for segment entities
            const limit = SEGMENTS_PER_PAGE;
            const offset = page * SEGMENTS_PER_PAGE;

            const extraction = await cgClient.extract.getExtract(
              extract.job_id,
              {
                limit,
                offset,
              },
            );

            const extractionData = extraction.data;
            const segmentEntities =
              extractionData?.segment_entities &&
              Array.isArray(extractionData.segment_entities)
                ? extractionData.segment_entities
                : [];

            // Calculate total pages based on total segment entities count
            const totalPages =
              extraction.total && extraction.total > 0
                ? Math.ceil(extraction.total / SEGMENTS_PER_PAGE)
                : 1;

            return formatPaginatedEntityResponse(
              extractionData?.entities || {},
              segmentEntities,
              page,
              totalPages,
            );
          }
          // If prompt doesn't match, continue to create new extraction
        }
      } catch (error) {
        // Continue to create new extraction if listing fails
      }

      // Step 3: Create new entity extraction
      try {
        const extractJob = await cgClient.extract.createExtract(url, {
          prompt: prompt,
          enable_video_level_entities: true,
          enable_segment_level_entities: false,
        } as any);

        // Wait for completion using SDK's waitForReady method
        const completedJob = await cgClient.extract.waitForReady(
          extractJob.job_id,
        );

        if (completedJob.status === "completed" && completedJob.data) {
          // Calculate pagination parameters for segment entities
          const limit = SEGMENTS_PER_PAGE;
          const offset = page * SEGMENTS_PER_PAGE;

          const entities = await cgClient.extract.getExtract(
            completedJob.job_id,
            {
              limit,
              offset,
            },
          );

          const extractionData = entities.data;
          const segmentEntities =
            extractionData?.segment_entities &&
            Array.isArray(extractionData.segment_entities)
              ? extractionData.segment_entities
              : [];

          // Calculate total pages based on total segment entities count
          const totalPages =
            entities.total && entities.total > 0
              ? Math.ceil(entities.total / SEGMENTS_PER_PAGE)
              : 1;

          return formatPaginatedEntityResponse(
            extractionData?.entities || {},
            segmentEntities,
            page,
            totalPages,
          );
        }

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  video_level_entities: {},
                  segment_level_entities: {
                    entities: [],
                    page: page,
                    total_pages: 0,
                  },
                  error:
                    "Failed to create entity extraction - job did not complete successfully",
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  video_level_entities: {},
                  segment_level_entities: {
                    entities: [],
                    page: page,
                    total_pages: 0,
                  },
                  error: `Error creating entity extraction: ${error instanceof Error ? error.message : "Unknown error"}`,
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
