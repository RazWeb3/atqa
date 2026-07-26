import { NextRequest, NextResponse } from "next/server";
import { getAllowedHosts, validateAudioUrl } from "@/features/audio/audio-policy";
import { fetchAudio } from "@/features/audio/audio-fetcher.server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const audioUrl = searchParams.get("url");

  if (!audioUrl) {
    return NextResponse.json(
      { error: "Missing url parameter" },
      { status: 400 },
    );
  }

  try {
    const allowedHosts = getAllowedHosts();
    const validatedUrl = validateAudioUrl(audioUrl, allowedHosts);

    // Get Range header from request
    const range = request.headers.get("range");

    const result = await fetchAudio(validatedUrl, range);

    // Build response headers
    const headers: Record<string, string> = {
      "Content-Type": result.contentType,
      "Content-Length": result.contentLength.toString(),
      "Accept-Ranges": "bytes",
      "Cache-Control": "public, max-age=3600",
    };

    return new NextResponse(result.body, {
      status: range ? 206 : 200,
      headers,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch audio";

    // Don't expose internal details
    if (
      message.includes("not allowed") ||
      message.includes("HTTPS") ||
      message.includes("credentials")
    ) {
      return NextResponse.json(
        { error: "Invalid audio URL" },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { error: "Failed to fetch audio" },
      { status: 502 },
    );
  }
}
