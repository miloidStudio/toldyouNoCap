/**
 * NoCap 後端進入點。
 *
 * - Express 提供健康檢查、加入連結短網址 /j/:code，以及正式環境的前端靜態檔
 * - Socket.io 負責所有即時同步（房間 room 機制 + 斷線重連）
 */

import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import { Server } from 'socket.io';
import type {
  AckResult,
  ClientToServerEvents,
  ServerToClientEvents,
} from '../../shared/types';
import { LIMITS, Question } from '../../shared/types';
import { auditDeck, getNextQuestionId, validateQuestion } from '../../shared/validator';
import { generateIntellectualQuestions } from './ai';
import { loadDeck, loadAllQuestions, saveDeck } from './deck';
import { GameError, GameService } from './game';
import { buildNetworkInfo } from './network';
import { InMemoryRoomStore } from './store';

const here = dirname(fileURLToPath(import.meta.url));

// 自動載入根目錄或 server 目錄下的 .env 檔案
for (const envPath of [resolve(here, '../../.env'), resolve(here, '../.env')]) {
  if (existsSync(envPath)) {
    try {
      const lines = readFileSync(envPath, 'utf-8').split('\n');
      for (const line of lines) {
        const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
        if (match) {
          const key = match[1];
          let value = (match[2] || '').trim();
          if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
          }
          if (!process.env[key]) process.env[key] = value;
        }
      }
    } catch {
      /* ignore */
    }
  }
}

const PORT = Number(process.env.PORT ?? 3001);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? '*';

const deck = loadDeck();
console.log(`[deck] 已載入 ${deck.length} 筆已複核題目`);

const app = express();
app.use(cors({ origin: CLIENT_ORIGIN }));
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, deckSize: deck.length });
});

/**
 * 讓前端知道這台伺服器在區網裡的 IP，
 * 房主的分享連結／QR code 才不會變成別人連不到的 localhost。
 */
app.get('/api/network', (_req, res) => {
  res.json(buildNetworkInfo(PORT));
});

// ---------------------------------------------------------------------------
// 題庫管理 REST API
// ---------------------------------------------------------------------------

/** 取得所有題目、領域統計與健檢結果 */
app.get('/api/deck', (_req, res) => {
  const all = loadAllQuestions();
  const stats = {
    total: all.length,
    verifiedCount: all.filter((q) => q.verified).length,
    categories: {} as Record<string, number>,
  };
  for (const q of all) {
    if (q.category) stats.categories[q.category] = (stats.categories[q.category] ?? 0) + 1;
  }
  const audit = auditDeck(all);
  res.json({ ok: true, questions: all, stats, audit });
});

/** 新增單筆題目 */
app.post('/api/deck', (req, res) => {
  const body = req.body;
  const all = loadAllQuestions();
  const existingTerms = new Set(all.map((q) => q.term.trim()));
  const validation = validateQuestion(body, existingTerms);
  if (!validation.valid) {
    return res.status(400).json({ ok: false, error: validation.issues.map((i) => i.message).join('；') });
  }

  const nextId = getNextQuestionId(all);
  const newQ: Question = {
    id: nextId,
    term: String(body.term).trim(),
    definition: String(body.definition).trim(),
    category: String(body.category).trim(),
    hintKeyword: String(body.hintKeyword).trim(),
    difficulty: ([1, 2, 3].includes(Number(body.difficulty)) ? Number(body.difficulty) : 3) as 1 | 2 | 3,
    sourceUrl: body.sourceUrl || `https://zh.wikipedia.org/wiki/${encodeURIComponent(String(body.term).trim())}`,
    pageviews: Number(body.pageviews) || 20,
    dykHook: body.dykHook || null,
    verified: body.verified !== undefined ? Boolean(body.verified) : true,
  };

  const updated = [...all, newQ];
  const activeDeck = saveDeck(updated);
  game.updateDeck(activeDeck);
  res.json({ ok: true, question: newQ });
});

/** 批次新增題目 */
app.post('/api/deck/batch', (req, res) => {
  const { questions: items } = req.body || {};
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ ok: false, error: '請提供合法的題目陣列' });
  }

  const all = loadAllQuestions();
  const existingTerms = new Set(all.map((q) => q.term.trim()));
  const added: Question[] = [];
  let tempDeck = [...all];

  for (const item of items) {
    const val = validateQuestion(item, existingTerms);
    if (val.valid) {
      const nextId = getNextQuestionId(tempDeck);
      const q: Question = {
        id: nextId,
        term: String(item.term).trim(),
        definition: String(item.definition).trim(),
        category: String(item.category).trim(),
        hintKeyword: String(item.hintKeyword).trim(),
        difficulty: ([1, 2, 3].includes(Number(item.difficulty)) ? Number(item.difficulty) : 3) as 1 | 2 | 3,
        sourceUrl: item.sourceUrl || `https://zh.wikipedia.org/wiki/${encodeURIComponent(String(item.term).trim())}`,
        pageviews: 20,
        dykHook: item.dykHook || null,
        verified: true,
      };
      added.push(q);
      tempDeck.push(q);
      existingTerms.add(q.term);
    }
  }

  const activeDeck = saveDeck(tempDeck);
  game.updateDeck(activeDeck);
  res.json({ ok: true, count: added.length, questions: added });
});

