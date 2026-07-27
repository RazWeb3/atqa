import { NextRequest, NextResponse } from "next/server";
import {
  WhitelistAddSchema,
  WhitelistRemoveSchema,
} from "@/features/review/reading-whitelist";
import {
  addWhitelistEntry,
  loadWhitelist,
  removeWhitelistEntry,
} from "@/features/review/reading-whitelist.server";

export async function GET() {
  try {
    const entries = await loadWhitelist();
    return NextResponse.json({ entries });
  } catch (error) {
    console.error("Whitelist load failed:", error);
    return NextResponse.json({ error: "WHITELIST_FAILED" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = WhitelistAddSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "INVALID_REQUEST",
        issues: parsed.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
      { status: 400 },
    );
  }

  try {
    const entries = await addWhitelistEntry(
      parsed.data.token,
      parsed.data.reading,
    );
    return NextResponse.json({ entries });
  } catch (error) {
    console.error("Whitelist add failed:", error);
    return NextResponse.json({ error: "WHITELIST_FAILED" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = WhitelistRemoveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
  }

  try {
    const entries = await removeWhitelistEntry(parsed.data.token);
    return NextResponse.json({ entries });
  } catch (error) {
    console.error("Whitelist remove failed:", error);
    return NextResponse.json({ error: "WHITELIST_FAILED" }, { status: 500 });
  }
}
