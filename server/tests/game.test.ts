import { describe, expect, it } from 'vitest';
import type { Server } from 'socket.io';
import { Question } from '../../shared/types';
import { GameService } from '../src/game';
import { InMemoryRoomStore } from '../src/store';

const sampleDeck: Question[] = [
  {
    id: 'q1',
    term: '指猴',
    definition: '馬達加斯加特有的夜行性狐猴。',
    category: '動物冷知識',
    hintKeyword: '覓食',
    difficulty: 2,
    sourceUrl: 'https://example.com/1',
    pageviews: 10,
    dykHook: null,
    verified: true,
  },
  {
    id: 'q2',
    term: '鯨落',
    definition: '鯨魚屍體沉入海底形成的生態系統。',
    category: '動物冷知識',
    hintKeyword: '深海',
    difficulty: 1,
    sourceUrl: 'https://example.com/2',
    pageviews: 20,
    dykHook: null,
    verified: true,
  },
  {
    id: 'q3',
    term: '飛地',
    definition: '某國家境內的一塊隸屬於他國的領土。',
    category: '地理冷知識',
    hintKeyword: '邊界',
    difficulty: 2,
    sourceUrl: 'https://example.com/3',
    pageviews: 30,
    dykHook: null,
    verified: true,
  },
  {
    id: 'q4',
    term: '尼莫點',
    definition: '地球表面距離陸地最遠的海域中心。',
    category: '地理冷知識',
    hintKeyword: '海洋',
    difficulty: 2,
    sourceUrl: 'https://example.com/4',
    pageviews: 40,
    dykHook: null,
    verified: true,
  },
  {
    id: 'q5',
    term: '超流體',
    definition: '黏度為零的流體狀態。',
    category: '科學術語',
    hintKeyword: '低溫',
    difficulty: 3,
    sourceUrl: 'https://example.com/5',
    pageviews: 50,
    dykHook: null,
    verified: true,
  },
  {
    id: 'q6',
    term: '潮汐鎖定',
    definition: '天體自轉週期與公轉週期相同的現象。',
    category: '科學術語',
    hintKeyword: '自轉',
    difficulty: 2,
    sourceUrl: 'https://example.com/6',
    pageviews: 60,
    dykHook: null,
    verified: true,
  },
];

function createTestHarness() {
  const store = new InMemoryRoomStore();
  const emitted: { target: string; event: string; data: any }[] = [];

  const mockIo = {
    to: (target: string) => ({
      emit: (event: string, data: any) => {
        emitted.push({ target, event, data });
      },
    }),
  } as unknown as Server;

  const game = new GameService(store, sampleDeck, mockIo);
  return { store, game, emitted };
}

describe('GameService - 輪數與全場總場次', () => {
  it('一輪代表每位玩家各擔任一次猜題者，總場次 = 輪數 * 人數', async () => {
    const { game, store } = createTestHarness();

    const { room, player: host } = await game.createRoom('Host', 'socket-host');
    const { player: p2 } = await game.joinRoom(room.code, 'Player2', 'socket-p2');
    const { player: p3 } = await game.joinRoom(room.code, 'Player3', 'socket-p3');

    // 房主設定 2 輪（3 人時應為 6 場）
    await game.updateSettings(room.code, host.id, { totalRounds: 2 });
    await game.startGame(room.code, host.id);

    const updated = (await store.get(room.code))!;
    expect(updated.phase).toBe('PLAYING');
    expect(updated.totalRounds).toBe(2);
    expect(updated.totalQuestions).toBe(6);

    // 隊列長度為 6，且扣除當前第一場猜題者後，隊列中尚有 5 人
    expect(updated.guesserQueue).toHaveLength(5);

    // 檢查全場輪替次數：每個人擔任猜題者剛好 2 次
    const allGuessers = [updated.currentRound!.guesserId, ...updated.guesserQueue];
    expect(allGuessers).toHaveLength(6);
    for (const pid of [host.id, p2.id, p3.id]) {
      expect(allGuessers.filter((id) => id === pid)).toHaveLength(2);
    }
  });

  it('若總題目數超過題庫題數則拋出錯誤', async () => {
    const { game } = createTestHarness();
    const { room, player: host } = await game.createRoom('Host', 'socket-host');
    await game.joinRoom(room.code, 'Player2', 'socket-p2');
    await game.joinRoom(room.code, 'Player3', 'socket-p3');

    // 題庫共 6 題，設定 3 輪需 9 題 -> 應報錯
    await game.updateSettings(room.code, host.id, { totalRounds: 3 });
    await expect(game.startGame(room.code, host.id)).rejects.toThrow('不夠進行 3 輪');
  });
});

