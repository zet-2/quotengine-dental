/**
 * Turn a point implant estimate into an indicative range (~±30%). Exact implant
 * count from a flat 2D panoramic is inherently uncertain (real planning uses CBCT),
 * so the patient-facing estimate is a range, not a false-precision single number.
 */
export interface CountRange {
  readonly low: number;
  readonly high: number;
}

const MAX_DENTAL_UNITS = 32;

export function implantCountRange(point: number): CountRange {
  if (point <= 0) return { low: 0, high: 0 };
  const boundedPoint = Math.min(MAX_DENTAL_UNITS, point);
  const low = Math.max(1, Math.round(boundedPoint * 0.7));
  const high = Math.min(
    MAX_DENTAL_UNITS,
    Math.max(low, Math.round(boundedPoint * 1.3)),
  );
  return { low, high };
}
