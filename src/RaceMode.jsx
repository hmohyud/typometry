import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import ReactDOM from 'react-dom';
import { KeyboardHeatmap } from './KeyboardViz';
import { Tooltip } from './Tooltip';

// Editable name component
function EditableName({ name, isYou, onNameChange }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const inputRef = useRef(null);

  // Check if name is a default name (guest followed by number)
  const isDefaultName = /^guest\d+$/i.test(name);

  useEffect(() => {
    setValue(name);
  }, [name]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (trimmed && trimmed !== name) {
      onNameChange(trimmed);
    } else {
      setValue(name);
    }
    setEditing(false);
  };

  const handleKeyDown = (e) => {
    e.stopPropagation(); // Prevent typing from bubbling to main input
    if (e.key === 'Enter') {
      handleSubmit();
    } else if (e.key === 'Escape') {
      setValue(name);
      setEditing(false);
    }
  };

  if (!isYou) {
    return <span className="racer-name-text">{name}</span>;
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        className="name-edit-input"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={handleSubmit}
        onKeyDown={handleKeyDown}
        onKeyUp={(e) => e.stopPropagation()}
        onKeyPress={(e) => e.stopPropagation()}
        maxLength={20}
      />
    );
  }

  return (
    <span 
      className="racer-name-text editable" 
      onClick={() => setEditing(true)}
      title="click to edit"
    >
      {name}
      {isDefaultName && (
        <svg 
          className="edit-name-icon" 
          width="11" 
          height="11" 
          viewBox="0 0 24 24" 
          fill="none" 
          stroke="currentColor" 
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
      )}
    </span>
  );
}

// Race lobby component - shown while waiting for racers
export function RaceLobby({ 
  raceId, 
  racers, 
  spectators = [],
  myId, 
  isHost,
  isSpectator,
  lateJoiner = false,
  realtimeMode,
  winStreak = { current: 0, best: 0 },
  onRealtimeModeChange,
  onReady, 
  onStart, 
  onLeave,
  onNameChange,
  shareUrl,
  joinKey 
}) {
  const [isReady, setIsReady] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showLink, setShowLink] = useState(false);
  const [linkType, setLinkType] = useState('join'); // 'join' or 'spectate'

  const handleReadyToggle = () => {
    if (isSpectator) return; // Spectators can't ready up
    const newReady = !isReady;
    setIsReady(newReady);
    onReady(newReady);
  };

  // Generate URL based on link type
  // Join URL includes the secret key, spectate URL has spectate=1
  const currentUrl = linkType === 'join' && joinKey
    ? `${shareUrl}&join=${joinKey}`
    : `${shareUrl}&spectate=1`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(currentUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const allReady = racers.length >= 2 && racers.every(r => r.ready);
  const canStart = isHost && allReady && !isSpectator;
  const urlRef = useRef(null);

  const handleUrlClick = () => {
    if (!showLink) {
      setShowLink(true);
      // Select after state update
      setTimeout(() => {
        if (urlRef.current) {
          const selection = window.getSelection();
          const range = document.createRange();
          range.selectNodeContents(urlRef.current);
          selection.removeAllRanges();
          selection.addRange(range);
        }
      }, 0);
    } else if (urlRef.current) {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(urlRef.current);
      selection.removeAllRanges();
      selection.addRange(range);
    }
  };

  return (
    <div className="race-lobby">
      {/* Invite bar - with link type selector */}
      <div className="invite-section">
        <div className="invite-type-row">
          <span className="invite-type-label">share link:</span>
          {/* Only show join option if user has joinKey */}
          {joinKey ? (
            <div className="invite-type-toggle">
              <button 
                className={`type-btn ${linkType === 'join' ? 'active' : ''}`}
                onClick={() => setLinkType('join')}
              >
                join race
              </button>
              <button 
                className={`type-btn ${linkType === 'spectate' ? 'active' : ''}`}
                onClick={() => setLinkType('spectate')}
              >
                watch only
              </button>
            </div>
          ) : (
            <div className="invite-type-toggle">
              <button className="type-btn active" disabled>watch only</button>
            </div>
          )}
        </div>
        <div className="invite-bar">
          <div className="invite-url" onClick={handleUrlClick}>
            {showLink ? (
              <code ref={urlRef}>{currentUrl}</code>
            ) : (
              <span className="invite-dots">••••••••••••••••••••••••</span>
            )}
          </div>
          <button 
            onClick={() => setShowLink(!showLink)} 
            className="invite-toggle"
          >
            {showLink ? 'hide' : 'show'}
          </button>
          <button 
            onClick={handleCopy} 
            className={`invite-copy ${copied ? 'copied' : ''}`}
          >
            {copied ? 'copied' : 'copy'}
          </button>
        </div>
      </div>

      {/* Spectator banner */}
      {isSpectator && !lateJoiner && (
        <div className="spectator-banner">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
            <circle cx="12" cy="12" r="3"/>
          </svg>
          spectating
        </div>
      )}
      
      {/* Late joiner banner - watching current race, will join next */}
      {lateJoiner && (
        <div className="late-joiner-banner">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12 6 12 12 16 14"/>
          </svg>
          race in progress — you'll join the next one
        </div>
      )}

      {/* Win streak badge */}
      {winStreak.current > 0 && !isSpectator && (
        <Tooltip text={`Best streak: ${winStreak.best}`}>
          <div className="win-streak-badge">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2c1 3 2.5 3.5 3.5 4.5A5 5 0 0 1 17 10c0 .5-.5 2-1.5 3-1 1-2 1.5-3.5 1.5S9 14 8 13c-1-1-1.5-2.5-1.5-3a5 5 0 0 1 1.5-3.5C9 5.5 11 5 12 2z"/>
              <path d="M12 18v4M8 22h8"/>
            </svg>
            {winStreak.current} streak
          </div>
        </Tooltip>
      )}

      {/* Racers list */}
      <div className="lobby-racers">
        {racers.map((racer) => (
          <div 
            key={racer.id} 
            className={`lobby-racer ${racer.id === myId ? 'you' : ''}`}
          >
            <div className="racer-info">
              <span 
                className={`racer-status ${racer.ready ? 'ready' : ''}`}
                title={racer.ready ? 'ready' : 'not ready'}
              />
              <EditableName 
                name={racer.name} 
                isYou={racer.id === myId}
                onNameChange={onNameChange}
              />
              {racer.id === myId && <span className="you-tag">you</span>}
            </div>
          </div>
        ))}
        {racers.length < 2 && !isSpectator && (
          <div className="lobby-racer empty">
            <div className="racer-info">
              <span className="racer-status" />
              <span className="racer-name-text">waiting...</span>
            </div>
          </div>
        )}
      </div>

      {/* Spectators list */}
      {spectators.length > 0 && (
        <div className="lobby-spectators">
          <span className="spectators-label">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
            {spectators.length} watching
          </span>
        </div>
      )}

      {/* Race Settings (host only) */}
      <div className="lobby-settings">
        <Tooltip text={realtimeMode ? "Timer starts at GO for everyone" : "Timer starts when you begin typing"}>
          <label className={`setting-toggle ${!isHost || isSpectator ? 'disabled' : ''}`}>
            <input
              type="checkbox"
              checked={realtimeMode}
              onChange={(e) => isHost && !isSpectator && onRealtimeModeChange(e.target.checked)}
              disabled={!isHost || isSpectator}
            />
            <span className="toggle-slider" />
            <span className="toggle-label">realtime</span>
          </label>
        </Tooltip>
      </div>

      {/* Actions - fixed layout */}
      <div className="lobby-actions">
        <button onClick={onLeave} className="lobby-btn leave">
          leave
        </button>
        {!isSpectator && (
          <>
            <button 
              onClick={handleReadyToggle}
              className={`lobby-btn ready-toggle ${isReady ? 'is-ready' : ''}`}
            >
              {isReady ? 'not ready' : 'ready'}
            </button>
            <button 
              onClick={canStart ? onStart : undefined}
              className={`lobby-btn start ${!canStart ? 'disabled' : ''}`}
              disabled={!canStart}
            >
              start
            </button>
          </>
        )}
        {isSpectator && (
          <span className="spectator-waiting">waiting for race to start...</span>
        )}
      </div>
    </div>
  );
}

