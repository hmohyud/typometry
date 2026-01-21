import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from './supabase';

// Supabase Realtime = unlimited messages, no write limits!
// All race data flows through WebSocket broadcast, not database

// Cap racers to keep broadcast manageable - host sends to all, all send back
export const MAX_RACERS = 8;

export const RaceStatus = {
  IDLE: 'idle',
  CONNECTING: 'connecting',
  WAITING: 'waiting',
  COUNTDOWN: 'countdown',
  RACING: 'racing',
  FINISHED: 'finished',
};

const generateRacerId = () => {
  const stored = sessionStorage.getItem('typometry_racer_id');
  if (stored) return stored;
  const id = 'racer_' + Math.random().toString(36).substring(2, 11);
  sessionStorage.setItem('typometry_racer_id', id);
  return id;
};

const generateRaceCode = () => {
  // Generate a secure 16-char code - impossible to read quickly on stream
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789'; // No confusing chars
  let code = '';
  for (let i = 0; i < 16; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

export function useRace() {
  const [state, setState] = useState({
    raceId: null,
    status: RaceStatus.IDLE,
    paragraph: '',
    paragraphIndex: 0,
    racers: [],
    spectators: [],
    myId: null,
    isHost: false,
    isSpectator: false,
    lateJoiner: false,
    joinKey: null,
    myFinished: false,
    countdownEnd: null,
    raceStartTime: null,
    results: [],
    raceStats: null,
    error: null,
    realtimeMode: true,
    strictMode: false, // Non-blocking by default; can skip errors (shows adjusted WPM)
    lobbyName: '', // Custom lobby name set by host
    // Host transfer state
    hostDisconnectedAt: null,
    pendingHostId: null,
    hostTransferSeconds: 60,
    originalHostId: null, // Track who was host before disconnect
    // Stats viewing
    viewingPlayerStats: null,
    statsRequestPending: null,
    // New round trigger - increments when new round starts, used by App.jsx to reset typing
    newRoundCounter: 0,
    // Chat
    chatMessages: [], // Array of { id, odId, name, message, timestamp }
  });

  const myIdRef = useRef(generateRacerId());
  const channelRef = useRef(null);
  const raceDataRef = useRef(null);
  const isHostRef = useRef(false);
  const myNameRef = useRef('Anonymous');
  const hostTransferTimerRef = useRef(null);
  const originalHostIdRef = useRef(null); // For checking in presence sync

  // Broadcast to all peers
  const broadcast = useCallback((type, payload) => {
    if (channelRef.current) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'race',
        payload: { type, ...payload },
      });
    }
  }, []);

  // Calculate race stats
  const calculateRaceStats = useCallback((results, myId, paragraph, paragraphIndex, raceId, roundNumber = 0) => {
    const myResult = results.find(r => r.id === myId) || null;
    const allWpms = results.map(r => r.wpm);
    const allAccuracies = results.map(r => r.accuracy);
    const allTimes = results.map(r => r.time);

    return {
      myResult,
      allResults: results,
      paragraph,
      paragraphIndex,
      raceId,
      roundId: `${raceId}_round${roundNumber}`, // Unique ID per round
      roundNumber,
      startTime: Date.now(),
      endTime: Date.now(),
      racerCount: results.length,
      wpmRank: myResult?.position || 0,
      accuracyRank: myResult
        ? [...results].sort((a, b) => b.accuracy - a.accuracy).findIndex(r => r.id === myId) + 1
        : 0,
      timeRank: myResult
        ? [...results].sort((a, b) => a.time - b.time).findIndex(r => r.id === myId) + 1
        : 0,
      avgWpm: allWpms.length > 0 ? allWpms.reduce((a, b) => a + b, 0) / allWpms.length : 0,
      fastestWpm: allWpms.length > 0 ? Math.max(...allWpms) : 0,
      slowestWpm: allWpms.length > 0 ? Math.min(...allWpms) : 0,
      wpmSpread: allWpms.length > 0 ? Math.max(...allWpms) - Math.min(...allWpms) : 0,
      avgAccuracy: allAccuracies.length > 0 ? allAccuracies.reduce((a, b) => a + b, 0) / allAccuracies.length : 0,
      bestAccuracy: allAccuracies.length > 0 ? Math.max(...allAccuracies) : 0,
      worstAccuracy: allAccuracies.length > 0 ? Math.min(...allAccuracies) : 0,
      avgTime: allTimes.length > 0 ? allTimes.reduce((a, b) => a + b, 0) / allTimes.length : 0,
      fastestTime: allTimes.length > 0 ? Math.min(...allTimes) : 0,
      slowestTime: allTimes.length > 0 ? Math.max(...allTimes) : 0,
      myWpmVsAvg: myResult ? myResult.wpm - (allWpms.reduce((a, b) => a + b, 0) / allWpms.length) : 0,
      myAccuracyVsAvg: myResult ? myResult.accuracy - (allAccuracies.reduce((a, b) => a + b, 0) / allAccuracies.length) : 0,
      myTimeVsAvg: myResult ? myResult.time - (allTimes.reduce((a, b) => a + b, 0) / allTimes.length) : 0,
    };
  }, []);

  // Handle broadcast messages
  const handleBroadcast = useCallback((payload) => {
    const { type, ...data } = payload;

    switch (type) {
      case 'race_info':
        // Legacy: Host sent race info to new joiner
        setState(prev => ({
          ...prev,
          paragraph: data.paragraph,
          paragraphIndex: data.paragraphIndex,
        }));
        break;

      case 'race_state_sync':
        // Full state sync for rejoining racers
        setState(prev => {
          // Don't override if we're the host
          if (isHostRef.current) return prev;
          
          // Don't downgrade from FINISHED status - race is over
          if (prev.status === RaceStatus.FINISHED) return prev;
          
          // Map status string to RaceStatus
          let newStatus = prev.status;
          if (data.status === 'waiting') newStatus = RaceStatus.WAITING;
          else if (data.status === 'countdown') newStatus = RaceStatus.COUNTDOWN;
          else if (data.status === 'racing') newStatus = RaceStatus.RACING;
          else if (data.status === 'finished') newStatus = RaceStatus.FINISHED;
          
          return {
            ...prev,
            paragraph: data.paragraph,
            paragraphIndex: data.paragraphIndex,
            status: newStatus,
            raceStartTime: data.raceStartTime,
            racers: data.racers.length > 0 ? data.racers : prev.racers,
            realtimeMode: data.realtimeMode ?? prev.realtimeMode,
            strictMode: data.strictMode ?? prev.strictMode,
            lobbyName: data.lobbyName ?? prev.lobbyName,
          };
        });
        break;

      case 'ready_update':
        setState(prev => ({
          ...prev,
          racers: prev.racers.map(r =>
            r.id === data.odId ? { ...r, ready: data.ready } : r
          )
        }));
        if (isHostRef.current && raceDataRef.current) {
          raceDataRef.current.racers = raceDataRef.current.racers.map(r =>
            r.id === data.odId ? { ...r, ready: data.ready } : r
          );
        }
        break;

      case 'name_update':
        setState(prev => ({
          ...prev,
          racers: prev.racers.map(r =>
            r.id === data.odId ? { ...r, name: data.name } : r
          )
        }));
        if (isHostRef.current && raceDataRef.current) {
          raceDataRef.current.racers = raceDataRef.current.racers.map(r =>
            r.id === data.odId ? { ...r, name: data.name } : r
          );
        }
        break;

      case 'settings_update':
        setState(prev => ({
          ...prev,
          realtimeMode: data.realtimeMode ?? prev.realtimeMode,
          strictMode: data.strictMode ?? prev.strictMode,
        }));
        break;

      case 'lobby_name_update':
        setState(prev => ({
          ...prev,
          lobbyName: data.lobbyName || '',
        }));
        if (raceDataRef.current) {
          raceDataRef.current.lobbyName = data.lobbyName || '';
        }
        break;

      case 'countdown':
        setState(prev => ({
          ...prev,
          status: RaceStatus.COUNTDOWN,
          countdownEnd: data.endTime,
          realtimeMode: data.realtimeMode ?? prev.realtimeMode,
          paragraph: data.paragraph || prev.paragraph,
          paragraphIndex: data.paragraphIndex ?? prev.paragraphIndex,
        }));
        break;

      case 'race_start':
        setState(prev => ({
          ...prev,
          status: RaceStatus.RACING,
          raceStartTime: data.startTime,
          realtimeMode: data.realtimeMode ?? prev.realtimeMode,
          paragraph: data.paragraph || prev.paragraph,
          paragraphIndex: data.paragraphIndex ?? prev.paragraphIndex,
        }));
        break;

      case 'progress':
        setState(prev => ({
          ...prev,
          racers: prev.racers.map(r => {
            if (r.id !== data.odId) return r;
            
            // Only update position if new position is ahead (never go backward)
            const newPosition = typeof data.position === 'number' ? data.position : r.position;
            const currentPosition = typeof r.position === 'number' ? r.position : -1;
            const finalPosition = Math.max(newPosition || 0, currentPosition);
            
            return { 
              ...r, 
              progress: data.progress, 
              wpm: data.wpm, 
              accuracy: data.accuracy, 
              position: finalPosition,
            };
          })
        }));
        if (isHostRef.current && raceDataRef.current) {
          raceDataRef.current.racers = raceDataRef.current.racers.map(r => {
            if (r.id !== data.odId) return r;
            
            const newPosition = typeof data.position === 'number' ? data.position : r.position;
            const currentPosition = typeof r.position === 'number' ? r.position : -1;
            const finalPosition = Math.max(newPosition || 0, currentPosition);
            
            return { 
              ...r, 
              progress: data.progress, 
              wpm: data.wpm, 
              accuracy: data.accuracy, 
              position: finalPosition,
            };
          });
        }
        break;

      case 'finish':
        setState(prev => {
          const updatedRacers = prev.racers.map(r =>
            r.id === data.odId ? { 
              ...r, 
              finished: true, 
              wpm: data.wpm, 
              accuracy: data.accuracy, 
              time: data.time, 
              wordSpeeds: data.wordSpeeds || [],
              keystrokeData: data.keystrokeData || [],
            } : r
          );
          
          // If host, update raceData
          if (isHostRef.current && raceDataRef.current) {
            raceDataRef.current.racers = raceDataRef.current.racers.map(r =>
              r.id === data.odId ? { 
                ...r, 
                finished: true, 
                wpm: data.wpm, 
                accuracy: data.accuracy, 
                time: data.time, 
                wordSpeeds: data.wordSpeeds || [],
                keystrokeData: data.keystrokeData || [],
              } : r
            );
          }
          
          // Check if this is our own finish
          const isMyFinish = data.odId === prev.myId;
          
          // Calculate progressive stats with whoever has finished so far
          const finishedRacers = updatedRacers.filter(r => r.finished);
          const allFinished = updatedRacers.every(r => r.finished);
          
          if (finishedRacers.length > 0) {
            const results = [...finishedRacers]
              .sort((a, b) => b.wpm - a.wpm)
              .map((r, i) => ({ ...r, position: i + 1 }));
            
            // Calculate progressive race stats
            const raceStats = calculateRaceStats(results, prev.myId, prev.paragraph, prev.paragraphIndex, prev.raceId, prev.newRoundCounter);
            raceStats.racerCount = updatedRacers.length;
            raceStats.finishedCount = finishedRacers.length;
            raceStats.isComplete = allFinished;

            // If all finished and we're host, broadcast final results
            if (allFinished && isHostRef.current) {
              // Update raceDataRef status
              if (raceDataRef.current) {
                raceDataRef.current.status = 'finished';
              }
              
              setTimeout(() => {
                broadcast('race_finished', { results });
              }, 50);

              return {
                ...prev,
                racers: updatedRacers,
                myFinished: prev.myFinished || isMyFinish,
                status: RaceStatus.FINISHED,
                results,
                raceStats,
              };
            }

            return { 
              ...prev, 
              racers: updatedRacers,
              myFinished: prev.myFinished || isMyFinish,
              results, // Update results progressively
              raceStats, // Update stats progressively
            };
          }
          
          return { ...prev, racers: updatedRacers, myFinished: prev.myFinished || isMyFinish };
        });
        break;

      case 'race_finished':
        // Update raceDataRef status if we're host
        if (isHostRef.current && raceDataRef.current) {
          raceDataRef.current.status = 'finished';
          
          // Unready all racers in host data
          raceDataRef.current.racers = raceDataRef.current.racers.map(r => ({
            ...r,
            ready: false,
          }));
          
          // Update host presence to reflect finished status (unready)
          if (channelRef.current) {
            const myRacer = data.results.find(r => r.id === myIdRef.current);
            channelRef.current.track({
              odId: myIdRef.current,
              name: myNameRef.current,
              ready: false, // Unready after race
              progress: 100,
              wpm: myRacer?.wpm || 0,
              accuracy: myRacer?.accuracy || 100,
              finished: true,
              time: myRacer?.time || 0,
              isHost: true,
              raceState: {
                status: 'finished',
              },
            });
          }
        } else {
          // Non-host: update presence to unready
          if (channelRef.current) {
            const myRacer = data.results.find(r => r.id === myIdRef.current);
            channelRef.current.track({
              odId: myIdRef.current,
              name: myNameRef.current,
              ready: false, // Unready after race
              progress: 100,
              wpm: myRacer?.wpm || 0,
              accuracy: myRacer?.accuracy || 100,
              finished: true,
              time: myRacer?.time || 0,
              isHost: false,
              isSpectator: false,
            });
          }
        }
        
        // Late joiners: update presence to convert from spectator to racer
        setState(prev => {
          if (prev.lateJoiner && channelRef.current) {
            // Convert late joiner to regular racer for next race
            channelRef.current.track({
              odId: myIdRef.current,
              name: myNameRef.current,
              ready: false,
              progress: 0,
              wpm: 0,
              accuracy: 100,
              finished: false,
              time: 0,
              isHost: false,
              isSpectator: false, // No longer spectating
            });
          }
          
          // Unready all racers in state
          const unreadyRacers = prev.racers.map(r => ({
            ...r,
            ready: false,
          }));
          
          const raceStats = calculateRaceStats(data.results, prev.myId, prev.paragraph, prev.paragraphIndex, prev.raceId, prev.newRoundCounter);
          // Check if I'm in the results (meaning I finished)
          const myResultExists = data.results.some(r => r.id === prev.myId);
          return {
            ...prev,
            status: RaceStatus.FINISHED,
            results: data.results,
            racers: unreadyRacers,
            raceStats,
            myFinished: prev.myFinished || myResultExists,
            // Convert late joiner back to regular racer
            isSpectator: prev.lateJoiner ? false : prev.isSpectator,
            lateJoiner: false,
          };
        });
        break;

      case 'new_round':
        // Host initiated a new round - reset to lobby with new paragraph
        // Skip for host since they already updated state in startNewRound
        if (isHostRef.current) break;
        
        setState(prev => {
          // Reset all racers to not ready, not finished
          const resetRacers = prev.racers.map(r => ({
            ...r,
            ready: false,
            finished: false,
            progress: 0,
            wpm: 0,
            accuracy: 100,
            time: 0,
            position: undefined,
            wordSpeeds: [],
            keystrokeData: [],
          }));
          
          return {
            ...prev,
            status: RaceStatus.WAITING,
            paragraph: data.paragraph,
            paragraphIndex: data.paragraphIndex,
            racers: resetRacers,
            results: [],
            raceStats: null,
            myFinished: false,
            countdownEnd: null,
            raceStartTime: null,
            // Reset spectator/late joiner status so ready button shows
            isSpectator: false,
            lateJoiner: false,
            // Increment counter to trigger typing reset in App.jsx
            newRoundCounter: prev.newRoundCounter + 1,
          };
        });
        
        // Update presence to not ready
        if (channelRef.current) {
          channelRef.current.track({
            odId: myIdRef.current,
            name: myNameRef.current,
            ready: false,
            progress: 0,
            wpm: 0,
            accuracy: 100,
            finished: false,
            time: 0,
            isHost: isHostRef.current,
            isSpectator: false,
          });
        }
        break;

      case 'chat':
        // Someone sent a chat message - skip if already received (dedupe by id)
        setState(prev => {
          if (prev.chatMessages.some(m => m.id === data.id)) return prev;
          
          return {
            ...prev,
            chatMessages: [
              ...prev.chatMessages,
              {
                id: data.id || `msg_${Date.now()}`,
                odId: data.odId,
                name: data.name,
                message: (data.message || '').slice(0, 500), // Enforce max length
                timestamp: data.timestamp || Date.now(),
              }
            ].slice(-50), // Keep last 50 messages
          };
        });
        break;

      case 'stats_request':
        // Someone is requesting our stats
        if (data.targetId === myIdRef.current && data.requesterId) {
          const cumulativeStats = JSON.parse(localStorage.getItem('typometry_cumulative_stats') || 'null');
          if (cumulativeStats) {
            broadcast('stats_response', {
              requesterId: data.requesterId,
              odId: myIdRef.current,
              stats: cumulativeStats,
            });
          }
        }
        break;

      case 'stats_response':
        // Received stats we requested
        if (data.requesterId === myIdRef.current && data.stats) {
          setState(prev => ({
            ...prev,
            viewingPlayerStats: {
              odId: data.odId,
              stats: data.stats,
            },
            statsRequestPending: null,
          }));
        }
        break;

      case 'host_reclaimed':
        // Original host came back and reclaimed host - cancel transfer
        if (hostTransferTimerRef.current) {
          clearInterval(hostTransferTimerRef.current);
          hostTransferTimerRef.current = null;
        }
        originalHostIdRef.current = null;
        setState(prev => ({
          ...prev,
          hostDisconnectedAt: null,
          pendingHostId: null,
          hostTransferSeconds: 60,
          originalHostId: null,
        }));
        break;

      case 'host_transferred':
        // Host manually transferred to someone else
        if (hostTransferTimerRef.current) {
          clearInterval(hostTransferTimerRef.current);
          hostTransferTimerRef.current = null;
        }
        originalHostIdRef.current = null;
        
        // Check if we're the new host
        if (data.newHostId === myIdRef.current) {
          isHostRef.current = true;
          // Store in sessionStorage so we can reclaim after refresh
          sessionStorage.setItem(`typometry_host_${data.raceId}`, myIdRef.current);
          
          setState(prev => {
            raceDataRef.current = {
              racers: prev.racers,
              paragraph: prev.paragraph,
              paragraphIndex: prev.paragraphIndex,
              status: prev.status === RaceStatus.RACING ? 'racing' : 
                      prev.status === RaceStatus.FINISHED ? 'finished' : 'waiting',
              raceStartTime: prev.raceStartTime,
              joinKey: prev.joinKey,
            };
            return {
              ...prev,
              isHost: true,
              hostDisconnectedAt: null,
              pendingHostId: null,
              hostTransferSeconds: 60,
              originalHostId: null,
            };
          });
          
          // Update presence to reflect new host status
          if (channelRef.current) {
            setState(prev => {
              const myRacer = prev.racers.find(r => r.id === myIdRef.current);
              channelRef.current.track({
                odId: myIdRef.current,
                name: myNameRef.current,
                ready: myRacer?.ready ?? false,
                progress: myRacer?.progress || 0,
                wpm: myRacer?.wpm || 0,
                accuracy: myRacer?.accuracy || 100,
                finished: myRacer?.finished || false,
                time: myRacer?.time || 0,
                isHost: true,
                raceState: {
                  paragraph: prev.paragraph,
                  paragraphIndex: prev.paragraphIndex,
                  status: prev.status === RaceStatus.RACING ? 'racing' : 
                          prev.status === RaceStatus.FINISHED ? 'finished' : 'waiting',
                  raceStartTime: prev.raceStartTime,
                  joinKey: prev.joinKey,
                },
              });
              return prev;
            });
          }
        } else {
          // We're not the new host
          if (data.oldHostId === myIdRef.current) {
            // We were the old host, remove our host status
            isHostRef.current = false;
            raceDataRef.current = null;
            sessionStorage.removeItem(`typometry_host_${data.raceId}`);
          }
          setState(prev => ({
            ...prev,
            isHost: false,
            hostDisconnectedAt: null,
            pendingHostId: null,
            hostTransferSeconds: 60,
            originalHostId: null,
          }));
        }
        break;
    }
  }, [calculateRaceStats, broadcast]);

  // Check if all racers finished and broadcast results (host responsibility)
  const checkAllFinished = useCallback(() => {
    setState(prev => {
      if (!isHostRef.current) return prev;
      
      const allFinished = prev.racers.length > 0 && prev.racers.every(r => r.finished);
      if (!allFinished) return prev;
      
      // All finished - calculate and broadcast results
      const results = [...prev.racers]
        .sort((a, b) => b.wpm - a.wpm)
        .map((r, i) => ({ ...r, position: i + 1 }));

      broadcast('race_finished', { results });

      const raceStats = calculateRaceStats(results, prev.myId, prev.paragraph, prev.paragraphIndex, prev.raceId, prev.newRoundCounter);

      return {
        ...prev,
        status: RaceStatus.FINISHED,
        results,
        raceStats,
      };
    });
  }, [broadcast, calculateRaceStats]);

  // Handle presence sync (who's in the room)
  const handlePresenceSync = useCallback(() => {
    if (!channelRef.current) return;

    const presenceState = channelRef.current.presenceState();
    const presenceRacersMap = new Map(); // Dedupe by odId
    const presenceSpectatorsMap = new Map();
    let hostPresent = false;
    let currentHost = null;
    let raceStateFromHost = null;

    Object.values(presenceState).forEach(presences => {
      presences.forEach(presence => {
        // Skip if no odId
        if (!presence.odId) return;
        
        const person = {
          id: presence.odId,
          name: presence.name,
          ready: presence.ready || false,
          progress: presence.progress || 0,
          wpm: presence.wpm || 0,
          accuracy: presence.accuracy || 100,
          position: presence.position, // Character position in text (for ghost cursor)
          finished: presence.finished || false,
          time: presence.time || 0,
          isHost: presence.isHost || false,
          isSpectator: presence.isSpectator || false,
        };
        
        // Use Map to deduplicate - later entries override earlier ones
        if (presence.isSpectator) {
          presenceSpectatorsMap.set(presence.odId, person);
        } else {
          presenceRacersMap.set(presence.odId, person);
        }
        
        if (presence.isHost) {
          hostPresent = true;
          currentHost = presence;
          // Host stores race state in presence for recovery
          if (presence.raceState) {
            raceStateFromHost = presence.raceState;
          }
        }
      });
    });

    // Convert maps to arrays
    const presenceRacers = Array.from(presenceRacersMap.values());
    const presenceSpectators = Array.from(presenceSpectatorsMap.values());

    setState(prev => {
      // Merge presence data with existing racers to preserve broadcast-updated fields
      // (progress, wpm, accuracy are updated via broadcast more frequently than presence)
      const existingRacersMap = new Map(prev.racers.map(r => [r.id, r]));
      
      // During a race, also keep track of disconnected racers from host's data
      const hostRacersMap = new Map();
      if (isHostRef.current && raceDataRef.current?.racers) {
        raceDataRef.current.racers.forEach(r => hostRacersMap.set(r.id, r));
      }
      
      let racers = presenceRacers.map(pr => {
        const existing = existingRacersMap.get(pr.id);
        const hostData = hostRacersMap.get(pr.id);
        
        if (existing || hostData) {
          // Merge with existing/host data - racer might be reconnecting
          const source = existing || hostData;
          const existingPos = typeof source.position === 'number' ? source.position : -1;
          const newPos = typeof pr.position === 'number' ? pr.position : -1;
          const finalPos = Math.max(existingPos, newPos);
          
          // In WAITING status (after rematch), prefer presence values for finished/ready/progress
          // since new_round resets these. During racing, keep sticky/max values.
          const isWaiting = prev.status === RaceStatus.WAITING;
          
          return {
            ...pr,
            // In waiting, use presence value. During race, keep max.
            progress: isWaiting ? pr.progress : Math.max(pr.progress, source.progress || 0),
            wpm: isWaiting ? pr.wpm : (source.wpm > 0 ? source.wpm : pr.wpm),
            accuracy: isWaiting ? pr.accuracy : (source.accuracy < 100 ? source.accuracy : pr.accuracy),
            // In waiting, use presence value. During race, keep true if either is true.
            finished: isWaiting ? pr.finished : (pr.finished || source.finished),
            time: isWaiting ? pr.time : (source.time || pr.time),
            wordSpeeds: source.wordSpeeds || pr.wordSpeeds,
            keystrokeData: source.keystrokeData || pr.keystrokeData,
            position: isWaiting ? pr.position : (finalPos >= 0 ? finalPos : undefined),
            disconnected: false, // They're back online
          };
        }
        return { ...pr, disconnected: false };
      });
      
      // During a race, keep disconnected racers who had progress (they might reconnect)
      const raceInProgress = prev.status === RaceStatus.RACING || prev.status === RaceStatus.COUNTDOWN;
      if (raceInProgress) {
        const onlineIds = new Set(presenceRacers.map(r => r.id));
        
        // Add disconnected racers from existing state
        prev.racers.forEach(r => {
          if (!onlineIds.has(r.id) && r.progress > 0 && !r.finished) {
            racers.push({ ...r, disconnected: true });
          }
        });
        
        // Also check host's raceData
        if (isHostRef.current && raceDataRef.current?.racers) {
          raceDataRef.current.racers.forEach(r => {
            if (!onlineIds.has(r.id) && r.progress > 0 && !r.finished && !racers.find(x => x.id === r.id)) {
              racers.push({ ...r, disconnected: true });
            }
          });
        }
      }
      
      // If we just joined and there's race state from host, sync it
      // IMPORTANT: Only run this for INITIAL joins, not after new_round
      // Check if we're already in the racers list - if so, we're not a new joiner
      const alreadyInRace = racers.some(r => r.id === prev.myId);
      const isInitialJoin = !alreadyInRace && prev.status === RaceStatus.WAITING;
      
      if (raceStateFromHost && !isHostRef.current && isInitialJoin) {
        let newStatus = prev.status;
        if (raceStateFromHost.status === 'racing') newStatus = RaceStatus.RACING;
        else if (raceStateFromHost.status === 'countdown') newStatus = RaceStatus.COUNTDOWN;
        else if (raceStateFromHost.status === 'finished') newStatus = RaceStatus.FINISHED;
        
        // Check if we're reconnecting (our ID exists in racers with progress)
        const myRacer = racers.find(r => r.id === prev.myId);
        const isReconnecting = myRacer && myRacer.progress > 0;
        
        // Validate joinKey - if no key or wrong key, force spectator
        const hostJoinKey = raceStateFromHost.joinKey;
        const hasValidKey = prev.joinKey && hostJoinKey && prev.joinKey === hostJoinKey;
        const invalidKey = hostJoinKey && !hasValidKey && !prev.isSpectator;
        
        // Check if race is full (MAX_RACERS reached and we're not already in)
        const activeRacers = racers.filter(r => !r.disconnected && !r.isSpectator);
        const isAlreadyRacer = activeRacers.some(r => r.id === prev.myId);
        const raceFull = activeRacers.length >= MAX_RACERS && !isAlreadyRacer;
        
        // If race is already in progress and we're not reconnecting, convert to spectator
        const raceInProgress = newStatus === RaceStatus.RACING || newStatus === RaceStatus.COUNTDOWN;
        const shouldBeSpectator = (raceInProgress && !prev.isSpectator && !isReconnecting) || invalidKey || raceFull;
        
        return {
          ...prev,
          racers,
          spectators: presenceSpectators,
          paragraph: raceStateFromHost.paragraph || prev.paragraph,
          paragraphIndex: raceStateFromHost.paragraphIndex || prev.paragraphIndex,
          status: newStatus,
          raceStartTime: raceStateFromHost.raceStartTime || prev.raceStartTime,
          // Sync host's settings
          realtimeMode: raceStateFromHost.realtimeMode ?? prev.realtimeMode,
          strictMode: raceStateFromHost.strictMode ?? prev.strictMode,
          isSpectator: shouldBeSpectator || prev.isSpectator,
          lateJoiner: raceInProgress && shouldBeSpectator, // Flag to show "waiting for race to end" message
        };
      }
      
      // Even if not syncing race state, validate joinKey on first presence sync
      // But ONLY during active race states (countdown/racing) - not during waiting or finished
      // This prevents incorrectly converting returning participants to spectators after a new round
      const raceActive = prev.status === RaceStatus.COUNTDOWN || prev.status === RaceStatus.RACING;
      if (raceStateFromHost && !isHostRef.current && !prev.isSpectator && raceActive) {
        const hostJoinKey = raceStateFromHost.joinKey;
        const hasValidKey = prev.joinKey && hostJoinKey && prev.joinKey === hostJoinKey;
        if (hostJoinKey && !hasValidKey) {
          // Invalid key - convert to spectator
          return {
            ...prev,
            racers,
            spectators: presenceSpectators,
            isSpectator: true,
          };
        }
      }
      
      // Sync settings from host in WAITING status (for guests who join after settings changed)
      if (raceStateFromHost && !isHostRef.current && prev.status === RaceStatus.WAITING) {
        const settingsChanged = 
          (raceStateFromHost.realtimeMode !== undefined && raceStateFromHost.realtimeMode !== prev.realtimeMode) ||
          (raceStateFromHost.strictMode !== undefined && raceStateFromHost.strictMode !== prev.strictMode);
        if (settingsChanged) {
          return {
            ...prev,
            racers,
            spectators: presenceSpectators,
            realtimeMode: raceStateFromHost.realtimeMode ?? prev.realtimeMode,
            strictMode: raceStateFromHost.strictMode ?? prev.strictMode,
          };
        }
      }
      
      // Check if host left - start transfer timer instead of immediate election
      if (!hostPresent && racers.length > 0 && prev.status !== RaceStatus.IDLE && prev.status !== RaceStatus.FINISHED) {
        // Determine who would be the new host (first by alphabetical ID)
        const sortedRacers = [...racers].sort((a, b) => a.id.localeCompare(b.id));
        const pendingHostId = sortedRacers[0].id;
        
        // Check if WE are the original host trying to reclaim (after refresh)
        // We check sessionStorage since our state was reset on refresh
        const wasHost = sessionStorage.getItem(`typometry_host_${prev.raceId}`);
        if (wasHost === myIdRef.current) {
          // We're the original host rejoining - reclaim!
          isHostRef.current = true;
          const currentStatus = prev.status === RaceStatus.RACING ? 'racing' : 
                                prev.status === RaceStatus.FINISHED ? 'finished' : 'waiting';
          raceDataRef.current = { 
            racers, 
            paragraph: prev.paragraph, 
            paragraphIndex: prev.paragraphIndex,
            status: currentStatus,
            raceStartTime: prev.raceStartTime,
            joinKey: prev.joinKey,
          };
          
          // Clear timer (might be running on other clients)
          if (hostTransferTimerRef.current) {
            clearInterval(hostTransferTimerRef.current);
            hostTransferTimerRef.current = null;
          }
          originalHostIdRef.current = null;
          
          // Update presence and broadcast reclaim
          if (channelRef.current) {
            const myRacer = racers.find(r => r.id === myIdRef.current);
            channelRef.current.track({
              odId: myIdRef.current,
              name: myNameRef.current,
              ready: myRacer?.ready ?? false,
              progress: myRacer?.progress || 0,
              wpm: myRacer?.wpm || 0,
              accuracy: myRacer?.accuracy || 100,
              finished: myRacer?.finished || false,
              time: myRacer?.time || 0,
              isHost: true,
              raceState: {
                paragraph: prev.paragraph,
                paragraphIndex: prev.paragraphIndex,
                status: currentStatus,
                raceStartTime: prev.raceStartTime,
                joinKey: prev.joinKey,
              },
            });
          }
          
          broadcast('host_reclaimed', { hostId: myIdRef.current });
          
          return {
            ...prev,
            racers,
            spectators: presenceSpectators,
            isHost: true,
            hostDisconnectedAt: null,
            pendingHostId: null,
            hostTransferSeconds: 60,
            originalHostId: null,
          };
        }
        
        // If timer not already running, start it
        if (!prev.hostDisconnectedAt && !hostTransferTimerRef.current) {
          const disconnectedAt = Date.now();
          
          // Find the original host from previous racers list
          const previousHost = prev.racers.find(r => r.isHost);
          const origHostId = previousHost?.id || null;
          originalHostIdRef.current = origHostId;
          
          // Start countdown timer
          hostTransferTimerRef.current = setInterval(() => {
            setState(currentState => {
              const elapsed = Math.floor((Date.now() - disconnectedAt) / 1000);
              const remaining = Math.max(0, 60 - elapsed);
              
              if (remaining <= 0) {
                // Time's up - transfer host
                clearInterval(hostTransferTimerRef.current);
                hostTransferTimerRef.current = null;
                originalHostIdRef.current = null;
                
                // Recalculate pending host from current racers (original might have left)
                const currentRacers = currentState.racers.filter(r => !r.disconnected);
                if (currentRacers.length === 0) {
                  return {
                    ...currentState,
                    hostDisconnectedAt: null,
                    pendingHostId: null,
                    hostTransferSeconds: 60,
                    originalHostId: null,
                  };
                }
                
                const sortedCurrentRacers = [...currentRacers].sort((a, b) => a.id.localeCompare(b.id));
                const actualNewHostId = sortedCurrentRacers[0].id;
                
                // Check if we should become host
                if (actualNewHostId === myIdRef.current) {
                  isHostRef.current = true;
                  // Store in sessionStorage so we can reclaim after refresh
                  sessionStorage.setItem(`typometry_host_${currentState.raceId}`, myIdRef.current);
                  
                  const currentStatus = currentState.status === RaceStatus.RACING ? 'racing' : 
                                        currentState.status === RaceStatus.FINISHED ? 'finished' : 'waiting';
                  raceDataRef.current = { 
                    racers: currentState.racers, 
                    paragraph: currentState.paragraph, 
                    paragraphIndex: currentState.paragraphIndex,
                    status: currentStatus,
                    raceStartTime: currentState.raceStartTime,
                    joinKey: currentState.joinKey,
                  };
                  
                  // Update presence to reflect new host
                  if (channelRef.current) {
                    const myRacer = currentState.racers.find(r => r.id === myIdRef.current);
                    channelRef.current.track({
                      odId: myIdRef.current,
                      name: myNameRef.current,
                      ready: myRacer?.ready ?? false,
                      progress: myRacer?.progress || 0,
                      wpm: myRacer?.wpm || 0,
                      accuracy: myRacer?.accuracy || 100,
                      finished: myRacer?.finished || false,
                      time: myRacer?.time || 0,
                      isHost: true,
                      raceState: {
                        paragraph: currentState.paragraph,
                        paragraphIndex: currentState.paragraphIndex,
                        status: currentStatus,
                        raceStartTime: currentState.raceStartTime,
                        joinKey: currentState.joinKey,
                      },
                    });
                  }
                  
                  return {
                    ...currentState,
                    isHost: true,
                    hostDisconnectedAt: null,
                    pendingHostId: null,
                    hostTransferSeconds: 60,
                    originalHostId: null,
                  };
                }
                
                return {
                  ...currentState,
                  hostDisconnectedAt: null,
                  pendingHostId: null,
                  hostTransferSeconds: 60,
                  originalHostId: null,
                };
              }
              
              // Update countdown and pending host (might change if people leave)
              const currentRacers = currentState.racers.filter(r => !r.disconnected);
              const sortedCurrentRacers = [...currentRacers].sort((a, b) => a.id.localeCompare(b.id));
              const currentPendingHostId = sortedCurrentRacers.length > 0 ? sortedCurrentRacers[0].id : null;
              
              return {
                ...currentState,
                hostTransferSeconds: remaining,
                pendingHostId: currentPendingHostId,
              };
            });
          }, 1000);
          
          return {
            ...prev,
            racers,
            spectators: presenceSpectators,
            hostDisconnectedAt: disconnectedAt,
            pendingHostId,
            hostTransferSeconds: 60,
            originalHostId: origHostId,
          };
        }
        
        return { ...prev, racers, spectators: presenceSpectators };
      }
      
      // Host is present - clear any transfer timer
      if (hostPresent && prev.hostDisconnectedAt) {
        if (hostTransferTimerRef.current) {
          clearInterval(hostTransferTimerRef.current);
          hostTransferTimerRef.current = null;
        }
        originalHostIdRef.current = null;
        return {
          ...prev,
          racers,
          spectators: presenceSpectators,
          hostDisconnectedAt: null,
          pendingHostId: null,
          hostTransferSeconds: 60,
          originalHostId: null,
        };
      }
      
      return { ...prev, racers, spectators: presenceSpectators };
    });

    // Update raceDataRef with presence racers (for host)
    if (isHostRef.current && raceDataRef.current) {
      raceDataRef.current.racers = presenceRacers;
    }
  }, [checkAllFinished, broadcast]);

  // Handle presence join
  const handlePresenceJoin = useCallback(({ newPresences }) => {
    // If host, send full race state to new/rejoining racer
    if (isHostRef.current && raceDataRef.current) {
      setTimeout(() => {
        broadcast('race_state_sync', {
          paragraph: raceDataRef.current.paragraph,
          paragraphIndex: raceDataRef.current.paragraphIndex,
          status: raceDataRef.current.status || 'waiting',
          raceStartTime: raceDataRef.current.raceStartTime || null,
          racers: raceDataRef.current.racers || [],
          realtimeMode: raceDataRef.current.realtimeMode ?? true,
          strictMode: raceDataRef.current.strictMode ?? false,
          lobbyName: raceDataRef.current.lobbyName || '',
        });
      }, 100);
    }
    handlePresenceSync();
  }, [broadcast, handlePresenceSync]);

  // Create a new race - returns the code immediately
  const createRace = useCallback((paragraph, paragraphIndex) => {
    const raceId = generateRaceCode();
    // Generate a separate join key - required to participate (not just spectate)
    const joinKey = Math.random().toString(36).substring(2, 10);
    // Store joinKey in sessionStorage so host can recover after refresh
    sessionStorage.setItem(`typometry_race_key_${raceId}`, joinKey);
    return { raceId, joinKey, paragraph, paragraphIndex };
  }, []);

  // Join a race (as host, joiner, or spectator)
  // joinKey is required to participate - without it, user becomes spectator
  const joinRace = useCallback(async (raceId, name, paragraph = '', paragraphIndex = 0, asHost = false, asSpectator = false, joinKey = null) => {
    const myId = myIdRef.current;
    isHostRef.current = asHost;
    
    // Store host status in sessionStorage so we can reclaim after refresh
    if (asHost) {
      sessionStorage.setItem(`typometry_host_${raceId}`, myId);
    }

    setState(prev => ({
      ...prev,
      raceId,
      status: RaceStatus.CONNECTING,
      myId,
      isHost: asHost,
      isSpectator: asSpectator,
      lateJoiner: false, // Reset - will be set if race is in progress
      paragraph: asHost ? paragraph : '',
      paragraphIndex: asHost ? paragraphIndex : 0,
      joinKey: joinKey, // Store provided join key for validation
      error: null,
      results: [],
      raceStats: null,
    }));

    if (asHost) {
      raceDataRef.current = { paragraph, paragraphIndex, racers: [], realtimeMode: true, strictMode: false, joinKey, lobbyName: '' };
    }

    // Subscribe to Supabase Realtime channel
    const channel = supabase.channel(`race:${raceId}`, {
      config: { presence: { key: myId } },
    });

    channel
      .on('presence', { event: 'sync' }, handlePresenceSync)
      .on('presence', { event: 'join' }, handlePresenceJoin)
      .on('presence', { event: 'leave' }, handlePresenceSync)
      .on('broadcast', { event: 'race' }, ({ payload }) => handleBroadcast(payload))
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          // Check existing names in the room
          const presenceState = channel.presenceState();
          const existingNames = new Set();
          Object.values(presenceState).forEach(presences => {
            presences.forEach(p => {
              if (p.name) existingNames.add(p.name.toLowerCase());
            });
          });
          
          // Determine name - assign guest number if needed
          let finalName = name;
          if (!name || name === 'guest' || name.match(/^guest\d*$/)) {
            // Assign guest number
            let guestNum = 1;
            while (existingNames.has(`guest${guestNum}`)) {
              guestNum++;
            }
            finalName = `guest${guestNum}`;
          } else {
            // Check for duplicate - add number suffix if taken
            const baseName = name.toLowerCase();
            if (existingNames.has(baseName)) {
              let suffix = 2;
              while (existingNames.has(`${baseName}${suffix}`)) {
                suffix++;
              }
              finalName = `${name}${suffix}`;
            }
          }
          myNameRef.current = finalName;
          
          // Track presence - host includes joinKey in raceState for validation
          await channel.track({
            odId: myId,
            name: finalName,
            ready: asSpectator ? true : false, // Spectators are always "ready"
            progress: 0,
            wpm: 0,
            accuracy: 100,
            finished: false,
            time: 0,
            isHost: asHost,
            isSpectator: asSpectator,
            // Host broadcasts joinKey and settings so joiners can sync
            ...(asHost && raceDataRef.current?.joinKey ? {
              raceState: {
                status: 'waiting',
                joinKey: raceDataRef.current.joinKey,
                realtimeMode: raceDataRef.current.realtimeMode ?? true,
                strictMode: raceDataRef.current.strictMode ?? false,
              }
            } : {}),
          });

          // Delayed check for name collisions (race condition protection)
          setTimeout(async () => {
            const ps = channel.presenceState();
            const nameCount = {};
            const myOdId = myIdRef.current;
            
            Object.values(ps).forEach(presences => {
              presences.forEach(p => {
                const n = p.name?.toLowerCase();
                if (n) {
                  if (!nameCount[n]) nameCount[n] = [];
                  nameCount[n].push(p.odId);
                }
              });
            });
            
            // Check if our name has duplicates
            const myName = myNameRef.current?.toLowerCase();
            if (myName && nameCount[myName] && nameCount[myName].length > 1) {
              // Multiple people with same name - later joiner (higher odId) gets renamed
              const sorted = nameCount[myName].sort();
              const myIndex = sorted.indexOf(myOdId);
              if (myIndex > 0) {
                // We're not the first - need to rename
                const newName = `${myNameRef.current}${myIndex + 1}`;
                myNameRef.current = newName;
                
                await channel.track({
                  odId: myOdId,
                  name: newName,
                  ready: false,
                  progress: 0,
                  wpm: 0,
                  accuracy: 100,
                  finished: false,
                  time: 0,
                  isHost: asHost,
                });
              }
            }
          }, 500);

          setState(prev => ({ ...prev, status: RaceStatus.WAITING }));
        } else if (status === 'CHANNEL_ERROR') {
          setState(prev => ({ ...prev, status: RaceStatus.IDLE, error: 'Failed to connect' }));
        }
      });

    channelRef.current = channel;
  }, [handlePresenceSync, handlePresenceJoin, handleBroadcast]);

  // Set ready status
  const setReady = useCallback(async (ready) => {
    if (!channelRef.current) return;

    // Get current presence state to preserve isSpectator
    const currentPresence = channelRef.current.presenceState()[myIdRef.current]?.[0];

    await channelRef.current.track({
      odId: myIdRef.current,
      name: myNameRef.current,
      ready,
      progress: 0,
      wpm: 0,
      accuracy: 100,
      finished: false,
      time: 0,
      isHost: isHostRef.current,
      isSpectator: currentPresence?.isSpectator || false,
    });

    broadcast('ready_update', { odId: myIdRef.current, ready });
  }, [broadcast]);

  // Update display name
  const updateName = useCallback(async (newName) => {
    if (!channelRef.current || !newName.trim()) return;
    
    let finalName = newName.trim().slice(0, 20); // Max 20 chars
    
    // Check for duplicate names (excluding self)
    const presenceState = channelRef.current.presenceState();
    const existingNames = new Set();
    Object.entries(presenceState).forEach(([odId, presences]) => {
      presences.forEach(p => {
        if (p.odId !== myIdRef.current && p.name) {
          existingNames.add(p.name.toLowerCase());
        }
      });
    });
    
    // Add suffix if name is taken
    const baseName = finalName.toLowerCase();
    if (existingNames.has(baseName)) {
      let suffix = 2;
      while (existingNames.has(`${baseName}${suffix}`)) {
        suffix++;
      }
      finalName = `${finalName}${suffix}`;
    }
    
    myNameRef.current = finalName;
    
    // Update local state
    setState(prev => ({
      ...prev,
      racers: prev.racers.map(r =>
        r.id === myIdRef.current ? { ...r, name: finalName } : r
      )
    }));
    
    // Update presence
    const myRacer = channelRef.current.presenceState()[myIdRef.current]?.[0];
    await channelRef.current.track({
      odId: myIdRef.current,
      name: finalName,
      ready: myRacer?.ready || false,
      progress: myRacer?.progress || 0,
      wpm: myRacer?.wpm || 0,
      accuracy: myRacer?.accuracy || 100,
      finished: myRacer?.finished || false,
      time: myRacer?.time || 0,
      isHost: isHostRef.current,
      isSpectator: myRacer?.isSpectator || false,
    });
    
    // Broadcast name change
    broadcast('name_update', { odId: myIdRef.current, name: finalName });
    
    // Save to localStorage for future sessions
    localStorage.setItem('typometry_racer_name', finalName);
  }, [broadcast]);

  // Start the race (host only)
  const startRace = useCallback((newParagraph, newParagraphIndex) => {
    if (!isHostRef.current) return;

    const countdownEnd = Date.now() + 3000;
    
    // Get current realtimeMode from state
    setState(prev => {
      const realtimeMode = prev.realtimeMode;
      // Use new paragraph if provided, otherwise fall back to existing
      const paragraph = newParagraph || raceDataRef.current?.paragraph || prev.paragraph;
      const paragraphIndex = typeof newParagraphIndex === 'number' ? newParagraphIndex : (raceDataRef.current?.paragraphIndex ?? prev.paragraphIndex);
      
      // Update raceDataRef with new paragraph
      if (raceDataRef.current) {
        raceDataRef.current.paragraph = paragraph;
        raceDataRef.current.paragraphIndex = paragraphIndex;
      }
      
      broadcast('countdown', { 
        endTime: countdownEnd, 
        realtimeMode,
        paragraph,
        paragraphIndex,
      });

      if (raceDataRef.current) {
        raceDataRef.current.status = 'countdown';
        raceDataRef.current.realtimeMode = realtimeMode;
      }

      setTimeout(() => {
        const startTime = Date.now();
        broadcast('race_start', { startTime, realtimeMode, paragraph, paragraphIndex });
        
        if (raceDataRef.current) {
          raceDataRef.current.status = 'racing';
          raceDataRef.current.raceStartTime = startTime;
        }
        
        // Update host presence with race state for recovery
        if (channelRef.current && isHostRef.current) {
          const myRacer = raceDataRef.current?.racers?.find(r => r.id === myIdRef.current);
          channelRef.current.track({
            odId: myIdRef.current,
            name: myNameRef.current,
            ready: true,
            progress: myRacer?.progress || 0,
            wpm: myRacer?.wpm || 0,
            accuracy: myRacer?.accuracy || 100,
            finished: false,
            time: 0,
            isHost: true,
            raceState: {
              paragraph: raceDataRef.current.paragraph,
              paragraphIndex: raceDataRef.current.paragraphIndex,
              status: 'racing',
              raceStartTime: startTime,
              realtimeMode,
              joinKey: raceDataRef.current.joinKey,
            },
          });
        }
        
        setState(prev2 => ({
          ...prev2,
          status: RaceStatus.RACING,
          raceStartTime: startTime,
        }));
      }, 3000);

      return {
        ...prev,
        status: RaceStatus.COUNTDOWN,
        countdownEnd,
        paragraph,
        paragraphIndex,
      };
    });
  }, [broadcast]);

  // Set realtime mode (host only)
  const setRealtimeMode = useCallback((enabled) => {
    if (!isHostRef.current) return;
    
    setState(prev => {
      // Update presence with new settings
      if (channelRef.current && raceDataRef.current) {
        const myRacer = prev.racers.find(r => r.id === myIdRef.current);
        channelRef.current.track({
          odId: myIdRef.current,
          name: myNameRef.current,
          ready: myRacer?.ready ?? false,
          progress: myRacer?.progress || 0,
          wpm: myRacer?.wpm || 0,
          accuracy: myRacer?.accuracy || 100,
          finished: myRacer?.finished || false,
          time: myRacer?.time || 0,
          isHost: true,
          raceState: {
            status: 'waiting',
            paragraph: prev.paragraph,
            paragraphIndex: prev.paragraphIndex,
            joinKey: raceDataRef.current.joinKey,
            realtimeMode: enabled,
            strictMode: raceDataRef.current.strictMode ?? false,
          },
        });
      }
      return { ...prev, realtimeMode: enabled };
    });
    broadcast('settings_update', { realtimeMode: enabled });
    
    if (raceDataRef.current) {
      raceDataRef.current.realtimeMode = enabled;
    }
  }, [broadcast]);

  // Set strict mode - must correct errors to advance (host only)
  const setStrictMode = useCallback((enabled) => {
    if (!isHostRef.current) return;
    
    setState(prev => {
      // Update presence with new settings
      if (channelRef.current && raceDataRef.current) {
        const myRacer = prev.racers.find(r => r.id === myIdRef.current);
        channelRef.current.track({
          odId: myIdRef.current,
          name: myNameRef.current,
          ready: myRacer?.ready ?? false,
          progress: myRacer?.progress || 0,
          wpm: myRacer?.wpm || 0,
          accuracy: myRacer?.accuracy || 100,
          finished: myRacer?.finished || false,
          time: myRacer?.time || 0,
          isHost: true,
          raceState: {
            status: 'waiting',
            paragraph: prev.paragraph,
            paragraphIndex: prev.paragraphIndex,
            joinKey: raceDataRef.current.joinKey,
            realtimeMode: raceDataRef.current.realtimeMode ?? true,
            strictMode: enabled,
          },
        });
      }
      return { ...prev, strictMode: enabled };
    });
    broadcast('settings_update', { strictMode: enabled });
    
    if (raceDataRef.current) {
      raceDataRef.current.strictMode = enabled;
    }
  }, [broadcast]);

  // Set lobby name (host only)
  const setLobbyName = useCallback((name) => {
    if (!isHostRef.current) return;
    
    const lobbyName = (name || '').slice(0, 30); // Max 30 chars
    setState(prev => ({ ...prev, lobbyName }));
    broadcast('lobby_name_update', { lobbyName });
    
    if (raceDataRef.current) {
      raceDataRef.current.lobbyName = lobbyName;
    }
  }, [broadcast]);

  // Start a new round with the same players (host only)
  // Takes a new paragraph from the caller
  const startNewRound = useCallback((newParagraph, newParagraphIndex) => {
    if (!isHostRef.current) return;
    
    // Broadcast new round to all players
    broadcast('new_round', { 
      paragraph: newParagraph, 
      paragraphIndex: newParagraphIndex,
    });
    
    // Update host's raceData
    if (raceDataRef.current) {
      raceDataRef.current.paragraph = newParagraph;
      raceDataRef.current.paragraphIndex = newParagraphIndex;
      raceDataRef.current.status = 'waiting';
      raceDataRef.current.raceStartTime = null;
      // Reset racers
      raceDataRef.current.racers = raceDataRef.current.racers.map(r => ({
        ...r,
        ready: false,
        finished: false,
        progress: 0,
        wpm: 0,
        accuracy: 100,
        time: 0,
        position: undefined,
        wordSpeeds: [],
        keystrokeData: [],
      }));
    }
    
    // Update host state
    setState(prev => {
      const resetRacers = prev.racers.map(r => ({
        ...r,
        ready: false,
        finished: false,
        progress: 0,
        wpm: 0,
        accuracy: 100,
        time: 0,
        position: undefined,
        wordSpeeds: [],
        keystrokeData: [],
      }));
      
      return {
        ...prev,
        status: RaceStatus.WAITING,
        paragraph: newParagraph,
        paragraphIndex: newParagraphIndex,
        racers: resetRacers,
        results: [],
        raceStats: null,
        myFinished: false,
        countdownEnd: null,
        raceStartTime: null,
        // Reset spectator/late joiner (for consistency)
        isSpectator: false,
        lateJoiner: false,
        // Increment counter (host also uses this for consistency)
        newRoundCounter: prev.newRoundCounter + 1,
      };
    });
    
    // Update host presence
    if (channelRef.current) {
      channelRef.current.track({
        odId: myIdRef.current,
        name: myNameRef.current,
        ready: false,
        progress: 0,
        wpm: 0,
        accuracy: 100,
        finished: false,
        time: 0,
        isHost: true,
        isSpectator: false,
        raceState: {
          status: 'waiting',
          paragraph: newParagraph,
          paragraphIndex: newParagraphIndex,
          joinKey: raceDataRef.current?.joinKey,
          realtimeMode: raceDataRef.current?.realtimeMode ?? true,
          strictMode: raceDataRef.current?.strictMode ?? false,
        },
      });
    }
  }, [broadcast]);

  // Update progress - real-time via broadcast (unlimited!)
  const updateProgress = useCallback((progress, wpm, accuracy, position) => {
    broadcast('progress', { odId: myIdRef.current, progress, wpm, accuracy, position });

    // Update presence - include race state if host
    if (channelRef.current) {
      const presenceData = {
        odId: myIdRef.current,
        name: myNameRef.current,
        ready: true,
        progress,
        wpm,
        accuracy,
        position,
        finished: false,
        time: 0,
        isHost: isHostRef.current,
      };
      
      // Host includes race state for recovery
      if (isHostRef.current && raceDataRef.current) {
        presenceData.raceState = {
          paragraph: raceDataRef.current.paragraph,
          paragraphIndex: raceDataRef.current.paragraphIndex,
          status: raceDataRef.current.status,
          raceStartTime: raceDataRef.current.raceStartTime,
        };
      }
      
      channelRef.current.track(presenceData);
    }

    setState(prev => ({
      ...prev,
      racers: prev.racers.map(r =>
        r.id === myIdRef.current ? { ...r, progress, wpm, accuracy } : r
      )
    }));
  }, [broadcast]);

  // Finish race
  const finishRace = useCallback((wpm, accuracy, time, wordSpeeds = [], keystrokeData = []) => {
    const myId = myIdRef.current;
    broadcast('finish', { odId: myId, wpm, accuracy, time, wordSpeeds, keystrokeData });

    // Update presence to show finished
    if (channelRef.current) {
      const presenceData = {
        odId: myId,
        name: myNameRef.current,
        ready: false, // Race is over, not ready for next
        progress: 100,
        wpm,
        accuracy,
        finished: true,
        time,
        isHost: isHostRef.current,
      };
      
      // Host includes race state - mark as racing until all finished
      if (isHostRef.current && raceDataRef.current) {
        presenceData.raceState = {
          paragraph: raceDataRef.current.paragraph,
          paragraphIndex: raceDataRef.current.paragraphIndex,
          status: raceDataRef.current.status || 'racing',
          raceStartTime: raceDataRef.current.raceStartTime,
        };
      }
      
      channelRef.current.track(presenceData);
    }

    setState(prev => {
      const updatedRacers = prev.racers.map(r =>
        r.id === myId ? { ...r, finished: true, wpm, accuracy, time, wordSpeeds, keystrokeData } : r
      );

      // Update host's race data
      if (isHostRef.current && raceDataRef.current) {
        raceDataRef.current.racers = raceDataRef.current.racers.map(r =>
          r.id === myId ? { ...r, finished: true, wpm, accuracy, time, wordSpeeds } : r
        );
      }

      // Calculate stats immediately with whoever has finished
      const finishedRacers = updatedRacers.filter(r => r.finished);
      const allFinished = updatedRacers.every(r => r.finished);
      
      const results = [...finishedRacers]
        .sort((a, b) => b.wpm - a.wpm)
        .map((r, i) => ({ ...r, position: i + 1 }));

      const raceStats = calculateRaceStats(results, myId, prev.paragraph, prev.paragraphIndex, prev.raceId, prev.newRoundCounter);
      raceStats.racerCount = updatedRacers.length;
      raceStats.finishedCount = finishedRacers.length;
      raceStats.isComplete = allFinished;

      // If all finished and we're host, broadcast final results
      if (allFinished && isHostRef.current) {
        broadcast('race_finished', { results });
        
        // Update raceDataRef status
        if (raceDataRef.current) {
          raceDataRef.current.status = 'finished';
        }
        
        // Update presence with finished status
        if (channelRef.current) {
          channelRef.current.track({
            odId: myId,
            name: myNameRef.current,
            ready: false, // Race is over, not ready for next
            progress: 100,
            wpm,
            accuracy,
            finished: true,
            time,
            isHost: true,
            raceState: {
              status: 'finished',
            },
          });
        }

        return {
          ...prev,
          racers: updatedRacers,
          myFinished: true,
          status: RaceStatus.FINISHED,
          results,
          raceStats,
        };
      }

      return { 
        ...prev, 
        racers: updatedRacers, 
        myFinished: true,
        results,
        raceStats, // Show stats immediately
      };
    });
  }, [broadcast, calculateRaceStats]);

  // Manually transfer host to another racer
  const transferHost = useCallback((newHostId) => {
    if (!isHostRef.current) {
      console.warn('Only the host can transfer host');
      return false;
    }
    
    if (!newHostId || newHostId === myIdRef.current) {
      console.warn('Invalid transfer target');
      return false;
    }
    
    setState(prev => {
      // Verify target is a valid racer
      const targetRacer = prev.racers.find(r => r.id === newHostId && !r.disconnected);
      if (!targetRacer) {
        console.warn('Target racer not found or disconnected');
        return prev;
      }
      
      // Clear our host status
      isHostRef.current = false;
      raceDataRef.current = null;
      sessionStorage.removeItem(`typometry_host_${prev.raceId}`);
      
      // Broadcast the transfer
      broadcast('host_transferred', { 
        oldHostId: myIdRef.current, 
        newHostId,
        raceId: prev.raceId,
      });
      
      // Update presence to remove host status
      if (channelRef.current) {
        const myRacer = prev.racers.find(r => r.id === myIdRef.current);
        channelRef.current.track({
          odId: myIdRef.current,
          name: myNameRef.current,
          ready: myRacer?.ready ?? false,
          progress: myRacer?.progress || 0,
          wpm: myRacer?.wpm || 0,
          accuracy: myRacer?.accuracy || 100,
          finished: myRacer?.finished || false,
          time: myRacer?.time || 0,
          isHost: false,
        });
      }
      
      return {
        ...prev,
        isHost: false,
      };
    });
    
    return true;
  }, [broadcast]);

  // Leave race
  const leaveRace = useCallback(async () => {
    // Clean up sessionStorage
    setState(prev => {
      if (prev.raceId) {
        sessionStorage.removeItem(`typometry_race_key_${prev.raceId}`);
        sessionStorage.removeItem(`typometry_host_${prev.raceId}`);
        sessionStorage.removeItem('typometry_active_race');
      }
      return prev;
    });
    
    // Clear host transfer timer
    if (hostTransferTimerRef.current) {
      clearInterval(hostTransferTimerRef.current);
      hostTransferTimerRef.current = null;
    }
    originalHostIdRef.current = null;
    
    if (channelRef.current) {
      await supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    isHostRef.current = false;
    raceDataRef.current = null;

    setState(prev => ({
      ...prev,
      raceId: null,
      status: RaceStatus.IDLE,
      racers: [],
      myId: null,
      isHost: false,
      isSpectator: false,
      lateJoiner: false,
      joinKey: null,
      myFinished: false,
      countdownEnd: null,
      raceStartTime: null,
      results: [],
      error: null,
      lobbyName: '',
      hostDisconnectedAt: null,
      pendingHostId: null,
      hostTransferSeconds: 60,
      originalHostId: null,
      viewingPlayerStats: null,
      statsRequestPending: null,
      chatMessages: [],
    }));
  }, []);

  // Clear race stats
  const clearRaceStats = useCallback(() => {
    setState(prev => ({ ...prev, raceStats: null }));
  }, []);

  // Request to view another player's stats
  const requestPlayerStats = useCallback((targetId) => {
    if (!channelRef.current) return;
    
    setState(prev => ({ ...prev, statsRequestPending: targetId }));
    broadcast('stats_request', { 
      targetId, 
      requesterId: myIdRef.current 
    });
    
    // Timeout after 5 seconds
    setTimeout(() => {
      setState(prev => {
        if (prev.statsRequestPending === targetId) {
          return { ...prev, statsRequestPending: null };
        }
        return prev;
      });
    }, 5000);
  }, [broadcast]);

  // Clear stats viewing
  const clearViewingStats = useCallback(() => {
    setState(prev => ({ 
      ...prev, 
      viewingPlayerStats: null,
      statsRequestPending: null,
    }));
  }, []);

  // Send chat message
  const sendChat = useCallback((message) => {
    if (!channelRef.current || !message.trim()) return;
    
    const trimmedMessage = message.trim().slice(0, 500); // Max 500 chars
    const chatMessage = {
      id: `msg_${Date.now()}_${myIdRef.current}`,
      odId: myIdRef.current,
      name: myNameRef.current,
      message: trimmedMessage,
      timestamp: Date.now(),
    };
    
    // Add to own state first (will be deduped by ID when broadcast returns)
    setState(prev => ({
      ...prev,
      chatMessages: [...prev.chatMessages, chatMessage].slice(-50),
    }));
    
    broadcast('chat', chatMessage);
  }, [broadcast]);

  // Clear chat (for new lobby)
  const clearChat = useCallback(() => {
    setState(prev => ({ ...prev, chatMessages: [] }));
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
      if (hostTransferTimerRef.current) {
        clearInterval(hostTransferTimerRef.current);
      }
    };
  }, []);

  // Derived state
  const waitingForOthers = state.myFinished && state.status === RaceStatus.RACING;
  const finishedCount = state.racers.filter(r => r.finished).length;
  const totalCount = state.racers.length;

  return {
    state,
    createRace,
    joinRace,
    setReady,
    updateName,
    startRace,
    startNewRound,
    updateProgress,
    finishRace,
    leaveRace,
    clearRaceStats,
    setRealtimeMode,
    setStrictMode,
    setLobbyName,
    transferHost,
    requestPlayerStats,
    clearViewingStats,
    sendChat,
    clearChat,
    isInRace: state.status !== RaceStatus.IDLE && state.status !== RaceStatus.FINISHED,
    hasRaceStats: state.raceStats !== null,
    waitingForOthers,
    finishedCount,
    totalCount,
  };
}
