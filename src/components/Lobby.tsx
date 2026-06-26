import React, { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { webrtcService } from '../services/webrtcService';
import { Settings, Play, Users, Key, AlertCircle, Copy, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export const Lobby: React.FC = () => {
  const { playerName, setPlayerName, apiKey, setApiKey, connectionStatus } = useGameStore();
  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loadingRole, setLoadingRole] = useState<'host' | 'player' | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);

  const generateRoomCode = (): string => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Avoid easily confused chars
    let code = '';
    for (let i = 0; i < 4; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  };

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!playerName.trim()) {
      setErrorMsg("Будь ласка, введіть своє ім'я.");
      return;
    }
    if (!apiKey.trim()) {
      setErrorMsg("Будь ласка, вкажіть Metered Realtime API Key.");
      return;
    }

    setErrorMsg(null);
    setLoadingRole('host');
    const newCode = generateRoomCode();

    try {
      // Fetch the default cards
      const response = await fetch('./cards/base-ua.json');
      if (response.ok) {
        const data = await response.json();
        useGameStore.getState().setCatalogDeck(data.cards || []);
      } else {
        useGameStore.getState().addLog('Не вдалося завантажити каталог карток із сервера. Використовуємо порожню колоду.', 'error');
      }

      await webrtcService.connect(newCode, 'host');
    } catch (err: any) {
      setErrorMsg(err.message || "Не вдалося створити кімнату. Спробуйте ще раз.");
    } finally {
      setLoadingRole(null);
    }
  };

  const handleJoinRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!playerName.trim()) {
      setErrorMsg("Будь ласка, введіть своє ім'я.");
      return;
    }
    if (!roomCodeInput.trim() || roomCodeInput.length !== 4) {
      setErrorMsg("Код кімнати повинен містити 4 символи.");
      return;
    }
    if (!apiKey.trim()) {
      setErrorMsg("Будь ласка, вкажіть Metered Realtime API Key.");
      return;
    }

    setErrorMsg(null);
    setLoadingRole('player');
    const cleanCode = roomCodeInput.toUpperCase().trim();

    try {
      await webrtcService.connect(cleanCode, 'player');
    } catch (err: any) {
      setErrorMsg(err.message || "Не вдалося підключитися до кімнати. Перевірте код.");
    } finally {
      setLoadingRole(null);
    }
  };

  const copyDefaultApiKey = () => {
    const defaultKey = 'pk_live_d8438186a51d8db02c918ef9bcfb5c0f';
    setApiKey(defaultKey);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  const isLoading = connectionStatus === 'connecting' || loadingRole !== null;

  return (
    <div className="w-full max-w-md mx-auto px-4 py-8">
      {/* Brand Header */}
      <div className="text-center mb-8">
        <motion.div 
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 15 }}
          className="inline-flex items-center justify-center p-4 bg-brand-500 text-white rounded-3xl shadow-lg shadow-brand-500/20 mb-4"
        >
          <Users className="h-8 w-8" />
        </motion.div>
        <h1 className="text-4xl font-extrabold tracking-tight text-neutral-900 dark:text-white mb-2">
          Whisper Tasks
        </h1>
      </div>

      {/* Main card */}
      <motion.div 
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="glass-panel rounded-3xl shadow-premium p-6 mb-4 relative overflow-hidden"
      >
        <AnimatePresence>
          {errorMsg && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 rounded-2xl p-4 flex items-start gap-3 mb-6"
            >
              <AlertCircle className="h-5 w-5 text-red-500 dark:text-red-400 shrink-0 mt-0.5" />
              <p className="text-sm text-red-800 dark:text-red-300 font-medium">{errorMsg}</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Player Name Input */}
        <div className="mb-6">
          <label htmlFor="playerName" className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-2">
            Ваше ім'я
          </label>
          <input
            type="text"
            id="playerName"
            disabled={isLoading}
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            placeholder="Введіть нікнейм..."
            maxLength={15}
            className="w-full px-4 py-3.5 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent dark:text-white transition-all text-base placeholder-neutral-400 dark:placeholder-neutral-600 disabled:opacity-50"
          />
        </div>

        {/* Tab Selection/Action boxes */}
        <div className="grid grid-cols-1 gap-4">
          {/* Join Game Box */}
          <div className="border border-neutral-200 dark:border-neutral-800 rounded-2xl p-4 bg-white/50 dark:bg-neutral-900/50">
            <h3 className="text-sm font-bold text-neutral-800 dark:text-neutral-200 mb-3 flex items-center gap-2">
              <Users className="h-4 w-4 text-brand-500" />
              Приєднатися до гри
            </h3>
            <form onSubmit={handleJoinRoom} className="flex gap-2">
              <input
                type="text"
                disabled={isLoading}
                value={roomCodeInput}
                onChange={(e) => setRoomCodeInput(e.target.value.toUpperCase().slice(0, 4))}
                placeholder="КОД КІМНАТИ"
                className="w-full px-4 py-3 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent text-center font-mono font-bold tracking-widest text-lg placeholder:font-sans placeholder:tracking-normal placeholder:text-sm placeholder:text-neutral-400 dark:placeholder:text-neutral-600 dark:text-white disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={isLoading}
                className="px-6 bg-brand-500 hover:bg-brand-600 active:scale-95 text-white font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all text-sm shadow-md shadow-brand-500/10 disabled:opacity-50"
              >
                {isLoading && loadingRole === 'player' ? (
                  <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>Ввійти</>
                )}
              </button>
            </form>
          </div>

          <div className="relative flex items-center justify-center my-1">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-neutral-200 dark:border-neutral-800"></div>
            </div>
            <span className="relative px-3 text-xs text-neutral-400 bg-neutral-50 dark:bg-neutral-950 uppercase tracking-wider font-semibold">або</span>
          </div>

          {/* Create Game Box */}
          <button
            onClick={handleCreateRoom}
            disabled={isLoading}
            className="w-full py-4 px-4 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 hover:border-brand-500/50 dark:hover:border-brand-500/50 hover:bg-brand-50/10 dark:hover:bg-brand-950/10 active:scale-[0.98] text-neutral-800 dark:text-neutral-200 font-bold rounded-2xl flex items-center justify-center gap-2.5 transition-all text-base shadow-sm disabled:opacity-50 group"
          >
            {isLoading && loadingRole === 'host' ? (
              <div className="h-5 w-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <Play className="h-5 w-5 text-brand-500 group-hover:scale-110 transition-transform" />
                Створити нову кімнату (Host)
              </>
            )}
          </button>
        </div>
      </motion.div>

      {/* Settings Panel Toggle */}
      <div className="text-center">
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="inline-flex items-center gap-2 text-xs font-semibold text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 transition-colors focus:outline-none"
        >
          <Settings className={`h-4 w-4 transition-transform duration-300 ${showSettings ? 'rotate-90 text-brand-500' : ''}`} />
          Налаштування мережі
        </button>
      </div>

      {/* Settings Panel Content */}
      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden mt-4"
          >
            <div className="glass-panel rounded-2xl p-5 shadow-sm border border-neutral-200 dark:border-neutral-800 text-left">
              <h4 className="text-xs font-bold text-neutral-800 dark:text-neutral-200 uppercase tracking-widest mb-4 flex items-center gap-1.5">
                <Key className="h-3.5 w-3.5 text-brand-500" />
                Metered Realtime Config
              </h4>
              <div className="space-y-3">
                <div>
                  <label htmlFor="apiKey" className="block text-[10px] font-bold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider mb-1.5">
                    Publishable API Key (Send enabled)
                  </label>
                  <div className="relative">
                    <input
                      type="password"
                      id="apiKey"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      className="w-full pl-3 pr-20 py-2 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-brand-500 focus:border-transparent text-sm dark:text-white"
                    />
                    <button
                      onClick={copyDefaultApiKey}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 px-2 py-1 text-[10px] font-bold bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-600 dark:text-neutral-350 rounded-lg flex items-center gap-1 transition-all"
                    >
                      {copiedKey ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                      {copiedKey ? 'Вставлено' : 'Ключ за замовч.'}
                    </button>
                  </div>
                </div>
                <p className="text-[10px] text-neutral-400 leading-relaxed">
                  * Додаток використовує безкоштовний сигналінг Metered. Якщо ліміти перевищено, ви можете створити власний акаунт на <a href="https://www.metered.ca/" target="_blank" rel="noreferrer" className="text-brand-500 underline">metered.ca</a> та вставити сюди ваш Publishable Key.
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