// Countdown overlay
export function RaceCountdown({ endTime }) {
  const [count, setCount] = useState(3);

  useEffect(() => {
    const interval = setInterval(() => {
      const remaining = Math.ceil((endTime - Date.now()) / 1000);
      setCount(Math.max(0, remaining));
    }, 100);

    return () => clearInterval(interval);
  }, [endTime]);

  return (
    <div className="race-countdown-overlay">
      <div className="race-countdown-number">
        {count > 0 ? count : 'GO'}
      </div>
    </div>
  );
}

// Racer colors - consistent across the app
export const RACER_COLORS = [
  { name: 'amber', hex: '#f59e0b' },
  { name: 'violet', hex: '#8b5cf6' },
  { name: 'pink', hex: '#ec4899' },
  { name: 'cyan', hex: '#06b6d4' },
  { name: 'emerald', hex: '#10b981' },
  { name: 'rose', hex: '#f43f5e' },
  { name: 'sky', hex: '#0ea5e9' },
  { name: 'orange', hex: '#f97316' },
];

// Get stable color index for a racer based on all racers in the race
export function getRacerColorIndex(racerId, allRacers) {
  // Sort all racers by ID for stable ordering
  const sortedIds = [...allRacers].map(r => r.id).sort();
  return sortedIds.indexOf(racerId) % RACER_COLORS.length;
}

// Progress bar for a single racer
export function RacerProgress({ racer, isYou, colorIndex = 0 }) {
  const color = RACER_COLORS[colorIndex];
  
  return (
    <div className={`racer-progress ${isYou ? 'you' : ''} ${racer.finished ? 'finished' : ''} ${racer.disconnected ? 'disconnected' : ''}`}>
      <div className="racer-progress-info">
        <span className="racer-progress-name" style={{ color: isYou ? 'var(--text)' : color.hex }}>
          {racer.name}
          {isYou && <span className="you-tag">you</span>}
          {racer.disconnected && <span className="disconnected-tag">offline</span>}
        </span>
        <span className="racer-progress-wpm">
          {racer.wpm > 0 ? `${Math.round(racer.wpm)}` : '–'}
        </span>
      </div>
      <div className="racer-progress-bar">
        <div 
          className="racer-progress-fill"
          style={{ 
            width: `${racer.progress}%`,
            backgroundColor: isYou ? 'var(--accent)' : color.hex,
          }}
        />
      </div>
    </div>
  );
}

// Race progress panel showing all racers
export function RaceProgressPanel({ racers = [], spectators = [], myId, myFinished, isSpectator, lateJoiner = false }) {
  const safeRacers = Array.isArray(racers) ? racers : [];
  
  const sortedRacers = useMemo(() => {
    // Sort: you first, then by stable ID order (not progress, to prevent jitter during typing)
    // Progress-based reordering during a race is distracting
    return [...safeRacers].sort((a, b) => {
      // Always put yourself first
      if (a.id === myId) return -1;
      if (b.id === myId) return 1;
      // Sort by ID for stable ordering (prevents list from jumping around)
      return a.id.localeCompare(b.id);
    });
  }, [safeRacers, myId]);

  const finishedCount = safeRacers.filter(r => r.finished).length;
  const totalCount = safeRacers.length;

  return (
    <div className="race-progress-panel">
      {/* Late joiner banner */}
      {lateJoiner && (
        <div className="late-joiner-watching">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12 6 12 12 16 14"/>
          </svg>
          race in progress — you'll join the next one
        </div>
      )}
      {sortedRacers.map(racer => {
        const colorIndex = getRacerColorIndex(racer.id, racers);
        return (
          <RacerProgress 
            key={racer.id} 
            racer={racer} 
            isYou={racer.id === myId}
            colorIndex={colorIndex}
          />
        );
      })}
      {myFinished && finishedCount < totalCount && !isSpectator && (
        <div className="waiting-for-others">
          waiting for others ({finishedCount}/{totalCount})
        </div>
      )}
      {isSpectator && !lateJoiner && (
        <div className="spectator-watching">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
            <circle cx="12" cy="12" r="3"/>
          </svg>
          watching
        </div>
      )}
      {spectators.length > 0 && !isSpectator && (
        <div className="spectators-indicator">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
            <circle cx="12" cy="12" r="3"/>
          </svg>
          {spectators.length} watching
        </div>
      )}
    </div>
  );
}