/** 更新指定題目（可更新內容或切換 verified 開關） */
app.put('/api/deck/:id', (req, res) => {
  const id = req.params.id;
  const body = req.body;
  const all = loadAllQuestions();
  const idx = all.findIndex((q) => q.id === id);
  if (idx === -1) {
    return res.status(404).json({ ok: false, error: '找不到該題目' });
  }

  const existing = all[idx];
  const merged: Question = {
    ...existing,
    ...body,
    id: existing.id, // 保留原 ID
  };

  const otherTerms = new Set(all.filter((q) => q.id !== id).map((q) => q.term.trim()));
  const validation = validateQuestion(merged, otherTerms);
  if (!validation.valid) {
    return res.status(400).json({ ok: false, error: validation.issues.map((i) => i.message).join('；') });
  }

  all[idx] = merged;
  const activeDeck = saveDeck(all);
  game.updateDeck(activeDeck);
  res.json({ ok: true, question: merged });
});

/** 刪除指定題目 */
app.delete('/api/deck/:id', (req, res) => {
  const id = req.params.id;
  const all = loadAllQuestions();
  const filtered = all.filter((q) => q.id !== id);
  if (filtered.length === all.length) {
    return res.status(404).json({ ok: false, error: '找不到該題目' });
  }

  const activeDeck = saveDeck(filtered);
  game.updateDeck(activeDeck);
  res.json({ ok: true, deletedId: id });
});

/** 呼叫 Gemini 產生候選題目供前端預覽 */
app.post('/api/deck/generate', async (req, res) => {
  try {
    const { count = 5, category, topic, apiKey } = req.body || {};
    const effectiveApiKey =
      (apiKey && String(apiKey).trim()) ||
      (req.headers['x-gemini-api-key'] ? String(req.headers['x-gemini-api-key']).trim() : undefined) ||
      process.env.GEMINI_API_KEY;

    if (!effectiveApiKey) {
      return res.status(400).json({
        ok: false,
        error: '未設定 GEMINI_API_KEY。請在網頁彈窗中輸入金鑰，或在專案根目錄 .env 檔案中設定。',
      });
    }

    const all = loadAllQuestions();
    const existingTerms = new Set(all.map((q) => q.term.trim()));
    const rawCandidates = await generateIntellectualQuestions({
      count: Math.min(Number(count) || 5, 20),
      category: category ? String(category) : undefined,
      topic: topic ? String(topic) : undefined,
      apiKey: effectiveApiKey,
      existingTerms,
    });

    const candidates = rawCandidates.map((raw) => ({
      candidate: raw,
      validation: validateQuestion(raw, existingTerms),
    }));

    res.json({ ok: true, candidates });
  } catch (err: any) {
    console.error('[deck:generate error]', err);
    res.status(500).json({ ok: false, error: err.message || '生成失敗' });
  }
});

/** 重設題庫回最初 30 題 */
app.post('/api/deck/reset', (_req, res) => {
  const all = loadAllQuestions();
  const original30 = all.slice(0, 30);
  const activeDeck = saveDeck(original30);
  game.updateDeck(activeDeck);
  res.json({ ok: true, count: original30.length });
});

const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: { origin: CLIENT_ORIGIN },
  // 斷線重連的緩衝：短暫斷網不會立刻掉 socket
  pingTimeout: 20000,
});

const store = new InMemoryRoomStore();
const game = new GameService(store, deck, io);

// ---------------------------------------------------------------------------
// 每條 socket 連線綁定的資料
// ---------------------------------------------------------------------------

interface SocketSession {
  code: string;
  playerId: string;
}

const sessions = new Map<string, SocketSession>();

function ok<T>(data: T): AckResult<T> {
  return { ok: true, data };
}

function fail(error: unknown): AckResult<never> {
  const message = error instanceof GameError ? error.message : '發生未預期的錯誤，請稍後再試';
  if (!(error instanceof GameError)) console.error(error);
  return { ok: false, error: message };
}

function normalizeName(raw: unknown): string {
  const name = String(raw ?? '').trim().replace(/\s+/g, ' ');
  if (name.length === 0) throw new GameError('請輸入暱稱');
  if (name.length > LIMITS.NAME_MAX_LENGTH) {
    throw new GameError(`暱稱最多 ${LIMITS.NAME_MAX_LENGTH} 個字`);
  }
  return name;
}

function normalizeCode(raw: unknown): string {
  const code = String(raw ?? '').trim().toUpperCase();
  if (!/^[A-Z0-9]{4,6}$/.test(code)) throw new GameError('房號格式不正確');
  return code;
}