describe('GameService - 老實人看牌時機 (ROLE_ASSIGN vs THINKING)', () => {
  it('在猜題者按下開始觀察前（ROLE_ASSIGN），老實人只能看到題目看不到定義；進入 THINKING 後才揭曉', async () => {
    const { game, store, emitted } = createTestHarness();

    const { room, player: host } = await game.createRoom('Host', 'socket-host');
    await game.joinRoom(room.code, 'Player2', 'socket-p2');
    await game.joinRoom(room.code, 'Player3', 'socket-p3');

    await game.updateSettings(room.code, host.id, { totalRounds: 1 });
    await game.startGame(room.code, host.id);

    const r = (await store.get(room.code))!;
    const honestId = r.currentRound!.honestId;
    const honestPlayer = r.players.find((p) => p.id === honestId)!;

    // 1. 在 ROLE_ASSIGN 階段：老實人收到的 role:private 中 definition 應為 null
    const roleAssignEmits = emitted.filter(
      (e) => e.target === honestPlayer.socketId && e.event === 'role:private'
    );
    const lastRoleAssignInfo = roleAssignEmits[roleAssignEmits.length - 1].data;
    expect(lastRoleAssignInfo.role).toBe('HONEST');
    expect(lastRoleAssignInfo.term).toBeTruthy();
    expect(lastRoleAssignInfo.definition).toBeNull();

    // 2. 猜題者按下「開始觀察」，階段進入 THINKING
    const guesserId = r.currentRound!.guesserId;
    await game.advancePhase(room.code, guesserId);

    const rThinking = (await store.get(room.code))!;
    expect(rThinking.currentRound!.phase).toBe('THINKING');

    const thinkingEmits = emitted.filter(
      (e) => e.target === honestPlayer.socketId && e.event === 'role:private'
    );
    const lastThinkingInfo = thinkingEmits[thinkingEmits.length - 1].data;
    expect(lastThinkingInfo.role).toBe('HONEST');
    expect(lastThinkingInfo.definition).toBe(rThinking.currentRound!.definition);

    // 3. 進入 DISCUSSION 階段：老實人的定義再次被收回 (definition: null)
    await game.advancePhase(room.code, guesserId);
    const rDiscussion = (await store.get(room.code))!;
    expect(rDiscussion.currentRound!.phase).toBe('DISCUSSION');

    const discussionEmits = emitted.filter(
      (e) => e.target === honestPlayer.socketId && e.event === 'role:private'
    );
    const lastDiscussionInfo = discussionEmits[discussionEmits.length - 1].data;
    expect(lastDiscussionInfo.definition).toBeNull();
  });
});

