/** 計分板：任何階段都可展開查看 */

import { useState } from 'react';
import type { PublicRoomState } from '../../../shared/types';
import { Card, SectionTitle } from './ui';

export function Scoreboard({
  room,
  meId,
  delta,
  alwaysOpen = false,
}: {
  room: PublicRoomState;
  meId: string | null;
  /** RESULT 階段可傳入該輪加分，顯示 +2 之類的標記 */
  delta?: Record<string, number> | null;
  alwaysOpen?: boolean;
}) {
  const [open, setOpen] = useState(alwaysOpen);
  const sorted = [...room.players].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  const top = sorted[0]?.score ?? 0;

  return (
    <Card>
      <button
        type="button"
        onClick={() => !alwaysOpen && setOpen((v) => !v)}
        className="flex w-full items-center justify-between"
        disabled={alwaysOpen}
      >
        <SectionTitle>計分板</SectionTitle>
        {!alwaysOpen && <span className="mb-3 text-xs text-slate-400">{open ? '收合 ▲' : '展開 ▼'}</span>}
      </button>

      {open && (
        <ul className="flex flex-col gap-1.5">
          {sorted.map((p, i) => {
            const d = delta?.[p.id] ?? 0;
            const ratio = top > 0 ? p.score / top : 0;
            return (
              <li
                key={p.id}
                className={`relative flex items-center gap-3 overflow-hidden rounded-xl px-3 py-2.5 ring-1
                  ${p.id === meId ? 'ring-amber-400/35' : 'ring-white/6'}`}
              >
                {/* 分數長條當背景，一眼看出差距 */}
                <div
                  className="absolute inset-y-0 left-0 bg-amber-400/12"
                  style={{ width: `${ratio * 100}%` }}
                  aria-hidden
                />
                <span className="relative w-5 text-center text-xs font-bold text-slate-400">
                  {i + 1}
                </span>
                <span className="relative flex-1 truncate font-bold">
                  {p.name}
                  {p.isHost && <span className="ml-1.5 text-[0.65rem] text-amber-300">房主</span>}
                  {!p.connected && <span className="ml-1.5 text-[0.65rem] text-rose-300">離線</span>}
                </span>
                {d > 0 && (
                  <span className="relative text-sm font-black text-emerald-300">+{d}</span>
                )}
                <span className="tabular relative w-9 text-right text-xl font-black">
                  {p.score}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
