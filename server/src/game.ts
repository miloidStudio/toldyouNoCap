/**
 * 遊戲服務層：把純邏輯（engine.ts）接上房間狀態、計時器與 Socket.io 廣播。
 *
 * 所有「會改變房間狀態」的動作都集中在這裡，
 * socket 層（index.ts）只負責參數驗證與轉發。
 *
 * 流程重點：一輪只有一個計時器（THINKING），
 * 開始觀察與進入下一輪由「猜題者」主導，討論階段不計時、由猜題者投票結束。
 */

import { randomUUID } from 'node:crypto';
import type { Server } from 'socket.io';
import {
  DEFAULT_SETTINGS,
  LIMITS,
  Player,
  PrivateRoleInfo,
  PublicRoomState,
  Question,
  Room,
  RoomSettings,
  RoundPhase,
} from '../../shared/types';
import {
  buildGuesserQueue,
  computeRanking,
  computeScoreDelta,
  createRound,
  generateRoomCode,
  pickHints,
  pickQuestion,
  takeNextGuesser,
} from './engine';
import { RoomStore } from './store';

export class GameError extends Error {}

interface PhaseTimer {
  timeout: NodeJS.Timeout;
  endsAt: number;
}

export class GameService {
  private phaseTimers = new Map<string, PhaseTimer>();
  private disconnectTimers = new Map<string, NodeJS.Timeout>();
  /** 目前階段的結束時間戳，供前端做倒數；null 代表該階段不倒數 */
  private phaseEndsAt = new Map<string, number | null>();

  constructor(
    private readonly store: RoomStore,
    private deck: readonly Question[],
    private readonly io: Server
  ) {}

  /** 熱更新記憶體中的題庫池 */
  updateDeck(newDeck: readonly Question[]): void {
    this.deck = newDeck;
  }

  // -------------------------------------------------------------------------
  // 房間生命週期
  // -------------------------------------------------------------------------

  async createRoom(hostName: string, socketId: string): Promise<{ room: Room; player: Player }> {
    let code = generateRoomCode(4);
    let attempts = 0;
    while (await this.store.has(code)) {
      attempts++;
      // 碰撞太多次就加長房號（規格允許 4–6 碼）
      code = generateRoomCode(attempts > 20 ? 6 : attempts > 8 ? 5 : 4);
    }

    const player = this.makePlayer(hostName, socketId);
    const room: Room = {
      code,
      hostId: player.id,
      players: [player],
      usedQuestionIds: [],
      currentRound: null,
      settings: { ...DEFAULT_SETTINGS },
      phase: 'LOBBY',
      guesserQueue: [],
      roundsPlayed: 0,
      totalRounds: 0,
      totalQuestions: 0,
      createdAt: Date.now(),
    };
    await this.store.set(room);
    return { room, player };
  }

  async joinRoom(
    code: string,
    name: string,
    socketId: string
  ): Promise<{ room: Room; player: Player }> {
    const room = await this.requireRoom(code);
    if (room.phase !== 'LOBBY') {
      throw new GameError('遊戲已經開始了，無法中途加入');
    }
    if (room.players.length >= LIMITS.MAX_PLAYERS) {
      throw new GameError(`房間已滿（上限 ${LIMITS.MAX_PLAYERS} 人）`);
    }
    if (room.players.some((p) => p.name === name)) {
      throw new GameError('這個暱稱已經有人用了，換一個吧');
    }
    const player = this.makePlayer(name, socketId);
    room.players.push(player);
    await this.store.set(room);
    return { room, player };
  }

  /** 斷線重連：沿用原本的 playerId 接回座位與分數 */
  async rejoinRoom(
    code: string,
    playerId: string,
    socketId: string
  ): Promise<{ room: Room; player: Player }> {
    const room = await this.requireRoom(code);
    const player = room.players.find((p) => p.id === playerId);
    if (!player) {
      throw new GameError('找不到你的座位，可能已經被移除或等待時間超過了');
    }
    player.socketId = socketId;
    player.disconnectedAt = null;
    this.clearDisconnectTimer(playerId);
    await this.store.set(room);
    return { room, player };
  }

