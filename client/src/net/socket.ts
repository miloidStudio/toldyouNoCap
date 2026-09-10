/**
 * Socket.io 連線封裝。
 *
 * 對外只暴露「連線物件」與「帶 ack 的 emit」，
 * 讓畫面層不用處理 callback 風格的回呼。
 */

import { io, Socket } from 'socket.io-client';
import type {
  AckResult,
  ClientToServerEvents,
  ServerToClientEvents,
} from '../../../shared/types';
import { PROTOCOL_VERSION } from '../../../shared/types';
import { getServerUrl } from './env';

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: AppSocket | null = null;

export function getSocket(): AppSocket {
  if (socket) return socket;
  const url = getServerUrl();
  socket = (url ? io(url, socketOptions) : io(socketOptions)) as AppSocket;
  return socket;
}

const socketOptions = {
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 500,
  reconnectionDelayMax: 3000,
  timeout: 8000,
  auth: { protocolVersion: PROTOCOL_VERSION },
};

/** 包成 Promise 的 emit；伺服器回傳 { ok:false } 時 reject 出錯誤訊息 */
export function emitWithAck<T>(
  event: keyof ClientToServerEvents,
  payload?: unknown
): Promise<T> {
  return new Promise((resolve, reject) => {
    const s = getSocket();
    let settled = false;
    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error('伺服器回應逾時，請確認網路後再試一次'));
    }, 10_000);
    const ack = (res: AckResult<T>) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      if (res && res.ok) resolve(res.data);
      else reject(new Error(res?.error ?? '連線失敗'));
    };
    // 有些事件沒有 payload，直接把 ack 當第一個參數送出
    if (payload === undefined) {
      (s.emit as (e: string, cb: unknown) => void)(event, ack);
    } else {
      (s.emit as (e: string, p: unknown, cb: unknown) => void)(event, payload, ack);
    }
  });
}
