/**
 * 角色分配邏輯、提示關鍵字與計分邏輯的單元測試。
 *
 * 亂數以「可預測的假 RNG」注入，確保測試不會偶發失敗。
 */

import { describe, expect, it } from 'vitest';
import { Player, Question, SCORE } from '../../shared/types';
import {
  buildGuesserQueue,
  computeRanking,
  computeScoreDelta,
  createRound,
  generateRoomCode,
  pickHints,
  pickHonest,
  pickQuestion,
  shuffle,
  takeNextGuesser,
  weightedPick,
} from '../src/engine';

// ---------------------------------------------------------------------------
// 測試輔助
// ---------------------------------------------------------------------------

function makePlayer(id: string, overrides: Partial<Player> = {}): Player {
  return {
    id,
    name: id.toUpperCase(),
    socketId: `socket-${id}`,
    score: 0,
    timesAsGuesser: 0,
    timesAsHonest: 0,
    disconnectedAt: null,
    ...overrides,
  };
}

function makeQuestion(overrides: Partial<Question> = {}): Question {
  return {
    id: 'q1',
    term: '指猴',
    definition: '馬達加斯加的夜行性狐猴。',
    category: '動物冷知識',
    hintKeyword: '覓食',
    difficulty: 2,
    sourceUrl: 'https://example.com',
    pageviews: 10,
    dykHook: null,
    verified: true,
    ...overrides,
  };
}

/** 依序回傳指定數列的假亂數；用完就從頭循環 */
function seqRng(values: number[]) {
  let i = 0;
  return () => values[i++ % values.length];
}

/** 固定種子的偽亂數（mulberry32），讓統計性質的測試不會偶發失敗 */
function seededRng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const question = makeQuestion();

/** 一副橫跨多個分類的小題庫，用來測提示關鍵字 */
const deck: Question[] = [
  makeQuestion({ id: 'a1', category: '動物', hintKeyword: '覓食', term: '指猴' }),
  makeQuestion({ id: 'a2', category: '動物', hintKeyword: '深海', term: '鯨落' }),
  makeQuestion({ id: 'g1', category: '地理', hintKeyword: '邊界', term: '飛地' }),
  makeQuestion({ id: 'g2', category: '地理', hintKeyword: '海洋', term: '尼莫點' }),
  makeQuestion({ id: 's1', category: '科學', hintKeyword: '低溫', term: '超流體' }),
  makeQuestion({ id: 's2', category: '科學', hintKeyword: '自轉', term: '潮汐鎖定' }),
];

// ---------------------------------------------------------------------------
// 猜題者輪替（改為房主手動輸入總輪數）
// ---------------------------------------------------------------------------

describe('buildGuesserQueue（猜題者輪替）', () => {
  it('隊列長度等於房主指定的總輪數', () => {
    expect(buildGuesserQueue(['a', 'b', 'c', 'd'], 7, seededRng(1))).toHaveLength(7);
    expect(buildGuesserQueue(['a', 'b', 'c'], 1, seededRng(1))).toHaveLength(1);
    expect(buildGuesserQueue(['a', 'b', 'c'], 20, seededRng(1))).toHaveLength(20);
  });

  it('輪數剛好是人數倍數時，每個人擔任次數完全相同', () => {
    const queue = buildGuesserQueue(['a', 'b', 'c', 'd'], 8, seededRng(7));
    for (const id of ['a', 'b', 'c', 'd']) {
      expect(queue.filter((x) => x === id)).toHaveLength(2);
    }
  });

  it('輪數除不盡時，每人擔任次數最多相差一次', () => {
    const ids = ['a', 'b', 'c', 'd', 'e'];
    const queue = buildGuesserQueue(ids, 13, seededRng(99));
    const counts = ids.map((id) => queue.filter((x) => x === id).length);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
  });

  it('不會連續兩輪都是同一個人（包含跨圈交界）', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const queue = buildGuesserQueue(['a', 'b', 'c'], 15, seededRng(seed));
      for (let i = 1; i < queue.length; i++) {
        expect(queue[i]).not.toBe(queue[i - 1]);
      }
    }
  });

  it('沒有玩家時回傳空隊列，不會無限迴圈', () => {
    expect(buildGuesserQueue([], 5)).toEqual([]);
  });
});