  async markDisconnected(code: string, playerId: string, socketId?: string): Promise<void> {
    const room = await this.store.get(code);
    if (!room) return;
    const player = room.players.find((p) => p.id === playerId);
    if (!player) return;

    // 關鍵修復：如果玩家已經換上了新的 socket 連線（如重新整理或自動重連），
    // 舊 socket 的延遲斷線事件絕不能把新連線覆蓋為離線！
    if (socketId && player.socketId && player.socketId !== socketId) {
      return;
    }

    player.socketId = null;
    player.disconnectedAt = Date.now();
    await this.store.set(room);
    await this.broadcast(room);

    // 等待期內回來可以無縫接回；超過就依當下階段處理
    this.clearDisconnectTimer(playerId);
    this.disconnectTimers.set(
      playerId,
      setTimeout(() => {
        void this.handleGraceExpired(code, playerId);
      }, LIMITS.RECONNECT_GRACE_SECONDS * 1000)
    );
  }

  /**
   * 確保玩家的 socketId 與當前操作的連線保持一致。
   * 若玩家在線操作但因先前 race condition 被誤標為離線，自動自我修復為在線並補發身分。
   */
  async ensurePlayerConnected(code: string, playerId: string, socketId: string): Promise<void> {
    const room = await this.store.get(code);
    if (!room) return;
    const player = room.players.find((p) => p.id === playerId);
    if (!player) return;

    if (player.socketId !== socketId) {
      player.socketId = socketId;
      player.disconnectedAt = null;
      this.clearDisconnectTimer(playerId);
      await this.store.set(room);
      await this.broadcast(room);
      await this.sendPrivateRoles(room);
    }
  }

  private async handleGraceExpired(code: string, playerId: string): Promise<void> {
    this.disconnectTimers.delete(playerId);
    const room = await this.store.get(code);
    if (!room) return;
    const player = room.players.find((p) => p.id === playerId);
    if (!player || player.socketId !== null) return;

    if (room.phase === 'LOBBY') {
      // Lobby 階段直接移除，不影響任何進行中的資料
      await this.removePlayer(room, playerId, '等待重連逾時，已離開房間');
    } else {
      // 遊戲進行中保留座位與分數，交由房主決定是否踢除
      this.toastRoom(
        room,
        `「${player.name}」已離線超過 ${LIMITS.RECONNECT_GRACE_SECONDS} 秒，房主可手動踢除`,
        'info'
      );
      await this.broadcast(room);
    }
  }

  async removePlayer(room: Room, playerId: string, reason: string): Promise<void> {
    const index = room.players.findIndex((p) => p.id === playerId);
    if (index < 0) return;
    const [removed] = room.players.splice(index, 1);
    this.clearDisconnectTimer(playerId);

    // 通知被移除的人
    if (removed.socketId) {
      this.io.to(removed.socketId).emit('room:closed', { reason });
    }

    if (room.players.length === 0) {
      this.clearPhaseTimer(room.code);
      await this.store.delete(room.code);
      return;
    }

    // 房主離開就轉移給下一位（優先給還連線中的）
    if (room.hostId === playerId) {
      const next = room.players.find((p) => p.socketId !== null) ?? room.players[0];
      room.hostId = next.id;
      this.toastRoom(room, `房主已離開，「${next.name}」成為新房主`, 'info');
    }

    // 把他還沒輪到的猜題輪次也清掉
    room.guesserQueue = room.guesserQueue.filter((id) => id !== playerId);

    // 若進行中的輪次因此無法繼續，直接作廢該輪
    if (room.phase === 'PLAYING' && room.currentRound) {
      const r = room.currentRound;
      const involved = r.guesserId === playerId || r.honestId === playerId;
      if (involved || room.players.length < LIMITS.MIN_PLAYERS) {
        await this.abortCurrentRound(
          room,
          involved ? '該輪的關鍵角色離開，本輪作廢' : '人數不足，本輪作廢'
        );
        return;
      }
      // 只是瞎掰人離開：從名單中移除即可
      r.blufferIds = r.blufferIds.filter((id) => id !== playerId);
    }

    await this.store.set(room);
    await this.broadcast(room);
  }

