export type ReadingEdit = {
  operation: "equal" | "insert" | "delete" | "replace";
  expected: string;
  observed: string;
  expectedStart: number;
  expectedEnd: number;
};

/**
 * Align expected and observed readings using dynamic programming.
 * Returns a list of edits describing the differences.
 */
export function alignReadings(
  expected: string,
  observed: string,
): ReadingEdit[] {
  const n = expected.length;
  const m = observed.length;

  // Create DP table
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    Array(m + 1).fill(0),
  );

  // Initialize base cases
  for (let i = 0; i <= n; i++) dp[i][0] = i;
  for (let j = 0; j <= m; j++) dp[0][j] = j;

  // Fill DP table
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (expected[i - 1] === observed[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1, // delete
          dp[i][j - 1] + 1, // insert
          dp[i - 1][j - 1] + 1, // replace
        );
      }
    }
  }

  // Backtrack to find edits
  const edits: ReadingEdit[] = [];
  let i = n;
  let j = m;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && expected[i - 1] === observed[j - 1]) {
      edits.unshift({
        operation: "equal",
        expected: expected[i - 1],
        observed: observed[j - 1],
        expectedStart: i - 1,
        expectedEnd: i,
      });
      i--;
      j--;
    } else if (
      i > 0 &&
      j > 0 &&
      dp[i][j] === dp[i - 1][j - 1] + 1
    ) {
      // Replace (prefer over adjacent delete/insert when costs tie)
      edits.unshift({
        operation: "replace",
        expected: expected[i - 1],
        observed: observed[j - 1],
        expectedStart: i - 1,
        expectedEnd: i,
      });
      i--;
      j--;
    } else if (i > 0 && dp[i][j] === dp[i - 1][j] + 1) {
      edits.unshift({
        operation: "delete",
        expected: expected[i - 1],
        observed: "",
        expectedStart: i - 1,
        expectedEnd: i,
      });
      i--;
    } else {
      edits.unshift({
        operation: "insert",
        expected: "",
        observed: observed[j - 1],
        expectedStart: i,
        expectedEnd: i,
      });
      j--;
    }
  }

  // Merge consecutive edits of the same operation type
  return mergeEdits(edits);
}

/**
 * Merge consecutive edits of the same operation type.
 */
function mergeEdits(edits: ReadingEdit[]): ReadingEdit[] {
  if (edits.length === 0) return [];

  const merged: ReadingEdit[] = [edits[0]];

  for (let i = 1; i < edits.length; i++) {
    const current = edits[i];
    const last = merged[merged.length - 1];

    if (current.operation === last.operation) {
      // Merge with previous
      last.expected += current.expected;
      last.observed += current.observed;
      last.expectedEnd = current.expectedEnd;
    } else {
      merged.push({ ...current });
    }
  }

  return merged;
}

/**
 * Check if there are any differences between expected and observed.
 */
export function hasDifferences(edits: ReadingEdit[]): boolean {
  return edits.some((edit) => edit.operation !== "equal");
}
