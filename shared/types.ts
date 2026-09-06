/**
 * NoCap — 前後端共用型別定義
 *
 * 這個檔案同時被 client 與 server 以相對路徑 import，
 * 不做任何執行期相依（純型別 + 常數），確保未來搬到
 * Capacitor / Electron 時不需修改。
 */

// ---------------------------------------------------------------------------
// 遊戲階段
// ---------------------------------------------------------------------------

/** 房間層級的階段 */
export type RoomPhase = 'LOBBY' | 'PLAYING' | 'GAME_OVER';

/**
 * 單一輪次內的階段。
 *
 * ROLE_ASSIGN：各自按住看身分卡，由「猜題者」按下開始觀察才進入下一階段
 * THINKING   ：倒數計時，讓所有人想好要怎麼講
 * DISCUSSION ：不計時的自由發言／質詢，主持權在猜題者手上，
 *              猜題者的畫面同時就有投票名單，覺得夠了就直接點人
 * RESULT     ：公布身分、正解與得分
 */
export type RoundPhase = 'ROLE_ASSIGN' | 'THINKING' | 'DISCUSSION' | 'RESULT';

/** 玩家在該輪的角色 */
export type Role = 'GUESSER' | 'HONEST' | 'BLUFFER';

// ---------------------------------------------------------------------------
// 核心資料模型
// ---------------------------------------------------------------------------

export interface Player {
  id: string;
  name: string;
  /** null 代表暫時斷線（仍保留座位與分數） */
  socketId: string | null;
  score: number;
  timesAsGuesser: number;
  timesAsHonest: number;
  /** 斷線的時間戳（毫秒），連線中為 null */
  disconnectedAt: number | null;
}

export interface Question {
  id: string;
  term: string;
  definition: string;
  /**
   * 分類。**不作為遊戲內的篩選條件**（分類本身會洩漏題目方向，
   * 破壞「完全未知」的樂趣），只用於題庫維護，以及挑選提示關鍵字時
   * 確保不相關的關鍵字真的來自別的領域。
   */
  category: string;
  /** 與本題相關、但不會直接洩底的關鍵字（提示用） */
  hintKeyword: string;
  difficulty: 1 | 2 | 3;
  sourceUrl: string;
  pageviews: number;
  dykHook: string | null;
  verified: boolean;
}

export interface Round {
  roundIndex: number;
  term: string;
  definition: string;
  questionId: string;
  /** 三個提示關鍵字：一個真的相關、兩個無關，順序已打散 */
  hints: string[];
  guesserId: string;
  honestId: string;
  blufferIds: string[];
  /** 猜題者投給誰 */
  vote: string | null;
  phase: RoundPhase;
  /** 該輪各玩家得分變化，於 RESULT 階段填入 */
  scoreDelta: Record<string, number>;
}

export interface RoomSettings {
  /** 這場總共要打幾輪，一輪代表全體玩家輪流擔任過一次猜題者 */
  totalRounds: number;
  /** 思考秒數，10–30 */
  thinkingSeconds: number;
}

export interface Room {
  code: string;
  hostId: string;
  players: Player[];
  usedQuestionIds: string[];
  currentRound: Round | null;
  settings: RoomSettings;
  phase: RoomPhase;
  /** 猜題者輪替隊列，開局時依總出題數產生 */
  guesserQueue: string[];
  /** 已完成的猜題場次 */
  roundsPlayed: number;
  /** 總輪數（循環次數） */
  totalRounds: number;
  /** 全場總猜題場次（totalRounds * 玩家數） */
  totalQuestions: number;
  createdAt: number;
}

// ---------------------------------------------------------------------------
// 傳給前端的「公開狀態」（不含正解、不含他人身分）
// ---------------------------------------------------------------------------

export interface PublicPlayer {
  id: string;
  name: string;
  score: number;
  timesAsGuesser: number;
  timesAsHonest: number;
  connected: boolean;
  isHost: boolean;
}

export interface PublicRound {
  roundIndex: number;
  /** 詞彙本身對所有人公開（只有定義是機密） */
  term: string;
  /** 三個提示關鍵字，對所有人公開 */
  hints: string[];
  guesserId: string;
  phase: RoundPhase;
  /** 目前階段的結束時間戳（毫秒）；null 代表這個階段不倒數 */
  phaseEndsAt: number | null;
  /** 僅在 RESULT 階段揭露 */
  reveal: {
    honestId: string;
    vote: string | null;
    definition: string;
    correct: boolean;
    scoreDelta: Record<string, number>;
  } | null;
}

export interface PublicRoomState {
  code: string;
  hostId: string;
  players: PublicPlayer[];
  phase: RoomPhase;
  settings: RoomSettings;
  round: PublicRound | null;
  roundsPlayed: number;
  totalRounds: number;
  totalQuestions: number;
  /** 題庫中可用的題目總數，用來擋下「輪數超過題目數」 */
  deckSize: number;
  /** 依分數排序後的最終排名，僅在 GAME_OVER 時提供 */
  finalRanking: { rank: number; playerId: string; name: string; score: number }[] | null;
}