  async kickPlayer(code: string, hostId: string, targetId: string): Promise<void> {
    const room = await this.requireRoom(code);
    this.requireHost(room, hostId);
    if (targetId === hostId) throw new GameError('房主不能踢除自己');
    await this.removePlayer(room, targetId, '你已被房主移出房間');
  }

  // -------------------------------------------------------------------------
  // 設定
  // -------------------------------------------------------------------------

  async updateSettings(code: string, hostId: string, patch: Partial<RoomSettings>): Promise<void> {
    const room = await this.requireRoom(code);
    this.requireHost(room, hostId);
    if (room.phase !== 'LOBBY') throw new GameError('遊戲進行中無法修改設定');

    const next: RoomSettings = { ...room.settings };

    if (patch.totalRounds !== undefined) {
      next.totalRounds = this.clampInt(patch.totalRounds, LIMITS.ROUNDS_MIN, LIMITS.ROUNDS_MAX, '輪數');
    }
    if (patch.thinkingSeconds !== undefined) {
      next.thinkingSeconds = this.clampInt(
        patch.thinkingSeconds,
        LIMITS.THINKING_MIN,
        LIMITS.THINKING_MAX,
        '思考秒數'
      );
    }

    room.settings = next;
    await this.store.set(room);
    await this.broadcast(room);
  }

  // -------------------------------------------------------------------------
  // 開局與輪次推進
  // -------------------------------------------------------------------------

  async startGame(code: string, hostId: string): Promise<void> {
    const room = await this.requireRoom(code);
    this.requireHost(room, hostId);
    if (room.phase !== 'LOBBY') throw new GameError('遊戲已經開始了');
    if (room.players.length < LIMITS.MIN_PLAYERS) {
      throw new GameError(
        `至少要 ${LIMITS.MIN_PLAYERS} 人才能開始（1 猜題者 + 1 老實人 + 至少 1 瞎掰人）`
      );
    }

    const totalRounds = room.settings.totalRounds;
    const totalQuestions = totalRounds * room.players.length;
    if (this.deck.length < totalQuestions) {
      throw new GameError(
        `題庫只有 ${this.deck.length} 題，不夠進行 ${totalRounds} 輪（共需 ${totalQuestions} 題）`
      );
    }

    room.phase = 'PLAYING';
    room.roundsPlayed = 0;
    room.totalRounds = totalRounds;
    room.totalQuestions = totalQuestions;
    room.usedQuestionIds = [];
    room.guesserQueue = buildGuesserQueue(
      room.players.map((p) => p.id),
      totalQuestions
    );
    for (const p of room.players) {
      p.score = 0;
      p.timesAsGuesser = 0;
      p.timesAsHonest = 0;
    }

    await this.startNextRound(room);
  }

  private async startNextRound(room: Room): Promise<void> {
    this.clearPhaseTimer(room.code);

    const present = room.players.map((p) => p.id);
    const { guesserId, queue } = takeNextGuesser(room.guesserQueue, present);
    room.guesserQueue = queue;

    if (!guesserId || room.players.length < LIMITS.MIN_PLAYERS) {
      await this.endGame(room);
      return;
    }

    const question = pickQuestion(this.deck, room.usedQuestionIds);
    if (!question) {
      this.toastRoom(room, '題庫的題目已經用完了，提前結束本場', 'info');
      await this.endGame(room);
      return;
    }

    room.usedQuestionIds.push(question.id);
    room.currentRound = createRound({
      roundIndex: room.roundsPlayed + 1,
      players: room.players,
      guesserId,
      question,
      deck: this.deck,
    });

    const guesser = room.players.find((p) => p.id === guesserId);
    const honest = room.players.find((p) => p.id === room.currentRound!.honestId);
    if (guesser) guesser.timesAsGuesser++;
    if (honest) honest.timesAsHonest++;

    await this.store.set(room);
    await this.broadcast(room);
    await this.sendPrivateRoles(room);
  }

