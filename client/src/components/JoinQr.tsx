/**
 * 房主 lobby 用的加入資訊：房號、分享連結、QR code（前端產生，不呼叫外部 API）。
 *
 * 重點：房主在自己電腦上開房時網址是 http://localhost:5173，
 * 直接拿它做 QR code 的話，別人掃了只會連到「他自己手機的 localhost」。
 * 所以偵測到 loopback 網址時，改用後端回報的區網 IP 來組連結。
 */

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { buildJoinUrl, isLoopbackHost } from '../net/env';
import type { GameApi } from '../useGame';
import { Button, Card, SectionTitle } from './ui';

export function JoinQr({ game }: { game: GameApi }) {
  const code = game.room!.code;
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const joinUrl = buildJoinUrl(code, game.lanAddress);
  const needsLan = isLoopbackHost();
  const lanMissing = needsLan && !game.lanAddress;

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(joinUrl, {
      width: 360,
      margin: 1,
      color: { dark: '#0b1020', light: '#ffffff' },
    })
      .then((url) => !cancelled && setDataUrl(url))
      .catch(() => setDataUrl(null));
    return () => {
      cancelled = true;
    };
  }, [joinUrl]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(joinUrl);
      game.pushToast('已複製加入連結');
    } catch {
      game.pushToast('這個瀏覽器不支援複製，請手動輸入房號', 'error');
    }
  };

  return (
    <Card className="text-center">
      <SectionTitle>邀請其他人加入</SectionTitle>

      <div className="tabular text-[3.25rem] font-black leading-none tracking-[0.28em] text-amber-300">
        {code}
      </div>
      <p className="mt-2 text-sm text-slate-400">在首頁輸入這組房號，或掃描下方 QR code</p>

      {dataUrl && (
        <div className="mx-auto mt-4 w-fit rounded-2xl bg-white p-2 shadow-lg">
          <img src={dataUrl} alt={`加入房間 ${code} 的 QR code`} className="w-48" />
        </div>
      )}

      <p className="mt-3 break-all font-mono text-xs text-slate-400">{joinUrl}</p>

      {lanMissing && (
        <p className="mt-2 rounded-xl bg-rose-500/12 px-3 py-2 text-xs leading-relaxed text-rose-200 ring-1 ring-rose-400/30">
          偵測不到區網 IP，這個連結只有你這台電腦連得到。
          請確認後端有正常啟動，或改用其他人手動輸入房號的方式。
        </p>
      )}

      {needsLan && game.lanAddresses.length > 1 && (
        <div className="mt-3 text-left">
          <label className="eyebrow mb-1 block">你的電腦有多張網卡，選對的那張</label>
          <select
            value={game.lanIndex}
            onChange={(e) => game.setLanIndex(Number(e.target.value))}
            className="w-full rounded-xl bg-black/30 px-3 py-2 text-sm ring-1 ring-white/12 outline-none"
          >
            {game.lanAddresses.map((a, i) => (
              <option key={a.address} value={i}>
                {a.address}（{a.interface}）
              </option>
            ))}
          </select>
        </div>
      )}

      <Button variant="secondary" className="mt-4" onClick={copy}>
        複製加入連結
      </Button>
    </Card>
  );
}
