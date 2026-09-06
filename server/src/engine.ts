/**
 * 遊戲核心邏輯（純函式，無副作用、無 I/O）
 *
 * 這一層刻意不碰 socket、不碰時間、不碰全域狀態，
 * 亂數來源以參數注入，方便單元測試與日後搬移。
 */

import { LIMITS, Player, Question, Round, SCORE } from '../../shared/types';

/** 亂數來源介面：回傳 [0, 1) 的浮點數 */
export type Rng = () => number;

export const defaultRng: Rng = Math.random;

// ---------------------------------------------------------------------------
// 基礎工具
// ---------------------------------------------------------------------------

/** Fisher–Yates 洗牌，回傳新陣列，不改動輸入 */
export function shuffle<T>(items: readonly T[], rng: Rng = defaultRng): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * 加權隨機挑選。weights 必須與 items 等長且皆為正數。
 */
export function weightedPick<T>(
  items: readonly T[],
  weights: readonly number[],
  rng: Rng = defaultRng
): T {
  if (items.length === 0) throw new Error('weightedPick：候選清單不可為空');
  if (items.length !== weights.length) throw new Error('weightedPick：權重數量與候選數量不符');

  const total = weights.reduce((sum, w) => sum + w, 0);
  if (total <= 0) throw new Error('weightedPick：權重總和必須大於 0');

  let threshold = rng() * total;
  for (let i = 0; i < items.length; i++) {
    threshold -= weights[i];
    if (threshold < 0) return items[i];
  }
  // 浮點誤差保險
  return items[items.length - 1];
}

// ---------------------------------------------------------------------------
// 猜題者輪替
// ---------------------------------------------------------------------------

/**
 * 建立猜題者隊列。
 *
 * 房主直接輸入這場要打幾輪，所以隊列長度就是總輪數，不再綁死「每人 1 或 2 次」。
 * 作法是一圈一圈洗牌後接起來再截斷，因此：
 *   - 每位玩家擔任猜題者的次數最多相差 1 次
 *   - 不會連續兩輪都是同一個人（跨圈交界會換位）
 */
export function buildGuesserQueue(
  playerIds: readonly string[],
  totalRounds: number,
  rng: Rng = defaultRng
): string[] {
  if (playerIds.length === 0) return [];
  const queue: string[] = [];
  while (queue.length < totalRounds) {
    const cycle = shuffle(playerIds, rng);
    // 避免跨圈交界出現同一人連兩輪
    if (queue.length > 0 && cycle.length > 1 && cycle[0] === queue[queue.length - 1]) {
      [cycle[0], cycle[1]] = [cycle[1], cycle[0]];
    }
    queue.push(...cycle);
  }
  return queue.slice(0, totalRounds);
}

/**
 * 從隊列取出下一位仍在房內的猜題者。
 * 回傳 { guesserId, queue }，queue 為移除掉已消耗項目後的新隊列。
 * 若隊列中已無有效玩家，guesserId 為 null。
 */
export function takeNextGuesser(
  queue: readonly string[],
  presentPlayerIds: readonly string[]
): { guesserId: string | null; queue: string[] } {
  const rest = [...queue];
  while (rest.length > 0) {
    const candidate = rest.shift()!;
    if (presentPlayerIds.includes(candidate)) {
      return { guesserId: candidate, queue: rest };
    }
    // 已離場的玩家直接跳過（同時消耗掉他的輪次）
  }
  return { guesserId: null, queue: rest };
}

// ---------------------------------------------------------------------------
// 老實人挑選
// ---------------------------------------------------------------------------

/**
 * 從非猜題者中加權隨機挑選老實人。
 * 權重與「已當過老實人的次數」成反比：weight = 1 / (1 + timesAsHonest)。
 * 這樣沒當過的人權重 1、當過一次 0.5、兩次 0.33…，
 * 既不會像純輪替那樣可被預測，也不會讓同一人一直被抽到。
 */
export function pickHonest(candidates: readonly Player[], rng: Rng = defaultRng): string {
  if (candidates.length === 0) throw new Error('pickHonest：至少需要一位非猜題者');
  const weights = candidates.map((p) => 1 / (1 + p.timesAsHonest));
  return weightedPick(candidates, weights, rng).id;
}

// ---------------------------------------------------------------------------
// 出題
// ---------------------------------------------------------------------------

/**
 * 從題庫抽一題尚未使用過的題目。
 *
 * 只取 verified: true。**刻意不做分類篩選**——分類本身就是強烈提示，
 * 會破壞「完全不知道這是什麼」的樂趣。
 */
export function pickQuestion(
  deck: readonly Question[],
  usedQuestionIds: readonly string[],
  rng: Rng = defaultRng
): Question | null {
  const pool = deck.filter((q) => q.verified && !usedQuestionIds.includes(q.id));
  if (pool.length === 0) return null;
  return pool[Math.floor(rng() * pool.length)];
}