  /**
   * 推進目前階段。
   *
   * actorId 為 null 代表是計時器自動觸發。
   * 誰有權推進由階段決定：
   *   ROLE_ASSIGN → THINKING：猜題者（房主為備援，避免猜題者斷線時卡住）
   *   THINKING    → DISCUSSION：倒數自動，或猜題者／房主提前結束
   *   DISCUSSION  → 只能由猜題者投票結束（房主可強制結束該輪，視為未投票）
   *   RESULT      → 下一輪：猜題者或房主
   */
  async advancePhase(code: string, actorId: string | null): Promise<void> {
    const room = await this.store.get(code);
    if (!room || room.phase !== 'PLAYING' || !room.currentRound) return;

    const round = room.currentRound;
    if (actorId !== null) this.requireGuesserOrHost(room, round.guesserId, actorId);

    switch (round.phase) {
      case 'ROLE_ASSIGN':
        this.setPhase(room, 'THINKING', room.settings.thinkingSeconds);
        break;
      case 'THINKING':
        this.setPhase(room, 'DISCUSSION', null);
        break;
      case 'DISCUSSION':
        // 沒有投票就結束討論（只有房主會這樣做）→ 該輪全員 0 分
        await this.resolveRound(room);
        return;
      case 'RESULT':
        await this.finishRoundAndContinue(room);
        return;
    }

    await this.store.set(room);
    await this.broadcast(room);
    // 階段改變會影響「老實人還看不看得到定義」，所以每次都要重送身分卡
    await this.sendPrivateRoles(room);
  }

  /**
   * 猜題者重抽題目：
   * 僅限在 ROLE_ASSIGN（看身分卡階段）執行。
   * 保留原本的猜題者、老實人與瞎掰人身分，只重抽題目與提示關鍵字。
   */
  async rerollQuestion(code: string, guesserId: string): Promise<void> {
    const room = await this.requireRoom(code);
    if (room.phase !== 'PLAYING' || !room.currentRound) {
      throw new GameError('目前沒有進行中的遊戲回合');
    }
    const round = room.currentRound;
    if (round.phase !== 'ROLE_ASSIGN') {
      throw new GameError('只有在「看身分卡」階段才能重抽題目');
    }
    if (round.guesserId !== guesserId) {
      throw new GameError('只有當前猜題者可以重抽題目');
    }

    const nextQuestion = pickQuestion(this.deck, room.usedQuestionIds);
    if (!nextQuestion) {
      throw new GameError('題庫中已無其他未使用的可用題目');
    }

    room.usedQuestionIds.push(nextQuestion.id);
    round.questionId = nextQuestion.id;
    round.term = nextQuestion.term;
    round.definition = nextQuestion.definition;
    round.hints = pickHints(nextQuestion, this.deck);

    this.toastRoom(room, '猜題者已更換題目，請重新查看身分卡！', 'info');
    await this.store.set(room);
    await this.broadcast(room);
    await this.sendPrivateRoles(room);
  }

  async vote(code: string, guesserId: string, targetId: string): Promise<void> {
    const room = await this.requireRoom(code);
    const round = room.currentRound;
    if (!round || round.phase !== 'DISCUSSION') throw new GameError('現在還不能投票');
    if (round.guesserId !== guesserId) throw new GameError('只有猜題者可以投票');
    if (targetId === guesserId) throw new GameError('不能投給自己');
    if (!room.players.some((p) => p.id === targetId)) throw new GameError('找不到這位玩家');

    round.vote = targetId;
    await this.resolveRound(room);
  }

  async tauntPlayer(code: string, guesserId: string, targetId: string): Promise<void> {
    const room = await this.requireRoom(code);
    const round = room.currentRound;
    if (!round || round.phase !== 'DISCUSSION') {
      throw new GameError('只有在討論階段才能使用「騙肖仔！」');
    }
    if (round.guesserId !== guesserId) {
      throw new GameError('只有猜題者可以使用「騙肖仔！」');
    }
    if (targetId === guesserId) {
      throw new GameError('不能對自己喊「騙肖仔！」');
    }
    const target = room.players.find((p) => p.id === targetId);
    if (!target) {
      throw new GameError('找不到這位玩家');
    }

    const guesser = room.players.find((p) => p.id === guesserId);
    const guesserName = guesser?.name ?? '猜題者';

    if (target.socketId) {
      this.io.to(target.socketId).emit('game:taunted', {
        guesserName,
        timestamp: Date.now(),
      });
    }
  }

