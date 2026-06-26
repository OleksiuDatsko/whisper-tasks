import React, { useState, useEffect } from 'react';
import { useGameStore } from '../store/gameStore';
import { webrtcService } from '../services/webrtcService';
import type { CardInstance } from '../types/game';
import { LogOut, CheckCircle, HelpCircle, Check, X, ShieldAlert, Award, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import confetti from 'canvas-confetti';

export const PlayerView: React.FC = () => {
  const { roomCode, playerName, players, myCards, resolvedCards, gameStatus, connectionStatus, offlineQueue, sessionPlayerId } = useGameStore();

  const [activeCardForAction, setActiveCardForAction] = useState<CardInstance | null>(null);
  const [actionType, setActionType] = useState<'completed' | 'guessed' | null>(null);
  const [selectedHelperId, setSelectedHelperId] = useState<string>('');

  // Trigger confetti when a card is resolved as completed
  useEffect(() => {
    // Check if the last resolved card was just completed
    if (resolvedCards.length > 0 && resolvedCards[0].status === 'completed') {
      const resolvedAt = resolvedCards[0].resolvedAt;
      if (resolvedAt) {
        const diffMs = Date.now() - new Date(resolvedAt).getTime();
        // If it was resolved within the last 5 seconds, trigger confetti
        if (diffMs < 5000) {
          confetti({
            particleCount: 100,
            spread: 70,
            origin: { y: 0.8 },
            colors: ['#fbbf24', '#f59e0b', '#d97706', '#3b82f6', '#10b981']
          });
        }
      }
    }
  }, [resolvedCards]);

  const handleExit = () => {
    if (window.confirm('Ви впевнені, що хочете вийти з гри?')) {
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

  // Get other players (filter out current player)
  // Since we are player, we find other players in the room
  const otherPlayers = players.filter(p => p.isConnected && p.id !== sessionPlayerId);

  // Map difficulty styles
  const getDifficultyBadge = (cardText: string) => {
    // Find the difficulty from the raw deck if available, else default to easy
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

  return (
    <div className="w-full max-w-lg mx-auto px-4 py-6">
      {/* Lobby header / status */}
      <div className="flex items-center justify-between mb-6 pb-4 border-b border-neutral-200 dark:border-neutral-800">
        <div>
          <span className="text-[10px] font-bold text-neutral-450 dark:text-neutral-500 uppercase tracking-widest block">ГРАВЕЦЬ</span>
          <h2 className="text-xl font-bold dark:text-white flex items-center gap-2">
            {playerName}
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
              connectionStatus === 'connected' 
                ? 'bg-green-150 text-green-700 dark:bg-green-950/40 dark:text-green-400' 
                : 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400'
            }`}>
              {connectionStatus === 'connected' ? `Кімната ${roomCode}` : 'Перепідключення...'}
            </span>
          </h2>
          {gameStatus === 'playing' && (
            <div className="mt-1 flex items-center gap-1.5">
              <span className="text-[10px] font-bold text-neutral-450 dark:text-neutral-500 uppercase tracking-wider">Мій рахунок:</span>
              <span className="text-xs px-2 py-0.5 bg-green-500/10 dark:bg-green-500/20 text-green-700 dark:text-green-300 font-extrabold rounded-md">
                {(players.find(p => p.id === sessionPlayerId)?.score || 0)} балів
              </span>
            </div>
          )}
        </div>

        <button
          onClick={handleExit}
          className="flex items-center justify-center p-2 rounded-xl bg-neutral-100 hover:bg-red-50 hover:text-red-500 dark:bg-neutral-850 dark:hover:bg-red-950/20 dark:hover:text-red-400 text-neutral-500 transition-colors"
          title="Вийти з гри"
        >
          <LogOut className="h-4.5 w-4.5" />
        </button>
      </div>

      {gameStatus === 'lobby' ? (
        /* Lobby Waiting Screen */
        <motion.div 
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="glass-panel rounded-3xl p-8 text-center shadow-premium flex flex-col items-center justify-center py-16"
        >
          <div className="p-4 bg-brand-500/10 dark:bg-brand-500/20 text-brand-500 rounded-full mb-4 animate-pulse">
            <ShieldAlert className="h-10 w-10" />
          </div>
          <h3 className="text-lg font-bold dark:text-white mb-2">Очікуємо старту</h3>
          <p className="text-sm text-neutral-500 dark:text-neutral-450 leading-relaxed max-w-xs mb-6">
            Ви приєдналися до кімнати. Коли Хост запустить гру, ви отримаєте свої 3 таємні завдання.
          </p>
          <div className="flex flex-col items-center gap-1.5 bg-neutral-50 dark:bg-neutral-900/50 px-4 py-3 rounded-2xl border border-neutral-150 dark:border-neutral-850 w-full max-w-xs">
            <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Підключені гравці</span>
            <div className="flex flex-wrap justify-center gap-1.5 mt-1">
              {players.map(p => (
                <span 
                  key={p.id} 
                  className={`text-xs px-2.5 py-1 rounded-xl font-medium ${
                    p.id === sessionPlayerId 
                      ? 'bg-brand-500 text-white font-bold' 
                      : 'bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300'
                  }`}
                >
                  {p.name}
                </span>
              ))}
            </div>
          </div>
        </motion.div>
      ) : (
        /* Game Playing Screen */
        <div className="space-y-6">
          {/* Section: My active cards */}
          <div>
            <h3 className="text-xs font-bold text-neutral-450 dark:text-neutral-500 uppercase tracking-widest mb-3 flex items-center gap-1.5">
              Мої активні картки
              <span className="px-2 py-0.5 text-[10px] bg-neutral-100 dark:bg-neutral-850 text-neutral-500 dark:text-neutral-400 rounded-full font-bold">
                {myCards.length}
              </span>
            </h3>

            <div className="space-y-4">
              <AnimatePresence mode="popLayout">
                {myCards.length === 0 ? (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="p-8 text-center text-neutral-400 bg-neutral-100/50 dark:bg-neutral-900/50 border border-dashed border-neutral-200 dark:border-neutral-800 rounded-2xl"
                  >
                    Завдання не призначені або колода закінчилась.
                  </motion.div>
                ) : (
                  myCards.map((card, index) => {
                    const isPending = offlineQueue?.some(action => action.cardInstanceId === card.instanceId);
                    return (
                      <motion.div
                        key={card.instanceId}
                        layout
                        initial={{ y: 30, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ scale: 0.95, opacity: 0 }}
                        transition={{ type: 'spring', stiffness: 260, damping: 25, delay: index * 0.05 }}
                        className={`glow-card glass-panel rounded-3xl p-5 shadow-premium flex flex-col justify-between min-h-[160px] transition-all border-l-4 ${
                          isPending 
                            ? 'border-l-amber-500 bg-amber-500/5 opacity-70 scale-[0.98]' 
                            : 'border-l-brand-500'
                        }`}
                      >
                        {/* Top label / difficulty */}
                        <div className="flex items-center justify-between gap-2 mb-3">
                          <span className="text-[10px] font-bold text-brand-600 dark:text-brand-400 uppercase tracking-widest">
                            Завдання #{card.instanceId.split('-')[1] || 'Secret'}
                          </span>
                          {isPending ? (
                            <span className="text-[10px] font-bold text-amber-600 bg-amber-500/10 dark:text-amber-400 dark:bg-amber-500/20 uppercase tracking-wider px-2.5 py-0.5 rounded-full flex items-center gap-1">
                              <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                              Очікує хоста
                            </span>
                          ) : (
                            getDifficultyBadge(card.text)
                          )}
                        </div>

                        {/* Card Content Text */}
                        <div className="flex-1 text-left text-neutral-850 dark:text-neutral-100 text-lg font-bold leading-snug mb-5">
                          {card.text}
                        </div>

                        {/* Card Actions */}
                        <div className="grid grid-cols-2 gap-3 mt-auto">
                          {isPending ? (
                            <div className="col-span-2 py-3 text-center text-amber-600 dark:text-amber-400 font-bold bg-amber-500/10 rounded-2xl flex items-center justify-center gap-2 text-sm border border-amber-500/20">
                              <Clock className="h-4 w-4 animate-spin" />
                              Чекаємо на підтвердження хостом...
                            </div>
                          ) : (
                            <>
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
                            </>
                          )}
                        </div>
                      </motion.div>
                    );
                  })
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Scoreboard / Leaderboard */}
          <div className="glass-panel rounded-3xl p-5 shadow-premium">
            <span className="text-[10px] font-bold text-neutral-450 dark:text-neutral-500 uppercase tracking-widest block mb-3">Таблиця балів</span>
            <div className="flex flex-wrap gap-2">
              {players.map((p) => {
                const isMe = p.id === sessionPlayerId;
                return (
                  <div
                    key={p.id}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold ${
                      isMe
                        ? 'bg-brand-500/5 border-brand-500/20 text-brand-700 dark:text-brand-350'
                        : 'bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 text-neutral-700 dark:text-neutral-300'
                    }`}
                  >
                    <span className={`h-2 w-2 rounded-full ${p.isConnected ? 'bg-green-500' : 'bg-neutral-300 dark:bg-neutral-750'}`} />
                    <span className="truncate max-w-[80px]">{p.name}</span>
                    <span className="ml-1 px-1.5 py-0.5 bg-neutral-100 dark:bg-neutral-850 rounded-md font-extrabold text-neutral-850 dark:text-neutral-100">
                      {p.score || 0}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Section: Resolved cards history */}
          <div className="mt-8">
            <h3 className="text-xs font-bold text-neutral-450 dark:text-neutral-500 uppercase tracking-widest mb-3 flex items-center gap-1.5">
              Історія закритих карток
              <span className="px-2 py-0.5 text-[10px] bg-neutral-100 dark:bg-neutral-850 text-neutral-500 dark:text-neutral-400 rounded-full font-bold">
                {resolvedCards.length}
              </span>
            </h3>

            <div className="space-y-3">
              {resolvedCards.length === 0 ? (
                <p className="text-xs text-neutral-400 text-center py-4">У вас ще немає закритих карток.</p>
              ) : (
                resolvedCards.map((card) => (
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
        </div>
      )}

      {/* Action Modals */}
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
                  className="px-4 py-2 bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-750 text-neutral-600 dark:text-neutral-300 text-sm font-bold rounded-xl transition-all"
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
