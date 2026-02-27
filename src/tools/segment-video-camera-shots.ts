import { z } from "zod";
import { Cloudglue } from "@cloudglue/cloudglue-js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export const schema = {
  url: z
    .string()
    .describe(
      "Video URL to segment into camera shots. Supports multiple formats:\n\n• **Cloudglue platform (default)**: `cloudglue://files/file-id` - Use file ID from list_videos\n• **Public HTTP video URLs**: Direct links to MP4 files (e.g., `https://example.com/video.mp4`)\n• **Data connector URLs** (requires setup in Cloudglue account):\n  - **Dropbox**: Shareable links (`https://www.dropbox.com/scl/fo/...`) or `dropbox://<path>/<to>/<file>`\n  - **Google Drive**: `gdrive://file/<file_id>`\n  - **Zoom**: Meeting UUID (`zoom://uuid/QFwZYEreTl2e6MBFSslXjQ%3D%3D`) or Meeting ID (`zoom://id/81586198865`)\n\nNote: YouTube URLs are not supported for camera shot segmentation.\nSee https://docs.cloudglue.dev/data-connectors/overview for data connector setup.",
    ),
};

// Helper function to format time in seconds to HH:MM:SS format
function formatTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  } else {
    return `${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
}

export function registerSegmentVideoCameraShots(
  server: McpServer,
  cgClient: Cloudglue,
) {
  server.tool(
    "segment_video_camera_shots",
    "Segment videos into camera shots with intelligent cost optimization. Automatically checks for existing shot segmentation jobs before creating new ones. Returns timestamps and metadata for each camera shot detected. Supports Cloudglue URLs and direct HTTP video URLs. Note: YouTube URLs are not supported for segmentation.",
    schema,
    {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    async ({ url }) => {
      // Helper function to format error response
      const formatErrorResponse = (error: string) => {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  url: url,
                  error: error,
                  segments: null,
                  total_shots: 0,
                },
                null,
                2,
              ),
            },
          ],
        };
      };

      // Check if it's a YouTube URL (not supported)
      if (url.includes("youtube.com") || url.includes("youtu.be")) {
        return formatErrorResponse(
          "YouTube URLs are not supported for camera shot segmentation. Please use Cloudglue URLs or direct HTTP video URLs instead.",
        );
      }

      // Step 1: Check for existing shot segmentation jobs for this URL
      try {
        const existingJobs = await cgClient.segments.listSegmentJobs({
          criteria: "shot",
          url: url,
          status: "completed",
          limit: 1,
        });

        if (existingJobs.data && existingJobs.data.length > 0) {
          const fullJob = await cgClient.segments.getSegmentJob(
            existingJobs.data[0].job_id,
          );
          if (fullJob.segments && fullJob.segments.length > 0) {
            const segments = fullJob.segments.map((segment) => ({
              start_time: segment.start_time,
              end_time: segment.end_time,
              start_time_formatted: formatTime(segment.start_time),
              end_time_formatted: formatTime(segment.end_time),
              duration_seconds: segment.end_time - segment.start_time,
            }));

            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(
                    {
                      url: url,
                      segments: segments,
                      total_shots: fullJob.segments.length,
                      source: "existing",
                    },
                    null,
                    2,
                  ),
                },
              ],
            };
          }
        }
      } catch (error) {
        // Continue to create new job if listing fails
      }

      // Step 2: Create new shot segmentation job
      try {
        const segmentJob = await cgClient.segments.createSegmentJob({
          url: url,
          criteria: "shot",
        });

        // Wait for completion using SDK's waitForReady method
        const completedJob = await cgClient.segments.waitForReady(
          segmentJob.job_id,
        );

        if (completedJob.status === "completed" && completedJob.segments) {
          const segments = completedJob.segments.map((segment) => ({
            start_time: segment.start_time,
            end_time: segment.end_time,
            start_time_formatted: formatTime(segment.start_time),
            end_time_formatted: formatTime(segment.end_time),
            duration_seconds: segment.end_time - segment.start_time,
          }));

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    url: url,
                    segments: segments,
                    total_shots: completedJob.segments.length,
                    source: "new",
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        }

        return formatErrorResponse(
          "Failed to create camera shot segmentation - job did not complete successfully",
        );
      } catch (error) {
        return formatErrorResponse(
          `Error creating camera shot segmentation: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
      }
    },
  );
}