  private async resolveRound(room: Room): Promise<void> {
    const round = room.currentRound;
    if (!round) return;

    const { delta } = computeScoreDelta(round);
    round.scoreDelta = delta;
    for (const player of room.players) {
      player.score += delta[player.id] ?? 0;
    }
    this.setPhase(room, 'RESULT', null);
    await this.store.set(room);
    await this.broadcast(room);
    // RESULT 階段公開定義，讓所有人都看得到正解
    await this.sendPrivateRoles(room);
  }

  private async finishRoundAndContinue(room: Room): Promise<void> {
    room.roundsPlayed++;
    room.currentRound = null;
    if (room.roundsPlayed >= room.totalQuestions || room.guesserQueue.length === 0) {
      await this.endGame(room);
    } else {
      await this.startNextRound(room);
    }
  }

  /** 中途作廢目前這輪（例如關鍵角色離場），不計分直接跳下一輪 */
  private async abortCurrentRound(room: Room, reason: string): Promise<void> {
    this.clearPhaseTimer(room.code);
    room.currentRound = null;
    this.toastRoom(room, reason, 'info');
    if (room.players.length < LIMITS.MIN_PLAYERS) {
      this.toastRoom(room, `人數不足 ${LIMITS.MIN_PLAYERS} 人，本場結束`, 'error');
      await this.endGame(room);
      return;
    }
    if (room.roundsPlayed >= room.totalQuestions || room.guesserQueue.length === 0) {
      await this.endGame(room);
      return;
    }
    await this.startNextRound(room);
  }

  async abortGame(code: string, hostId: string): Promise<void> {
    const room = await this.requireRoom(code);
    this.requireHost(room, hostId);
    if (room.phase !== 'PLAYING') throw new GameError('目前沒有進行中的遊戲');
    this.toastRoom(room, '房主提前結束了本場遊戲', 'info');
    await this.endGame(room);
  }

  private async endGame(room: Room): Promise<void> {
    this.clearPhaseTimer(room.code);
    room.phase = 'GAME_OVER';
    room.currentRound = null;
    await this.store.set(room);
    await this.broadcast(room);
    await this.sendPrivateRoles(room);
  }

  /** 回到 LOBBY 再玩一場（保留玩家，重置分數） */
  async restart(code: string, hostId: string): Promise<void> {
    const room = await this.requireRoom(code);
    this.requireHost(room, hostId);
    this.clearPhaseTimer(room.code);
    room.phase = 'LOBBY';
    room.currentRound = null;
    room.usedQuestionIds = [];
    room.guesserQueue = [];
    room.roundsPlayed = 0;
    room.totalRounds = 0;
    room.totalQuestions = 0;
    for (const p of room.players) {
      p.score = 0;
      p.timesAsGuesser = 0;
      p.timesAsHonest = 0;
    }
    await this.store.set(room);
    await this.broadcast(room);
    await this.sendPrivateRoles(room);
  }

  // -------------------------------------------------------------------------
  // 階段與計時器
  // -------------------------------------------------------------------------

  private setPhase(room: Room, phase: RoundPhase, seconds: number | null): void {
    if (!room.currentRound) return;
    room.currentRound.phase = phase;
    this.clearPhaseTimer(room.code);

    if (seconds === null) return;

    const endsAt = Date.now() + seconds * 1000;
    this.phaseEndsAt.set(room.code, endsAt);
    const timeout = setTimeout(() => {
      void this.advancePhase(room.code, null);
    }, seconds * 1000);
    this.phaseTimers.set(room.code, { timeout, endsAt });
  }

  private clearPhaseTimer(code: string): void {
    const timer = this.phaseTimers.get(code);
    if (timer) {
      clearTimeout(timer.timeout);
      this.phaseTimers.delete(code);
    }
    this.phaseEndsAt.set(code, null);
  }

  private clearDisconnectTimer(playerId: string): void {
    const t = this.disconnectTimers.get(playerId);
    if (t) {
      clearTimeout(t);
      this.disconnectTimers.delete(playerId);
    }
  }

  // -------------------------------------------------------------------------
  // 廣播
  // -------------------------------------------------------------------------

