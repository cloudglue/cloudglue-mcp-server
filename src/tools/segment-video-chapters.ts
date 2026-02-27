import { z } from "zod";
import { Cloudglue } from "@cloudglue/cloudglue-js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export const schema = {
  url: z
    .string()
    .describe(
      "Video URL to segment into chapters. Supports multiple formats:\n\n• **Cloudglue platform (default)**: `cloudglue://files/file-id` - Use file ID from list_videos\n• **YouTube URLs**: `https://www.youtube.com/watch?v=...` or `https://youtu.be/...`\n• **Public HTTP video URLs**: Direct links to MP4 files (e.g., `https://example.com/video.mp4`)\n• **Data connector URLs** (requires setup in Cloudglue account):\n  - **Dropbox**: Shareable links (`https://www.dropbox.com/scl/fo/...`) or `dropbox://<path>/<to>/<file>`\n  - **Google Drive**: `gdrive://file/<file_id>`\n  - **Zoom**: Meeting UUID (`zoom://uuid/QFwZYEreTl2e6MBFSslXjQ%3D%3D`) or Meeting ID (`zoom://id/81586198865`)\n\nSee https://docs.cloudglue.dev/data-connectors/overview for data connector setup.",
    ),
  prompt: z
    .string()
    .describe(
      "Custom prompt to guide chapter detection. Describe what types of chapters or segments you want to identify. Examples: 'Identify main topics and transitions', 'Find scene changes and key moments', 'Segment by speaker changes and topics'. Leave empty to use default chapter detection.",
    )
    .optional(),
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

export function registerSegmentVideoChapters(
  server: McpServer,
  cgClient: Cloudglue,
) {
  server.tool(
    "segment_video_chapters",
    "Segment videos into chapters with intelligent cost optimization. Automatically checks for existing chapter segmentation jobs before creating new ones. Returns timestamps and descriptions for each chapter detected. Supports all URL formats: Cloudglue URLs, YouTube URLs, public HTTP video URLs, and data connector URLs (Dropbox, Google Drive, Zoom).",
    schema,
    {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    async ({ url, prompt }) => {
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
                  chapters: null,
                  total_chapters: 0,
                },
                null,
                2,
              ),
            },
          ],
        };
      };

      // Step 1: Check for existing narrative segmentation jobs for this URL
      try {
        const existingJobs = await cgClient.segments.listSegmentJobs({
          criteria: "narrative",
          url: url,
          status: "completed",
          limit: 1,
        });

        if (existingJobs.data && existingJobs.data.length > 0) {
          const fullJob = await cgClient.segments.getSegmentJob(
            existingJobs.data[0].job_id,
          );
          if (fullJob.segments && fullJob.segments.length > 0) {
            const chapters = fullJob.segments.map(
              (segment: { start_time: number; description?: string }, index: number) => ({
                chapter_number: index + 1,
                start_time: segment.start_time,
                start_time_formatted: formatTime(segment.start_time),
                description: segment.description || `Chapter ${index + 1}`,
              }),
            );

            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(
                    {
                      url: url,
                      chapters: chapters,
                      total_chapters: fullJob.segments.length,
                      source: "existing",
                      ...(prompt && { prompt: prompt }),
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

      // Step 2: Create new narrative segmentation job
      try {
        const narrativeConfig: any = {};
        if (prompt) {
          narrativeConfig.prompt = prompt;
        }

        const segmentJob = await cgClient.segments.createSegmentJob({
          url: url,
          criteria: "narrative",
          narrative_config: narrativeConfig,
        });

        // Wait for completion using SDK's waitForReady method
        const completedJob = await cgClient.segments.waitForReady(
          segmentJob.job_id,
        );

        if (completedJob.status === "completed" && completedJob.segments) {
          const chapters = completedJob.segments.map((segment, index) => ({
            chapter_number: index + 1,
            start_time: segment.start_time,
            start_time_formatted: formatTime(segment.start_time),
            description: segment.description || `Chapter ${index + 1}`,
          }));

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    url: url,
                    chapters: chapters,
                    total_chapters: completedJob.segments.length,
                    source: "new",
                    ...(prompt && { prompt: prompt }),
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        }

        return formatErrorResponse(
          "Failed to create chapter segmentation - job did not complete successfully",
        );
      } catch (error) {
        return formatErrorResponse(
          `Error creating chapter segmentation: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
      }
    },
  );
}