/** 只送給該玩家本人的機密資訊 */
export interface PrivateRoleInfo {
  roundIndex: number;
  role: Role;
  term: string;
  /**
   * 真實定義。只有老實人在 THINKING 階段拿得到；
   * 在 ROLE_ASSIGN（開始觀察前）只能看到題目；
   * 一旦進入 DISCUSSION 就會被收回（避免有人對著螢幕照唸，一看就穿幫），
   * 到 RESULT 才對所有人公開。
   */
  definition: string | null;
}

// ---------------------------------------------------------------------------
// Socket 事件（client → server）
// ---------------------------------------------------------------------------

export interface ClientToServerEvents {
  'room:create': (
    payload: { name: string },
    ack: (res: AckResult<{ code: string; playerId: string }>) => void
  ) => void;
  'room:join': (
    payload: { code: string; name: string },
    ack: (res: AckResult<{ code: string; playerId: string }>) => void
  ) => void;
  'room:rejoin': (
    payload: { code: string; playerId: string },
    ack: (res: AckResult<{ code: string; playerId: string }>) => void
  ) => void;
  'room:leave': () => void;
  'room:kick': (payload: { playerId: string }, ack: (res: AckResult<null>) => void) => void;
  'room:settings': (payload: Partial<RoomSettings>, ack: (res: AckResult<null>) => void) => void;
  'game:start': (ack: (res: AckResult<null>) => void) => void;
  /** 推進目前階段：ROLE_ASSIGN→THINKING 由猜題者按、RESULT→下一輪由猜題者或房主按 */
  'phase:advance': (ack: (res: AckResult<null>) => void) => void;
  /** 猜題者投票，直接結束該輪 */
  'game:vote': (payload: { targetId: string }, ack: (res: AckResult<null>) => void) => void;
  /** 猜題者嘲諷玩家：「騙肖仔！」 */
  'game:taunt': (payload: { targetId: string }, ack: (res: AckResult<null>) => void) => void;
  /** 房主緊急結束整場 */
  'game:abort': (ack: (res: AckResult<null>) => void) => void;
  /** 回到 LOBBY 再玩一場 */
  'game:restart': (ack: (res: AckResult<null>) => void) => void;
}

// ---------------------------------------------------------------------------
// Socket 事件（server → client）
// ---------------------------------------------------------------------------

export interface ServerToClientEvents {
  'room:state': (state: PublicRoomState) => void;
  'role:private': (info: PrivateRoleInfo | null) => void;
  'room:closed': (payload: { reason: string }) => void;
  'toast': (payload: { message: string; kind: 'info' | 'error' }) => void;
  /** 被猜題者嘲諷「騙肖仔！」 */
  'game:taunted': (payload: { guesserName: string; timestamp: number }) => void;
}

export type AckResult<T> = { ok: true; data: T } | { ok: false; error: string };

// ---------------------------------------------------------------------------
// 平衡性常數（集中管理，方便日後調整）
// ---------------------------------------------------------------------------

export const SCORE = {
  /** 猜對時，猜題者得分 */
  GUESSER_CORRECT: 2,
  /** 猜對時，老實人得分 */
  HONEST_WHEN_FOUND: 1,
  /** 猜錯時，被指到的瞎掰人得分 */
  BLUFFER_FOOLED_GUESSER: 2,
} as const;

export const LIMITS = {
  MIN_PLAYERS: 3,
  MAX_PLAYERS: 12,
  THINKING_MIN: 10,
  THINKING_MAX: 30,
  ROUNDS_MIN: 1,
  ROUNDS_MAX: 10,
  /** 每輪顯示幾個提示關鍵字（1 個相關 + 2 個無關） */
  HINT_COUNT: 3,
  /** 斷線後保留座位的秒數 */
  RECONNECT_GRACE_SECONDS: 60,
  NAME_MAX_LENGTH: 12,
} as const;

export const DEFAULT_SETTINGS: RoomSettings = {
  totalRounds: 1,
  thinkingSeconds: 20,
};

// ---------------------------------------------------------------------------
// 網路資訊（讓房主的分享連結／QR code 用區網 IP 而不是 localhost）
// ---------------------------------------------------------------------------

export interface NetworkInfo {
  /** 後端偵測到的區網 IPv4 位址（可能有多張網卡） */
  addresses: { address: string; interface: string }[];
  /** 後端自己的連接埠 */
  serverPort: number;
}

/** 知識分子 / 學術專屬的深度領域分類清單 */
export const INTELLECTUAL_CATEGORIES = [
  '理論物理與高深科學',
  '哲學悖論與認識論',
  '賽局理論與行為經濟學',
  '演化生物與罕見生理機制',
  '冷僻地緣政治與外交奇案',
  '認知科學與深層心理學',
  '語言學與符號學',
  '歷史典故與學術奇聞',
] as const;