  buildPublicState(room: Room): PublicRoomState {
    const round = room.currentRound;
    return {
      code: room.code,
      hostId: room.hostId,
      phase: room.phase,
      settings: room.settings,
      roundsPlayed: room.roundsPlayed,
      totalRounds: room.totalRounds,
      totalQuestions: room.totalQuestions,
      deckSize: this.deck.length,
      players: room.players.map((p) => ({
        id: p.id,
        name: p.name,
        score: p.score,
        timesAsGuesser: p.timesAsGuesser,
        timesAsHonest: p.timesAsHonest,
        connected: p.socketId !== null,
        isHost: p.id === room.hostId,
      })),
      round: round
        ? {
            roundIndex: round.roundIndex,
            term: round.term,
            hints: round.hints,
            guesserId: round.guesserId,
            phase: round.phase,
            phaseEndsAt: this.phaseEndsAt.get(room.code) ?? null,
            reveal:
              round.phase === 'RESULT'
                ? {
                    honestId: round.honestId,
                    vote: round.vote,
                    definition: round.definition,
                    correct: round.vote === round.honestId,
                    scoreDelta: round.scoreDelta,
                  }
                : null,
          }
        : null,
      finalRanking: room.phase === 'GAME_OVER' ? computeRanking(room.players) : null,
    };
  }

  async broadcast(room: Room): Promise<void> {
    this.io.to(this.roomChannel(room.code)).emit('room:state', this.buildPublicState(room));
  }

  /** 逐一送出每位玩家自己的身分卡內容（其他人拿不到） */
  async sendPrivateRoles(room: Room): Promise<void> {
    const round = room.currentRound;
    for (const player of room.players) {
      if (!player.socketId) continue;
      if (!round) {
        this.io.to(player.socketId).emit('role:private', null);
        continue;
      }
      const role =
        player.id === round.guesserId
          ? 'GUESSER'
          : player.id === round.honestId
            ? 'HONEST'
            : 'BLUFFER';

      // 老實人只在「思考」階段拿得到定義；
      // 在 ROLE_ASSIGN（開始觀察前）只能看到題目；
      // 進入討論就收回，避免有人對著螢幕照唸而被一眼看穿。
      const honestCanRead = role === 'HONEST' && round.phase === 'THINKING';

      const info: PrivateRoleInfo = {
        roundIndex: round.roundIndex,
        role,
        term: round.term,
        definition: honestCanRead || round.phase === 'RESULT' ? round.definition : null,
      };
      this.io.to(player.socketId).emit('role:private', info);
    }
  }

  roomChannel(code: string): string {
    return `room:${code}`;
  }

  toastRoom(room: Room, message: string, kind: 'info' | 'error'): void {
    this.io.to(this.roomChannel(room.code)).emit('toast', { message, kind });
  }

  // -------------------------------------------------------------------------
  // 小工具
  // -------------------------------------------------------------------------

  async requireRoom(code: string): Promise<Room> {
    const room = await this.store.get(code);
    if (!room) throw new GameError(`找不到房間 ${code}`);
    return room;
  }

  private requireHost(room: Room, playerId: string): void {
    if (room.hostId !== playerId) throw new GameError('只有房主可以執行這個動作');
  }

  private requireGuesserOrHost(room: Room, guesserId: string, playerId: string): void {
    if (playerId !== guesserId && playerId !== room.hostId) {
      throw new GameError('這一輪由猜題者主持，等他決定');
    }
  }

  private makePlayer(name: string, socketId: string): Player {
    return {
      id: randomUUID(),
      name,
      socketId,
      score: 0,
      timesAsGuesser: 0,
      timesAsHonest: 0,
      disconnectedAt: null,
    };
  }

  private clampInt(value: number, min: number, max: number, label: string): number {
    const n = Math.round(Number(value));
    if (!Number.isFinite(n) || n < min || n > max) {
      throw new GameError(`${label}必須介於 ${min}–${max}`);
    }
    return n;
  }

  /** 測試/維運用：關閉所有計時器 */
  shutdown(): void {
    for (const t of this.phaseTimers.values()) clearTimeout(t.timeout);
    for (const t of this.disconnectTimers.values()) clearTimeout(t);
    this.phaseTimers.clear();
    this.disconnectTimers.clear();
  }
}