// Race results screen with podium
export function RaceResults({ results = [], myId, isHost, onPlayAgain, onLeave, isWaitingForOthers }) {
  const formatTime = (ms) => (ms / 1000).toFixed(1) + 's';
  
  // Ensure results is an array
  const safeResults = Array.isArray(results) ? results : [];
  
  // Split into podium (top 3) and rest
  const podiumRacers = safeResults.slice(0, 3);
  const remainingRacers = safeResults.slice(3);
  
  // Reorder for podium display: 2nd, 1st, 3rd
  const podiumOrder = [];
  if (podiumRacers[1]) podiumOrder.push({ ...podiumRacers[1], place: 2 });
  if (podiumRacers[0]) podiumOrder.push({ ...podiumRacers[0], place: 1 });
  if (podiumRacers[2]) podiumOrder.push({ ...podiumRacers[2], place: 3 });
  
  const getMedal = (place) => {
    if (place === 1) return '🥇';
    if (place === 2) return '🥈';
    if (place === 3) return '🥉';
    return '';
  };
  
  return (
    <div className="race-results">
      {isWaitingForOthers && (
        <div className="results-waiting">
          waiting for others to finish...
        </div>
      )}
      
      {/* Podium Display */}
      <div className="podium-container">
        {podiumOrder.map((racer) => (
          <div 
            key={racer.id} 
            className={`podium-spot place-${racer.place} ${racer.id === myId ? 'you' : ''}`}
          >
            <div className="podium-racer">
              <span className="podium-medal">{getMedal(racer.place)}</span>
              <span className="podium-name">
                {racer.name}
                {racer.id === myId && <span className="you-tag">you</span>}
              </span>
              <span className="podium-wpm">{Math.round(racer.wpm)} wpm</span>
              <span className="podium-time">{formatTime(racer.time)}</span>
            </div>
            <div className="podium-block">
              <span className="podium-place">{racer.place}</span>
            </div>
          </div>
        ))}
      </div>
      
      {/* Remaining racers list */}
      {remainingRacers.length > 0 && (
        <div className="remaining-racers">
          {remainingRacers.map((racer, index) => (
            <div 
              key={racer.id} 
              className={`remaining-racer ${racer.id === myId ? 'you' : ''}`}
            >
              <span className="remaining-place">{index + 4}th</span>
              <span className="remaining-name">
                {racer.name}
                {racer.id === myId && <span className="you-tag">you</span>}
              </span>
              <span className="remaining-wpm">{Math.round(racer.wpm)} wpm</span>
              <span className="remaining-time">{formatTime(racer.time)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="results-actions">
        <button onClick={onLeave} className="result-btn">
          leave
        </button>
        {!isWaitingForOthers && isHost && (
          <button onClick={onPlayAgain} className="result-btn primary">
            next round
          </button>
        )}
        {!isWaitingForOthers && !isHost && (
          <span className="waiting-for-host">waiting for host...</span>
        )}
      </div>
    </div>
  );
}

// Word Speed Map - shows per-word speeds for each racer
function WordSpeedMap({ results, paragraph, myId }) {
  if (!results || results.length === 0 || !paragraph) return null;
  
  // Check if any racer has wordSpeeds data
  const hasWordSpeeds = results.some(r => r.wordSpeeds && r.wordSpeeds.length > 0);
  if (!hasWordSpeeds) return null;
  
  // Extract words from paragraph
  const words = paragraph.split(/\s+/).filter(w => w.length > 0);
  if (words.length === 0) return null;
  
  // Get all word speeds and calculate percentile-based normalization
  const allSpeeds = results.flatMap(r => r.wordSpeeds || []).filter(s => s > 0);
  if (allSpeeds.length === 0) return null;
  
  // Use percentiles to avoid outliers skewing the color scale
  const sortedSpeeds = [...allSpeeds].sort((a, b) => a - b);
  const p10Index = Math.floor(sortedSpeeds.length * 0.1);
  const p90Index = Math.floor(sortedSpeeds.length * 0.9);
  const minSpeed = sortedSpeeds[p10Index] || sortedSpeeds[0];
  const maxSpeed = sortedSpeeds[p90Index] || sortedSpeeds[sortedSpeeds.length - 1];
  const speedRange = maxSpeed - minSpeed || 1;
  
  // Calculate average speed per word position
  const avgSpeedsPerWord = words.map((_, wordIndex) => {
    const speedsAtPosition = results
      .map(r => r.wordSpeeds?.[wordIndex])
      .filter(s => s !== undefined && s > 0);
    if (speedsAtPosition.length === 0) return null;
    return Math.round(speedsAtPosition.reduce((a, b) => a + b, 0) / speedsAtPosition.length);
  });
  
  // Color function: red (slow) -> yellow -> green (fast), clamped to percentile range
  const getSpeedColor = (speed, opacity = 1) => {
    if (!speed || speed <= 0) return `rgba(100, 100, 100, ${opacity * 0.3})`;
    // Clamp to percentile range
    const clampedSpeed = Math.max(minSpeed, Math.min(maxSpeed, speed));
    const normalized = (clampedSpeed - minSpeed) / speedRange;
    // HSL: 0 = red, 60 = yellow, 120 = green
    const hue = normalized * 120;
    return `hsla(${hue}, 70%, 45%, ${opacity})`;
  };
  
  return (
    <div className="word-speed-map">
      <div className="speed-map-header">
        <span className="speed-map-title">word speeds</span>
        <div className="speed-map-legend">
          <span className="legend-slow">slow</span>
          <div className="legend-gradient" />
          <span className="legend-fast">fast</span>
        </div>
      </div>
      
      {/* Average row */}
      <div className="speed-map-row avg-row">
        <span className="speed-map-label">avg</span>
        <div className="speed-map-words">
          {words.map((word, i) => (
            <span 
              key={i} 
              className="speed-word"
              style={{ 
                backgroundColor: getSpeedColor(avgSpeedsPerWord[i], 0.7),
              }}
              title={avgSpeedsPerWord[i] ? `${avgSpeedsPerWord[i]} wpm` : 'no data'}
            >
              {word}
            </span>
          ))}
        </div>
      </div>
      
      {/* Individual racer rows */}
      {results.map(racer => {
        const speeds = racer.wordSpeeds || [];
        if (speeds.length === 0) return null;
        
        const colorIndex = getRacerColorIndex(racer.id, results);
        const color = RACER_COLORS[colorIndex];
        const isYou = racer.id === myId;
        
        return (
          <div 
            key={racer.id} 
            className={`speed-map-row ${isYou ? 'you' : ''}`}
          >
            <span className="speed-map-label" style={{ color: isYou ? 'var(--accent)' : color.hex }}>
              {racer.name}
              {isYou && <span className="you-tag">you</span>}
            </span>
            <div className="speed-map-words">
              {words.map((word, i) => (
                <span 
                  key={i} 
                  className="speed-word"
                  style={{ 
                    backgroundColor: getSpeedColor(speeds[i], 0.7),
                  }}
                  title={speeds[i] ? `${speeds[i]} wpm` : 'no data'}
                >
                  {word}
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Speed Over Time Chart - shows how speed varied throughout the race
function SpeedOverTimeChart({ results, myId }) {
  if (!results || results.length === 0) return null;
  
  // Check if any racer has wordSpeeds data
  const hasWordSpeeds = results.some(r => r.wordSpeeds && r.wordSpeeds.length > 0);
  if (!hasWordSpeeds) return null;
  
  const maxWords = Math.max(...results.map(r => r.wordSpeeds?.length || 0));
  if (maxWords < 3) return null; // Need at least 3 data points
  
  // Get all speeds to calculate y-axis range
  const allSpeeds = results.flatMap(r => r.wordSpeeds || []).filter(s => s > 0);
  if (allSpeeds.length === 0) return null;
  
  const minSpeed = Math.floor(Math.min(...allSpeeds) * 0.85);
  const maxSpeed = Math.ceil(Math.max(...allSpeeds) * 1.1);
  const speedRange = maxSpeed - minSpeed || 1;
  
  // Create data for each racer
  const racerData = results.map(racer => {
    const speeds = racer.wordSpeeds || [];
    if (speeds.length < 2) return null;
    
    const colorIndex = getRacerColorIndex(racer.id, results);
    const hexColor = racer.id === myId ? '#6ecf6e' : RACER_COLORS[colorIndex].hex;
    const isYou = racer.id === myId;
    
    return {
      id: racer.id,
      name: racer.name,
      hexColor,
      isYou,
      speeds,
    };
  }).filter(Boolean);
  
  if (racerData.length === 0) return null;
  
  return (
    <div className="speed-chart">
      <div className="speed-chart-header">
        <span className="speed-chart-title">speed over time</span>
      </div>
      
      <div className="speed-chart-legend">
        {racerData.map(({ id, name, hexColor, isYou }) => (
          <div key={id} className="speed-legend-item">
            <span className="speed-legend-dot" style={{ backgroundColor: hexColor }} />
            <span className="speed-legend-name">{name}{isYou ? ' (you)' : ''}</span>
          </div>
        ))}
      </div>
      
      <div className="speed-chart-container">
        <div className="speed-chart-y-axis">
          <span>{maxSpeed}</span>
          <span>{Math.round((maxSpeed + minSpeed) / 2)}</span>
          <span>{minSpeed}</span>
        </div>
        <div className="speed-chart-graph">
          <svg 
            viewBox="0 0 100 50" 
            preserveAspectRatio="none"
            className="speed-chart-svg"
          >
            {/* Grid lines */}
            <line x1="0" y1="0" x2="100" y2="0" stroke="currentColor" strokeWidth="0.3" opacity="0.2" vectorEffect="non-scaling-stroke" />
            <line x1="0" y1="25" x2="100" y2="25" stroke="currentColor" strokeWidth="0.3" opacity="0.15" strokeDasharray="2,2" vectorEffect="non-scaling-stroke" />
            <line x1="0" y1="50" x2="100" y2="50" stroke="currentColor" strokeWidth="0.3" opacity="0.2" vectorEffect="non-scaling-stroke" />
            
            {/* Lines - render "you" last so it's on top */}
            {racerData
              .sort((a, b) => (a.isYou ? 1 : 0) - (b.isYou ? 1 : 0))
              .map(({ id, hexColor, speeds, isYou }) => {
                const points = speeds.map((speed, i) => {
                  const x = (i / (speeds.length - 1)) * 100;
                  const y = 50 - ((speed - minSpeed) / speedRange) * 50;
                  return `${x},${y}`;
                }).join(' ');
                
                return (
                  <polyline 
                    key={id}
                    points={points}
                    fill="none"
                    stroke={hexColor}
                    strokeWidth={isYou ? 2 : 1.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity={isYou ? 1 : 0.7}
                    vectorEffect="non-scaling-stroke"
                  />
                );
              })}
          </svg>
        </div>
      </div>
      <div className="speed-chart-x-label">words →</div>
    </div>
  );
}

// Race Keyboards - shows keyboard heatmaps for each racer
function RaceKeyboards({ results, myId }) {
  if (!results || results.length === 0) return null;
  
  // Check if any racer has keystrokeData
  const hasKeystrokeData = results.some(r => r.keystrokeData && r.keystrokeData.length > 0);
  if (!hasKeystrokeData) return null;
  
  // Convert keystrokeData to keyStats format for KeyboardHeatmap
  const convertToKeyStats = (keystrokeData) => {
    if (!keystrokeData || keystrokeData.length === 0) return null;
    
    const keyStats = {};
    keystrokeData.forEach(k => {
      // Normalize key to lowercase, skip backspace and modifier keys
      const rawKey = k.key;
      if (!rawKey) return;
      const key = rawKey.toLowerCase();
      if (key === 'backspace' || key === 'shift' || key === 'control' || key === 'alt' || key === 'meta') return;
      
      if (!keyStats[key]) {
        keyStats[key] = { times: [], count: 0, correct: 0, errors: 0 };
      }
      
      if (k.time && k.time > 0) {
        keyStats[key].times.push(k.time);
      }
      keyStats[key].count++;
      
      // Handle both boolean and string representations of correct
      const isCorrect = k.correct === true || k.correct === 'true';
      if (isCorrect) {
        keyStats[key].correct++;
      } else {
        keyStats[key].errors++;
      }
    });
    
    // Compute avgInterval and accuracy for each key
    Object.keys(keyStats).forEach(key => {
      const times = keyStats[key].times;
      keyStats[key].avgInterval = times.length > 0 
        ? times.reduce((a, b) => a + b, 0) / times.length 
        : 0;
      keyStats[key].accuracy = keyStats[key].count > 0 
        ? keyStats[key].correct / keyStats[key].count 
        : 1;
    });
    
    return keyStats;
  };
  
  return (
    <div className="race-keyboards">
      <div className="race-keyboards-header">
        <span className="race-keyboards-title">keyboard heatmaps</span>
      </div>
      <div className="race-keyboards-grid">
        {results.map(racer => {
          const keyStats = convertToKeyStats(racer.keystrokeData);
          if (!keyStats) return null;
          
          const colorIndex = getRacerColorIndex(racer.id, results);
          const color = RACER_COLORS[colorIndex];
          const isYou = racer.id === myId;
          
          return (
            <div key={racer.id} className={`race-keyboard ${isYou ? 'you' : ''}`}>
              <div className="race-keyboard-header" style={{ color: isYou ? 'var(--accent)' : color.hex }}>
                {racer.name}{isYou && ' (you)'}
              </div>
              <KeyboardHeatmap keyStats={keyStats} mode="speed" />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Race Stats Panel - for the Race tab in stats view
export function RaceStatsPanel({ raceStats, fmt, isHost, isWaitingForOthers, onPlayAgain, onLeave }) {
  if (!raceStats) {
    return (
      <div className="race-stats-empty">
        <p>no race data yet</p>
      </div>
    );
  }

  const { 
    myResult, 
    allResults, 
    avgWpm, 
    avgAccuracy, 
    fastestWpm, 
    slowestWpm,
    wpmSpread,
    bestAccuracy,
    worstAccuracy,
    avgTime,
    fastestTime,
    slowestTime,
    racerCount,
    finishedCount,
    isComplete,
    myWpmVsAvg,
    paragraph,
  } = raceStats;

  const formatTime = (ms) => {
    const seconds = ms / 1000;
    if (seconds < 60) return `${seconds.toFixed(1)}s`;
    const mins = Math.floor(seconds / 60);
    const secs = (seconds % 60).toFixed(1);
    return `${mins}m ${secs}s`;
  };

  const getMedal = (place) => {
    if (place === 1) return '🥇';
    if (place === 2) return '🥈';
    if (place === 3) return '🥉';
    return '';
  };

  // Calculate interesting derived stats
  const winner = allResults[0];
  const runnerUp = allResults[1];
  const marginOfVictory = runnerUp ? winner.wpm - runnerUp.wpm : 0;
  const marginTime = runnerUp ? runnerUp.time - winner.time : 0;
  const myPercentile = myResult ? Math.round((1 - (myResult.position - 1) / (finishedCount || racerCount)) * 100) : 0;
  const wpmPerChar = myResult ? (myResult.wpm / 60 * 5) : 0; // chars per second approximation
  
  // Head to head (for 2 player races)
  const isHeadToHead = racerCount === 2;
  const opponent = isHeadToHead ? allResults.find(r => r.id !== myResult?.id) : null;
  
  // Waiting for others indicator
  const stillWaiting = finishedCount && racerCount && finishedCount < racerCount;

  return (
    <div className="pvp-stats">
      {/* Mini Podium at top */}
      <div className="pvp-mini-podium">
        {allResults.slice(0, 3).map((racer, idx) => {
          const isYou = racer.id === myResult?.id;
          const colorIndex = getRacerColorIndex(racer.id, allResults);
          const color = RACER_COLORS[colorIndex];
          return (
            <div key={racer.id} className={`mini-podium-entry ${isYou ? 'you' : ''}`}>
              <span className="mini-medal">{getMedal(idx + 1)}</span>
              <span className="mini-name" style={{ color: isYou ? 'var(--text)' : color.hex }}>
                {racer.name}
                {isYou && <span className="you-tag">you</span>}
              </span>
              <span className="mini-wpm">{Math.round(racer.wpm)} wpm</span>
              <span className="mini-time">{formatTime(racer.time)}</span>
            </div>
          );
        })}
        
        {/* Actions */}
        <div className="mini-podium-actions">
          {onLeave && (
            <button onClick={onLeave} className="mini-action-btn leave">
              leave
            </button>
          )}
          {isWaitingForOthers && (
            <span className="mini-waiting">waiting for others...</span>
          )}
          {!isWaitingForOthers && isHost && onPlayAgain && (
            <button onClick={onPlayAgain} className="mini-action-btn next">
              next round
            </button>
          )}
          {!isWaitingForOthers && !isHost && (
            <span className="mini-waiting">waiting for host...</span>
          )}
        </div>
      </div>

      {/* Header */}
      <div className="pvp-header">
        {stillWaiting && (
          <span className="waiting-indicator">
            waiting for {racerCount - finishedCount} more...
          </span>
        )}
      </div>

      {/* Your Result - Hero Section */}
      {myResult && (
        <div className="pvp-hero">
          <Tooltip text="Your finishing position">
            <div className="pvp-position">
              <span className="position-num">{myResult.position}</span>
              <span className="position-suffix">
                {myResult.position === 1 ? 'st' : myResult.position === 2 ? 'nd' : myResult.position === 3 ? 'rd' : 'th'}
              </span>
              {stillWaiting && <span className="provisional">(provisional)</span>}
            </div>
          </Tooltip>
          <div className="pvp-main-stats">
            <Tooltip text="Words per minute - your typing speed">
              <div className="main-stat">
                <span className="stat-value">{fmt.int(myResult.wpm)}</span>
                <span className="stat-label">wpm</span>
              </div>
            </Tooltip>
            <Tooltip text="Percentage of characters typed correctly">
              <div className="main-stat">
                <span className="stat-value">{fmt.dec(myResult.accuracy, 1)}</span>
                <span className="stat-label">accuracy</span>
              </div>
            </Tooltip>
            <Tooltip text="Time taken to complete the paragraph">
              <div className="main-stat">
                <span className="stat-value">{formatTime(myResult.time)}</span>
                <span className="stat-label">time</span>
              </div>
            </Tooltip>
          </div>
        </div>
      )}

      {/* Head to Head (2 players) */}
      {isHeadToHead && myResult && opponent && (
        <div className="pvp-h2h">
          <div className="h2h-row">
            <span className="h2h-you">{fmt.int(myResult.wpm)}</span>
            <Tooltip text="Words per minute comparison">
              <span className="h2h-label">wpm</span>
            </Tooltip>
            <span className="h2h-them">{fmt.int(opponent.wpm)}</span>
          </div>
          <div className="h2h-bar">
            <div 
              className="h2h-fill you" 
              style={{ width: `${(myResult.wpm / (myResult.wpm + opponent.wpm)) * 100}%` }}
            />
          </div>
          <div className="h2h-row">
            <span className="h2h-you">{fmt.dec(myResult.accuracy, 1)}%</span>
            <Tooltip text="Accuracy percentage comparison">
              <span className="h2h-label">accuracy</span>
            </Tooltip>
            <span className="h2h-them">{fmt.dec(opponent.accuracy, 1)}%</span>
          </div>
          <div className="h2h-bar">
            <div 
              className="h2h-fill you" 
              style={{ width: `${(myResult.accuracy / (myResult.accuracy + opponent.accuracy)) * 100}%` }}
            />
          </div>
          <div className="h2h-row">
            <span className="h2h-you">{formatTime(myResult.time)}</span>
            <Tooltip text="Time to complete (less is better)">
              <span className="h2h-label">time</span>
            </Tooltip>
            <span className="h2h-them">{formatTime(opponent.time)}</span>
          </div>
          <div className="h2h-bar">
            <div 
              className="h2h-fill you" 
              style={{ width: `${(opponent.time / (myResult.time + opponent.time)) * 100}%` }}
            />
          </div>
          <div className="h2h-names">
            <span>you</span>
            <span>{opponent.name}</span>
          </div>
        </div>
      )}

      {/* Performance Context (3+ players) */}
      {!isHeadToHead && myResult && (
        <div className="pvp-context">
          <div className="context-item">
            <div className="context-bar">
              <div 
                className="context-fill"
                style={{ width: `${myPercentile}%` }}
              />
              <span className="context-marker" style={{ left: `${myPercentile}%` }}>▼</span>
            </div>
            <div className="context-labels">
              <span>bottom</span>
              <span className="context-value">{myPercentile}th percentile</span>
              <span>top</span>
            </div>
          </div>
          <div className="context-diff">
            <span className={myWpmVsAvg >= 0 ? 'positive' : 'negative'}>
              {myWpmVsAvg >= 0 ? '+' : ''}{fmt.dec(myWpmVsAvg, 1)} wpm vs field
            </span>
          </div>
        </div>
      )}

      {/* Race Insights */}
      <div className="pvp-insights">
        {marginOfVictory > 0 && (
          <Tooltip text="Speed difference between 1st and 2nd place">
            <div className="insight">
              <span className="insight-value">{fmt.dec(marginOfVictory, 1)}</span>
              <span className="insight-label">wpm margin</span>
            </div>
          </Tooltip>
        )}
        {marginTime > 0 && (
          <Tooltip text="Time difference between 1st and 2nd place">
            <div className="insight">
              <span className="insight-value">{(marginTime / 1000).toFixed(1)}s</span>
              <span className="insight-label">time gap</span>
            </div>
          </Tooltip>
        )}
        <Tooltip text="Difference between fastest and slowest racer">
          <div className="insight">
            <span className="insight-value">{fmt.int(wpmSpread)}</span>
            <span className="insight-label">wpm spread</span>
          </div>
        </Tooltip>
        <Tooltip text="Average speed of all racers">
          <div className="insight">
            <span className="insight-value">{fmt.dec(avgWpm, 0)}</span>
            <span className="insight-label">field avg</span>
          </div>
        </Tooltip>
        <Tooltip text="Average accuracy of all racers">
          <div className="insight">
            <span className="insight-value">{fmt.dec(avgAccuracy, 1)}%</span>
            <span className="insight-label">avg accuracy</span>
          </div>
        </Tooltip>
        <Tooltip text="Average completion time for all racers">
          <div className="insight">
            <span className="insight-value">{formatTime(avgTime)}</span>
            <span className="insight-label">avg time</span>
          </div>
        </Tooltip>
        {paragraph && myResult && (
          <Tooltip text="Your typing speed in characters per second">
            <div className="insight">
              <span className="insight-value">{(paragraph.length / (myResult.time / 1000)).toFixed(1)}</span>
              <span className="insight-label">chars/sec</span>
            </div>
          </Tooltip>
        )}
        {paragraph && (
          <Tooltip text="Total words in paragraph (5 chars = 1 word)">
            <div className="insight">
              <span className="insight-value">{Math.round(paragraph.length / 5)}</span>
              <span className="insight-label">words</span>
            </div>
          </Tooltip>
        )}
      </div>

      {/* Standings */}
      <div className="pvp-standings">
        {allResults.map((racer, index) => {
          // Bar width relative to fastest racer (100% for winner)
          const barWidth = fastestWpm > 0 
            ? (racer.wpm / fastestWpm) * 100 
            : 100;
          const colorIndex = getRacerColorIndex(racer.id, allResults);
          const color = RACER_COLORS[colorIndex];
          const isYou = racer.id === myResult?.id;
          
          return (
            <Tooltip key={racer.id} text={`${fmt.int(racer.wpm)} WPM · ${fmt.dec(racer.accuracy, 1)}% accuracy · ${formatTime(racer.time)}`}>
              <div className={`standing ${isYou ? 'you' : ''}`}>
                <span className="standing-pos" style={{ color: isYou ? 'var(--accent)' : color.hex }}>{index + 1}</span>
                <div className="standing-info">
                  <span className="standing-name" style={{ color: isYou ? 'var(--text)' : color.hex }}>
                    {racer.name}
                    {isYou && <span className="you-tag">you</span>}
                  </span>
                  <div className="standing-bar">
                    <div 
                      className="standing-fill" 
                      style={{ 
                        width: `${barWidth}%`,
                        backgroundColor: isYou ? 'var(--accent)' : color.hex,
                      }} 
                    />
                  </div>
                </div>
                <span className="standing-wpm" style={{ color: isYou ? 'var(--accent)' : color.hex }}>{fmt.int(racer.wpm)}</span>
              </div>
            </Tooltip>
          );
        })}
      </div>

      {/* Speed Over Time Chart */}
      <SpeedOverTimeChart results={allResults} myId={myResult?.id} />

      {/* Word Speed Map */}
      <WordSpeedMap results={allResults} paragraph={paragraph} myId={myResult?.id} />

      {/* Keyboard Visualization */}
      <RaceKeyboards results={allResults} myId={myResult?.id} />

      {/* Text Info */}
      <div className="pvp-text-info">
        <span>{paragraph?.length || 0} chars</span>
        <span>·</span>
        <span>{Math.round((paragraph?.length || 0) / 5)} words</span>
      </div>
    </div>
  );
}

export function LobbyPresenceIndicator({ racers, spectators = [], myId, isHost, raceStatus }) {
  const [expanded, setExpanded] = useState(false);
  
  if (!racers || racers.length === 0) return null;
  
  const onlineRacers = racers.filter(r => !r.disconnected);
  const disconnectedRacers = racers.filter(r => r.disconnected);
  const totalOnline = onlineRacers.length + spectators.length;
  
  const getStatusIcon = (racer) => {
    if (racer.disconnected) return '⚫'; // offline
    if (racer.finished) return '✓';
    if (racer.ready) return '●'; // ready
    return '○'; // not ready
  };
  
  const getStatusColor = (racer) => {
    if (racer.disconnected) return '#6b7280'; // gray
    if (racer.finished) return '#10b981'; // green
    if (racer.ready) return '#6ecf6e'; // accent green
    return '#f59e0b'; // amber - not ready
  };

  return (
    <div className={`lobby-presence ${expanded ? 'expanded' : ''}`}>
      <button 
        className="presence-toggle"
        onClick={() => setExpanded(!expanded)}
        title="Show lobby members"
      >
        <span className="presence-count">{totalOnline}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
          <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
      </button>
      
      {expanded && (
        <div className="presence-dropdown">
          <div className="presence-header">
            <span>in lobby</span>
            {isHost && <span className="host-badge">host</span>}
          </div>
          
          <div className="presence-list">
            {onlineRacers.map(racer => (
              <div key={racer.id} className="presence-item">
                <span 
                  className="presence-status"
                  style={{ color: getStatusColor(racer) }}
                >
                  {getStatusIcon(racer)}
                </span>
                <span className="presence-name">
                  {racer.name}
                  {racer.id === myId && <span className="you-indicator">(you)</span>}
                </span>
                {racer.isHost && <span className="host-indicator">★</span>}
              </div>
            ))}
            
            {disconnectedRacers.length > 0 && (
              <>
                <div className="presence-divider">offline</div>
                {disconnectedRacers.map(racer => (
                  <div key={racer.id} className="presence-item disconnected">
                    <span className="presence-status" style={{ color: '#6b7280' }}>⚫</span>
                    <span className="presence-name">{racer.name}</span>
                  </div>
                ))}
              </>
            )}
            
            {spectators.length > 0 && (
              <>
                <div className="presence-divider">watching</div>
                {spectators.map(spec => (
                  <div key={spec.id} className="presence-item spectator">
                    <span className="presence-status">👁</span>
                    <span className="presence-name">
                      {spec.name}
                      {spec.id === myId && <span className="you-indicator">(you)</span>}
                    </span>
                  </div>
                ))}
              </>
            )}
          </div>
          
          <div className="presence-legend">
            <span><span style={{color: '#6ecf6e'}}>●</span> ready</span>
            <span><span style={{color: '#f59e0b'}}>○</span> not ready</span>
            <span><span style={{color: '#10b981'}}>✓</span> finished</span>
          </div>
        </div>
      )}
    </div>
  );
}

// Player Stats Modal - shows when clicking another player's name
export function PlayerStatsModal({ playerStats, onClose }) {
  if (!playerStats?.stats) return null;
  
  const { stats } = playerStats;
  
  return (
    <div className="player-stats-modal-overlay" onClick={onClose}>
      <div className="player-stats-modal" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>×</button>
        <h3>Player Stats</h3>
        <div className="player-stats-grid">
          <div className="stat-item">
            <span className="stat-value">{stats.wpm || '-'}</span>
            <span className="stat-label">avg WPM</span>
          </div>
          <div className="stat-item">
            <span className="stat-value">{stats.accuracy || '-'}%</span>
            <span className="stat-label">accuracy</span>
          </div>
          <div className="stat-item">
            <span className="stat-value">{stats.sessions || 0}</span>
            <span className="stat-label">sessions</span>
          </div>
          <div className="stat-item">
            <span className="stat-value">{stats.behavioral?.maxBurst || '-'}</span>
            <span className="stat-label">best burst</span>
          </div>
          <div className="stat-item">
            <span className="stat-value">{stats.consistency || '-'}%</span>
            <span className="stat-label">consistency</span>
          </div>
          <div className="stat-item">
            <span className="stat-value">{stats.avgInterval || '-'}ms</span>
            <span className="stat-label">keystroke</span>
          </div>
        </div>
      </div>
    </div>
  );
}


// Non-blocking Lobby Panel - collapsible sidebar
const MAX_RACERS = 8;

export function LobbyPanel({ 
  raceId, 
  racers = [], 
  spectators = [],
  myId, 
  isHost,
  isSpectator,
  lateJoiner = false,
  raceStatus,
  realtimeMode,
  strictMode = false,
  lobbyName = '',
  hostDisconnectedAt,
  pendingHostId,
  hostTransferSeconds,
  originalHostId,
  viewingPlayerStats,
  statsRequestPending,
  onRealtimeModeChange,
  onStrictModeChange,
  onLobbyNameChange,
  onReady, 
  onStart, 
  onLeave,
  onNameChange,
  onRequestStats,
  onClearViewingStats,
  onTransferHost,
  onRematch,
  shareUrl,
  joinKey 
}) {
  // Safety check for racers
  const safeRacers = Array.isArray(racers) ? racers : [];
  
  const [expanded, setExpanded] = useState(true);
  const [isReady, setIsReady] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showLink, setShowLink] = useState(false);
  const [linkType, setLinkType] = useState('join');
  const [editingLobbyName, setEditingLobbyName] = useState(false);
  const [lobbyNameValue, setLobbyNameValue] = useState(lobbyName);
  
  // Hold state for transfer
  const [transferHoldProgress, setTransferHoldProgress] = useState({});
  const transferTimerRef = useRef(null);
  
  // Double-click leave confirmation
  const [leaveConfirm, setLeaveConfirm] = useState(false);
  const leaveConfirmTimerRef = useRef(null);
  
  // Tooltip state
  const [tooltipText, setTooltipText] = useState('');
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  
  const urlRef = useRef(null);
  const lobbyNameInputRef = useRef(null);

  // Sync ready state
  useEffect(() => {
    const myRacer = safeRacers.find(r => r.id === myId);
    if (myRacer) setIsReady(myRacer.ready);
  }, [safeRacers, myId]);

  // Sync lobby name
  useEffect(() => {
    setLobbyNameValue(lobbyName);
  }, [lobbyName]);

  // Focus lobby name input
  useEffect(() => {
    if (editingLobbyName && lobbyNameInputRef.current) {
      lobbyNameInputRef.current.focus();
      lobbyNameInputRef.current.select();
    }
  }, [editingLobbyName]);

  // Cleanup timers
  useEffect(() => {
    return () => {
      if (transferTimerRef.current) clearInterval(transferTimerRef.current);
      if (leaveConfirmTimerRef.current) clearTimeout(leaveConfirmTimerRef.current);
    };
  }, []);

  // Tooltip handlers
  const [tooltipGetter, setTooltipGetter] = useState(null);
  
  const showTooltip = (text) => (e) => {
    setTooltipText(text);
    setTooltipGetter(null);
    setTooltipPos({ x: e.clientX, y: e.clientY });
  };
  
  // Dynamic tooltip that recalculates text on each render
  const showDynamicTooltip = (getter) => (e) => {
    setTooltipText(getter());
    setTooltipGetter(() => getter);
    setTooltipPos({ x: e.clientX, y: e.clientY });
  };
  
  const moveTooltip = (e) => {
    if (tooltipText || tooltipGetter) {
      setTooltipPos({ x: e.clientX, y: e.clientY });
      // Update dynamic tooltip text
      if (tooltipGetter) {
        setTooltipText(tooltipGetter());
      }
    }
  };
  
  const hideTooltip = () => {
    setTooltipText('');
    setTooltipGetter(null);
  };

  // URL handling - shareUrl already contains ?race=xxx, so we append parameters
  // If user doesn't have joinKey (spectator), always use watch link
  const currentUrl = (linkType === 'watch' || !joinKey)
    ? `${shareUrl}&spectate=1`
    : `${shareUrl}&join=${joinKey}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(currentUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Copy failed:', err);
    }
  };

  const handleReadyToggle = () => {
    const newReady = !isReady;
    setIsReady(newReady);
    onReady(newReady);
  };

  const handleLobbyNameSubmit = () => {
    const trimmed = lobbyNameValue.trim();
    if (trimmed !== lobbyName && onLobbyNameChange) {
      onLobbyNameChange(trimmed);
    }
    setEditingLobbyName(false);
  };

  const handleLobbyNameKeyDown = (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') handleLobbyNameSubmit();
    else if (e.key === 'Escape') {
      setLobbyNameValue(lobbyName);
      setEditingLobbyName(false);
    }
  };

  // Transfer host hold (1.2s)
  const startTransferHold = (targetId) => (e) => {
    e.stopPropagation();
    const startTime = Date.now();
    setTransferHoldProgress({ [targetId]: 0 });
    
    transferTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(100, (elapsed / 1200) * 100);
      setTransferHoldProgress({ [targetId]: progress });
      
      if (elapsed >= 1200) {
        clearInterval(transferTimerRef.current);
        transferTimerRef.current = null;
        setTransferHoldProgress({});
        onTransferHost(targetId);
      }
    }, 16);
  };

  const cancelTransferHold = () => {
    if (transferTimerRef.current) {
      clearInterval(transferTimerRef.current);
      transferTimerRef.current = null;
    }
    setTransferHoldProgress({});
  };

  // Double-click to leave
  const handleLeaveClick = () => {
    if (leaveConfirm) {
      // Second click - leave
      if (leaveConfirmTimerRef.current) clearTimeout(leaveConfirmTimerRef.current);
      setLeaveConfirm(false);
      onLeave();
    } else {
      // First click - ask confirmation
      setLeaveConfirm(true);
      leaveConfirmTimerRef.current = setTimeout(() => {
        setLeaveConfirm(false);
      }, 3000);
    }
  };

  // Derived state
  const allReady = safeRacers.length >= 2 && safeRacers.every(r => r.ready);
  const showStartButton = isHost && !isSpectator && raceStatus === 'waiting';
  const canStart = showStartButton && allReady;
  const canRematch = isHost && raceStatus === 'finished';
  const activeRacerCount = safeRacers.filter(r => !r.disconnected).length;

  const getStatusIndicator = (racer) => {
    if (racer.finished) return { symbol: '✓', cls: 'finished', tip: 'Finished' };
    if (racer.ready) return { symbol: '●', cls: 'ready', tip: 'Ready' };
    return { symbol: '○', cls: '', tip: 'Not ready' };
  };

  // Collapsed view
  if (!expanded) {
    return (
      <div className="lobby-panel collapsed">
        <button className="lobby-panel-toggle" onClick={() => setExpanded(true)}>
          <div className="collapsed-racers">
            {safeRacers.slice(0, 5).map((racer) => {
              const status = getStatusIndicator(racer);
              const isYou = racer.id === myId;
              return (
                <div key={racer.id} className={`collapsed-racer ${isYou ? 'you' : ''} ${racer.disconnected ? 'disconnected' : ''}`}>
                  <span className={`collapsed-status ${status.cls}`}>{status.symbol}</span>
                  <span className="collapsed-name">{racer.name}</span>
                  {racer.isHost && <span className="collapsed-host">★</span>}
                </div>
              );
            })}
            {safeRacers.length > 5 && <div className="collapsed-more">+{safeRacers.length - 5}</div>}
          </div>
          <svg className="expand-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18l-6-6 6-6"/>
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div className="lobby-panel expanded">
      {/* Header */}
      <div className="lobby-panel-header">
        {isHost && raceStatus === 'waiting' ? (
          editingLobbyName ? (
            <input
              ref={lobbyNameInputRef}
              type="text"
              className="lobby-name-input"
              value={lobbyNameValue}
              onChange={(e) => setLobbyNameValue(e.target.value)}
              onBlur={handleLobbyNameSubmit}
              onKeyDown={handleLobbyNameKeyDown}
              onKeyUp={(e) => e.stopPropagation()}
              placeholder="lobby name..."
              maxLength={30}
            />
          ) : (
            <span 
              className="lobby-name-editable" 
              onClick={() => setEditingLobbyName(true)}
              onMouseEnter={showTooltip('Click to rename')}
              onMouseMove={moveTooltip}
              onMouseLeave={hideTooltip}
            >
              {lobbyName || 'lobby'}
              <svg className="edit-icon" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </span>
          )
        ) : (
          <span className="lobby-title">{lobbyName || 'lobby'}</span>
        )}
        <button 
          className="lobby-panel-collapse" 
          onClick={() => setExpanded(false)}
          onMouseEnter={showTooltip('Collapse')}
          onMouseMove={moveTooltip}
          onMouseLeave={hideTooltip}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 18l6-6-6-6"/>
          </svg>
        </button>
      </div>

      {/* Host Transfer Warning */}
      {hostDisconnectedAt && (
        <div className="host-transfer-warning">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12 6 12 12 16 14"/>
          </svg>
          <div className="host-transfer-info">
            <span className="host-transfer-text">host disconnected</span>
            <span className="host-transfer-countdown">{hostTransferSeconds}s</span>
          </div>
        </div>
      )}

      {/* Share Link */}
      <div className="lobby-share-section">
        <div className="share-label">share {joinKey ? linkType : 'watch'} link:</div>
        {/* Only show link type toggle if user has joinKey (can share join links) */}
        {joinKey ? (
          <div className="link-type-toggle">
            <button 
              className={linkType === 'join' ? 'active' : ''} 
              onClick={() => setLinkType('join')}
              onMouseEnter={showTooltip('Recipients can race')}
              onMouseMove={moveTooltip}
              onMouseLeave={hideTooltip}
            >
              join
            </button>
            <button 
              className={linkType === 'watch' ? 'active' : ''} 
              onClick={() => setLinkType('watch')}
              onMouseEnter={showTooltip('Recipients can only watch')}
              onMouseMove={moveTooltip}
              onMouseLeave={hideTooltip}
            >
              watch
            </button>
          </div>
        ) : (
          <div className="link-type-toggle">
            <button className="active" disabled>watch only</button>
          </div>
        )}
        <div className="share-url-row">
          <div className="url-bar-container">
            {showLink ? (
              <input
                ref={urlRef}
                type="text"
                className="url-input"
                value={currentUrl}
                readOnly
                onClick={(e) => e.target.select()}
              />
            ) : (
              <div className="url-hidden">••••••••••••</div>
            )}
            <button 
              className="eye-toggle-btn"
              onClick={() => setShowLink(!showLink)}
              onMouseEnter={showDynamicTooltip(() => showLink ? 'Hide link' : 'Show link')}
              onMouseMove={moveTooltip}
              onMouseLeave={hideTooltip}
            >
              {showLink ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                  <line x1="1" y1="1" x2="23" y2="23"/>
                </svg>
              )}
            </button>
          </div>
          <button 
            className="copy-btn" 
            onClick={handleCopy}
            onMouseEnter={showTooltip('Copy to clipboard')}
            onMouseMove={moveTooltip}
            onMouseLeave={hideTooltip}
          >
            {copied ? '✓' : 'copy'}
          </button>
        </div>
      </div>

      {/* Racers List */}
      <div className="lobby-members">
        <div className="members-header">
          <span>racers</span>
          <span 
            className={`racer-count ${activeRacerCount >= MAX_RACERS ? 'full' : ''}`}
            onMouseEnter={showTooltip(`Max ${MAX_RACERS} racers`)}
            onMouseMove={moveTooltip}
            onMouseLeave={hideTooltip}
          >
            {activeRacerCount}/{MAX_RACERS}
          </span>
        </div>
        {safeRacers.map((racer) => {
          const isYou = racer.id === myId;
          const isRacerHost = racer.isHost;
          const isPendingHost = racer.id === pendingHostId;
          const status = getStatusIndicator(racer);
          const canTransferTo = isHost && !isYou && !racer.disconnected && !isRacerHost;
          const transferProgress = transferHoldProgress[racer.id] || 0;
          
          return (
            <div key={racer.id} className={`lobby-member ${isYou ? 'you' : ''} ${racer.disconnected ? 'disconnected' : ''}`}>
              <span 
                className={`member-status ${status.cls}`}
                onMouseEnter={showTooltip(status.tip)}
                onMouseMove={moveTooltip}
                onMouseLeave={hideTooltip}
              >
                {status.symbol}
              </span>
              <span className="member-name">
                {isYou ? (
                  <EditableName name={racer.name} isYou={true} onNameChange={onNameChange} />
                ) : (
                  <span 
                    className="clickable-name"
                    onClick={() => onRequestStats && onRequestStats(racer.id)}
                    onMouseEnter={showTooltip('View stats')}
                    onMouseMove={moveTooltip}
                    onMouseLeave={hideTooltip}
                  >
                    {racer.name}
                  </span>
                )}
                {isYou && <span className="you-badge">you</span>}
              </span>
              
              {/* Host badge or transfer star */}
              {isRacerHost ? (
                <span className="host-badge" onMouseEnter={showTooltip('Host')} onMouseMove={moveTooltip} onMouseLeave={hideTooltip}>★</span>
              ) : isPendingHost ? (
                <span className="pending-host-badge" onMouseEnter={showTooltip('Becoming host')} onMouseMove={moveTooltip} onMouseLeave={hideTooltip}>→★</span>
              ) : canTransferTo ? (
                <button
                  className={`transfer-star-btn ${transferProgress > 0 ? 'holding' : ''}`}
                  onMouseDown={startTransferHold(racer.id)}
                  onMouseUp={cancelTransferHold}
                  onMouseLeave={(e) => { cancelTransferHold(); hideTooltip(); }}
                  onTouchStart={startTransferHold(racer.id)}
                  onTouchEnd={cancelTransferHold}
                  onMouseEnter={showTooltip('Hold to make host')}
                  onMouseMove={moveTooltip}
                >
                  <svg className="star-outline" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                  </svg>
                  <svg 
                    className="star-fill" 
                    width="14" 
                    height="14" 
                    viewBox="0 0 24 24" 
                    fill="#f59e0b" 
                    stroke="#f59e0b" 
                    strokeWidth="2"
                    style={{ clipPath: `inset(${100 - transferProgress}% 0 0 0)` }}
                  >
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                  </svg>
                </button>
              ) : null}
              
              {statsRequestPending === racer.id && <span className="stats-loading">...</span>}
            </div>
          );
        })}
      </div>

      {/* Spectators */}
      {spectators.length > 0 && (
        <div className="lobby-spectators-list">
          <div className="members-header">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
            <span onMouseEnter={showTooltip('Spectators')} onMouseMove={moveTooltip} onMouseLeave={hideTooltip}>
              {spectators.length} watching
            </span>
          </div>
        </div>
      )}

      {/* Settings */}
      {raceStatus === 'waiting' && (
        <div className="lobby-settings-section">
          <div className="setting-row">
            <label 
              className={`setting-toggle ${!isHost ? 'disabled' : ''}`}
              onMouseEnter={showDynamicTooltip(() =>
                strictMode 
                  ? 'STRICT MODE ON: Must fix every error before advancing. Pure typing accuracy required.' 
                  : 'STRICT MODE OFF: Can skip errors and keep typing. Final WPM adjusted by word accuracy.'
              )}
              onMouseMove={moveTooltip}
              onMouseLeave={hideTooltip}
            >
              <input
                type="checkbox"
                checked={strictMode}
                onChange={(e) => isHost && onStrictModeChange(e.target.checked)}
                disabled={!isHost}
              />
              <span className="toggle-track"><span className="toggle-thumb" /></span>
              <span className="toggle-label">strict mode</span>
            </label>
            <span className="setting-hint">{strictMode ? 'fix errors' : 'skip errors'}</span>
          </div>
          <div className="setting-row">
            <label 
              className={`setting-toggle ${!isHost ? 'disabled' : ''}`}
              onMouseEnter={showDynamicTooltip(() =>
                realtimeMode 
                  ? 'REALTIME ON: Timer starts at GO for everyone simultaneously. Fair head-to-head racing.' 
                  : 'REALTIME OFF: Timer starts when you begin typing. Better for practice sessions.'
              )}
              onMouseMove={moveTooltip}
              onMouseLeave={hideTooltip}
            >
              <input
                type="checkbox"
                checked={realtimeMode}
                onChange={(e) => isHost && onRealtimeModeChange(e.target.checked)}
                disabled={!isHost}
              />
              <span className="toggle-track"><span className="toggle-thumb" /></span>
              <span className="toggle-label">realtime</span>
            </label>
            <span className="setting-hint">{realtimeMode ? 'synced start' : 'own pace'}</span>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="lobby-actions-section">
        {!isSpectator && raceStatus === 'waiting' && (
          <button 
            onClick={handleReadyToggle}
            className={`lobby-action-btn ready ${isReady ? 'is-ready' : ''}`}
            onMouseEnter={showDynamicTooltip(() => isReady ? 'Unready' : 'Ready up')}
            onMouseMove={moveTooltip}
            onMouseLeave={hideTooltip}
          >
            {isReady ? '✓ ready' : 'ready up'}
          </button>
        )}
        
        {showStartButton && (
          <button 
            onClick={canStart ? onStart : undefined}
            className={`lobby-action-btn start ${!canStart ? 'disabled' : ''}`}
            disabled={!canStart}
            onMouseEnter={showDynamicTooltip(() => canStart ? 'Start race' : 'Waiting for all to ready')}
            onMouseMove={moveTooltip}
            onMouseLeave={hideTooltip}
          >
            start race
          </button>
        )}
        
        {canRematch && (
          <button 
            onClick={onRematch}
            className="lobby-action-btn rematch"
            onMouseEnter={showTooltip('New race, same players')}
            onMouseMove={moveTooltip}
            onMouseLeave={hideTooltip}
          >
            rematch
          </button>
        )}
        
        <button 
          className={`lobby-action-btn leave ${leaveConfirm ? 'confirming' : ''}`}
          onClick={handleLeaveClick}
          onMouseEnter={showDynamicTooltip(() => leaveConfirm ? 'Click again to confirm' : 'Leave lobby')}
          onMouseMove={moveTooltip}
          onMouseLeave={hideTooltip}
        >
          {leaveConfirm ? 'are you sure?' : 'leave'}
        </button>
      </div>

      {/* Status Messages */}
      {isSpectator && raceStatus === 'waiting' && (
        <div className="lobby-status spectator">watching...</div>
      )}
      {lateJoiner && (
        <div className="lobby-status late">joining next race...</div>
      )}

      {/* Player Stats Modal - rendered via portal */}
      {viewingPlayerStats && ReactDOM.createPortal(
        <PlayerStatsModal playerStats={viewingPlayerStats} onClose={onClearViewingStats} />,
        document.body
      )}
      
      {/* Tooltip - rendered via portal to avoid affecting layout */}
      {/* Always show tooltip to the LEFT of mouse for lobby panel (which is on right side of screen) */}
      {tooltipText && ReactDOM.createPortal(
        <div 
          className="cursor-tooltip lobby-tooltip"
          style={{ 
            left: tooltipPos.x - 12,
            top: tooltipPos.y + 40 > window.innerHeight ? tooltipPos.y - 30 : tooltipPos.y + 12,
            transform: 'translateX(-100%)'
          }}
        >
          {tooltipText}
        </div>,
        document.body
      )}
    </div>
  );
}


export default {
  RaceLobby,
  RaceCountdown,
  RacerProgress,
  RaceProgressPanel,
  RaceResults,
  RaceStatsPanel,
  LobbyPresenceIndicator,
  LobbyPanel,
  PlayerStatsModal,
};
