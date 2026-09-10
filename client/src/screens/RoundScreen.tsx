/** 遊戲進行中：依階段切換畫面內容 */

import { useEffect, useState } from 'react';
import type { RoundPhase } from '../../../shared/types';
import type { GameApi } from '../useGame';
import { Countdown } from '../components/Countdown';
import { RoleCard, ROLE_LABEL } from '../components/RoleCard';
import { Scoreboard } from '../components/Scoreboard';
import { TermCard } from '../components/TermCard';
import { Button, Card, Pill, Screen, SectionTitle } from '../components/ui';

const PHASE_LABEL: Record<RoundPhase, string> = {
  ROLE_ASSIGN: '看身分卡',
  THINKING: '思考中',
  DISCUSSION: '自由討論',
  RESULT: '本輪結果',
};

export function RoundScreen({ game }: { game: GameApi }) {
  const room = game.room!;
  const me = game.me!;
  const round = room.round!;
  const guesserName = room.players.find((p) => p.id === round.guesserId)?.name ?? '（已離開）';

  const currentCycle = Math.floor((round.roundIndex - 1) / Math.max(1, room.players.length)) + 1;

  return (
    <Screen>
      <header className="pt-2">
        <div>
          <div className="flex items-center gap-2">
            <Pill tone="brand">
              第 {currentCycle} / {room.totalRounds} 輪（第 {round.roundIndex} / {room.totalQuestions} 場）
            </Pill>
            <Pill>{room.code}</Pill>
          </div>
          <h1 className="mt-2 text-2xl font-black text-amber-300">{PHASE_LABEL[round.phase]}</h1>
        </div>
      </header>

      {round.phase === 'ROLE_ASSIGN' && <RoleAssign game={game} guesserName={guesserName} />}
      {round.phase === 'THINKING' && <Thinking game={game} />}
      {round.phase === 'DISCUSSION' && <Discussion game={game} guesserName={guesserName} />}
      {round.phase === 'RESULT' && <Result game={game} />}

      {round.phase !== 'RESULT' && <Scoreboard room={room} meId={me.id} />}

      {game.isHost && <HostControls game={game} />}
    </Screen>
  );
}

// ---------------------------------------------------------------------------

function SynchronizedRoleCard({ game }: { game: GameApi }) {
  const round = game.room?.round;
  const isSync = !!game.privateRole && !!round && game.privateRole.roundIndex === round.roundIndex;

  if (isSync) {
    return <RoleCard info={game.privateRole!} phase={round.phase} />;
  }

  return (
    <div className="glass flex min-h-[160px] flex-col items-center justify-center gap-3 rounded-3xl p-6 text-center text-sm text-slate-400">
      <div className="pulse-ring text-3xl">🃏</div>
      <span className="font-bold text-slate-200">身分卡同步中…</span>
      <button
        type="button"
        onClick={() => game.syncRole()}
        className="mt-1 rounded-xl bg-white/10 px-3.5 py-1.5 text-xs font-semibold text-amber-300 ring-1 ring-white/15 transition hover:bg-white/20 active:translate-y-px"
      >
        點此重新同步身分
      </button>
    </div>
  );
}

function WaitingForGuesser({ guesserName, text }: { guesserName: string; text: string }) {
  return (
    <Card className="text-center" glow="guess">
      <div className="eyebrow">本輪的猜題者</div>
      <div className="mt-1.5 text-2xl font-black text-sky-300">{guesserName}</div>
    </Card>
  );
}

function RoleAssign({ game, guesserName }: { game: GameApi; guesserName: string }) {
  const round = game.room!.round!;
  return (
    <>
      {game.isGuesser ? (
        <Card glow="guess">
          <SectionTitle>你是猜題者</SectionTitle>
          <p className="text-sm leading-relaxed text-slate-300">
            請等待全體玩家按住查看各自的身分卡，確認大家都看好後，按下方按鈕開始觀察。
          </p>
        </Card>
      ) : (
        <WaitingForGuesser
          guesserName={guesserName}
          text="等他按下「開始觀察」就會開始倒數。趁現在先按住下方看好自己的身分卡。"
        />
      )}

      <TermCard term={round.term} hints={round.hints} />

      <SynchronizedRoleCard game={game} />

      {game.isGuesser && (
        <div className="flex flex-col gap-2.5">
          <Button variant="guess" disabled={game.busy} onClick={game.advancePhase}>
            開始觀察（倒數 {game.room!.settings.thinkingSeconds} 秒）
          </Button>
          <Button
            variant="ghost"
            disabled={game.busy}
            onClick={game.rerollQuestion}
            className="min-h-[46px] border border-amber-400/30 text-base font-semibold text-amber-300 hover:bg-amber-400/10 hover:text-amber-200"
          >
            🎲 重抽一題（若這題有人知道）
          </Button>
        </div>
      )}
    </>
  );
}

