import { useEffect } from 'react';

export interface TauntNotice {
  guesserName: string;
  id: number;
}

export function TauntOverlay({
  taunt,
  onDismiss,
}: {
  taunt: TauntNotice | null;
  onDismiss: () => void;
}) {
  useEffect(() => {
    if (!taunt) return;

    const timer = setTimeout(() => {
      onDismiss();
    }, 2000);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss();
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [taunt?.id, onDismiss]);

  if (!taunt) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="騙肖仔！通知"
      onClick={onDismiss}
      className="fixed inset-0 z-50 flex cursor-pointer select-none flex-col items-center justify-center bg-black/80 p-6 backdrop-blur-md transition-all animate-in fade-in duration-150"
    >
      <div className="flex max-w-sm flex-col items-center text-center">
        <div className="mb-2 text-6xl animate-bounce">🫵</div>

        <div className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/20 px-4 py-1.5 text-sm font-bold text-rose-300 ring-1 ring-rose-500/40">
          <span>📢</span>
          <span>猜題者「{taunt.guesserName}」對你大喊</span>
        </div>

        <div className="my-6 transform text-6xl font-black tracking-wider text-rose-400 drop-shadow-[0_0_35px_rgba(244,63,94,0.8)] transition sm:text-8xl active:scale-95">
          騙肖仔！
        </div>

        <p className="text-xs font-medium tracking-wide text-slate-400">
          點擊螢幕任何地方或 2 秒後自動關閉
        </p>
      </div>
    </div>
  );
}
