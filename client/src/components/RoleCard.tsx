/**
 * 身分卡：預設遮住內容，必須「按住查看、放開隱藏」。
 * 支援按住時上下滑動滾動閱讀定義，手指放開時自動遮蔽。
 */

import { useState } from 'react';
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

  const isGuesser = info.role === 'GUESSER';
  const isHonest = info.role === 'HONEST';
  // 老實人在看身分卡階段還沒拿到定義（等猜題者按下開始觀察）
  const waitingForObservation = isHonest && !info.definition && phase === 'ROLE_ASSIGN';
  // 老實人的定義在進入討論後會被伺服器收回，避免有人對著螢幕照唸
  const definitionWithdrawn = isHonest && !info.definition && phase === 'DISCUSSION';

  // 滑鼠操作 (Desktop)
  const handleMouseDown = () => setRevealed(true);
  const handleMouseUp = () => setRevealed(false);
  const handleMouseLeave = () => setRevealed(false);

  // 觸控操作 (Mobile) - 手指按住時上下滑動不會被中斷，放開時才隱藏
  const handleTouchStart = () => setRevealed(true);
  const handleTouchEnd = () => setRevealed(false);

  return (
    <div
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onContextMenu={(e) => e.preventDefault()}
      style={{
        WebkitTouchCallout: 'none',
        WebkitUserSelect: 'none',
        userSelect: 'none',
      }}
      className={`glass relative min-h-[200px] cursor-pointer select-none rounded-3xl p-6 text-center transition-all duration-150
        ${isGuesser ? 'ring-1 ring-sky-400/45' : 'ring-1 ring-white/10'}
        ${revealed ? 'bg-black/40' : 'pulse-ring'}`}
    >
      {revealed ? (
        <div className="flex flex-col gap-3 pt-1">
          <div className="eyebrow">你的身分</div>
          <div className={`text-3xl font-black ${isGuesser ? 'text-sky-300' : 'text-slate-50'}`}>
            {ROLE_LABEL[info.role]}
          </div>

          <div className="rounded-2xl bg-black/30 p-4 ring-1 ring-white/8">
            <div className="eyebrow">題目</div>
            <div className="mt-1 text-2xl font-black text-amber-300">{info.term}</div>

            {info.definition && (
              <div className="mt-4 border-t border-white/10 pt-3 text-left">
                <div className="flex items-center justify-between">
                  <span className="eyebrow">真實定義</span>
                  <span className="text-[11px] text-amber-300/80">（僅思考階段可見）</span>
                </div>
                {/* 支援內部平滑捲動，按住滑動時不會關閉卡片 */}
                <div className="mt-1.5 max-h-56 overflow-y-auto overscroll-contain rounded-xl bg-black/40 p-3.5 text-base leading-relaxed text-slate-100 ring-1 ring-white/10 touch-pan-y">
                  {info.definition}
                </div>
              </div>
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
        <div className="flex min-h-[160px] flex-col items-center justify-center gap-3">
          <div className="text-5xl">🤫</div>
          <div className="text-xl font-black">按住這裡查看身分</div>
          <div className="text-sm text-slate-400">放開就會立刻蓋回去，小心鄰座偷看</div>
        </div>
      )}
    </div>
  );
}

export { ROLE_LABEL };
