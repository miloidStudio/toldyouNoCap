/** 最終排名。平手時並列顯示贏家，v1 不做延長賽。 */

import type { GameApi } from '../useGame';
import { Button, Card, Screen, SectionTitle } from '../components/ui';

const MEDAL = ['🥇', '🥈', '🥉'];

export function GameOverScreen({ game }: { game: GameApi }) {
  const room = game.room!;
  const me = game.me!;
  const ranking = room.finalRanking ?? [];
  const winners = ranking.filter((r) => r.rank === 1);
  const top = winners[0]?.score ?? 0;

  return (
    <Screen>
      <header className="pt-6 text-center">
        <div className="eyebrow">全 {room.totalRounds} 輪結束（共 {room.totalQuestions} 場猜題）</div>
        <h1 className="mt-2 text-3xl font-black">最終排名</h1>
      </header>

      <Card className="text-center" glow="brand">
        <div className="text-6xl">🏆</div>
        <div className="eyebrow mt-3">{winners.length > 1 ? '並列冠軍' : '冠軍'}</div>
        <div className="mt-1.5 text-3xl font-black text-amber-300">
          {winners.map((w) => w.name).join('、')}
        </div>
        <div className="tabular mt-1 text-lg text-slate-300">{top} 分</div>
      </Card>

      <Card>
        <SectionTitle>完整排名</SectionTitle>
        <ul className="flex flex-col gap-1.5">
          {ranking.map((r) => {
            const ratio = top > 0 ? r.score / top : 0;
            return (
              <li
                key={r.playerId}
                className={`relative flex items-center gap-3 overflow-hidden rounded-xl px-3 py-3 ring-1 ${
                  r.playerId === me.id ? 'ring-amber-400/35' : 'ring-white/6'
                }`}
              >
                <div
                  className="absolute inset-y-0 left-0 bg-amber-400/12"
                  style={{ width: `${ratio * 100}%` }}
                  aria-hidden
                />
                <span className="relative w-8 text-center text-lg">{MEDAL[r.rank - 1] ?? r.rank}</span>
                <span className="relative flex-1 truncate font-bold">{r.name}</span>
                <span className="tabular relative text-2xl font-black">{r.score}</span>
              </li>
            );
          })}
        </ul>
      </Card>

      {game.isHost ? (
        <Button disabled={game.busy} onClick={game.restart}>
          再玩一場（回到設定）
        </Button>
      ) : (
        <p className="text-center text-sm text-slate-400">等房主開下一場…</p>
      )}
      <Button variant="ghost" onClick={game.leaveRoom}>
        離開房間
      </Button>
    </Screen>
  );
}
