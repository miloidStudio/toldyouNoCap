/** 首頁：輸入暱稱 → 開房或加入房間。從分享連結 /j/<房號> 進來時會自動帶入房號。 */

import { useEffect, useState } from 'react';
import { LIMITS } from '../../../shared/types';
import type { GameApi } from '../useGame';
import { Button, Card, Screen, SectionTitle } from '../components/ui';

// ===========================================================================
// 製作團隊與鳴謝資訊（你可以在此直接修改名字、角色、照片與感謝名單）
// 照片可放置於 client/public/（例如 /creator1.jpg）或直接貼上圖片網址
// ===========================================================================
export interface CreatorProfile {
  name: string;
  role: string;
  avatar: string;
}

export const CREATORS: CreatorProfile[] = [
  {
    name: 'Ethan Cheng',
    role: '遊戲企劃',
    avatar: '/creator1.jpg', // 可將照片存入 client/public/creator1.jpg
  },
  {
    name: 'junhanjunhanlin',
    role: '技術協作',
    avatar: '/creator2.jpg', // 可將照片存入 client/public/creator2.jpg
  },
];

export const SPECIAL_THANKS =
  '特別鳴謝：施 Tina ，以及所有陪伴測試的朋友們！還在優化中...';

function CreatorAvatar({
  src,
  alt,
  fallbackText,
}: {
  src: string;
  alt: string;
  fallbackText: string;
}) {
  const [hasError, setHasError] = useState(false);

  return (
    <div className="relative mb-2.5 flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-gradient-to-tr from-amber-500/25 via-sky-500/25 to-purple-500/25 shadow-lg ring-2 ring-amber-400/40">
      {!hasError && src ? (
        <img
          src={src}
          alt={alt}
          onError={() => setHasError(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-xl font-black text-amber-200">
          {fallbackText}
        </div>
      )}
    </div>
  );
}

export function HomeScreen({
  game,
  onOpenAdmin,
}: {
  game: GameApi;
  onOpenAdmin?: () => void;
}) {
  const [nickname, setNickname] = useState(game.name);
  const [code, setCode] = useState(game.pendingJoinCode ?? '');
  const fromLink = game.pendingJoinCode !== null;

  useEffect(() => {
    if (game.pendingJoinCode) setCode(game.pendingJoinCode);
  }, [game.pendingJoinCode]);

  const nameOk = nickname.trim().length > 0 && nickname.trim().length <= LIMITS.NAME_MAX_LENGTH;
  const codeOk = /^[A-Za-z0-9]{4,6}$/.test(code.trim());

  const inputClass =
    'w-full rounded-2xl bg-black/30 px-4 py-3.5 text-xl outline-none ring-1 ring-white/12 ' +
    'transition focus:ring-2 focus:ring-amber-400 placeholder:text-slate-600';

  return (
    <Screen>
      <header className="pt-8 pb-2 text-center">
        <h1 className="text-5xl font-black tracking-tight">
          No<span className="text-amber-300">Cap</span>
        </h1>
        <p className="mt-3 text-sm text-slate-400">NoCap · 面對面聚會用的話術推理遊戲</p>
      </header>

      <Card>
        <SectionTitle>你的暱稱</SectionTitle>
        <input
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          maxLength={LIMITS.NAME_MAX_LENGTH}
          placeholder="例如：阿明"
          className={inputClass}
        />
        <p className="mt-2 text-xs text-slate-500">最多 {LIMITS.NAME_MAX_LENGTH} 個字</p>
      </Card>

      {fromLink ? (
        <Card glow="brand">
          <SectionTitle>受邀加入</SectionTitle>
          <div className="tabular mb-5 text-center text-5xl font-black tracking-[0.28em] text-amber-300">
            {code}
          </div>
          <Button
            disabled={!nameOk || !codeOk || game.busy || !game.connected}
            onClick={() => game.joinRoom(code.trim(), nickname.trim())}
          >
            加入這個房間
          </Button>
          <Button
            variant="ghost"
            className="mt-2"
            onClick={() => {
              game.setPendingJoinCode(null);
              setCode('');
            }}
          >
            改成自己開房
          </Button>
        </Card>
      ) : (
        <>
          <Card>
            <SectionTitle>開一間新房</SectionTitle>
            <Button
              disabled={!nameOk || game.busy || !game.connected}
              onClick={() => game.createRoom(nickname.trim())}
            >
              建立房間
            </Button>
            <p className="mt-2.5 text-center text-xs text-slate-500">
              你會成為房主，可以設定輪數與思考時間
            </p>
          </Card>

          <Card>
            <SectionTitle>加入朋友的房間</SectionTitle>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
              maxLength={6}
              inputMode="text"
              autoCapitalize="characters"
              placeholder="房號"
              className={`${inputClass} tabular text-center text-3xl font-black tracking-[0.28em]`}
            />
            <Button
              variant="secondary"
              className="mt-3"
              disabled={!nameOk || !codeOk || game.busy || !game.connected}
              onClick={() => game.joinRoom(code.trim(), nickname.trim())}
            >
              加入房間
            </Button>
          </Card>
        </>
      )}

      {!game.connected && (
        <p className="text-center text-sm text-rose-300">連線中… 若持續失敗請確認後端是否啟動</p>
      )}

      <details className="glass rounded-3xl p-5 text-sm text-slate-300">
        <summary className="cursor-pointer font-bold text-slate-100">怎麼玩？</summary>
        <div className="mt-4 flex flex-col gap-2.5 leading-relaxed">
          <p>
            每輪一位<b className="text-sky-300">猜題者</b>、一位老實人，其餘都是瞎掰人。
          </p>
          <p>老實人拿到冷門詞彙的真實定義，瞎掰人只看得到詞彙跟三個提示關鍵字，必須臨場胡謅。</p>
          <p>猜題者按下「開始觀察」後大家想一下，接著自由發言、互相質詢，全程口頭進行。</p>
          <p>猜題者覺得聽夠了，就直接指認誰在說真話。</p>
          <p>猜對：猜題者 +2、老實人 +1。猜錯：被指到的瞎掰人 +2，其他人 0 分。</p>
          <p className="text-slate-500">這個網頁只負責發牌、計時、投票、計分，說話請面對面來。</p>
        </div>
      </details>

      {/* 製作團隊與特別鳴謝 */}
      <footer className="glass rounded-3xl p-5 text-center">
        <div className="mb-4 flex items-center justify-center gap-2 text-xs font-bold tracking-wider text-amber-300/90 uppercase">
          <span>✨</span>
          <span>Created By · 製作團隊</span>
          <span>✨</span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {CREATORS.map((c, idx) => (
            <div
              key={idx}
              className="flex flex-col items-center rounded-2xl bg-white/[0.04] p-3.5 ring-1 ring-white/10 transition hover:bg-white/[0.07]"
            >
              <CreatorAvatar
                src={c.avatar}
                alt={c.name}
                fallbackText={c.name.slice(0, 1) || '✨'}
              />
              <div className="text-sm font-bold text-slate-100">{c.name}</div>
              <div className="mt-0.5 text-xs text-slate-400">{c.role}</div>
            </div>
          ))}
        </div>

        {/* 感謝名單 Credit */}
        <div className="mt-4 rounded-2xl bg-white/[0.03] px-4 py-3 ring-1 ring-white/5">
          <p className="text-xs leading-relaxed text-slate-300 whitespace-pre-line">
            {SPECIAL_THANKS}
          </p>
        </div>
      </footer>
    </Screen>
  );
}
