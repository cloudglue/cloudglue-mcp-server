import { z } from "zod";
import { Cloudglue } from "@cloudglue/cloudglue-js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export const schema = {
  file_id: z
    .string()
    .describe(
      "Video file ID from Cloudglue without the 'cloudglue://files/' prefix. Use the 'id' field from list_videos results (e.g., use 'abc123' not 'cloudglue://files/abc123'). This gives technical details about the video file itself.",
    ),
};

export function registerGetVideoMetadata(
  server: McpServer,
  cgClient: Cloudglue,
) {
  server.tool(
    "get_video_metadata",
    "Get comprehensive technical metadata about a Cloudglue video file including duration, resolution, file size, processing status, and computed statistics. Use this when you need video specifications, file details, or processing information rather than content analysis. Different from content-focused tools like describe_video.",
    schema,
    {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    async ({ file_id }) => {
      try {
        const file = await cgClient.files.getFile(file_id);

        if (file.status !== "completed") {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  {
                    file_id: file_id,
                    status: file.status,
                    error: `Video is in ${file.status} status and metadata may be incomplete`,
                    metadata: {
                      filename: file.filename || null,
                      uri: file.uri || null,
                      created_at: file.created_at || null,
                      updated_at: file.updated_at || null,
                    },
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        }

        // Comprehensive metadata response
        const metadata = {
          file_id: file.id,
          filename: file.filename,
          uri: file.uri,
          status: file.status,
          created_at: file.created_at,
          updated_at: file.updated_at,
          file_size: file.file_size || null,
          mime_type: file.mime_type || null,
          metadata: file.metadata || {},
          video_info: file.video_info
            ? {
                duration_seconds: file.video_info.duration_seconds,
                duration_formatted: file.video_info.duration_seconds
                  ? `${Math.floor(file.video_info.duration_seconds / 60)}:${(file.video_info.duration_seconds % 60).toFixed(0).padStart(2, "0")}`
                  : null,
                has_audio: file.video_info.has_audio,
                width: file.video_info.width || null,
                height: file.video_info.height || null,
                fps: file.video_info.fps || null,
                bitrate: file.video_info.bitrate || null,
                codec: file.video_info.codec || null,
              }
            : null,
          processing_info: {
            upload_completed_at: file.upload_completed_at || null,
            processing_started_at: file.processing_started_at || null,
            processing_completed_at: file.processing_completed_at || null,
          },
          // Additional computed fields
          computed: {
            file_age_days: file.created_at
              ? Math.floor(
                  (Date.now() - new Date(file.created_at).getTime()) /
                    (1000 * 60 * 60 * 24),
                )
              : null,
            processing_duration_seconds:
              file.processing_started_at &&
              file.processing_completed_at &&
              typeof file.processing_started_at === "string" &&
              typeof file.processing_completed_at === "string"
                ? Math.floor(
                    (new Date(file.processing_completed_at).getTime() -
                      new Date(file.processing_started_at).getTime()) /
                      1000,
                  )
                : null,
          },
        };

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(metadata, null, 2),
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
                  file_id: file_id,
                  error: `Failed to retrieve video metadata: ${error instanceof Error ? error.message : "Unknown error"}`,
                  metadata: null,
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
