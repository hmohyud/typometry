import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from './supabase';

// Supabase Realtime = unlimited messages, no write limits!
// All race data flows through WebSocket broadcast, not database

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
    lateJoiner: false, // True if joined while race was in progress
    joinKey: null, // Key required to participate (not just spectate)
    myFinished: false,
    countdownEnd: null,
    raceStartTime: null,
    results: [],
    raceStats: null,
    error: null,
    realtimeMode: true, // Timer starts at GO, not first keystroke
  });

  const myIdRef = useRef(generateRacerId());
  const channelRef = useRef(null);
  const raceDataRef = useRef(null);
  const isHostRef = useRef(false);
  const myNameRef = useRef('Anonymous');

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
  const calculateRaceStats = useCallback((results, myId, paragraph, paragraphIndex, raceId) => {
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
        }));
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
            const raceStats = calculateRaceStats(results, prev.myId, prev.paragraph, prev.paragraphIndex, prev.raceId);
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
          
          // Update host presence to reflect finished status
          if (channelRef.current) {
            const myRacer = data.results.find(r => r.id === myIdRef.current);
            channelRef.current.track({
              odId: myIdRef.current,
              name: myNameRef.current,
              ready: true,
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
          
          const raceStats = calculateRaceStats(data.results, prev.myId, prev.paragraph, prev.paragraphIndex, prev.raceId);
          // Check if I'm in the results (meaning I finished)
          const myResultExists = data.results.some(r => r.id === prev.myId);
          return {
            ...prev,
            status: RaceStatus.FINISHED,
            results: data.results,
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

      const raceStats = calculateRaceStats(results, prev.myId, prev.paragraph, prev.paragraphIndex, prev.raceId);

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
          
          return {
            ...pr,
            progress: Math.max(pr.progress, source.progress || 0),
            wpm: source.wpm > 0 ? source.wpm : pr.wpm,
            accuracy: source.accuracy < 100 ? source.accuracy : pr.accuracy,
            finished: pr.finished || source.finished,
            time: source.time || pr.time,
            wordSpeeds: source.wordSpeeds || pr.wordSpeeds,
            keystrokeData: source.keystrokeData || pr.keystrokeData,
            position: finalPos >= 0 ? finalPos : undefined,
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
      if (raceStateFromHost && !isHostRef.current && prev.status === RaceStatus.WAITING) {
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
        
        // If race is already in progress and we're not reconnecting, convert to spectator
        const raceInProgress = newStatus === RaceStatus.RACING || newStatus === RaceStatus.COUNTDOWN;
        const shouldBeSpectator = (raceInProgress && !prev.isSpectator && !isReconnecting) || invalidKey;
        
        return {
          ...prev,
          racers,
          spectators: presenceSpectators,
          paragraph: raceStateFromHost.paragraph || prev.paragraph,
          paragraphIndex: raceStateFromHost.paragraphIndex || prev.paragraphIndex,
          status: newStatus,
          raceStartTime: raceStateFromHost.raceStartTime || prev.raceStartTime,
          isSpectator: shouldBeSpectator || prev.isSpectator,
          lateJoiner: raceInProgress && shouldBeSpectator, // Flag to show "waiting for race to end" message
        };
      }
      
      // Even if not syncing race state, validate joinKey on first presence sync
      if (raceStateFromHost && !isHostRef.current && !prev.isSpectator && prev.status !== RaceStatus.IDLE) {
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
      
      // Check if host left - need to elect new host
      if (!hostPresent && racers.length > 0 && prev.status !== RaceStatus.IDLE && prev.status !== RaceStatus.FINISHED) {
        // Elect new host - first by alphabetical ID (deterministic)
        const sortedRacers = [...racers].sort((a, b) => a.id.localeCompare(b.id));
        const newHostId = sortedRacers[0].id;
        
        if (newHostId === prev.myId) {
          // We are the new host - take over
          isHostRef.current = true;
          const currentStatus = prev.status === RaceStatus.RACING ? 'racing' : 
                                prev.status === RaceStatus.FINISHED ? 'finished' : 'waiting';
          raceDataRef.current = { 
            racers, 
            paragraph: prev.paragraph, 
            paragraphIndex: prev.paragraphIndex,
            status: currentStatus,
            raceStartTime: prev.raceStartTime,
            joinKey: prev.joinKey, // Preserve joinKey for validation
          };
          
          // Update our presence to reflect host status with race state
          if (channelRef.current) {
            const myRacer = racers.find(r => r.id === prev.myId);
            channelRef.current.track({
              odId: prev.myId,
              name: myNameRef.current,
              ready: myRacer?.ready || true,
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
                joinKey: prev.joinKey, // Include for new joiner validation
              },
            });
          }
          
          // Check if we need to end the race
          setTimeout(() => checkAllFinished(), 100);
          
          return { ...prev, racers, isHost: true };
        }
      }
      
      return { ...prev, racers, spectators: presenceSpectators };
    });

    // Update raceDataRef with presence racers (for host)
    if (isHostRef.current && raceDataRef.current) {
      raceDataRef.current.racers = presenceRacers;
    }
  }, [checkAllFinished]);

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
      raceDataRef.current = { paragraph, paragraphIndex, racers: [], realtimeMode: true, joinKey };
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
            // Host broadcasts joinKey so joiners can validate
            ...(asHost && raceDataRef.current?.joinKey ? {
              raceState: {
                status: 'waiting',
                joinKey: raceDataRef.current.joinKey,
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
  const startRace = useCallback(() => {
    if (!isHostRef.current) return;

    const countdownEnd = Date.now() + 3000;
    
    // Get current realtimeMode from state
    setState(prev => {
      const realtimeMode = prev.realtimeMode;
      const paragraph = raceDataRef.current?.paragraph || prev.paragraph;
      const paragraphIndex = raceDataRef.current?.paragraphIndex ?? prev.paragraphIndex;
      
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
      };
    });
  }, [broadcast]);

  // Set realtime mode (host only)
  const setRealtimeMode = useCallback((enabled) => {
    if (!isHostRef.current) return;
    
    setState(prev => ({ ...prev, realtimeMode: enabled }));
    broadcast('settings_update', { realtimeMode: enabled });
    
    if (raceDataRef.current) {
      raceDataRef.current.realtimeMode = enabled;
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
        ready: true,
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

      const raceStats = calculateRaceStats(results, myId, prev.paragraph, prev.paragraphIndex, prev.raceId);
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
            ready: true,
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

  // Leave race
  const leaveRace = useCallback(async () => {
    // Clean up joinKey from sessionStorage
    setState(prev => {
      if (prev.raceId) {
        sessionStorage.removeItem(`typometry_race_key_${prev.raceId}`);
      }
      return prev;
    });
    
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
    }));
  }, []);

  // Clear race stats
  const clearRaceStats = useCallback(() => {
    setState(prev => ({ ...prev, raceStats: null }));
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
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
    isInRace: state.status !== RaceStatus.IDLE && state.status !== RaceStatus.FINISHED,
    hasRaceStats: state.raceStats !== null,
    waitingForOthers,
    finishedCount,
    totalCount,
  };
}
