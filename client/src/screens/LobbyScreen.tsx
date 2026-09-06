/** Lobby：等待玩家、房主設定、開局 */

import { useEffect, useState } from 'react';
import { LIMITS } from '../../../shared/types';
import type { GameApi } from '../useGame';
import { JoinQr } from '../components/JoinQr';
import { Button, Card, Pill, Screen, SectionTitle } from '../components/ui';

export function LobbyScreen({ game }: { game: GameApi }) {
  const room = game.room!;
  const me = game.me!;
  const { settings } = room;
  const enough = room.players.length >= LIMITS.MIN_PLAYERS;
  const playerCount = Math.max(1, room.players.length);
  const maxRounds = Math.min(LIMITS.ROUNDS_MAX, Math.max(1, Math.floor(room.deckSize / playerCount)));
  const totalQuestions = settings.totalRounds * room.players.length;
  const enoughQuestions = room.players.length === 0 || totalQuestions <= room.deckSize;

  // 輪數輸入用本機狀態，避免每敲一個字就送一次設定
  const [roundsDraft, setRoundsDraft] = useState(String(settings.totalRounds));
  useEffect(() => setRoundsDraft(String(settings.totalRounds)), [settings.totalRounds]);

  const commitRounds = (value: number) => {
    const clamped = Math.min(maxRounds, Math.max(LIMITS.ROUNDS_MIN, Math.round(value)));
    setRoundsDraft(String(clamped));
    if (clamped !== settings.totalRounds) game.updateSettings({ totalRounds: clamped });
  };

  return (
    <Screen>
      <header className="flex items-center justify-between pt-2">
        <div>
          <h1 className="text-2xl font-black">等待開始</h1>
          <p className="mt-1 text-sm text-slate-400">房號 {room.code}</p>
        </div>
        <button
          onClick={game.leaveRoom}
          className="rounded-xl px-3 py-2 text-sm text-slate-300 ring-1 ring-white/12"
        >
          離開
        </button>
      </header>

      <JoinQr game={game} />

      <Card>
        <SectionTitle right={<Pill>{room.players.length} 人</Pill>}>玩家</SectionTitle>
        <ul className="flex flex-col gap-1.5">
          {room.players.map((p) => (
            <li
              key={p.id}
              className={`flex items-center gap-3 rounded-xl px-3 py-3 ring-1 ${
                p.id === me.id ? 'ring-amber-400/35' : 'ring-white/6'
              }`}
            >
              <span className="flex-1 truncate font-bold">
                {p.name}
                {p.id === me.id && <span className="ml-1.5 text-xs text-slate-400">（你）</span>}
                {p.isHost && <span className="ml-1.5 text-[0.65rem] text-amber-300">房主</span>}
                {!p.connected && <span className="ml-1.5 text-[0.65rem] text-rose-300">離線</span>}
              </span>
              {game.isHost && p.id !== me.id && (
                <button
                  onClick={() => game.kickPlayer(p.id)}
                  className="rounded-lg px-2 py-1 text-xs text-rose-300 ring-1 ring-rose-500/40"
                >
                  踢除
                </button>
              )}
            </li>
          ))}
        </ul>
        {!enough && (
          <p className="mt-3 text-center text-sm text-rose-300">
            至少要 {LIMITS.MIN_PLAYERS} 人才能開始（還差 {LIMITS.MIN_PLAYERS - room.players.length}{' '}
            人）
          </p>
        )}
      </Card>

      {game.isHost ? (
        <Card>
          <SectionTitle>房主設定</SectionTitle>

          <label className="mb-1 block text-sm font-bold text-slate-300">這場要打幾輪</label>
          <p className="mb-2 text-xs text-slate-400 leading-relaxed">
            一輪代表每位玩家各當一次猜題者（目前 {room.players.length} 人，一輪共 {room.players.length} 場猜題）。
          </p>
          <div className="mb-2 flex items-stretch gap-2">
            <button
              onClick={() => commitRounds(settings.totalRounds - 1)}
              disabled={settings.totalRounds <= LIMITS.ROUNDS_MIN}
              className="w-14 rounded-2xl text-2xl font-black text-slate-200 ring-1 ring-white/12 disabled:opacity-30"
            >
              −
            </button>
            <input
              type="number"
              inputMode="numeric"
              min={LIMITS.ROUNDS_MIN}
              max={maxRounds}
              value={roundsDraft}
              onChange={(e) => setRoundsDraft(e.target.value)}
              onBlur={() => commitRounds(Number(roundsDraft) || settings.totalRounds)}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
              className="tabular flex-1 rounded-2xl bg-black/30 px-4 py-3 text-center text-3xl
                font-black outline-none ring-1 ring-white/12 focus:ring-2 focus:ring-amber-400
                [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
            />
            <button
              onClick={() => commitRounds(settings.totalRounds + 1)}
              disabled={settings.totalRounds >= maxRounds}
              className="w-14 rounded-2xl text-2xl font-black text-slate-200 ring-1 ring-white/12 disabled:opacity-30"
            >
              +
            </button>
          </div>
          <div className="mb-1 flex gap-2">
            {[1, 2, 3]
              .filter((n) => n <= maxRounds)
              .map((n) => (
                <button
                  key={n}
                  onClick={() => commitRounds(n)}
                  className={`flex-1 rounded-xl py-2 text-sm font-bold ring-1 transition ${
                    settings.totalRounds === n
                      ? 'bg-amber-400/20 text-amber-200 ring-amber-400/40'
                      : 'text-slate-300 ring-white/10 hover:bg-white/5'
                  }`}
                >
                  {n} 輪
                </button>
              ))}
          </div>
          <p className="mb-5 text-xs text-slate-500">
            全場共 {totalQuestions} 場猜題 · 每人當猜題者 {settings.totalRounds} 次 · 題庫上限 {maxRounds} 輪
          </p>

          <label className="mb-1 block text-sm text-slate-300">
            思考秒數：<b className="text-amber-300">{settings.thinkingSeconds} 秒</b>
          </label>
          <input
            type="range"
            min={LIMITS.THINKING_MIN}
            max={LIMITS.THINKING_MAX}
            step={5}
            value={settings.thinkingSeconds}
            onChange={(e) => game.updateSettings({ thinkingSeconds: Number(e.target.value) })}
            className="w-full accent-amber-400"
          />
          <p className="mt-2 text-xs leading-relaxed text-slate-500">
            倒數結束後直接進入自由討論，之後全程由猜題者主持，不再計時。
          </p>
        </Card>
      ) : (
        <Card>
          <SectionTitle>本場設定</SectionTitle>
          <ul className="flex flex-col gap-1.5 text-sm text-slate-300">
            <li>
              共 {settings.totalRounds} 輪（每人當猜題者 {settings.totalRounds} 次，全場共 {totalQuestions} 場）
            </li>
            <li>思考 {settings.thinkingSeconds} 秒，之後自由討論不計時</li>
            <li>題目不分類，抽到什麼算什麼</li>
          </ul>
          <p className="mt-4 text-center text-sm text-slate-400">等房主按下開始…</p>
        </Card>
      )}

      {game.isHost && (
        <div className="sticky bottom-3">
          {!enoughQuestions && (
            <p className="mb-2 text-center text-sm text-rose-300">
              題庫只有 {room.deckSize} 題，不夠進行 {settings.totalRounds} 輪（共需 {totalQuestions} 題）
            </p>
          )}
          <Button disabled={!enough || !enoughQuestions || game.busy} onClick={game.startGame}>
            開始遊戲（{settings.totalRounds} 輪，共 {totalQuestions} 場）
          </Button>
        </div>
      )}
    </Screen>
  );
}
