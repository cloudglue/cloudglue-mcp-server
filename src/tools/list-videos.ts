import { z } from "zod";
import { Cloudglue } from "@cloudglue/cloudglue-js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export const schema = {
  page: z
    .number()
    .int()
    .min(0)
    .describe(
      "Page number for paginated results. Each page contains 25 videos. Defaults to 0 (first page). Use this to retrieve videos for specific pages. Increase the page number to get the next 25 videos.",
    )
    .optional()
    .default(0),
  collection_id: z
    .string()
    .describe(
      "Filter to videos in a specific collection. Use the collection ID from list_collections. Leave empty to see all user videos.",
    )
    .optional(),
  created_after: z
    .string()
    .describe(
      "Only show videos created after this date. Format: YYYY-MM-DD (e.g., '2024-01-15'). Useful for finding recent content.",
    )
    .optional(),
  created_before: z
    .string()
    .describe(
      "Only show videos created before this date. Format: YYYY-MM-DD (e.g., '2024-01-15'). Useful for filtering to older content.",
    )
    .optional(),
};

export function registerListVideos(server: McpServer, cgClient: Cloudglue) {
  server.tool(
    "list_videos",
    "Browse and search video metadata with powerful filtering options. Use this to explore available videos, find specific content by date, or see what's in a collection. Returns essential video info like duration, filename, and IDs needed for other tools. Results are paginated in 25 videos per page - use the 'page' parameter to retrieve specific pages (page 0 = first 25 videos, page 1 = next 25 videos, etc.). Each response includes `page` and `total_pages` fields. Use date filtering to focus on specific time periods, then paginate within those results.",
    schema,
    {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    async ({ page = 0, collection_id, created_after, created_before }) => {
      const VIDEOS_PER_PAGE = 25;
      const limit = VIDEOS_PER_PAGE;
      const offset = page * VIDEOS_PER_PAGE;

      let videos: any[] = [];
      let totalCount: number = 0;

      if (collection_id) {
        // If collection_id is provided, get videos from that collection
        // Note: For collections, date filtering uses added_after/added_before (when video was added to collection)
        // TODO: Consider adding separate parameters for added_after/added_before vs created_after/created_before
        const collectionVideos = await cgClient.collections.listVideos(
          collection_id,
          {
            limit: limit,
            offset: offset,
            status: "completed", // Filter for completed videos only
            ...(created_after && { added_after: created_after }),
            ...(created_before && { added_before: created_before }),
          },
        );
        totalCount = collectionVideos.total;

        // Get detailed info for each video
        const processedVideos = await Promise.all(
          collectionVideos.data.map(async (video) => {
            const fileInfo = await cgClient.files.getFile(video.file_id);

            return {
              filename: fileInfo.filename,
              uri: fileInfo.uri,
              id: fileInfo.id,
              created_at: fileInfo.created_at,
              metadata: fileInfo.metadata,
              video_info: fileInfo.video_info
                ? {
                    duration_seconds: fileInfo.video_info.duration_seconds,
                    has_audio: fileInfo.video_info.has_audio,
                  }
                : null,
              collection_id: video.collection_id,
              added_at: video.added_at,
            };
          }),
        );

        videos = processedVideos;
      } else {
        // Get all individual videos using API filtering
        // Note: API supports status filtering - we're using it internally to filter for completed videos only
        // TODO: Consider exposing status as a tool parameter if users need to see pending/processing/failed videos
        const files = await cgClient.files.listFiles({
          limit: limit,
          offset: offset,
          status: "completed", // Filter for completed videos only
          ...(created_after && { created_after: created_after }),
          ...(created_before && { created_before: created_before }),
        });
        totalCount = files.total;

        videos = files.data.map((file) => ({
          filename: file.filename,
          uri: file.uri,
          id: file.id,
          created_at: file.created_at,
          metadata: file.metadata,
          video_info: file.video_info
            ? {
                duration_seconds: file.video_info.duration_seconds,
                has_audio: file.video_info.has_audio,
              }
            : null,
        }));
      }

      // Calculate total pages based on API total count
      const totalPages =
        totalCount > 0 ? Math.ceil(totalCount / VIDEOS_PER_PAGE) : 1;

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                videos: videos,
                page: page,
                total_pages: totalPages,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );
}
