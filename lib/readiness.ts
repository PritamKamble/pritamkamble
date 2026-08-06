import { todayUtcDateString } from "@/lib/formatDate";

export type ReadinessResult = {
  score: number;
  consistencyPct: number | null;
  mockAvg: number | null;
};

/**
 * 50/50 blend of daily-log consistency (days logged / days since first log)
 * and average completed mock-interview score. Missing inputs count as 0,
 * not "N/A" - the score is meant to nudge action, not hide behind gaps.
 */
export function computeReadinessScore(
  logCount: number,
  firstLogDate: string | null,
  completedInterviewScores: number[],
): ReadinessResult {
  let consistencyPct: number | null = null;
  if (firstLogDate) {
    const start = new Date(firstLogDate + "T00:00:00Z");
    const today = new Date(todayUtcDateString() + "T00:00:00Z");
    const totalDays =
      Math.floor((today.getTime() - start.getTime()) / 86400000) + 1;
    consistencyPct = totalDays > 0 ? Math.min(100, (logCount / totalDays) * 100) : 0;
  }

  let mockAvg: number | null = null;
  if (completedInterviewScores.length > 0) {
    mockAvg =
      completedInterviewScores.reduce((a, b) => a + b, 0) /
      completedInterviewScores.length;
  }

  const consistencyVal = consistencyPct ?? 0;
  const mockPct = mockAvg != null ? (mockAvg / 10) * 100 : 0;
  const score = Math.round((consistencyVal + mockPct) / 2);

  return { score, consistencyPct, mockAvg };
}
