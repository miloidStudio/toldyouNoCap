/**
 * 遊戲狀態 Hook：把 socket 事件轉成 React 狀態，並提供各種操作動作。
 * 畫面元件只依賴這個 Hook 的回傳值，不直接碰 socket。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  NetworkInfo,
  PrivateRoleInfo,
  PublicRoomState,
  RoomSettings,
} from '../../shared/types';
import type { TauntNotice } from './components/TauntOverlay';
import {
  clearJoinUrl,
  clearSession,
  fetchNetworkInfo,
  isLoopbackHost,
  loadName,
  loadSession,
  parseJoinCodeFromLocation,
  saveName,
  saveSession,
} from './net/env';
import { emitWithAck, getSocket } from './net/socket';

export interface ToastMessage {
  id: number;
  message: string;
  kind: 'info' | 'error';
}

export type Screen = 'HOME' | 'ROOM';

export function useGame() {
  const [connected, setConnected] = useState(false);
  const [room, setRoom] = useState<PublicRoomState | null>(null);
  const [privateRole, setPrivateRole] = useState<PrivateRoleInfo | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [name, setName] = useState(() => loadName());
  const [pendingJoinCode, setPendingJoinCode] = useState<string | null>(() =>
    parseJoinCodeFromLocation()
  );
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [tauntNotice, setTauntNotice] = useState<TauntNotice | null>(null);
  const [busy, setBusy] = useState(false);
  const [network, setNetwork] = useState<NetworkInfo | null>(null);
  const [lanIndex, setLanIndex] = useState(0);
  const toastId = useRef(0);
  const tauntIdRef = useRef(0);

  const pushToast = useCallback((message: string, kind: 'info' | 'error' = 'info') => {
    const id = ++toastId.current;
    setToasts((prev) => [...prev, { id, message, kind }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500);
  }, []);

  // -------------------------------------------------------------------------
  // 區網 IP：只有在網址是 localhost 時才需要（否則分享連結本來就對）
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!isLoopbackHost()) return;
    let cancelled = false;
    void fetchNetworkInfo().then((info) => {
      if (!cancelled) setNetwork(info);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // -------------------------------------------------------------------------
  // socket 事件綁定
  // -------------------------------------------------------------------------
  useEffect(() => {
    const socket = getSocket();

    const onConnect = () => {
      setConnected(true);
      // 斷線重連：用 localStorage 內的座位資訊自動接回
      const session = loadSession();
      if (session) {
        emitWithAck<{ code: string; playerId: string }>('room:rejoin', session)
          .then((res) => setPlayerId(res.playerId))
          .catch(() => {
            clearSession();
            setPlayerId(null);
            setRoom(null);
          });
      }
    };
    const onDisconnect = () => setConnected(false);
    const onState = (state: PublicRoomState) => setRoom(state);
    const onRole = (info: PrivateRoleInfo | null) => setPrivateRole(info);
    const onClosed = ({ reason }: { reason: string }) => {
      clearSession();
      setRoom(null);
      setPrivateRole(null);
      setPlayerId(null);
      setTauntNotice(null);
      pushToast(reason, 'error');
    };
    const onToast = (payload: { message: string; kind: 'info' | 'error' }) =>
      pushToast(payload.message, payload.kind);
    const onTaunted = (payload: { guesserName: string; timestamp: number }) => {
      const id = ++tauntIdRef.current;
      setTauntNotice({ guesserName: payload.guesserName, id });
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('room:state', onState);
    socket.on('role:private', onRole);
    socket.on('room:closed', onClosed);
    socket.on('toast', onToast);
    socket.on('game:taunted', onTaunted);
    if (socket.connected) onConnect();

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('room:state', onState);
      socket.off('role:private', onRole);
      socket.off('room:closed', onClosed);
      socket.off('toast', onToast);
      socket.off('game:taunted', onTaunted);
    };
  }, [pushToast]);

  // -------------------------------------------------------------------------
  // 動作
  // -------------------------------------------------------------------------

  const run = useCallback(
    async (fn: () => Promise<unknown>) => {
      setBusy(true);
      try {
        await fn();
        return true;
      } catch (e) {
        pushToast(e instanceof Error ? e.message : '操作失敗', 'error');
        return false;
      } finally {
        setBusy(false);
      }
    },
    [pushToast]
  );

  const createRoom = useCallback(
    async (playerName: string) => {
      saveName(playerName);
      setName(playerName);
      return run(async () => {
        const res = await emitWithAck<{ code: string; playerId: string }>('room:create', {
          name: playerName,
        });
        saveSession(res);
        setPlayerId(res.playerId);
        clearJoinUrl();
        setPendingJoinCode(null);
      });
    },
    [run]
  );

  const joinRoom = useCallback(
    async (code: string, playerName: string) => {
      saveName(playerName);
      setName(playerName);
      return run(async () => {
        const res = await emitWithAck<{ code: string; playerId: string }>('room:join', {
          code: code.toUpperCase(),
          name: playerName,
        });
        saveSession(res);
        setPlayerId(res.playerId);
        clearJoinUrl();
        setPendingJoinCode(null);
      });
    },
    [run]
  );

  const leaveRoom = useCallback(() => {
    getSocket().emit('room:leave');
    clearSession();
    setRoom(null);
    setPrivateRole(null);
    setPlayerId(null);
    setTauntNotice(null);
  }, []);

  const updateSettings = useCallback(
    (patch: Partial<RoomSettings>) => run(() => emitWithAck('room:settings', patch)),
    [run]
  );
  const kickPlayer = useCallback(
    (targetId: string) => run(() => emitWithAck('room:kick', { playerId: targetId })),
    [run]
  );
  const startGame = useCallback(() => run(() => emitWithAck('game:start')), [run]);
  const advancePhase = useCallback(() => run(() => emitWithAck('phase:advance')), [run]);
  const rerollQuestion = useCallback(
    () => run(() => emitWithAck('round:rerollQuestion')),
    [run]
  );
  const vote = useCallback(
    (targetId: string) => run(() => emitWithAck('game:vote', { targetId })),
    [run]
  );
  const dismissTaunt = useCallback(() => setTauntNotice(null), []);
  const taunt = useCallback(
    async (targetId: string) => {
      try {
        await emitWithAck('game:taunt', { targetId });
        return true;
      } catch (e) {
        pushToast(e instanceof Error ? e.message : '嘲諷失敗', 'error');
        return false;
      }
    },
    [pushToast]
  );
  const abortGame = useCallback(() => run(() => emitWithAck('game:abort')), [run]);
  const restart = useCallback(() => run(() => emitWithAck('game:restart')), [run]);

  // -------------------------------------------------------------------------
  // 衍生資料
  // -------------------------------------------------------------------------

  const me = useMemo(
    () => (room && playerId ? (room.players.find((p) => p.id === playerId) ?? null) : null),
    [room, playerId]
  );
  const isHost = !!me && room?.hostId === me.id;
  const isGuesser = !!me && room?.round?.guesserId === me.id;
  const screen: Screen = room && me ? 'ROOM' : 'HOME';

  const lanAddresses = network?.addresses ?? [];
  const lanAddress = lanAddresses[lanIndex]?.address ?? null;

  return {
    connected,
    room,
    me,
    isHost,
    isGuesser,
    privateRole,
    name,
    setName,
    pendingJoinCode,
    setPendingJoinCode,
    toasts,
    busy,
    screen,
    lanAddress,
    lanAddresses,
    lanIndex,
    setLanIndex,
    pushToast,
    tauntNotice,
    dismissTaunt,
    createRoom,
    joinRoom,
    leaveRoom,
    updateSettings,
    kickPlayer,
    startGame,
    advancePhase,
    rerollQuestion,
    vote,
    taunt,
    abortGame,
    restart,
  };
}

export type GameApi = ReturnType<typeof useGame>;
