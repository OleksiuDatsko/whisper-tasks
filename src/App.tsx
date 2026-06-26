import React, { useEffect } from 'react';
import { useGameStore } from './store/gameStore';
import { Lobby } from './components/Lobby';
import { HostView } from './components/HostView';
import { PlayerView } from './components/PlayerView';
import { ThemeToggle } from './components/ThemeToggle';
import { webrtcService } from './services/webrtcService';
import { Users } from 'lucide-react';

const App: React.FC = () => {
  const { role, roomCode, connectionStatus } = useGameStore();

  // Host auto-reconnect on reload
  useEffect(() => {
    if (role === 'host' && roomCode && connectionStatus === 'disconnected') {
      webrtcService.connect(roomCode, 'host').catch((err) => {
        console.error('Failed to auto-reconnect host', err);
      });
    }
  }, [role, roomCode, connectionStatus]);

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 transition-colors duration-300 flex flex-col">
      {/* Global Top Nav */}
      <header className="sticky top-0 z-40 bg-white/80 dark:bg-neutral-900/80 backdrop-blur-md border-b border-neutral-200/50 dark:border-neutral-850 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2 select-none">
            <div className="p-1.5 bg-brand-500 text-white rounded-lg">
              <Users className="h-4 w-4" />
            </div>
            <span className="font-bold tracking-tight text-neutral-800 dark:text-white text-sm">
              Whisper Tasks
            </span>
          </div>

          <ThemeToggle />
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col justify-center py-6">
        {role === 'host' ? (
          <HostView />
        ) : role === 'player' ? (
          <PlayerView />
        ) : (
          <Lobby />
        )}
      </main>

      {/* Footer */}
      <footer className="py-6 border-t border-neutral-200/40 dark:border-neutral-900 text-center">
        <p className="text-[10px] font-medium text-neutral-400 dark:text-neutral-500">
          Whisper Tasks &copy; {new Date().getFullYear()} &bull; P2P Companion App для живих ігор
        </p>
      </footer>
    </div>
  );
};

export default App;
