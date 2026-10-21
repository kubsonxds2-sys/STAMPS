export interface StampProgress {
  current: number;
  total: number;
  remaining: number;
  label: string;
  complete: boolean;
}

export function getStampProgress(stamps: number, totalStamps: number): StampProgress {
  const total = Number.isFinite(totalStamps) ? Math.max(1, Math.trunc(totalStamps)) : 1;
  const current = Number.isFinite(stamps)
    ? Math.min(total, Math.max(0, Math.trunc(stamps)))
    : 0;

  return {
    current,
    total,
    remaining: total - current,
    label: `${current}/${total}`,
    complete: current === total,
  };
}
