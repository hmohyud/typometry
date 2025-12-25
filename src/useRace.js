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
    myId: null,
    isHost: false,
    myFinished: false,
    countdownEnd: null,
    raceStartTime: null,
    results: [],
    raceStats: null,
    error: null,
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

      case 'countdown':
        setState(prev => ({
          ...prev,
          status: RaceStatus.COUNTDOWN,
          countdownEnd: data.endTime,
        }));
        break;

      case 'race_start':
        setState(prev => ({
          ...prev,
          status: RaceStatus.RACING,
          raceStartTime: data.startTime,
        }));
        break;

      case 'progress':
        setState(prev => ({
          ...prev,
          racers: prev.racers.map(r =>
            r.id === data.odId ? { ...r, progress: data.progress, wpm: data.wpm, accuracy: data.accuracy } : r
          )
        }));
        if (isHostRef.current && raceDataRef.current) {
          raceDataRef.current.racers = raceDataRef.current.racers.map(r =>
            r.id === data.odId ? { ...r, progress: data.progress, wpm: data.wpm, accuracy: data.accuracy } : r
          );
        }
        break;

      case 'finish':
        setState(prev => {
          const updatedRacers = prev.racers.map(r =>
            r.id === data.odId ? { ...r, finished: true, wpm: data.wpm, accuracy: data.accuracy, time: data.time, wordSpeeds: data.wordSpeeds || [] } : r
          );
          
          // If host, update raceData and check if all finished
          if (isHostRef.current && raceDataRef.current) {
            raceDataRef.current.racers = raceDataRef.current.racers.map(r =>
              r.id === data.odId ? { ...r, finished: true, wpm: data.wpm, accuracy: data.accuracy, time: data.time, wordSpeeds: data.wordSpeeds || [] } : r
            );
            
            // Check if all finished
            const allFinished = updatedRacers.every(r => r.finished);
            if (allFinished) {
              const results = [...updatedRacers]
                .sort((a, b) => b.wpm - a.wpm)
                .map((r, i) => ({ ...r, position: i + 1 }));

              // Broadcast results (use setTimeout to avoid state update conflicts)
              setTimeout(() => {
                broadcast('race_finished', { results });
              }, 50);

              const raceStats = calculateRaceStats(results, prev.myId, prev.paragraph, prev.paragraphIndex, prev.raceId);

              return {
                ...prev,
                racers: updatedRacers,
                status: RaceStatus.FINISHED,
                results,
                raceStats,
              };
            }
          }
          
          return { ...prev, racers: updatedRacers };
        });
        break;

      case 'race_finished':
        setState(prev => {
          const raceStats = calculateRaceStats(data.results, prev.myId, prev.paragraph, prev.paragraphIndex, prev.raceId);
          return {
            ...prev,
            status: RaceStatus.FINISHED,
            results: data.results,
            raceStats,
          };
        });
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
    const racers = [];
    let hostPresent = false;
    let currentHost = null;
    let raceStateFromHost = null;

    Object.values(presenceState).forEach(presences => {
      presences.forEach(presence => {
        racers.push({
          id: presence.odId,
          name: presence.name,
          ready: presence.ready || false,
          progress: presence.progress || 0,
          wpm: presence.wpm || 0,
          accuracy: presence.accuracy || 100,
          finished: presence.finished || false,
          time: presence.time || 0,
          isHost: presence.isHost || false,
        });
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

    setState(prev => {
      // If we just joined and there's race state from host, sync it
      if (raceStateFromHost && !isHostRef.current && prev.status === RaceStatus.WAITING) {
        let newStatus = prev.status;
        if (raceStateFromHost.status === 'racing') newStatus = RaceStatus.RACING;
        else if (raceStateFromHost.status === 'countdown') newStatus = RaceStatus.COUNTDOWN;
        
        return {
          ...prev,
          racers,
          paragraph: raceStateFromHost.paragraph || prev.paragraph,
          paragraphIndex: raceStateFromHost.paragraphIndex || prev.paragraphIndex,
          status: newStatus,
          raceStartTime: raceStateFromHost.raceStartTime || prev.raceStartTime,
        };
      }
      
      // Check if host left - need to elect new host
      if (!hostPresent && racers.length > 0 && prev.status !== RaceStatus.IDLE && prev.status !== RaceStatus.FINISHED) {
        // Elect new host - first by alphabetical ID (deterministic)
        const sortedRacers = [...racers].sort((a, b) => a.id.localeCompare(b.id));
        const newHostId = sortedRacers[0].id;
        
        if (newHostId === prev.myId) {
          // We are the new host - take over
          isHostRef.current = true;
          raceDataRef.current = { 
            racers, 
            paragraph: prev.paragraph, 
            paragraphIndex: prev.paragraphIndex,
            status: prev.status === RaceStatus.RACING ? 'racing' : 'waiting',
            raceStartTime: prev.raceStartTime,
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
                status: prev.status === RaceStatus.RACING ? 'racing' : 'waiting',
                raceStartTime: prev.raceStartTime,
              },
            });
          }
          
          // Check if we need to end the race
          setTimeout(() => checkAllFinished(), 100);
          
          return { ...prev, racers, isHost: true };
        }
      }
      
      return { ...prev, racers };
    });

    if (isHostRef.current && raceDataRef.current) {
      raceDataRef.current.racers = racers;
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
        });
      }, 100);
    }
    handlePresenceSync();
  }, [broadcast, handlePresenceSync]);

  // Create a new race - returns the code immediately
  const createRace = useCallback((paragraph, paragraphIndex) => {
    const raceId = generateRaceCode();
    return { raceId, paragraph, paragraphIndex };
  }, []);

  // Join a race (as host or joiner)
  const joinRace = useCallback(async (raceId, name, paragraph = '', paragraphIndex = 0, asHost = false) => {
    const myId = myIdRef.current;
    isHostRef.current = asHost;

    setState(prev => ({
      ...prev,
      raceId,
      status: RaceStatus.CONNECTING,
      myId,
      isHost: asHost,
      paragraph: asHost ? paragraph : '',
      paragraphIndex: asHost ? paragraphIndex : 0,
      error: null,
      results: [],
      raceStats: null,
    }));

    if (asHost) {
      raceDataRef.current = { paragraph, paragraphIndex, racers: [] };
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
          
          // Track presence
          await channel.track({
            odId: myId,
            name: finalName,
            ready: false,
            progress: 0,
            wpm: 0,
            accuracy: 100,
            finished: false,
            time: 0,
            isHost: asHost,
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
    broadcast('countdown', { endTime: countdownEnd });

    if (raceDataRef.current) {
      raceDataRef.current.status = 'countdown';
    }

    setState(prev => ({
      ...prev,
      status: RaceStatus.COUNTDOWN,
      countdownEnd,
    }));

    setTimeout(() => {
      const startTime = Date.now();
      broadcast('race_start', { startTime });
      
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
          },
        });
      }
      
      setState(prev => ({
        ...prev,
        status: RaceStatus.RACING,
        raceStartTime: startTime,
      }));
    }, 3000);
  }, [broadcast]);

  // Update progress - real-time via broadcast (unlimited!)
  const updateProgress = useCallback((progress, wpm, accuracy) => {
    broadcast('progress', { odId: myIdRef.current, progress, wpm, accuracy });

    // Update presence - include race state if host
    if (channelRef.current) {
      const presenceData = {
        odId: myIdRef.current,
        name: myNameRef.current,
        ready: true,
        progress,
        wpm,
        accuracy,
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
  const finishRace = useCallback((wpm, accuracy, time, wordSpeeds = []) => {
    const myId = myIdRef.current;
    broadcast('finish', { odId: myId, wpm, accuracy, time, wordSpeeds });

    // Update presence to show finished
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
        isHost: isHostRef.current,
      });
    }

    setState(prev => {
      const updatedRacers = prev.racers.map(r =>
        r.id === myId ? { ...r, finished: true, wpm, accuracy, time, wordSpeeds } : r
      );

      // Update host's race data
      if (isHostRef.current && raceDataRef.current) {
        raceDataRef.current.racers = raceDataRef.current.racers.map(r =>
          r.id === myId ? { ...r, finished: true, wpm, accuracy, time, wordSpeeds } : r
        );
      }

      // Check if all finished (host will broadcast results)
      const allFinished = updatedRacers.every(r => r.finished);
      if (allFinished && isHostRef.current) {
        const results = [...updatedRacers]
          .sort((a, b) => b.wpm - a.wpm)
          .map((r, i) => ({ ...r, position: i + 1 }));

        broadcast('race_finished', { results });

        const raceStats = calculateRaceStats(results, myId, prev.paragraph, prev.paragraphIndex, prev.raceId);

        return {
          ...prev,
          racers: updatedRacers,
          myFinished: true,
          status: RaceStatus.FINISHED,
          results,
          raceStats,
        };
      }

      return { ...prev, racers: updatedRacers, myFinished: true };
    });
  }, [broadcast, calculateRaceStats]);

  // Leave race
  const leaveRace = useCallback(async () => {
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

  // Generate shareable results URL
  const generateShareUrl = useCallback(() => {
    if (!state.raceStats) return null;
    
    const { allResults, paragraph } = state.raceStats;
    
    // Compact format: name|wpm|acc|time for each racer, separated by ;
    const resultsStr = allResults.map(r => 
      `${r.name}|${Math.round(r.wpm)}|${Math.round(r.accuracy)}|${Math.round(r.time)}`
    ).join(';');
    
    // Include paragraph length and word count
    const meta = `${paragraph?.length || 0}|${Math.round((paragraph?.length || 0) / 5)}`;
    
    // Combine and encode
    const data = `${meta}::${resultsStr}`;
    const encoded = btoa(encodeURIComponent(data));
    
    return `${window.location.origin}${window.location.pathname}?r=${encoded}`;
  }, [state.raceStats]);

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
    updateProgress,
    finishRace,
    leaveRace,
    clearRaceStats,
    generateShareUrl,
    isInRace: state.status !== RaceStatus.IDLE && state.status !== RaceStatus.FINISHED,
    hasRaceStats: state.raceStats !== null,
    waitingForOthers,
    finishedCount,
    totalCount,
  };
}

// Utility to parse shared results from URL
export function parseSharedResults(encoded) {
  try {
    const data = decodeURIComponent(atob(encoded));
    const [meta, resultsStr] = data.split('::');
    const [charCount, wordCount] = meta.split('|').map(Number);
    
    const results = resultsStr.split(';').map((r, i) => {
      const [name, wpm, accuracy, time] = r.split('|');
      return {
        id: `shared_${i}`,
        name,
        wpm: Number(wpm),
        accuracy: Number(accuracy),
        time: Number(time),
        position: i + 1,
      };
    });
    
    return {
      results,
      charCount,
      wordCount,
      racerCount: results.length,
    };
  } catch (e) {
    console.error('Failed to parse shared results:', e);
    return null;
  }
}
