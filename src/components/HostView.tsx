import React, { useState, useEffect } from 'react';
import { useGameStore } from '../store/gameStore';
import { webrtcService } from '../services/webrtcService';
import { LogOut, Play, Users, Terminal, Clipboard, Check, RefreshCw, UserMinus, CheckCircle, HelpCircle, X, Award } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import confetti from 'canvas-confetti';
import type { CardInstance } from '../types/game';

export const HostView: React.FC = () => {
  const { roomCode, players, gameStatus, logs, clearLogs, connectionStatus, cardInstances, sessionPlayerId } = useGameStore();
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'control' | 'tasks'>('control');
  
  // Card Actions State (for Host playing)
  const [activeCardForAction, setActiveCardForAction] = useState<CardInstance | null>(null);
  const [actionType, setActionType] = useState<'completed' | 'guessed' | null>(null);
  const [selectedHelperId, setSelectedHelperId] = useState<string>('');

  // Reset tab to control when returning to lobby
  useEffect(() => {
    if (gameStatus === 'lobby') {
      setActiveTab('control');
    }
  }, [gameStatus]);

  // Trigger confetti when Host completes a card
  useEffect(() => {
    if (gameStatus === 'playing') {
      const hostResolved = cardInstances.filter(c => c.ownerPlayerId === sessionPlayerId && c.status === 'completed');
      if (hostResolved.length > 0) {
        // Sort by resolvedAt descending to find the latest
        const sorted = [...hostResolved].sort((a, b) => {
          return new Date(b.resolvedAt || 0).getTime() - new Date(a.resolvedAt || 0).getTime();
        });
        const lastResolved = sorted[0];
        if (lastResolved && lastResolved.resolvedAt) {
          const diffMs = Date.now() - new Date(lastResolved.resolvedAt).getTime();
          // Trigger confetti if resolved in the last 4 seconds
          if (diffMs < 4000) {
            confetti({
              particleCount: 100,
              spread: 70,
              origin: { y: 0.8 },
              colors: ['#fbbf24', '#f59e0b', '#d97706', '#3b82f6', '#10b981']
            });
          }
        }
      }
    }
  }, [cardInstances, sessionPlayerId, gameStatus]);

  const copyRoomCode = () => {
    if (!roomCode) return;
    navigator.clipboard.writeText(roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleStartGame = () => {
    webrtcService.startGame();
  };

  const handleExit = () => {
    if (window.confirm('Ви впевнені, що хочете закрити кімнату? Гра завершиться для всіх гравців.')) {
      webrtcService.disconnect();
    }
  };

  const handleOpenActionModal = (card: CardInstance, type: 'completed' | 'guessed') => {
    setActiveCardForAction(card);
    setActionType(type);
    setSelectedHelperId('');
  };

  const handleCloseModal = () => {
    setActiveCardForAction(null);
    setActionType(null);
    setSelectedHelperId('');
  };

  const handleConfirmAction = () => {
    if (!activeCardForAction || !actionType) return;

    if (actionType === 'completed') {
      if (!selectedHelperId) return;
      webrtcService.completeCard(activeCardForAction.instanceId, selectedHelperId);
    } else {
      webrtcService.guessCard(activeCardForAction.instanceId);
    }

    handleCloseModal();
  };

  const getDifficultyBadge = (cardText: string) => {
    const store = useGameStore.getState();
    const catalogCard = store.deck.find(c => c.text === cardText);
    const diff = catalogCard?.difficulty || 'easy';

    switch (diff) {
      case 'easy':
        return <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-green-50 text-green-600 dark:bg-green-950/20 dark:text-green-400">Легко</span>;
      case 'medium':
        return <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-yellow-50 text-yellow-600 dark:bg-yellow-950/20 dark:text-yellow-400">Середнє</span>;
      case 'hard':
        return <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-red-50 text-red-600 dark:bg-red-950/20 dark:text-red-400">Важко</span>;
      default:
        return null;
    }
  };

  const getHelperName = (helperId: string | null) => {
    if (!helperId) return '';
    const helper = players.find(p => p.id === helperId);
    return helper ? helper.name : 'Невідомий гравець';
  };

  const onlinePlayersCount = players.filter(p => p.isConnected).length;

  // Filter host's own cards for playing mode
  const hostActiveCards = cardInstances.filter(c => c.ownerPlayerId === sessionPlayerId && c.status === 'active');
  const hostResolvedCards = cardInstances.filter(c => c.ownerPlayerId === sessionPlayerId && c.status !== 'active');

  // Exclude current host from potential helper list in modal
  const otherPlayers = players.filter(p => p.isConnected && p.id !== sessionPlayerId);

  return (
    <div className="w-full max-w-4xl mx-auto px-4 py-6">
      {/* Top Header Panel */}
      <div className="flex flex-col md:flex-row gap-4 items-center justify-between mb-6 pb-6 border-b border-neutral-200 dark:border-neutral-800">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-brand-500 text-white rounded-2xl shadow-lg shadow-brand-500/10">
            <Users className="h-6 w-6" />
          </div>
          <div>
            <span className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Панель хоста</span>
            <h2 className="text-2xl font-bold dark:text-white flex items-center gap-2">
              Керування кімнатою
              <span className={`text-xs px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                connectionStatus === 'connected' 
                  ? 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400' 
                  : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-400'
              }`}>
                {connectionStatus === 'connected' ? 'В мережі' : 'Зʼєднання...'}
              </span>
            </h2>
          </div>
        </div>

        <button
          onClick={handleExit}
          className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-neutral-100 dark:bg-neutral-850 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/20 dark:hover:text-red-400 text-neutral-600 dark:text-neutral-400 rounded-xl transition-all border border-transparent hover:border-red-200 dark:hover:border-red-900/50"
        >
          <LogOut className="h-4 w-4" />
          Закрити кімнату
        </button>
      </div>

      {/* Tabs selector if game is in progress */}
      {gameStatus === 'playing' && (
        <div className="flex gap-2 mb-6 bg-neutral-150 dark:bg-neutral-900 p-1.5 rounded-2xl max-w-md mx-auto">
          <button
            onClick={() => setActiveTab('control')}
            className={`flex-1 py-3 text-sm font-extrabold rounded-xl transition-all ${
              activeTab === 'control'
                ? 'bg-white dark:bg-neutral-800 text-neutral-850 dark:text-white shadow-md'
                : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'
            }`}
          >
            Керування грою
          </button>
          <button
            onClick={() => setActiveTab('tasks')}
            className={`flex-1 py-3 text-sm font-extrabold rounded-xl transition-all relative ${
              activeTab === 'tasks'
                ? 'bg-white dark:bg-neutral-800 text-neutral-850 dark:text-white shadow-md'
                : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'
            }`}
          >
            Мої завдання
            {hostActiveCards.length > 0 && (
              <span className="absolute -top-1.5 -right-1.5 h-5 w-5 bg-brand-500 text-white rounded-full text-[10px] font-black flex items-center justify-center animate-bounce shadow-md">
                {hostActiveCards.length}
              </span>
            )}
          </button>
        </div>
      )}

      <AnimatePresence mode="wait">
        {activeTab === 'control' ? (
          /* TAB 1: CONTROL DASHBOARD */
          <motion.div
            key="control"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.15 }}
            className="grid grid-cols-1 lg:grid-cols-3 gap-6"
          >
            {/* Left column: Room Code & Actions */}
            <div className="space-y-6 lg:col-span-1">
              {/* Room Code Card */}
              <div className="glass-panel rounded-3xl p-6 shadow-premium relative overflow-hidden">
                <span className="text-[10px] font-bold text-neutral-400 dark:text-neutral-500 uppercase tracking-widest block mb-1">КОД КІМНАТИ</span>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-5xl font-black tracking-widest font-mono text-neutral-900 dark:text-white">
                    {roomCode}
                  </span>
                  <button
                    onClick={copyRoomCode}
                    className="p-3 bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-850 dark:hover:bg-neutral-800 rounded-2xl text-neutral-500 dark:text-neutral-400 transition-colors shadow-sm relative group"
                    title="Копіювати код"
                  >
                    {copied ? <Check className="h-5 w-5 text-green-500" /> : <Clipboard className="h-5 w-5" />}
                  </button>
                </div>
                <p className="text-xs text-neutral-400 mt-3 leading-relaxed">
                  Поділіться цим кодом з іншими гравцями, щоб вони могли приєднатися до вашої гри.
                </p>
              </div>

              {/* Game Controls Card */}
              <div className="glass-panel rounded-3xl p-6 shadow-premium">
                <span className="text-[10px] font-bold text-neutral-400 dark:text-neutral-500 uppercase tracking-widest block mb-4">Статус гри</span>
                
                {gameStatus === 'lobby' ? (
                  <div className="space-y-4">
                    <div className="p-4 bg-brand-50 dark:bg-brand-950/20 border border-brand-100 dark:border-brand-900/30 rounded-2xl text-center">
                      <span className="text-2xl font-bold text-brand-650 dark:text-brand-400">Лобі</span>
                      <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">Очікуємо приєднання гравців для початку роздачі.</p>
                    </div>
                    
                    <button
                      onClick={handleStartGame}
                      disabled={players.length === 0}
                      className="w-full py-4 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-bold rounded-2xl shadow-lg shadow-brand-500/20 flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
                    >
                      <Play className="h-5 w-5" />
                      Роздати картки (Почати)
                    </button>
                    {players.length === 0 && (
                      <p className="text-[10px] text-red-500 dark:text-red-400 text-center font-medium">Для старту потрібен хоча б один гравець.</p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="p-4 bg-green-50 dark:bg-green-950/20 border border-green-100 dark:border-green-900/30 rounded-2xl text-center">
                      <span className="text-2xl font-bold text-green-700 dark:text-green-400">Гра триває</span>
                      <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">Гравці виконують та вгадують таємні завдання.</p>
                    </div>

                    <button
                      onClick={handleStartGame}
                      className="w-full py-3 border border-brand-500/30 hover:border-brand-500 hover:bg-brand-500/5 text-brand-600 dark:text-brand-400 font-bold rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
                    >
                      <RefreshCw className="h-4 w-4" />
                      Перезапустити гру
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Center column: Players list */}
            <div className="lg:col-span-2 space-y-6">
              {/* Players List Card */}
              <div className="glass-panel rounded-3xl p-6 shadow-premium flex flex-col h-[320px] lg:h-[400px]">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold text-neutral-800 dark:text-neutral-200 uppercase tracking-wider flex items-center gap-2">
                    Гравці
                    <span className="px-2 py-0.5 text-xs bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400 rounded-full font-bold">
                      {onlinePlayersCount} / {players.length}
                    </span>
                  </h3>
                </div>

                <div className="overflow-y-auto flex-1 divide-y divide-neutral-100 dark:divide-neutral-800/50 pr-2">
                  {players.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center py-8">
                      <p className="text-sm text-neutral-400 dark:text-neutral-500">Кімната порожня. Гравці ще не підключилися.</p>
                    </div>
                  ) : (
                    players.map((player) => (
                      <div key={player.id} className="py-3.5 flex items-center justify-between first:pt-0 last:pb-0">
                        <div className="flex items-center gap-3">
                          <div className={`h-2.5 w-2.5 rounded-full ${player.isConnected ? 'bg-green-500 shadow-sm shadow-green-500/50' : 'bg-neutral-300 dark:bg-neutral-700'}`} />
                          <div>
                            <span className={`font-semibold ${player.isConnected ? 'text-neutral-850 dark:text-neutral-100' : 'text-neutral-400 dark:text-neutral-600 line-through'}`}>
                              {player.name}
                            </span>
                            {player.isHost && (
                              <span className="ml-2 text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-brand-500 text-white">Host</span>
                            )}
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-3">
                          {gameStatus === 'playing' && (
                            <>
                              <span className="text-xs px-2.5 py-1 bg-green-500/10 dark:bg-green-500/20 text-green-700 dark:text-green-300 font-extrabold rounded-xl">
                                Бали: {player.score || 0}
                              </span>
                              <span className="text-xs px-2.5 py-1 bg-brand-500/10 dark:bg-brand-500/20 text-brand-700 dark:text-brand-300 font-bold rounded-xl">
                                {player.cardCount} акт.
                              </span>
                            </>
                          )}
                          <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-md ${
                            player.isConnected 
                              ? 'bg-green-50 dark:bg-green-950/20 text-green-600 dark:text-green-400' 
                              : 'bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400'
                          }`}>
                            {player.isConnected ? 'online' : 'offline'}
                          </span>
                          
                          {/* Kick button: visible if game is in lobby, or player is disconnected, and NOT the host player */}
                          {(gameStatus === 'lobby' || !player.isConnected) && !player.isHost && (
                            <button
                              onClick={() => {
                                if (window.confirm(`Видалити гравця ${player.name}?`)) {
                                  webrtcService.kickPlayer(player.id);
                                }
                              }}
                              className="p-1 hover:bg-red-55/20 text-neutral-450 dark:text-neutral-500 hover:text-red-600 dark:hover:text-red-400 rounded-lg transition-colors"
                              title="Видалити гравця"
                            >
                              <UserMinus className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Full width bottom column: Debug logs */}
            <div className="lg:col-span-3">
              <div className="glass-panel rounded-3xl p-6 shadow-premium">
                <div className="flex items-center justify-between mb-4 border-b border-neutral-200 dark:border-neutral-800 pb-3">
                  <h3 className="text-sm font-bold text-neutral-800 dark:text-neutral-200 uppercase tracking-wider flex items-center gap-2">
                    <Terminal className="h-4 w-4 text-brand-500" />
                    Лог подій (Debug)
                  </h3>
                  <button
                    onClick={clearLogs}
                    className="text-xs font-semibold text-neutral-450 hover:text-neutral-600 dark:hover:text-neutral-200 transition-colors"
                  >
                    Очистити
                  </button>
                </div>

                <div className="bg-neutral-900 text-neutral-300 font-mono text-xs p-4 rounded-2xl h-[240px] overflow-y-auto space-y-1.5 shadow-inner">
                  {logs.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-neutral-500">
                      <span>Жодних подій ще не зареєстровано...</span>
                    </div>
                  ) : (
                    logs.map((log) => {
                      let colorClass = 'text-neutral-400';
                      if (log.type === 'success') colorClass = 'text-green-400';
                      if (log.type === 'warning') colorClass = 'text-yellow-400';
                      if (log.type === 'error') colorClass = 'text-red-400';

                      return (
                        <div key={log.id} className="leading-relaxed border-b border-neutral-800/40 pb-1 flex gap-2">
                          <span className="text-neutral-500 shrink-0 select-none">[{log.timestamp}]</span>
                          <span className={colorClass}>{log.text}</span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        ) : (
          /* TAB 2: HOST ACTIVE TASKS */
          <motion.div
            key="tasks"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.15 }}
            className="space-y-6 max-w-lg mx-auto"
          >
            {/* Section: Host Active Cards */}
            <div>
              <h3 className="text-xs font-bold text-neutral-450 dark:text-neutral-500 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                Мої активні картки
                <span className="px-2 py-0.5 text-[10px] bg-neutral-100 dark:bg-neutral-850 text-neutral-500 dark:text-neutral-400 rounded-full font-bold">
                  {hostActiveCards.length}
                </span>
              </h3>

              <div className="space-y-4">
                <AnimatePresence mode="popLayout">
                  {hostActiveCards.length === 0 ? (
                    <motion.div 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="p-8 text-center text-neutral-400 bg-neutral-100/50 dark:bg-neutral-900/50 border border-dashed border-neutral-200 dark:border-neutral-800 rounded-2xl"
                    >
                      Завдання не призначені або колода закінчилась.
                    </motion.div>
                  ) : (
                    hostActiveCards.map((card, index) => (
                      <motion.div
                        key={card.instanceId}
                        layout
                        initial={{ y: 30, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ scale: 0.95, opacity: 0 }}
                        transition={{ type: 'spring', stiffness: 260, damping: 25, delay: index * 0.05 }}
                        className="glow-card glass-panel rounded-3xl p-5 shadow-premium flex flex-col justify-between border-l-4 border-l-brand-500 min-h-[160px]"
                      >
                        {/* Top label / difficulty */}
                        <div className="flex items-center justify-between gap-2 mb-3">
                          <span className="text-[10px] font-bold text-brand-600 dark:text-brand-400 uppercase tracking-widest">
                            Завдання #{card.instanceId.split('-')[1] || 'Secret'}
                          </span>
                          {getDifficultyBadge(card.text)}
                        </div>

                        {/* Card Content Text */}
                        <div className="flex-1 text-left text-neutral-850 dark:text-neutral-100 text-lg font-bold leading-snug mb-5">
                          {card.text}
                        </div>

                        {/* Card Actions */}
                        <div className="grid grid-cols-2 gap-3 mt-auto">
                          <button
                            onClick={() => handleOpenActionModal(card, 'completed')}
                            className="py-3 px-4 bg-brand-500 hover:bg-brand-600 active:scale-95 text-white font-bold rounded-2xl shadow-md shadow-brand-500/10 flex items-center justify-center gap-1.5 transition-all text-sm"
                          >
                            <CheckCircle className="h-4 w-4" />
                            Виконано
                          </button>
                          <button
                            onClick={() => handleOpenActionModal(card, 'guessed')}
                            className="py-3 px-4 bg-transparent border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-900 active:scale-95 text-neutral-750 dark:text-neutral-300 font-semibold rounded-2xl flex items-center justify-center gap-1.5 transition-all text-sm"
                          >
                            <HelpCircle className="h-4 w-4 text-neutral-450" />
                            Вгадано
                          </button>
                        </div>
                      </motion.div>
                    ))
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Section: Resolved cards history */}
            <div className="mt-8">
              <h3 className="text-xs font-bold text-neutral-450 dark:text-neutral-500 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                Історія моїх закритих карток
                <span className="px-2 py-0.5 text-[10px] bg-neutral-100 dark:bg-neutral-850 text-neutral-500 dark:text-neutral-400 rounded-full font-bold">
                  {hostResolvedCards.length}
                </span>
              </h3>

              <div className="space-y-3">
                {hostResolvedCards.length === 0 ? (
                  <p className="text-xs text-neutral-400 text-center py-4">У вас ще немає закритих карток.</p>
                ) : (
                  hostResolvedCards.map((card) => (
                    <div 
                      key={card.instanceId} 
                      className="p-4 rounded-2xl bg-neutral-100/50 dark:bg-neutral-900/40 border border-neutral-200/50 dark:border-neutral-850 text-left flex gap-3 items-center justify-between"
                    >
                      <div className="min-w-0 flex-1">
                        <span className="text-[10px] font-semibold text-neutral-400 block mb-1">
                          {card.status === 'completed' ? 'Виконано' : 'Відгадано супротивником'}
                        </span>
                        <p className="text-sm font-semibold text-neutral-700 dark:text-neutral-300 truncate">
                          {card.text}
                        </p>
                        {card.status === 'completed' && card.completedByPlayerId && (
                          <span className="text-[10px] text-neutral-400 flex items-center gap-1 mt-0.5">
                            <Award className="h-3 w-3 text-brand-500" />
                            За допомогою: <strong className="font-bold">{getHelperName(card.completedByPlayerId)}</strong>
                          </span>
                        )}
                      </div>
                      
                      <div className="shrink-0">
                        {card.status === 'completed' ? (
                          <span className="p-1.5 rounded-full bg-green-50 dark:bg-green-950/20 text-green-500 block">
                            <Check className="h-4.5 w-4.5" />
                          </span>
                        ) : (
                          <span className="p-1.5 rounded-full bg-red-50 dark:bg-red-950/20 text-red-500 block">
                            <X className="h-4.5 w-4.5" />
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Action Modals (For Host task resolution) */}
      <AnimatePresence>
        {activeCardForAction && (
          <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-4 bg-black/40 backdrop-blur-sm">
            <motion.div
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              className="w-full max-w-md bg-white dark:bg-neutral-925 rounded-t-3xl sm:rounded-3xl shadow-premium border border-neutral-200 dark:border-neutral-850 p-6 overflow-hidden relative text-left"
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between mb-4 pb-2 border-b border-neutral-100 dark:border-neutral-850">
                <h3 className="text-base font-bold text-neutral-850 dark:text-white uppercase tracking-wider">
                  {actionType === 'completed' ? 'Завдання Виконано' : 'Завдання Відгадано'}
                </h3>
                <button
                  onClick={handleCloseModal}
                  className="p-1 text-neutral-400 hover:text-neutral-600 dark:hover:text-white transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Modal Card Preview */}
              <div className="p-4 bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl mb-5">
                <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest block mb-1">Секретна картка</span>
                <p className="text-sm font-semibold text-neutral-800 dark:text-neutral-200 leading-snug">
                  {activeCardForAction.text}
                </p>
              </div>

              {/* Modal Conditional Flow */}
              {actionType === 'completed' ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-neutral-550 dark:text-neutral-400 uppercase tracking-wider mb-2">
                      Хто з гравців виконав вашу вказівку?
                    </label>
                    
                    {otherPlayers.length === 0 ? (
                      <p className="text-xs text-red-500 py-2">Немає інших підключених гравців. Зачекайте підключення опонентів.</p>
                    ) : (
                      <div className="grid grid-cols-2 gap-2 max-h-[140px] overflow-y-auto pr-1">
                        {otherPlayers.map((player) => (
                          <button
                            key={player.id}
                            type="button"
                            onClick={() => setSelectedHelperId(player.id)}
                            className={`px-3 py-2.5 rounded-xl border text-sm font-semibold text-left transition-all ${
                              selectedHelperId === player.id
                                ? 'border-brand-500 bg-brand-500/10 text-brand-700 dark:text-brand-350'
                                : 'border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-900 text-neutral-700 dark:text-neutral-300'
                            }`}
                          >
                            {player.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="mb-6 leading-relaxed">
                  <p className="text-sm text-neutral-500 dark:text-neutral-400">
                    Ви впевнені, що ваше завдання було <strong>розкрито чи відгадано</strong> іншим гравцем? 
                  </p>
                  <p className="text-xs text-red-500 dark:text-red-400 font-semibold mt-2">
                    * Ця картка буде зарахована як провал і переміститься в історію, а натомість ви отримаєте нову.
                  </p>
                </div>
              )}

              {/* Modal Buttons */}
              <div className="flex gap-3 mt-6 border-t border-neutral-100 dark:border-neutral-850 pt-4 justify-end">
                <button
                  onClick={handleCloseModal}
                  className="px-4 py-2 bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-850 dark:hover:bg-neutral-750 text-neutral-600 dark:text-neutral-300 text-sm font-bold rounded-xl transition-all"
                >
                  Скасувати
                </button>
                <button
                  onClick={handleConfirmAction}
                  disabled={actionType === 'completed' && !selectedHelperId}
                  className="px-5 py-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-all shadow-md shadow-brand-500/10"
                >
                  Підтвердити
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
