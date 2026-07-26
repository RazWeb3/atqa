import { NextRequest, NextResponse } from "next/server";
import { ReviewRequestSchema } from "@/features/review/review-contract";
import { reviewUnit } from "@/features/review/review-orchestrator.server";

// In-memory idempotency store (per Cloud Run instance)
const inFlightRequests = new Map<string, Promise<unknown>>();

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

export async function POST(request: NextRequest) {
  // Validate idempotency key
  const idempotencyKey = request.headers.get("idempotency-key");
  if (!idempotencyKey || !IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) {
    return NextResponse.json(
      { error: "Invalid or missing Idempotency-Key header" },
      { status: 400 },
    );
  }

  // Check for in-flight request with same key
  const existingRequest = inFlightRequests.get(idempotencyKey);
  if (existingRequest) {
    // Return the same promise result
    try {
      const result = await existingRequest;
      return NextResponse.json(result, { status: 200 });
    } catch {
      return NextResponse.json(
        { error: "REVIEW_FAILED" },
        { status: 500 },
      );
    }
  }

  // Parse and validate request body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const parsed = ReviewRequestSchema.safeParse(body);
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

  const { unit } = parsed.data;

  // Create and store the review promise
  const reviewPromise = reviewUnit(unit);
  inFlightRequests.set(idempotencyKey, reviewPromise);

  try {
    const result = await reviewPromise;
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    // Log error internally but don't expose details
    console.error("Review failed:", error);
    return NextResponse.json(
      { error: "REVIEW_FAILED" },
      { status: 500 },
    );
  } finally {
    // Clean up in-flight request
    inFlightRequests.delete(idempotencyKey);
  }
}
