/**
 * 執行環境抽象層。
 *
 * 前端邏輯不直接假設「自己跑在瀏覽器分頁裡」，
 * 所有跟環境有關的判斷（後端位址、分享連結網域、深連結解析、本機儲存）
 * 都集中在這裡。之後要包成 Capacitor App 或 Electron App 時，
 * 只需要替換這個檔案的實作，畫面與遊戲邏輯完全不用動。
 */

import type { NetworkInfo, SessionCredentials } from '../../../shared/types';

export type Platform = 'web' | 'capacitor' | 'electron';

export function detectPlatform(): Platform {
  const w = globalThis as unknown as Record<string, unknown>;
  if (w.Capacitor) return 'capacitor';
  if (w.electronAPI || (typeof navigator !== 'undefined' && /Electron/i.test(navigator.userAgent))) {
    return 'electron';
  }
  return 'web';
}

/**
 * Socket.io 要連的後端位址。
 * - web：同源（開發時由 Vite proxy 轉給 :3001）
 * - App 包裝：必須用環境變數指定完整網址
 */
export function getServerUrl(): string | undefined {
  const configured = import.meta.env.VITE_SERVER_URL as string | undefined;
  if (configured) return configured;
  if (detectPlatform() !== 'web') {
    console.warn('[env] App 環境未設定 VITE_SERVER_URL，將無法連線');
  }
  return undefined; // undefined = socket.io 使用同源
}

// ---------------------------------------------------------------------------
// 分享連結：房主在自己電腦上開房時，網址是 localhost，
// 直接拿來做 QR code 的話別人掃了只會連到「他自己的 localhost」。
// 所以要跟後端要區網 IP 來組連結。
// ---------------------------------------------------------------------------

const LOOPBACK = /^(localhost|127\.0\.0\.1|\[?::1\]?|0\.0\.0\.0)$/i;

/** 目前的網址是不是只有自己這台電腦連得到 */
export function isLoopbackHost(): boolean {
  if (typeof location === 'undefined') return false;
  return LOOPBACK.test(location.hostname);
}

/** 向後端詢問它在區網裡的 IP */
export async function fetchNetworkInfo(): Promise<NetworkInfo | null> {
  try {
    const base = getServerUrl() ?? '';
    const res = await fetch(`${base}/api/network`);
    if (!res.ok) return null;
    return (await res.json()) as NetworkInfo;
  } catch {
    return null;
  }
}

/**
 * 產生分享連結用的網域。
 *
 * 優先序：
 *   1. VITE_PUBLIC_ORIGIN（正式部署時指定的網域）
 *   2. 網址是 localhost 時 → 換成後端回報的區網 IP，連接埠沿用目前這個
 *      （開發模式是 5173、正式模式是 3001，兩種都對）
 *   3. location.origin
 */
export function getShareOrigin(lanAddress?: string | null): string {
  const configured = import.meta.env.VITE_PUBLIC_ORIGIN as string | undefined;
  if (configured) return configured.replace(/\/$/, '');
  if (typeof location === 'undefined') return '';

  if (lanAddress && isLoopbackHost()) {
    const port = location.port ? `:${location.port}` : '';
    return `${location.protocol}//${lanAddress}${port}`;
  }
  return location.origin;
}

export function buildJoinUrl(code: string, lanAddress?: string | null): string {
  return `${getShareOrigin(lanAddress)}/j/${code}`;
}

/** 從目前網址解析出 /j/<房號> 的房號；不是深連結時回傳 null */
export function parseJoinCodeFromLocation(): string | null {
  if (typeof location === 'undefined') return null;
  const match = location.pathname.match(/^\/j\/([A-Za-z0-9]{4,6})\/?$/);
  return match ? match[1].toUpperCase() : null;
}

/** 把網址列改回根路徑，避免重新整理時又被當成新的加入動作 */
export function clearJoinUrl(): void {
  if (typeof history !== 'undefined' && location.pathname.startsWith('/j/')) {
    history.replaceState(null, '', '/');
  }
}

// ---------------------------------------------------------------------------
// 本機儲存（斷線重連 + 記住暱稱）
// ---------------------------------------------------------------------------

const SESSION_KEY = 'nocap.session';
const NAME_KEY = 'nocap.name';

export type StoredSession = SessionCredentials;

function safeStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function loadSession(): StoredSession | null {
  try {
    const storage = safeStorage();
    const raw = storage?.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSession;
    return parsed.code && parsed.playerId && parsed.reconnectToken ? parsed : null;
  } catch {
    return null;
  }
}

export function saveSession(session: StoredSession): void {
  try {
    safeStorage()?.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    /* 隱私模式下可能失敗，忽略即可 */
  }
}

export function clearSession(): void {
  try {
    safeStorage()?.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * 關閉分頁時通知伺服器。keepalive 能在頁面卸載後繼續送出短小請求；
 * 手機切換 App 或鎖屏只會觸發 visibilitychange，不會主動呼叫這裡。
 */
export function notifyPageExit(session: StoredSession): void {
  if (typeof location === 'undefined') return;
  const base = getServerUrl()?.replace(/\/$/, '') ?? '';
  const url = `${base}/api/room/page-exit`;
  const body = JSON.stringify(session);

  try {
    void fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    });
  } catch {
    /* 頁面已卸載時無法補救；一般 socket disconnect 仍會保留離線座位 */
  }
}

export function loadName(): string {
  try {
    const storage = safeStorage();
    return storage?.getItem(NAME_KEY) || '';
  } catch {
    return '';
  }
}

export function saveName(name: string): void {
  try {
    safeStorage()?.setItem(NAME_KEY, name);
  } catch {
    /* ignore */
  }
}
