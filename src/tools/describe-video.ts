import { z } from "zod";
import { Cloudglue } from "@cloudglue/cloudglue-js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export const schema = {
  url: z
    .string()
    .describe(
      "Video URL to describe. Supports multiple formats:\n\n• **Cloudglue platform (default)**: `cloudglue://files/file-id` - Use file ID from list_videos\n• **YouTube URLs**: `https://www.youtube.com/watch?v=...` or `https://youtu.be/...`\n• **Public HTTP video URLs**: Direct links to MP4 files (e.g., `https://example.com/video.mp4`)\n• **Data connector URLs** (requires setup in Cloudglue account):\n  - **Dropbox**: Shareable links (`https://www.dropbox.com/scl/fo/...`) or `dropbox://<path>/<to>/<file>`\n  - **Google Drive**: `gdrive://file/<file_id>`\n  - **Zoom**: Meeting UUID (`zoom://uuid/QFwZYEreTl2e6MBFSslXjQ%3D%3D`) or Meeting ID (`zoom://id/81586198865`)\n\nSee https://docs.cloudglue.dev/data-connectors/overview for data connector setup.",
    ),
  collection_id: z
    .string()
    .describe(
      "Optional collection ID to fetch previously extracted media descriptions from a media-descriptions collection (saves time and cost). Use collection ID from list_collections without. When provided with a Cloudglue URL, this tool retrieves existing descriptions that were previously extracted and stored in the specified collection. Only works with Cloudglue URLs.",
    )
    .optional(),
  page: z
    .number()
    .int()
    .min(0)
    .describe(
      "Page number for paginated results. Each page contains 5 minutes of video content. Defaults to 0 (first page). Use this to retrieve descriptions for specific time segments of longer videos. Increase the page number to get the next 5-minute segment. Works in conjunction with start_time_seconds - page 0 starts from start_time_seconds, page 1 starts 5 minutes after start_time_seconds, etc.",
    )
    .optional()
    .default(0),
  start_time_seconds: z
    .number()
    .int()
    .min(0)
    .describe(
      "Starting time offset in seconds for pagination. Defaults to 0 (start of video). Use this to begin pagination from a specific time index in the video. Combined with the page parameter, this allows you to navigate to specific time ranges: start_time_seconds sets the base offset, and page increments in 5-minute segments from that offset. For example, start_time_seconds=600 (10 minutes) with page=0 returns content from 10-15 minutes, page=1 returns 15-20 minutes, etc.",
    )
    .optional()
    .default(0),
};

// Helper function to extract file ID from Cloudglue URL
function extractFileIdFromUrl(url: string): string | null {
  const match = url.match(/cloudglue:\/\/files\/(.+)/);
  return match ? match[1] : null;
}

