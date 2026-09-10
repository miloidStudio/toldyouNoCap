/**
 * 題目字卡：詞彙 + 三個提示關鍵字。
 *
 * 三個關鍵字裡只有一個真的和題目有關，另外兩個是從別的領域抓來的誘餌。
 * 這樣瞎掰人不會完全一頭霧水地亂講（可以挑一個方向去編），
 * 但也不會直接被告知答案的領域。猜題者同樣看得到，因為知道這三個詞
 * 並不會幫他判斷「誰在說真話」。
 */

import { Card } from './ui';

export function TermCard({ term, hints }: { term: string; hints: string[] }) {
  return (
    <Card className="text-center" glow="brand">
      <div className="eyebrow">本輪題目</div>
      <div className="mt-1 text-4xl font-black tracking-tight text-amber-300">{term}</div>

      {hints.length > 0 && (
        <>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            {hints.map((h) => (
              <span
                key={h}
                className="rounded-full bg-white/6 px-3 py-1.5 text-sm font-bold text-slate-200 ring-1 ring-white/12"
              >
                {h}
              </span>
            ))}
          </div>
          <p className="mt-3 text-xs leading-relaxed text-slate-500">
            小提示：通常三個領域提示裡只有一個是真的
          </p>
        </>
      )}
    </Card>
  );
}