function Thinking({ game }: { game: GameApi }) {
  const room = game.room!;
  const round = room.round!;
  return (
    <>
      <Card glow="brand">
        <Countdown endsAt={round.phaseEndsAt} total={room.settings.thinkingSeconds} />
        <p className="mt-4 text-center text-sm leading-relaxed text-slate-400">
          想好你要怎麼解釋這個詞。時間到就直接進入自由討論。
        </p>
      </Card>

      <TermCard term={round.term} hints={round.hints} />
      <SynchronizedRoleCard game={game} />

      {game.isGuesser && (
        <Button variant="secondary" disabled={game.busy} onClick={game.advancePhase}>
          大家都想好了，直接開始討論
        </Button>
      )}
    </>
  );
}

function Discussion({ game, guesserName }: { game: GameApi; guesserName: string }) {
  const room = game.room!;
  const round = room.round!;
  const [selected, setSelected] = useState<string | null>(null);
  const candidates = room.players.filter((p) => p.id !== round.guesserId);

  // 換一輪就把選擇清掉，避免沿用上一輪的點選
  useEffect(() => setSelected(null), [round.roundIndex]);

  return (
    <>
      {game.isGuesser ? (
        <Card glow="guess">
          <SectionTitle>你來主持</SectionTitle>
          <p className="text-sm leading-relaxed text-slate-300">
            挑一個玩家開始依序解釋這個詞，儘量追問與質問吧。
            聽夠了就來指認到底誰是<b className="text-slate-100"> 老實人 </b>而誰又在<b className="text-slate-100"> 騙肖仔！</b>。
          </p>
        </Card>
      ) : (
        <WaitingForGuesser
          guesserName={guesserName}
          text="由他主持這一輪。輪到你就開口解釋，他問到你就回答。"
        />
      )}

      <TermCard term={round.term} hints={round.hints} />

      {game.isGuesser && (
        <Card>
          <SectionTitle>誰才是老實人？</SectionTitle>
          <ul className="flex flex-col gap-2">
            {candidates.map((p) => (
              <li key={p.id}>
                <button
                  onClick={() => setSelected((cur) => (cur === p.id ? null : p.id))}
                  className={`w-full rounded-2xl px-4 py-4 text-left text-lg font-bold transition ${selected === p.id
                    ? 'bg-sky-400/20 text-sky-100 ring-2 ring-sky-400/60'
                    : 'text-slate-100 ring-1 ring-white/10'
                    }`}
                >
                  {p.name}
                  {!p.connected && <span className="ml-2 text-xs text-rose-300">離線</span>}
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-slate-500">點一下選取、再點一下取消。確定後才會送出。</p>
        </Card>
      )}

      {!game.isGuesser && <SynchronizedRoleCard game={game} />}

      {game.isGuesser && (
        <div className="sticky bottom-3">
          {selected ? (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => game.taunt(selected)}
                className="flex-none rounded-2xl bg-rose-600/90 px-4 py-3.5 text-base font-black text-white shadow-lg shadow-rose-900/40 ring-1 ring-rose-400/50 transition hover:bg-rose-500 active:scale-95"
              >
                📢 騙肖仔！
              </button>
              <Button
                variant="guess"
                className="flex-1"
                disabled={game.busy}
                onClick={() => selected && game.vote(selected)}
              >
                確定指認：{candidates.find((p) => p.id === selected)?.name}
              </Button>
            </div>
          ) : (
            <Button variant="guess" disabled>
              先選一位玩家
            </Button>
          )}
        </div>
      )}
    </>
  );
}

function Result({ game }: { game: GameApi }) {
  const room = game.room!;
  const round = room.round!;
  const me = game.me!;
  const reveal = round.reveal!;
  const name = (id: string | null) =>
    id ? (room.players.find((p) => p.id === id)?.name ?? '（已離開）') : '（未投票）';
  const myDelta = reveal.scoreDelta[me.id] ?? 0;
  const isLastRound = room.roundsPlayed + 1 >= room.totalQuestions;
  const canAdvance = game.isGuesser || game.isHost;

  return (
    <>
      <Card glow={reveal.correct ? 'good' : 'bad'}>
        <div className="text-center">
          <div className="text-6xl">{reveal.correct ? '🎯' : reveal.vote ? '🤥' : '⏹️'}</div>
          <div className="mt-2 text-2xl font-black">
            {reveal.correct ? '猜對了！' : reveal.vote ? '被騙了！' : '沒有投票'}
          </div>
          <p className="mt-3 text-sm text-slate-300">
            {name(round.guesserId)} 指認了 <b className="text-amber-200">{name(reveal.vote)}</b>
          </p>
          <p className="mt-1 text-sm text-slate-300">
            真正的老實人是 <b className="text-emerald-300">{name(reveal.honestId)}</b>
          </p>
          {myDelta > 0 && (
            <div className="mt-4 inline-block rounded-full bg-emerald-400/15 px-4 py-1.5 text-lg font-black text-emerald-300 ring-1 ring-emerald-400/30">
              你這輪 +{myDelta} 分
            </div>
          )}
        </div>
      </Card>

      <Card>
        <SectionTitle>正解</SectionTitle>
        <div className="text-2xl font-black text-amber-300">{round.term}</div>
        <p className="mt-2 leading-relaxed text-slate-100">{reveal.definition}</p>
      </Card>

      <Card>
        <SectionTitle>本輪身分</SectionTitle>
        <ul className="flex flex-col gap-1.5 text-sm">
          {room.players.map((p) => {
            const role =
              p.id === round.guesserId
                ? 'GUESSER'
                : p.id === reveal.honestId
                  ? 'HONEST'
                  : 'BLUFFER';
            const d = reveal.scoreDelta[p.id] ?? 0;
            return (
              <li key={p.id} className="flex items-center gap-3 rounded-xl px-3 py-2 ring-1 ring-white/6">
                <span className="flex-1 truncate font-bold">{p.name}</span>
                <span
                  className={
                    role === 'GUESSER'
                      ? 'text-sky-300'
                      : role === 'HONEST'
                        ? 'text-emerald-300'
                        : 'text-slate-400'
                  }
                >
                  {ROLE_LABEL[role]}
                </span>
                <span className="tabular w-9 text-right font-black">{d > 0 ? `+${d}` : '0'}</span>
              </li>
            );
          })}
        </ul>
      </Card>

      <Scoreboard room={room} meId={me.id} delta={reveal.scoreDelta} alwaysOpen />

      {canAdvance ? (
        <div className="sticky bottom-3">
          <Button disabled={game.busy} onClick={game.advancePhase}>
            {isLastRound ? '看最終排名' : '下一輪'}
          </Button>
        </div>
      ) : (
        <p className="text-center text-sm text-slate-400">等猜題者進入下一輪…</p>
      )}
    </>
  );
}

function HostControls({ game }: { game: GameApi }) {
  const [open, setOpen] = useState(false);
  return (
    <Card>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="eyebrow flex w-full items-center justify-between"
      >
        <span>房主控制</span>
        <span>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="mt-4 flex flex-col gap-2">
          <ul className="flex flex-col gap-1.5">
            {game
              .room!.players.filter((p) => p.id !== game.me!.id)
              .map((p) => (
                <li
                  key={p.id}
                  className="flex items-center gap-3 rounded-xl px-3 py-2 ring-1 ring-white/6"
                >
                  <span className="flex-1 truncate text-sm">
                    {p.name}
                    {!p.connected && <span className="ml-1.5 text-xs text-rose-300">離線</span>}
                  </span>
                  <button
                    onClick={() => game.kickPlayer(p.id)}
                    className="rounded-lg px-2 py-1 text-xs text-rose-300 ring-1 ring-rose-500/40"
                  >
                    踢除
                  </button>
                </li>
              ))}
          </ul>
          <Button variant="danger" disabled={game.busy} onClick={game.abortGame}>
            提前結算/遊戲結束
          </Button>
        </div>
      )}
    </Card>
  );
}
