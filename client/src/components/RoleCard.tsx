/**
 * 身分卡：預設遮住內容，必須「按住查看、放開隱藏」。
 * 支援按住時上下滑動滾動閱讀定義，手指放開時自動遮蔽。
 */

import { useEffect, useState } from 'react';
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

  // 電腦版允許游標離開原卡片去操作閱讀層；放開滑鼠或視窗失焦才遮回。
  // 這樣長定義可以在按住期間用滾輪閱讀，不會因 mouseleave 提前關閉。
  const handleMouseDown = () => setRevealed(true);

  useEffect(() => {
    if (!revealed) return;

    const hide = () => setRevealed(false);
    window.addEventListener('mouseup', hide);
    window.addEventListener('blur', hide);
    return () => {
      window.removeEventListener('mouseup', hide);
      window.removeEventListener('blur', hide);
    };
  }, [revealed]);

  // 觸控操作 (Mobile) - 手指按住時上下滑動不會被中斷，放開時才隱藏
  const handleTouchStart = () => setRevealed(true);
  const handleTouchEnd = () => setRevealed(false);

  return (
    <div
      onMouseDown={handleMouseDown}
      onMouseUp={() => setRevealed(false)}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      onContextMenu={(e) => e.preventDefault()}
      style={{
        WebkitTouchCallout: 'none',
        WebkitUserSelect: 'none',
        userSelect: 'none',
      }}
      className={`glass relative min-h-[200px] w-full min-w-0 cursor-pointer select-none rounded-3xl p-6 text-center transition-colors duration-150
        ${isGuesser ? 'ring-1 ring-sky-400/45' : 'ring-1 ring-white/10'}
        ${revealed ? 'bg-black/40' : 'pulse-ring'}`}
    >
      {revealed ? (
        <div className="min-w-0">
          <div>
            <div className="eyebrow">你的身分</div>
            <div className={`mt-1 text-3xl font-black ${isGuesser ? 'text-sky-300' : 'text-slate-50'}`}>
              {ROLE_LABEL[info.role]}
            </div>
          </div>

          <div className="mt-4 min-w-0 rounded-2xl bg-black/30 p-4 text-left ring-1 ring-white/10">
            {info.definition && (
              <div>
                <div className="flex flex-wrap items-center justify-between gap-1">
                  <span className="eyebrow">真實定義</span>
                  <span className="text-[11px] text-amber-300/80">僅思考階段可見</span>
                </div>
                <div className="mt-2 break-words text-base leading-relaxed text-slate-100">
                  {info.definition}
                </div>
              </div>
            )}

            {waitingForObservation && (
              <p className="text-sm leading-relaxed text-amber-300/90">
                真實定義將在猜題者按下「開始觀察」進入思考時間後揭曉。
              </p>
            )}
            {definitionWithdrawn && (
              <p className="text-sm leading-relaxed text-slate-400">
                定義已經收起來了，接下來靠你自己記得的講。照著螢幕唸太容易被看穿。
              </p>
            )}
            {!info.definition && info.role === 'BLUFFER' && (
              <p className="text-sm text-slate-400">沒有正解，全靠你掰。</p>
            )}
            {!info.definition && isGuesser && (
              <p className="text-sm text-slate-400">你的裝置不會顯示答案。</p>
            )}

          </div>

          <p className="mt-4 text-sm leading-relaxed text-slate-300">{ROLE_HINT[info.role]}</p>
          {info.definition && <p className="mt-2 text-xs text-slate-500">按住不放，可捲動頁面閱讀</p>}
        </div>
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-3">
          <div className="text-5xl">🤫</div>
          <div className="text-xl font-black">按住這裡查看身分</div>
          <div className="text-sm text-slate-400">放開就會立刻蓋回去，小心鄰座偷看</div>
        </div>
      )}
    </div>
  );
}

export { ROLE_LABEL };
