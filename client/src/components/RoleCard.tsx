/**
 * 身分卡：預設遮住內容，必須「按住查看、放開隱藏」。
 * 面對面遊玩時避免鄰座偷瞄，也避免手機隨手放桌上就洩底。
 *
 * 顏色上**不區分老實人與瞎掰人**——既然是按住才看得到內容，
 * 卡片外觀就不該洩漏任何身分線索。整個介面只有「猜題者 vs 其他玩家」有色差。
 */

import { useCallback, useState } from 'react';
import type { PrivateRoleInfo, Role, RoundPhase } from '../../../shared/types';

const ROLE_LABEL: Record<Role, string> = {
  GUESSER: '猜題者',
  HONEST: '老實人',
  BLUFFER: '瞎掰人',
};

const ROLE_HINT: Record<Role, string> = {
  GUESSER: '聽完所有人的解釋，最後指認誰才是老實人。你看不到正解。',
  HONEST: '你是老實人。猜題者按下「開始觀察」後會顯示真實定義，思考時記好它，發言時照事實講。',
  BLUFFER: '你沒有正解。臨場掰一套聽起來很合理的解釋，把猜題者帶偏。',
};

export function RoleCard({ info, phase }: { info: PrivateRoleInfo; phase: RoundPhase }) {
  const [revealed, setRevealed] = useState(false);
  const show = useCallback(() => setRevealed(true), []);
  const hide = useCallback(() => setRevealed(false), []);

  const isGuesser = info.role === 'GUESSER';
  const isHonest = info.role === 'HONEST';
  // 老實人在看身分卡階段還沒拿到定義（等猜題者按下開始觀察）
  const waitingForObservation = isHonest && !info.definition && phase === 'ROLE_ASSIGN';
  // 老實人的定義在進入討論後會被伺服器收回，避免有人對著螢幕照唸
  const definitionWithdrawn = isHonest && !info.definition && phase === 'DISCUSSION';

  return (
    <div
      // 觸控與滑鼠都支援；離開元件範圍也要立刻蓋回去
      onPointerDown={show}
      onPointerUp={hide}
      onPointerLeave={hide}
      onPointerCancel={hide}
      onContextMenu={(e) => e.preventDefault()}
      className={`glass relative cursor-pointer select-none rounded-3xl p-6 text-center transition
        ${isGuesser ? 'ring-1 ring-sky-400/45' : 'ring-1 ring-white/10'}
        ${revealed ? '' : 'pulse-ring'}`}
    >
      {revealed ? (
        <div className="flex flex-col gap-3">
          <div className="eyebrow">你的身分</div>
          <div className={`text-3xl font-black ${isGuesser ? 'text-sky-300' : 'text-slate-50'}`}>
            {ROLE_LABEL[info.role]}
          </div>

          <div className="rounded-2xl bg-black/30 p-4 ring-1 ring-white/8">
            <div className="eyebrow">題目</div>
            <div className="mt-1 text-2xl font-black text-amber-300">{info.term}</div>

            {info.definition && (
              <>
                <div className="eyebrow mt-4">真實定義</div>
                <p className="mt-1 text-left text-base leading-relaxed text-slate-100">
                  {info.definition}
                </p>
              </>
            )}
            {waitingForObservation && (
              <p className="mt-3 text-sm leading-relaxed text-amber-300/90">
                （真實定義將在猜題者按下「開始觀察」進入思考時間後揭曉）
              </p>
            )}
            {definitionWithdrawn && (
              <p className="mt-3 text-sm leading-relaxed text-slate-400">
                定義已經收起來了，接下來靠你自己記得的講——照著螢幕唸太容易被看穿。
              </p>
            )}
            {!info.definition && info.role === 'BLUFFER' && (
              <p className="mt-3 text-sm text-slate-400">（沒有正解，全靠你掰）</p>
            )}
            {!info.definition && isGuesser && (
              <p className="mt-3 text-sm text-slate-400">（你的裝置不會顯示答案）</p>
            )}
          </div>

          <p className="text-sm leading-relaxed text-slate-300">{ROLE_HINT[info.role]}</p>
        </div>
      ) : (
        <div className="flex min-h-[200px] flex-col items-center justify-center gap-3">
          <div className="text-5xl">🤫</div>
          <div className="text-xl font-black">按住這裡查看身分</div>
          <div className="text-sm text-slate-400">放開就會立刻蓋回去，小心鄰座偷看</div>
        </div>
      )}
    </div>
  );
}

export { ROLE_LABEL };
