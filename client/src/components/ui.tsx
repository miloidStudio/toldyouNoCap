/** 共用的小型 UI 元件，統一按鈕尺寸與觸控區域（單手操作友善） */

import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'guess' | 'secondary' | 'ghost' | 'danger';

const VARIANT_CLASS: Record<Variant, string> = {
  primary:
    'bg-gradient-to-b from-[#fbbf24] to-[#f09409] text-[#2a1a02] shadow-[0_10px_28px_-12px_rgba(245,158,11,0.85)] active:translate-y-px',
  guess:
    'bg-gradient-to-b from-[#38bdf8] to-[#0284c7] text-[#03202f] shadow-[0_10px_28px_-12px_rgba(56,189,248,0.85)] active:translate-y-px',
  secondary: 'bg-white/8 text-slate-100 ring-1 ring-white/12 hover:bg-white/12',
  ghost: 'bg-transparent text-slate-300 ring-1 ring-white/12 hover:bg-white/6',
  danger: 'bg-rose-600/90 text-white hover:bg-rose-500 active:translate-y-px',
};

export function Button({
  variant = 'primary',
  className = '',
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      {...rest}
      className={`min-h-[54px] w-full rounded-2xl px-5 text-lg font-bold tracking-wide
        transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-35
        disabled:shadow-none ${VARIANT_CLASS[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

export function Card({
  children,
  className = '',
  glow,
}: {
  children: ReactNode;
  className?: string;
  /** 需要強調的卡片可以加一圈色暈 */
  glow?: 'brand' | 'guess' | 'good' | 'bad';
}) {
  const glowClass =
    glow === 'brand'
      ? 'ring-1 ring-amber-400/40'
      : glow === 'guess'
        ? 'ring-1 ring-sky-400/40'
        : glow === 'good'
          ? 'ring-1 ring-emerald-400/40'
          : glow === 'bad'
            ? 'ring-1 ring-rose-400/40'
            : '';
  return <div className={`glass rise rounded-3xl p-5 ${glowClass} ${className}`}>{children}</div>;
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="eyebrow">{children}</h2>
      {right}
    </div>
  );
}

export function Screen({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-full w-full max-w-md flex-col gap-4 px-4 pt-5 pb-12">
      {children}
    </div>
  );
}

/** 標示目前進度的小膠囊，例如「第 2 / 6 輪」 */
export function Pill({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'brand' | 'guess';
}) {
  const toneClass =
    tone === 'brand'
      ? 'bg-amber-400/15 text-amber-200 ring-amber-400/30'
      : tone === 'guess'
        ? 'bg-sky-400/15 text-sky-200 ring-sky-400/30'
        : 'bg-white/6 text-slate-300 ring-white/10';
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold ring-1 ${toneClass}`}
    >
      {children}
    </span>
  );
}
