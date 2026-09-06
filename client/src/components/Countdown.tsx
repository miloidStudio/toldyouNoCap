/** 大字倒數計時器。以伺服器給的結束時間戳為準，本機每 200ms 重算，避免各裝置不同步。 */

import { useEffect, useState } from 'react';

export function useRemainingSeconds(endsAt: number | null): number | null {
  const [remaining, setRemaining] = useState<number | null>(() => calc(endsAt));

  useEffect(() => {
    setRemaining(calc(endsAt));
    if (endsAt === null) return;
    const timer = setInterval(() => setRemaining(calc(endsAt)), 200);
    return () => clearInterval(timer);
  }, [endsAt]);

  return remaining;
}

function calc(endsAt: number | null): number | null {
  if (endsAt === null) return null;
  return Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
}

export function Countdown({ endsAt, total }: { endsAt: number | null; total?: number }) {
  const remaining = useRemainingSeconds(endsAt);
  if (remaining === null) return null;

  const ratio = total && total > 0 ? Math.min(1, remaining / total) : null;
  const urgent = remaining <= 5;

  return (
    <div className="flex flex-col items-center gap-3">
      <div
        className={`tabular text-[5.5rem] font-black leading-none tracking-tight transition-colors ${
          urgent ? 'text-rose-400' : 'text-amber-300'
        }`}
      >
        {remaining}
      </div>
      {ratio !== null && (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/8">
          <div
            className={`h-full rounded-full transition-[width] duration-200 ease-linear ${
              urgent ? 'bg-rose-400' : 'bg-amber-400'
            }`}
            style={{ width: `${ratio * 100}%` }}
          />
        </div>
      )}
    </div>
  );
}
