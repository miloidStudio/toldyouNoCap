/** 畫面上方的短暫提示訊息 */

import type { ToastMessage } from '../useGame';

export function Toasts({ toasts }: { toasts: ToastMessage[] }) {
  if (toasts.length === 0) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-50 flex flex-col items-center gap-2 px-4">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`w-full max-w-md rounded-2xl px-4 py-3 text-center text-sm font-bold shadow-lg ${
            t.kind === 'error' ? 'bg-rose-600 text-white' : 'bg-slate-100 text-slate-900'
          }`}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
