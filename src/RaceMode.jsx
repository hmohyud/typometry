import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { KeyboardHeatmap } from './KeyboardViz';

// Custom Tooltip component - appears above element
function Tooltip({ children, text, position = 'top' }) {
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState({ x: 0, y: 0 });
  const triggerRef = useRef(null);
  const tooltipRef = useRef(null);

  const showTooltip = useCallback(() => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setCoords({
        x: rect.left + rect.width / 2,
        y: rect.top,
      });
      setVisible(true);
    }
  }, []);

  const hideTooltip = useCallback(() => {
    setVisible(false);
  }, []);

  return (
    <span 
      ref={triggerRef}
      className="tooltip-trigger"
      onMouseEnter={showTooltip}
      onMouseLeave={hideTooltip}
      onFocus={showTooltip}
      onBlur={hideTooltip}
    >
      {children}
      {visible && text && (
        <span 
          ref={tooltipRef}
          className="custom-tooltip"
          style={{
            left: coords.x,
            top: coords.y,
          }}
        >
          {text}
          <span className="tooltip-arrow" />
        </span>
      )}
    </span>
  );
}

// Editable name component
function EditableName({ name, isYou, onNameChange }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const inputRef = useRef(null);

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
  // Join URL includes the secret key, spectate URL does not
  const currentUrl = linkType === 'join' && joinKey
    ? `${shareUrl}&join=${joinKey}`
    : shareUrl; // Spectate = just the race ID, no key

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
export function RaceProgressPanel({ racers, spectators = [], myId, myFinished, isSpectator, lateJoiner = false }) {
  const sortedRacers = useMemo(() => {
    // Sort: you first, then by progress/finish position
    return [...racers].sort((a, b) => {
      // Always put yourself first
      if (a.id === myId) return -1;
      if (b.id === myId) return 1;
      // Then sort by finish position or progress
      if (a.finished && b.finished) return (a.position || 0) - (b.position || 0);
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.progress - a.progress;
    });
  }, [racers, myId]);

  const finishedCount = racers.filter(r => r.finished).length;
  const totalCount = racers.length;

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

// Race results screen
export function RaceResults({ results, myId, onPlayAgain, onLeave, shareUrl, isWaitingForOthers }) {
  const [copied, setCopied] = useState(false);
  
  const formatTime = (ms) => (ms / 1000).toFixed(1) + 's';
  
  const handleShare = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };
  
  const finishedCount = results.length;
  
  return (
    <div className="race-results">
      {isWaitingForOthers && (
        <div className="results-waiting">
          waiting for others to finish...
        </div>
      )}
      <div className="results-list">
        {results.map((racer, index) => (
          <div 
            key={racer.id} 
            className={`result-row ${racer.id === myId ? 'you' : ''}`}
          >
            <span className="result-place">
              {index === 0 ? '1st' : index === 1 ? '2nd' : index === 2 ? '3rd' : `${index + 1}th`}
            </span>
            <span className="result-name">
              {racer.name}
              {racer.id === myId && <span className="you-tag">you</span>}
            </span>
            <span className="result-wpm" title="Words per minute">{Math.round(racer.wpm)}</span>
            <span className="result-accuracy" title="Accuracy percentage">{Math.round(racer.accuracy)}%</span>
            <span className="result-time" title="Time to complete">{formatTime(racer.time)}</span>
          </div>
        ))}
      </div>

      <div className="results-actions">
        <button onClick={onLeave} className="result-btn">
          leave
        </button>
        {shareUrl && !isWaitingForOthers && (
          <button onClick={handleShare} className="result-btn">
            {copied ? 'copied!' : 'share'}
          </button>
        )}
        {!isWaitingForOthers && (
          <button onClick={onPlayAgain} className="result-btn primary">
            race again
          </button>
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
  
  // Get all word speeds and calculate min/max for color scaling
  const allSpeeds = results.flatMap(r => r.wordSpeeds || []).filter(s => s > 0);
  if (allSpeeds.length === 0) return null;
  
  const minSpeed = Math.min(...allSpeeds);
  const maxSpeed = Math.max(...allSpeeds);
  const speedRange = maxSpeed - minSpeed || 1;
  
  // Calculate average speed per word position
  const avgSpeedsPerWord = words.map((_, wordIndex) => {
    const speedsAtPosition = results
      .map(r => r.wordSpeeds?.[wordIndex])
      .filter(s => s !== undefined && s > 0);
    if (speedsAtPosition.length === 0) return null;
    return Math.round(speedsAtPosition.reduce((a, b) => a + b, 0) / speedsAtPosition.length);
  });
  
  // Color function: red (slow) -> yellow -> green (fast)
  const getSpeedColor = (speed, opacity = 1) => {
    if (!speed || speed <= 0) return `rgba(100, 100, 100, ${opacity * 0.3})`;
    const normalized = (speed - minSpeed) / speedRange;
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
export function RaceStatsPanel({ raceStats, fmt, shareUrl }) {
  const [copied, setCopied] = useState(false);
  
  const handleShare = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };
  
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
      {/* Header */}
      <div className="pvp-header">
        {stillWaiting && (
          <span className="waiting-indicator">
            waiting for {racerCount - finishedCount} more...
          </span>
        )}
        {shareUrl && !stillWaiting && (
          <button className="pvp-share" onClick={handleShare}>
            {copied ? 'copied!' : 'share results'}
          </button>
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
          const barWidth = wpmSpread > 0 
            ? ((racer.wpm - slowestWpm) / wpmSpread) * 100 
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

// Parse shared results - re-export from useRace.js
// (imported at top of file, but also available here for backward compat)

// Shared Results View - standalone page for shared links
export function SharedResultsView({ data, onGoToApp }) {
  if (!data) {
    return (
      <div className="shared-results-error">
        <p>invalid results link</p>
        <button onClick={onGoToApp} className="go-to-app-btn">go to typometry</button>
      </div>
    );
  }
  
  const { 
    results, 
    charCount, 
    wordCount, 
    racerCount,
    avgWpm,
    avgAccuracy,
    avgTime,
    maxWpm,
    minWpm,
    wpmSpread,
    wpmStdDev,
    accStdDev,
    fastestTime,
    slowestTime,
    winner,
    marginWpm,
    marginTime,
    winnerCps,
    wordSpeedStats,
    hasWordSpeeds,
    timestamp,
  } = data;

  const formatTime = (ms) => {
    const seconds = ms / 1000;
    if (seconds < 60) return `${seconds.toFixed(1)}s`;
    const mins = Math.floor(seconds / 60);
    const secs = (seconds % 60).toFixed(1);
    return `${mins}m ${secs}s`;
  };
  
  const formatDate = (ts) => {
    if (!ts) return null;
    return new Date(ts).toLocaleDateString(undefined, { 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };
  
  return (
    <div className="shared-results">
      <div className="shared-header">
        <span className="shared-title">race results</span>
        <button onClick={onGoToApp} className="go-to-app-btn">try typometry</button>
      </div>
      
      {/* Winner Hero */}
      <div className="shared-winner">
        <span className="winner-label">winner</span>
        <span className="winner-name">{winner.name}</span>
        <div className="winner-stats">
          <span>{Math.round(winner.wpm * 10) / 10} wpm</span>
          <span>{Math.round(winner.accuracy * 10) / 10}%</span>
          <span>{formatTime(winner.time)}</span>
        </div>
      </div>
      
      {/* Standings with bars */}
      <div className="shared-standings">
        {results.map((racer, index) => {
          const barWidth = wpmSpread > 0 
            ? ((racer.wpm - minWpm) / wpmSpread) * 100 
            : 100;
          return (
            <div key={racer.id} className="shared-standing">
              <span className="standing-pos">{index + 1}</span>
              <div className="standing-info">
                <span className="standing-name">{racer.name}</span>
                <div className="standing-bar">
                  <div className="standing-fill" style={{ width: `${barWidth}%` }} />
                </div>
              </div>
              <span className="standing-wpm">{Math.round(racer.wpm)}</span>
            </div>
          );
        })}
      </div>
      
      {/* Competition Stats */}
      <div className="shared-stats-grid">
        {marginWpm > 0 && (
          <div className="shared-stat">
            <span className="stat-value">{marginWpm.toFixed(1)}</span>
            <span className="stat-label">wpm margin</span>
          </div>
        )}
        {marginTime > 0 && (
          <div className="shared-stat">
            <span className="stat-value">{(marginTime / 1000).toFixed(1)}s</span>
            <span className="stat-label">time gap</span>
          </div>
        )}
        <div className="shared-stat">
          <span className="stat-value">{avgWpm.toFixed(0)}</span>
          <span className="stat-label">avg wpm</span>
        </div>
        <div className="shared-stat">
          <span className="stat-value">{wpmSpread.toFixed(0)}</span>
          <span className="stat-label">wpm spread</span>
        </div>
        <div className="shared-stat">
          <span className="stat-value">{wpmStdDev.toFixed(1)}</span>
          <span className="stat-label">wpm σ</span>
        </div>
        <div className="shared-stat">
          <span className="stat-value">{avgAccuracy.toFixed(1)}%</span>
          <span className="stat-label">avg accuracy</span>
        </div>
        <div className="shared-stat">
          <span className="stat-value">{winnerCps.toFixed(1)}</span>
          <span className="stat-label">cps (winner)</span>
        </div>
        <div className="shared-stat">
          <span className="stat-value">{formatTime(avgTime)}</span>
          <span className="stat-label">avg time</span>
        </div>
      </div>
      
      {/* Word Speed Stats */}
      {hasWordSpeeds && wordSpeedStats && (
        <div className="shared-word-stats">
          <div className="word-stats-header">word-level analysis</div>
          <div className="shared-stats-grid">
            <div className="shared-stat">
              <span className="stat-value">{Math.round(wordSpeedStats.avgWordSpeed)}</span>
              <span className="stat-label">avg word wpm</span>
            </div>
            <div className="shared-stat">
              <span className="stat-value">{wordSpeedStats.maxWordSpeed}</span>
              <span className="stat-label">fastest word</span>
            </div>
            <div className="shared-stat">
              <span className="stat-value">{wordSpeedStats.minWordSpeed}</span>
              <span className="stat-label">slowest word</span>
            </div>
            <div className="shared-stat">
              <span className="stat-value">{wordSpeedStats.wordSpeedRange}</span>
              <span className="stat-label">word range</span>
            </div>
          </div>
        </div>
      )}
      
      {/* Meta */}
      <div className="shared-meta">
        <span>{racerCount} racer{racerCount !== 1 ? 's' : ''}</span>
        <span>·</span>
        <span>{charCount} chars</span>
        <span>·</span>
        <span>~{wordCount} words</span>
        {timestamp && (
          <>
            <span>·</span>
            <span>{formatDate(timestamp)}</span>
          </>
        )}
      </div>
      
      {/* Raw Data Expander */}
      <details className="shared-raw-data">
        <summary>view raw data</summary>
        <pre>{JSON.stringify(data, null, 2)}</pre>
      </details>
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
  SharedResultsView,
};
