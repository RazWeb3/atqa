import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { parseContent } from "@/features/content/content-schema";
import { normalizeContent } from "@/features/content/normalize-content";

const MAX_JSON_BYTES = 5 * 1024 * 1024; // 5 MiB

export async function POST(request: NextRequest) {
  try {
    const body = await request.arrayBuffer();

    if (body.byteLength > MAX_JSON_BYTES) {
      return NextResponse.json(
        {
          error: "INVALID_CONTENT",
          issues: [{ path: "", message: "JSON file exceeds 5 MiB limit" }],
        },
        { status: 400 },
      );
    }

    const text = new TextDecoder("utf-8").decode(body);
    let json: unknown;

    try {
      json = JSON.parse(text);
    } catch {
      return NextResponse.json(
        {
          error: "INVALID_CONTENT",
          issues: [{ path: "", message: "Invalid JSON syntax" }],
        },
        { status: 400 },
      );
    }

    const content = parseContent(json);
    const normalized = normalizeContent(content);

    return NextResponse.json(normalized, { status: 200 });
  } catch (error) {
    if (error instanceof ZodError) {
      const issues = error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      }));

      return NextResponse.json(
        { error: "INVALID_CONTENT", issues },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { error: "INTERNAL_ERROR", issues: [] },
      { status: 500 },
    );
  }
}
