/**
 * 偵測本機的區網 IPv4 位址。
 *
 * 用途：房主在自己電腦上開房時，瀏覽器網址是 http://localhost:5173，
 * 直接拿 location.origin 去產生分享連結與 QR code 的話，
 * 別人的手機掃了只會連到「他自己的 localhost」，當然連不上。
 * 所以後端要把自己在區網裡的 IP 告訴前端。
 */

import { networkInterfaces } from 'node:os';
import type { NetworkInfo } from '../../shared/types';

/**
 * 一般家用／辦公室網段優先，讓多網卡的機器（VPN、Docker、虛擬網卡）
 * 也能挑到玩家手機真正連得到的那一張。
 */
function priority(address: string, name: string): number {
  let score = 0;
  if (/^192\.168\./.test(address)) score += 100;
  else if (/^10\./.test(address)) score += 80;
  else if (/^172\.(1[6-9]|2\d|3[01])\./.test(address)) score += 60;

  // 虛擬網卡通常不是玩家連得到的那一張，往後排
  if (/^(docker|br-|veth|vboxnet|vmnet|utun|tun|tap|ZeroTier|Hyper-V)/i.test(name)) score -= 200;
  // 一般實體網卡名稱
  if (/^(en|eth|wl|wlan|Wi-Fi|Ethernet)/i.test(name)) score += 10;
  return score;
}

export function detectLanAddresses(): { address: string; interface: string }[] {
  const found: { address: string; interface: string }[] = [];
  const interfaces = networkInterfaces();

  for (const [name, addrs] of Object.entries(interfaces)) {
    for (const addr of addrs ?? []) {
      // Node 18+ 的 family 是字串 'IPv4'，舊版是數字 4，兩種都接受
      const isIpv4 = addr.family === 'IPv4' || (addr.family as unknown as number) === 4;
      if (!isIpv4 || addr.internal) continue;
      found.push({ address: addr.address, interface: name });
    }
  }

  return found.sort(
    (a, b) =>
      priority(b.address, b.interface) - priority(a.address, a.interface) ||
      a.address.localeCompare(b.address)
  );
}

export function buildNetworkInfo(serverPort: number): NetworkInfo {
  return { addresses: detectLanAddresses(), serverPort };
}
