import { useEffect, useState } from 'react';
import { TauntOverlay } from './components/TauntOverlay';
import { Toasts } from './components/Toasts';
import { DeckAdminScreen } from './screens/DeckAdminScreen';
import { GameOverScreen } from './screens/GameOverScreen';
import { HomeScreen } from './screens/HomeScreen';
import { LobbyScreen } from './screens/LobbyScreen';
import { RoundScreen } from './screens/RoundScreen';
import { useGame } from './useGame';

export default function App() {
  const game = useGame();
  const [isAdmin, setIsAdmin] = useState(
    typeof window !== 'undefined' &&
      (window.location.hash === '#admin' || window.location.pathname === '/admin')
  );

  useEffect(() => {
    const handleHash = () => {
      setIsAdmin(window.location.hash === '#admin' || window.location.pathname === '/admin');
    };
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  const openAdmin = () => {
    setIsAdmin(true);
    if (typeof window !== 'undefined') window.location.hash = 'admin';
  };

  const closeAdmin = () => {
    setIsAdmin(false);
    if (typeof window !== 'undefined' && window.location.hash === '#admin') {
      window.history.replaceState(null, '', window.location.pathname);
    }
  };

  if (isAdmin) {
    return <DeckAdminScreen onBack={closeAdmin} />;
  }

  return (
    <>
      <Toasts toasts={game.toasts} />
      <TauntOverlay taunt={game.tauntNotice} onDismiss={game.dismissTaunt} />
      {!game.connected && game.room && (
        <div className="fixed inset-x-0 top-0 z-40 bg-rose-600 py-1 text-center text-sm font-bold">
          連線中斷，重新連線中…
        </div>
      )}
      {renderScreen()}
    </>
  );

  function renderScreen() {
    if (game.screen === 'HOME' || !game.room || !game.me) {
      return <HomeScreen game={game} onOpenAdmin={openAdmin} />;
    }
    if (game.room.phase === 'LOBBY') return <LobbyScreen game={game} />;
    if (game.room.phase === 'GAME_OVER') return <GameOverScreen game={game} />;
    if (game.room.round) return <RoundScreen game={game} />;
    return (
      <div className="flex h-full items-center justify-center text-slate-400">準備下一輪…</div>
    );
  }
}