export function registerDescribeVideo(server: McpServer, cgClient: Cloudglue) {
  server.tool(
    "describe_video",
    "Gets comprehensive video descriptions with intelligent cost optimization and pagination support. Automatically checks for existing descriptions before creating new ones. Supports YouTube URLs, Cloudglue URLs, and direct HTTP video URLs with different analysis levels. Results are paginated in 5-minute segments - use the 'page' parameter to retrieve specific time segments of longer videos (page 0 = first 5 minutes, page 1 = next 5 minutes, etc.). Use 'start_time_seconds' to begin pagination from a specific time index (defaults to 0 for start of video). The combination of start_time_seconds and page allows precise navigation: start_time_seconds sets the base offset, and page increments in 5-minute segments from that offset. When `collection_id` is provided (from a media-descriptions collection), this tool fetches previously extracted descriptions that were stored in that collection for the given Cloudglue file, saving time and cost. Use this for individual video analysis.",
    schema,
    {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    async ({ url, collection_id, page = 0, start_time_seconds = 0 }) => {
      const fileId = extractFileIdFromUrl(url);
      const PAGE_SIZE_SECONDS = 300; // 5 minutes in seconds

      // Helper function to format paginated response
      const formatPaginatedResponse = (
        descriptionContent: string,
        currentPage: number,
        totalPages: number,
      ) => {
        const doc = {
          description: descriptionContent,
          page: currentPage,
          total_pages: totalPages,
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
          // First, get the description to obtain duration for pagination calculation
          // We'll use this to calculate total pages
          const fullDescription =
            await cgClient.collections.getMediaDescriptions(
              collection_id,
              fileId,
              { response_format: "markdown" },
            );

          if (fullDescription.content !== undefined) {
            const duration = fullDescription.duration_seconds || 0;

            // Calculate remaining duration from start_time_seconds
            const remainingDuration = Math.max(
              0,
              duration - start_time_seconds,
            );
            const totalPages =
              remainingDuration > 0
                ? Math.ceil(remainingDuration / PAGE_SIZE_SECONDS)
                : 1;

            // If start_time_seconds is beyond video length or remaining duration is 0, return empty
            if (start_time_seconds >= duration || remainingDuration === 0) {
              return formatPaginatedResponse("", page, totalPages);
            }

            // Calculate actual time range for the requested page
            const actualStartTime =
              start_time_seconds + page * PAGE_SIZE_SECONDS;
            const actualEndTime = Math.min(
              start_time_seconds + (page + 1) * PAGE_SIZE_SECONDS,
              duration,
            );

            // If calculated start time is beyond video length, return empty description
            if (actualStartTime >= duration) {
              return formatPaginatedResponse("", page, totalPages);
            }

            // If page is 0, start_time_seconds is 0, and video fits in one page, return full description
            if (
              page === 0 &&
              start_time_seconds === 0 &&
              duration <= PAGE_SIZE_SECONDS
            ) {
              return formatPaginatedResponse(
                fullDescription.content || "",
                page,
                totalPages,
              );
            }

            // Get paginated description for the requested time range
            const paginatedDescription =
              await cgClient.collections.getMediaDescriptions(
                collection_id,
                fileId,
                {
                  response_format: "markdown",
                  start_time_seconds: actualStartTime,
                  end_time_seconds: actualEndTime,
                },
              );

            return formatPaginatedResponse(
              paginatedDescription.content || "",
              page,
              totalPages,
            );
          }
        } catch (error) {
          // Continue to next step if collection lookup fails
        }
      }

      // Step 2: Check for existing individual descriptions for this URL
      try {
        const existingDescriptions = await cgClient.describe.listDescribes({
          limit: 1,
          status: "completed",
          url: url,
        });

        if (existingDescriptions.data && existingDescriptions.data.length > 0) {
          const describeJob = existingDescriptions.data[0];
          const describeJobId = describeJob.job_id;
          const duration = describeJob.duration_seconds || 0;

          // Calculate remaining duration from start_time_seconds
          const remainingDuration = Math.max(0, duration - start_time_seconds);
          const totalPages =
            remainingDuration > 0
              ? Math.ceil(remainingDuration / PAGE_SIZE_SECONDS)
              : 1;

          // If start_time_seconds is beyond video length, return empty
          if (start_time_seconds >= duration || remainingDuration === 0) {
            return formatPaginatedResponse("", page, totalPages);
          }

          // If duration is not available, get full description
          if (duration === 0) {
            const description = await cgClient.describe.getDescribe(
              describeJobId,
              {
                response_format: "markdown",
              },
            );
            return formatPaginatedResponse(
              description.data?.content || "",
              page,
              totalPages,
            );
          }

          // Calculate actual time range for the requested page
          const actualStartTime = start_time_seconds + page * PAGE_SIZE_SECONDS;
          const actualEndTime = Math.min(
            start_time_seconds + (page + 1) * PAGE_SIZE_SECONDS,
            duration,
          );

          // If calculated start time is beyond video length, return empty description
          if (actualStartTime >= duration) {
            return formatPaginatedResponse("", page, totalPages);
          }

          const description = await cgClient.describe.getDescribe(
            describeJobId,
            {
              response_format: "markdown",
              start_time_seconds: actualStartTime,
              end_time_seconds: actualEndTime,
            },
          );

          return formatPaginatedResponse(
            description.data?.content || "",
            page,
            totalPages,
          );
        }
      } catch (error) {
        // Continue to create new description if listing fails
      }

      // Step 3: Create new description
      try {
        const isYouTube =
          url.includes("youtube.com") || url.includes("youtu.be");
        const isCloudGlue = url.startsWith("cloudglue://");

        const describeOptions = {
          enable_summary: isYouTube, // only for youtube
          enable_speech: true,
          enable_scene_text: isCloudGlue, // Only enable for Cloudglue videos
          enable_visual_scene_description: isCloudGlue, // Only enable for Cloudglue videos
        };

        const describeJob = await cgClient.describe.createDescribe(
          url,
          describeOptions,
        );

        // Wait for completion using SDK's waitForReady method
        const completedJob = await cgClient.describe.waitForReady(
          describeJob.job_id,
          {
            response_format: "markdown",
          },
        );

        if (completedJob.status === "completed") {
          const duration = completedJob.duration_seconds || 0;

          // Calculate remaining duration from start_time_seconds
          const remainingDuration = Math.max(
            0,
            (duration || Infinity) - start_time_seconds,
          );
          const totalPages =
            remainingDuration > 0
              ? Math.ceil(remainingDuration / PAGE_SIZE_SECONDS)
              : 1;

          // If start_time_seconds is beyond video length, return empty
          if (
            start_time_seconds >= (duration || Infinity) ||
            remainingDuration === 0
          ) {
            return formatPaginatedResponse("", page, totalPages);
          }

          // Get paginated description for the requested page
          let descriptionContent = "";
          if (duration > 0) {
            // Calculate actual time range for the requested page
            const actualStartTime =
              start_time_seconds + page * PAGE_SIZE_SECONDS;
            const actualEndTime = Math.min(
              start_time_seconds + (page + 1) * PAGE_SIZE_SECONDS,
              duration || Infinity,
            );

            // If calculated start time is beyond video length, return empty description
            if (actualStartTime >= (duration || Infinity)) {
              return formatPaginatedResponse("", page, totalPages);
            }

            const paginatedDescription = await cgClient.describe.getDescribe(
              completedJob.job_id,
              {
                response_format: "markdown",
                start_time_seconds: actualStartTime,
                end_time_seconds: actualEndTime,
              },
            );
            descriptionContent = paginatedDescription.data?.content || "";
          } else {
            // Fallback to full content if duration is not available (only for page 0 and start_time_seconds 0)
            if (page === 0 && start_time_seconds === 0) {
              descriptionContent = completedJob.data?.content || "";
            } else {
              descriptionContent = "";
            }
          }

          return formatPaginatedResponse(descriptionContent, page, totalPages);
        }

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  description:
                    "Error: Failed to create description - job did not complete successfully",
                  page: page,
                  total_pages: 0,
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
                  description: `Error creating description: ${error instanceof Error ? error.message : "Unknown error"}`,
                  page: page,
                  total_pages: 0,
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