// ---------------------------------------------------------------------------
// 提示關鍵字
// ---------------------------------------------------------------------------

/**
 * 產生該輪的三個提示關鍵字：本題的相關關鍵字 1 個 + 無關關鍵字 2 個，順序打散。
 *
 * 用意是讓瞎掰人不會完全一頭霧水地亂講，又不能讓人直接看穿題目方向，
 * 所以無關的那兩個一律從「不同分類」的題目裡挑（分類只在這裡用到，
 * 不會被拿去當遊戲內的篩選條件）。
 */
export function pickHints(
  question: Question,
  deck: readonly Question[],
  rng: Rng = defaultRng
): string[] {
  const decoyPool = deck
    .filter(
      (q) =>
        q.id !== question.id &&
        q.category !== question.category &&
        q.hintKeyword &&
        q.hintKeyword !== question.hintKeyword
    )
    .map((q) => q.hintKeyword);

  // 去重，避免兩個誘餌撞在一起
  const unique = [...new Set(decoyPool)];
  const decoys = shuffle(unique, rng).slice(0, LIMITS.HINT_COUNT - 1);

  return shuffle([question.hintKeyword, ...decoys], rng);
}

// ---------------------------------------------------------------------------
// 計分
// ---------------------------------------------------------------------------

/**
 * 依猜題者的投票計算該輪各玩家得分。
 *
 * 猜對（指到老實人）：猜題者 +2、老實人 +1、其餘瞎掰人 0。
 * 猜錯（指到某位瞎掰人）：被指到的瞎掰人 +2，其他人皆 0。
 * 未投票（中途離場或房主強制結束）：全員 0。
 *
 * 回傳的 Record 包含該輪所有參與者，未得分者為 0，方便前端顯示。
 */
export function computeScoreDelta(round: {
  guesserId: string;
  honestId: string;
  blufferIds: readonly string[];
  vote: string | null;
}): { delta: Record<string, number>; correct: boolean } {
  const delta: Record<string, number> = {
    [round.guesserId]: 0,
    [round.honestId]: 0,
  };
  for (const id of round.blufferIds) delta[id] = 0;

  if (round.vote === null) {
    return { delta, correct: false };
  }

  const correct = round.vote === round.honestId;
  if (correct) {
    delta[round.guesserId] = SCORE.GUESSER_CORRECT;
    delta[round.honestId] = SCORE.HONEST_WHEN_FOUND;
  } else if (round.blufferIds.includes(round.vote)) {
    delta[round.vote] = SCORE.BLUFFER_FOOLED_GUESSER;
  }
  return { delta, correct };
}

// ---------------------------------------------------------------------------
// 排名
// ---------------------------------------------------------------------------

/**
 * 依分數由高到低排名。平手者並列同一名次（1, 1, 3 的形式），不做延長賽。
 */
export function computeRanking(
  players: readonly Player[]
): { rank: number; playerId: string; name: string; score: number }[] {
  const sorted = [...players].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  const result: { rank: number; playerId: string; name: string; score: number }[] = [];
  let lastScore: number | null = null;
  let lastRank = 0;
  sorted.forEach((p, index) => {
    const rank = lastScore !== null && p.score === lastScore ? lastRank : index + 1;
    lastScore = p.score;
    lastRank = rank;
    result.push({ rank, playerId: p.id, name: p.name, score: p.score });
  });
  return result;
}

// ---------------------------------------------------------------------------
// 組出一個新輪次
// ---------------------------------------------------------------------------

export interface CreateRoundInput {
  roundIndex: number;
  players: readonly Player[];
  guesserId: string;
  question: Question;
  deck: readonly Question[];
  rng?: Rng;
}

export function createRound(input: CreateRoundInput): Round {
  const rng = input.rng ?? defaultRng;
  const others = input.players.filter((p) => p.id !== input.guesserId);
  if (others.length < 2) {
    throw new Error(`createRound：至少需要 ${LIMITS.MIN_PLAYERS} 位玩家`);
  }
  const honestId = pickHonest(others, rng);
  const blufferIds = others.filter((p) => p.id !== honestId).map((p) => p.id);

  return {
    roundIndex: input.roundIndex,
    term: input.question.term,
    definition: input.question.definition,
    questionId: input.question.id,
    hints: pickHints(input.question, input.deck, rng),
    guesserId: input.guesserId,
    honestId,
    blufferIds,
    vote: null,
    phase: 'ROLE_ASSIGN',
    scoreDelta: {},
  };
}

// ---------------------------------------------------------------------------
// 房號
// ---------------------------------------------------------------------------

/** 排除易混淆字元（0/O、1/I/L）的英數字集 */
const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateRoomCode(length = 4, rng: Rng = defaultRng): string {
  let code = '';
  for (let i = 0; i < length; i++) {
    code += ROOM_CODE_ALPHABET[Math.floor(rng() * ROOM_CODE_ALPHABET.length)];
  }
  return code;
}