describe('takeNextGuesser（取下一位猜題者）', () => {
  it('依序取出並消耗隊列', () => {
    const first = takeNextGuesser(['a', 'b', 'c'], ['a', 'b', 'c']);
    expect(first.guesserId).toBe('a');
    expect(first.queue).toEqual(['b', 'c']);
  });

  it('跳過已離場的玩家，並一併消耗掉他的輪次', () => {
    const result = takeNextGuesser(['a', 'b', 'c'], ['b', 'c']);
    expect(result.guesserId).toBe('b');
    expect(result.queue).toEqual(['c']);
  });

  it('隊列中沒有任何在場玩家時回傳 null', () => {
    const result = takeNextGuesser(['a', 'b'], ['z']);
    expect(result.guesserId).toBeNull();
    expect(result.queue).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 老實人挑選
// ---------------------------------------------------------------------------

describe('pickHonest（老實人加權挑選）', () => {
  it('權重與已當過老實人的次數成反比：沒當過的優先', () => {
    const candidates = [
      makePlayer('a', { timesAsHonest: 3 }), // 權重 0.25
      makePlayer('b', { timesAsHonest: 0 }), // 權重 1
    ];
    // 總權重 1.25，抽到 0.5 落在 a(0.25) 之後 → b
    expect(pickHonest(candidates, () => 0.4)).toBe('b');
    // 抽到極小值落在 a 的區間內
    expect(pickHonest(candidates, () => 0.01)).toBe('a');
  });

  it('長期分佈會自動平衡，不會有人一直被抽到或一直沒抽到', () => {
    const rng = seededRng(20250904);
    const players = ['a', 'b', 'c', 'd'].map((id) => makePlayer(id));
    const rounds = 400;
    for (let round = 0; round < rounds; round++) {
      const honestId = pickHonest(players, rng);
      players.find((p) => p.id === honestId)!.timesAsHonest++;
    }
    const expected = rounds / players.length; // 100
    for (const p of players) {
      expect(Math.abs(p.timesAsHonest - expected)).toBeLessThan(expected * 0.25);
    }
  });

  it('已當過很多次的人，明顯比沒當過的人更不容易被抽到', () => {
    const rng = seededRng(42);
    const veteran = makePlayer('veteran', { timesAsHonest: 5 }); // 權重 1/6
    const rookie = makePlayer('rookie', { timesAsHonest: 0 }); // 權重 1
    let rookieCount = 0;
    for (let i = 0; i < 2000; i++) {
      if (pickHonest([veteran, rookie], rng) === 'rookie') rookieCount++;
    }
    // 理論比例 6/7 ≈ 0.857
    expect(rookieCount / 2000).toBeGreaterThan(0.8);
    expect(rookieCount / 2000).toBeLessThan(0.92);
  });

  it('候選為空時丟出錯誤', () => {
    expect(() => pickHonest([])).toThrow();
  });
});

describe('weightedPick', () => {
  it('權重總和為 0 時丟出錯誤', () => {
    expect(() => weightedPick(['a', 'b'], [0, 0])).toThrow();
  });

  it('權重與候選數量不符時丟出錯誤', () => {
    expect(() => weightedPick(['a', 'b'], [1])).toThrow();
  });
});

// ---------------------------------------------------------------------------
// 提示關鍵字
// ---------------------------------------------------------------------------

describe('pickHints（提示關鍵字）', () => {
  const target = deck[0]; // 動物 / 覓食

  it('固定給三個關鍵字', () => {
    for (let seed = 1; seed <= 20; seed++) {
      expect(pickHints(target, deck, seededRng(seed))).toHaveLength(3);
    }
  });

  it('其中一定包含本題真正相關的那個關鍵字', () => {
    for (let seed = 1; seed <= 20; seed++) {
      expect(pickHints(target, deck, seededRng(seed))).toContain(target.hintKeyword);
    }
  });

  it('另外兩個誘餌一律來自不同分類，避免不小心也扯得上關係', () => {
    const sameCategoryKeywords = deck
      .filter((q) => q.category === target.category && q.id !== target.id)
      .map((q) => q.hintKeyword);
    for (let seed = 1; seed <= 20; seed++) {
      const hints = pickHints(target, deck, seededRng(seed));
      for (const kw of sameCategoryKeywords) {
        expect(hints).not.toContain(kw);
      }
    }
  });

  it('三個關鍵字彼此不重複', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const hints = pickHints(target, deck, seededRng(seed));
      expect(new Set(hints).size).toBe(hints.length);
    }
  });

  it('順序會被打散，相關的那個不會固定在同一個位置', () => {
    const positions = new Set<number>();
    for (let seed = 1; seed <= 40; seed++) {
      positions.add(pickHints(target, deck, seededRng(seed)).indexOf(target.hintKeyword));
    }
    expect(positions.size).toBeGreaterThan(1);
  });

  it('題庫沒有其他分類可當誘餌時，至少仍會給出相關關鍵字', () => {
    const lonely = [target, deck[1]]; // 兩題都是「動物」
    const hints = pickHints(target, lonely, seededRng(3));
    expect(hints).toEqual([target.hintKeyword]);
  });
});

// ---------------------------------------------------------------------------
// 整輪角色分配
// ---------------------------------------------------------------------------

describe('createRound（整輪角色分配）', () => {
  const players = ['a', 'b', 'c', 'd'].map((id) => makePlayer(id));
  const build = (guesserId: string) =>
    createRound({ roundIndex: 1, players, guesserId, question: deck[0], deck });

  it('猜題者、老實人、瞎掰人三者互斥且涵蓋所有玩家', () => {
    const round = build('a');
    expect(round.guesserId).toBe('a');
    expect(round.honestId).not.toBe('a');
    expect(round.blufferIds).not.toContain('a');
    expect(round.blufferIds).not.toContain(round.honestId);

    const all = [round.guesserId, round.honestId, ...round.blufferIds].sort();
    expect(all).toEqual(['a', 'b', 'c', 'd']);
  });

  it('瞎掰人是「除了猜題者與老實人以外的所有人」', () => {
    expect(build('b').blufferIds).toHaveLength(players.length - 2);
  });

  it('三人局也成立（1 猜題者 + 1 老實人 + 1 瞎掰人）', () => {
    const three = ['a', 'b', 'c'].map((id) => makePlayer(id));
    const round = createRound({
      roundIndex: 1,
      players: three,
      guesserId: 'a',
      question: deck[0],
      deck,
    });
    expect(round.blufferIds).toHaveLength(1);
  });

  it('人數不足時丟出錯誤', () => {
    const two = ['a', 'b'].map((id) => makePlayer(id));
    expect(() =>
      createRound({ roundIndex: 1, players: two, guesserId: 'a', question: deck[0], deck })
    ).toThrow();
  });

  it('題目與提示關鍵字都正確帶入該輪，起始階段是看身分卡', () => {
    const round = createRound({
      roundIndex: 7,
      players,
      guesserId: 'a',
      question,
      deck: [...deck, question],
    });
    expect(round.term).toBe(question.term);
    expect(round.definition).toBe(question.definition);
    expect(round.questionId).toBe(question.id);
    expect(round.hints).toHaveLength(3);
    expect(round.hints).toContain(question.hintKeyword);
    expect(round.phase).toBe('ROLE_ASSIGN');
    expect(round.vote).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 計分
// ---------------------------------------------------------------------------

describe('computeScoreDelta（計分規則）', () => {
  const base = { guesserId: 'g', honestId: 'h', blufferIds: ['b1', 'b2'] };

  it('猜對：猜題者 +2、老實人 +1、瞎掰人 0', () => {
    const { delta, correct } = computeScoreDelta({ ...base, vote: 'h' });
    expect(correct).toBe(true);
    expect(delta.g).toBe(SCORE.GUESSER_CORRECT);
    expect(delta.h).toBe(SCORE.HONEST_WHEN_FOUND);
    expect(delta.b1).toBe(0);
    expect(delta.b2).toBe(0);
  });

  it('猜錯：被指到的瞎掰人獨得 +2，其餘全部 0', () => {
    const { delta, correct } = computeScoreDelta({ ...base, vote: 'b2' });
    expect(correct).toBe(false);
    expect(delta.b2).toBe(SCORE.BLUFFER_FOOLED_GUESSER);
    expect(delta.g).toBe(0);
    expect(delta.h).toBe(0);
    expect(delta.b1).toBe(0);
  });

  it('沒有部分得分：任何一輪最多只有兩人拿到分數', () => {
    for (const vote of ['h', 'b1', 'b2']) {
      const { delta } = computeScoreDelta({ ...base, vote });
      expect(Object.values(delta).filter((v) => v > 0).length).toBeLessThanOrEqual(2);
    }
  });

  it('未投票（中途離場或房主強制結束）：全員 0 分', () => {
    const { delta, correct } = computeScoreDelta({ ...base, vote: null });
    expect(correct).toBe(false);
    expect(Object.values(delta).every((v) => v === 0)).toBe(true);
  });

  it('回傳的紀錄涵蓋該輪所有參與者', () => {
    const { delta } = computeScoreDelta({ ...base, vote: 'h' });
    expect(Object.keys(delta).sort()).toEqual(['b1', 'b2', 'g', 'h']);
  });

  it('零和式：每輪加總不超過 3 分', () => {
    for (const vote of ['h', 'b1', null]) {
      const { delta } = computeScoreDelta({ ...base, vote });
      const total = Object.values(delta).reduce((s, v) => s + v, 0);
      expect(total).toBeLessThanOrEqual(3);
    }
  });
});

// ---------------------------------------------------------------------------
// 排名
// ---------------------------------------------------------------------------

describe('computeRanking（最終排名）', () => {
  it('依分數由高到低排序', () => {
    const players = [
      makePlayer('a', { name: '阿明', score: 3 }),
      makePlayer('b', { name: '小美', score: 7 }),
      makePlayer('c', { name: '大雄', score: 5 }),
    ];
    expect(computeRanking(players).map((r) => r.name)).toEqual(['小美', '大雄', '阿明']);
  });

  it('平手者並列同一名次，下一位跳號', () => {
    const players = [
      makePlayer('a', { name: '甲', score: 5 }),
      makePlayer('b', { name: '乙', score: 5 }),
      makePlayer('c', { name: '丙', score: 1 }),
    ];
    const ranking = computeRanking(players);
    expect(ranking.map((r) => r.rank)).toEqual([1, 1, 3]);
    expect(ranking.filter((r) => r.rank === 1)).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// 出題（刻意不做分類篩選）
// ---------------------------------------------------------------------------

describe('pickQuestion（出題）', () => {
  const pool: Question[] = [
    makeQuestion({ id: 'q1', category: '動物' }),
    makeQuestion({ id: 'q2', category: '地理' }),
    makeQuestion({ id: 'q3', category: '歷史', verified: false }),
  ];

  it('只抽已複核（verified）的題目', () => {
    for (let i = 0; i < 30; i++) {
      expect(pickQuestion(pool, [])?.verified).toBe(true);
    }
  });

  it('同一局不重複出題', () => {
    expect(pickQuestion(pool, ['q1'])?.id).toBe('q2');
  });

  it('題目用盡時回傳 null', () => {
    expect(pickQuestion(pool, ['q1', 'q2'])).toBeNull();
  });

  it('不會因為分類而篩掉題目：整副牌都可能被抽到', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 100; seed++) {
      const picked = pickQuestion(pool, [], seededRng(seed));
      if (picked) seen.add(picked.id);
    }
    expect(seen).toEqual(new Set(['q1', 'q2']));
  });
});

// ---------------------------------------------------------------------------
// 其他
// ---------------------------------------------------------------------------

describe('shuffle', () => {
  it('不改動原陣列，且元素完全一致', () => {
    const original = ['a', 'b', 'c', 'd'];
    const shuffled = shuffle(original, seqRng([0.1, 0.9, 0.5]));
    expect(original).toEqual(['a', 'b', 'c', 'd']);
    expect([...shuffled].sort()).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('generateRoomCode', () => {
  it('產生指定長度、且不含易混淆字元的房號', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateRoomCode(4);
      expect(code).toHaveLength(4);
      expect(code).toMatch(/^[A-Z0-9]{4}$/);
      expect(code).not.toMatch(/[01OIL]/);
    }
  });
});