io.on('connection', (socket) => {
  const bind = async (code: string, playerId: string) => {
    sessions.set(socket.id, { code, playerId });
    await socket.join(game.roomChannel(code));
  };

  const session = () => {
    const s = sessions.get(socket.id);
    if (!s) throw new GameError('你還沒有加入任何房間');
    return s;
  };

  socket.on('room:create', async (payload, ack) => {
    try {
      const name = normalizeName(payload?.name);
      const { room, player } = await game.createRoom(name, socket.id);
      await bind(room.code, player.id);
      ack(ok({ code: room.code, playerId: player.id }));
      await game.broadcast(room);
    } catch (e) {
      ack(fail(e));
    }
  });

  socket.on('room:join', async (payload, ack) => {
    try {
      const code = normalizeCode(payload?.code);
      const name = normalizeName(payload?.name);
      const { room, player } = await game.joinRoom(code, name, socket.id);
      await bind(code, player.id);
      ack(ok({ code, playerId: player.id }));
      await game.broadcast(room);
      await game.sendPrivateRoles(room);
    } catch (e) {
      ack(fail(e));
    }
  });

  socket.on('room:rejoin', async (payload, ack) => {
    try {
      const code = normalizeCode(payload?.code);
      const playerId = String(payload?.playerId ?? '');
      const { room, player } = await game.rejoinRoom(code, playerId, socket.id);
      await bind(code, player.id);
      ack(ok({ code, playerId: player.id }));
      await game.broadcast(room);
      await game.sendPrivateRoles(room);
    } catch (e) {
      ack(fail(e));
    }
  });

  socket.on('room:leave', async () => {
    const s = sessions.get(socket.id);
    if (!s) return;
    sessions.delete(socket.id);
    await socket.leave(game.roomChannel(s.code));
    const room = await store.get(s.code);
    if (room) await game.removePlayer(room, s.playerId, '你已離開房間');
  });

  socket.on('room:kick', async (payload, ack) => {
    try {
      const s = session();
      await game.kickPlayer(s.code, s.playerId, String(payload?.playerId ?? ''));
      ack(ok(null));
    } catch (e) {
      ack(fail(e));
    }
  });

  socket.on('room:settings', async (payload, ack) => {
    try {
      const s = session();
      await game.updateSettings(s.code, s.playerId, payload ?? {});
      ack(ok(null));
    } catch (e) {
      ack(fail(e));
    }
  });

  socket.on('game:start', async (ack) => {
    try {
      const s = session();
      await game.startGame(s.code, s.playerId);
      ack(ok(null));
    } catch (e) {
      ack(fail(e));
    }
  });

  socket.on('phase:advance', async (ack) => {
    try {
      const s = session();
      await game.advancePhase(s.code, s.playerId);
      ack(ok(null));
    } catch (e) {
      ack(fail(e));
    }
  });

  socket.on('game:vote', async (payload, ack) => {
    try {
      const s = session();
      await game.vote(s.code, s.playerId, String(payload?.targetId ?? ''));
      ack(ok(null));
    } catch (e) {
      ack(fail(e));
    }
  });

  socket.on('game:taunt', async (payload, ack) => {
    try {
      const s = session();
      await game.tauntPlayer(s.code, s.playerId, String(payload?.targetId ?? ''));
      ack(ok(null));
    } catch (e) {
      ack(fail(e));
    }
  });

  socket.on('game:abort', async (ack) => {
    try {
      const s = session();
      await game.abortGame(s.code, s.playerId);
      ack(ok(null));
    } catch (e) {
      ack(fail(e));
    }
  });

  socket.on('game:restart', async (ack) => {
    try {
      const s = session();
      await game.restart(s.code, s.playerId);
      ack(ok(null));
    } catch (e) {
      ack(fail(e));
    }
  });

  socket.on('disconnect', async () => {
    const s = sessions.get(socket.id);
    if (!s) return;
    sessions.delete(socket.id);
    await game.markDisconnected(s.code, s.playerId);
  });
});

// ---------------------------------------------------------------------------
// 靜態檔（正式環境下由後端一起服務前端，方便同一台機器開房給區網玩家連）
// ---------------------------------------------------------------------------

const clientDist = resolve(here, '../../client/dist');
if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
  // /j/:code 與其他前端路由一律交給 SPA 處理
  app.get(/^\/(?!api\/|socket\.io\/).*/, (_req, res) => {
    res.sendFile(resolve(clientDist, 'index.html'));
  });
  console.log(`[static] 已掛載前端靜態檔：${clientDist}`);
} else {
  console.log('[static] 找不到 client/dist，僅提供 API（開發模式請另外啟動 Vite）');
}

httpServer.listen(PORT, () => {
  console.log(`[server] NoCap 後端已啟動：http://localhost:${PORT}`);
  const { addresses } = buildNetworkInfo(PORT);
  if (addresses.length > 0) {
    console.log('[server] 同一個區網的裝置可用以下位址連進來：');
    for (const a of addresses) {
      console.log(`         http://${a.address}:${PORT}   (${a.interface})`);
    }
  } else {
    console.log('[server] 找不到區網 IP，其他裝置可能連不進來');
  }
});

// 優雅關閉，避免 nodemon/tsx 重啟時殘留計時器
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    game.shutdown();
    httpServer.close(() => process.exit(0));
  });
}