describe('GameService - 猜題者嘲諷「騙肖仔！」', () => {
  it('猜題者在 DISCUSSION 階段可對其他玩家喊「騙肖仔！」，目標收到通知', async () => {
    const { game, store, emitted } = createTestHarness();

    const { room, player: host } = await game.createRoom('Host', 'socket-host');
    const { player: p2 } = await game.joinRoom(room.code, 'Player2', 'socket-p2');
    const { player: p3 } = await game.joinRoom(room.code, 'Player3', 'socket-p3');

    await game.startGame(room.code, host.id);
    const r = (await store.get(room.code))!;
    const guesserId = r.currentRound!.guesserId;
    const guesserPlayer = r.players.find((p) => p.id === guesserId)!;
    const targetPlayer = r.players.find((p) => p.id !== guesserId)!;

    // 非 DISCUSSION 階段不能嘲諷
    await expect(game.tauntPlayer(room.code, guesserId, targetPlayer.id)).rejects.toThrow(
      '只有在討論階段才能使用'
    );

    // 推進到 THINKING，再推進到 DISCUSSION
    await game.advancePhase(room.code, guesserId);
    await game.advancePhase(room.code, guesserId);

    // 非猜題者不能發送嘲諷
    await expect(game.tauntPlayer(room.code, targetPlayer.id, guesserId)).rejects.toThrow(
      '只有猜題者可以使用'
    );

    // 不能對自己喊
    await expect(game.tauntPlayer(room.code, guesserId, guesserId)).rejects.toThrow(
      '不能對自己喊'
    );

    // 猜題者對 targetPlayer 喊「騙肖仔！」
    await game.tauntPlayer(room.code, guesserId, targetPlayer.id);

    const tauntEmits = emitted.filter(
      (e) => e.target === targetPlayer.socketId && e.event === 'game:taunted'
    );
    expect(tauntEmits).toHaveLength(1);
    expect(tauntEmits[0].data.guesserName).toBe(guesserPlayer.name);
    expect(tauntEmits[0].data.timestamp).toBeTypeOf('number');

    // 猜題者可以重複發送
    await game.tauntPlayer(room.code, guesserId, targetPlayer.id);
    const tauntEmits2 = emitted.filter(
      (e) => e.target === targetPlayer.socketId && e.event === 'game:taunted'
    );
    expect(tauntEmits2).toHaveLength(2);
  });
});

describe('GameService - 猜題者重抽一題 (rerollQuestion)', () => {
  it('猜題者在 ROLE_ASSIGN 階段可重抽題目，題目更換但身分與回合保持不變', async () => {
    const { game, store, emitted } = createTestHarness();

    const { room, player: host } = await game.createRoom('Host', 'socket-host');
    const { player: p2 } = await game.joinRoom(room.code, 'Player2', 'socket-p2');
    const { player: p3 } = await game.joinRoom(room.code, 'Player3', 'socket-p3');

    await game.startGame(room.code, host.id);
    const initialRoom = (await store.get(room.code))!;
    const initialRound = initialRoom.currentRound!;
    const guesserId = initialRound.guesserId;
    const honestId = initialRound.honestId;
    const initialQuestionId = initialRound.questionId;
    const initialTerm = initialRound.term;
    const nonGuesserId = initialRoom.players.find((p) => p.id !== guesserId)!.id;

    expect(initialRound.phase).toBe('ROLE_ASSIGN');

    // 非猜題者不能重抽
    await expect(game.rerollQuestion(room.code, nonGuesserId)).rejects.toThrow(
      '只有當前猜題者可以重抽題目'
    );

    // 猜題者執行重抽題目
    await game.rerollQuestion(room.code, guesserId);

    const updatedRoom = (await store.get(room.code))!;
    const updatedRound = updatedRoom.currentRound!;

    // 題目更換
    expect(updatedRound.questionId).not.toBe(initialQuestionId);
    expect(updatedRound.term).not.toBe(initialTerm);

    // 但猜題者、老實人、輪次、階段皆不變
    expect(updatedRound.guesserId).toBe(guesserId);
    expect(updatedRound.honestId).toBe(honestId);
    expect(updatedRound.roundIndex).toBe(initialRound.roundIndex);
    expect(updatedRound.phase).toBe('ROLE_ASSIGN');

    // 且題庫已使用清單記錄了前後兩題
    expect(updatedRoom.usedQuestionIds).toContain(initialQuestionId);
    expect(updatedRoom.usedQuestionIds).toContain(updatedRound.questionId);

    // 推進到 THINKING 後不能再重抽
    await game.advancePhase(room.code, guesserId);
    await expect(game.rerollQuestion(room.code, guesserId)).rejects.toThrow(
      '只有在「看身分卡」階段才能重抽題目'
    );
  });
});

