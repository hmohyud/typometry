import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';

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
  myId, 
  isHost,
  onReady, 
  onStart, 
  onLeave,
  onNameChange,
  shareUrl 
}) {
  const [isReady, setIsReady] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showLink, setShowLink] = useState(false);

  const handleReadyToggle = () => {
    const newReady = !isReady;
    setIsReady(newReady);
    onReady(newReady);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const allReady = racers.length >= 2 && racers.every(r => r.ready);
  const canStart = isHost && allReady;
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
      {/* Invite bar - all inline */}
      <div className="invite-bar">
        <button 
          onClick={() => setShowLink(!showLink)} 
          className="invite-toggle"
        >
          {showLink ? 'hide' : 'show'}
        </button>
        <div className="invite-url" onClick={handleUrlClick}>
          {showLink ? (
            <code ref={urlRef}>{shareUrl}</code>
          ) : (
            <span className="invite-dots">••••••••••••••••••••••••</span>
          )}
        </div>
        <button 
          onClick={handleCopy} 
          className={`invite-copy ${copied ? 'copied' : ''}`}
        >
          {copied ? 'copied' : 'copy'}
        </button>
      </div>

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
        {racers.length < 2 && (
          <div className="lobby-racer empty">
            <div className="racer-info">
              <span className="racer-status" />
              <span className="racer-name-text">waiting...</span>
            </div>
          </div>
        )}
      </div>

      {/* Actions - fixed layout */}
      <div className="lobby-actions">
        <button onClick={onLeave} className="lobby-btn leave">
          leave
        </button>
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

// Progress bar for a single racer
export function RacerProgress({ racer, isYou }) {
  return (
    <div className={`racer-progress ${isYou ? 'you' : ''} ${racer.finished ? 'finished' : ''}`}>
      <div className="racer-progress-info">
        <span className="racer-progress-name">
          {racer.name}
          {isYou && <span className="you-tag">you</span>}
        </span>
        <span className="racer-progress-wpm">
          {racer.wpm > 0 ? `${Math.round(racer.wpm)}` : '–'}
        </span>
      </div>
      <div className="racer-progress-bar">
        <div 
          className="racer-progress-fill"
          style={{ width: `${racer.progress}%` }}
        />
      </div>
    </div>
  );
}

// Race progress panel showing all racers
export function RaceProgressPanel({ racers, myId }) {
  const sortedRacers = useMemo(() => {
    return [...racers].sort((a, b) => {
      if (a.finished && b.finished) return (a.position || 0) - (b.position || 0);
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.progress - a.progress;
    });
  }, [racers]);

  return (
    <div className="race-progress-panel">
      {sortedRacers.map(racer => (
        <RacerProgress 
          key={racer.id} 
          racer={racer} 
          isYou={racer.id === myId}
        />
      ))}
    </div>
  );
}

// Race results screen
export function RaceResults({ results, myId, onPlayAgain, onLeave, onViewStats, shareUrl }) {
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
  
  return (
    <div className="race-results">
      <div className="results-list">
        {results.map((racer, index) => (
          <div 
            key={racer.id} 
            className={`result-row ${racer.id === myId ? 'you' : ''}`}
          >
            <span className="result-place">
              {index === 0 ? '1st' : index === 1 ? '2nd' : index === 2 ? '3rd' : `${index + 1}th`}
            </span>
            <span className="result-name">{racer.name}</span>
            <span className="result-wpm">{Math.round(racer.wpm)}</span>
            <span className="result-accuracy">{Math.round(racer.accuracy)}%</span>
            <span className="result-time">{formatTime(racer.time)}</span>
          </div>
        ))}
      </div>

      <div className="results-actions">
        <button onClick={onLeave} className="result-btn">
          leave
        </button>
        {shareUrl && (
          <button onClick={handleShare} className="result-btn">
            {copied ? 'copied!' : 'share'}
          </button>
        )}
        <button onClick={onViewStats} className="result-btn">
          stats
        </button>
        <button onClick={onPlayAgain} className="result-btn primary">
          race again
        </button>
      </div>
    </div>
  );
}

// Race Stats Panel - for the Race tab in stats view
export function RaceStatsPanel({ raceStats, onClear, fmt, shareUrl }) {
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
  const myPercentile = myResult ? Math.round((1 - (myResult.position - 1) / racerCount) * 100) : 0;
  const wpmPerChar = myResult ? (myResult.wpm / 60 * 5) : 0; // chars per second approximation
  
  // Head to head (for 2 player races)
  const isHeadToHead = racerCount === 2;
  const opponent = isHeadToHead ? allResults.find(r => r.id !== myResult?.id) : null;

  return (
    <div className="pvp-stats">
      {/* Header */}
      <div className="pvp-header">
        {shareUrl && (
          <button className="pvp-share" onClick={handleShare}>
            {copied ? 'copied!' : 'share'}
          </button>
        )}
        <button className="pvp-clear" onClick={onClear}>×</button>
      </div>

      {/* Your Result - Hero Section */}
      {myResult && (
        <div className="pvp-hero">
          <div className="pvp-position">
            <span className="position-num">{myResult.position}</span>
            <span className="position-suffix">
              {myResult.position === 1 ? 'st' : myResult.position === 2 ? 'nd' : myResult.position === 3 ? 'rd' : 'th'}
            </span>
          </div>
          <div className="pvp-main-stats">
            <div className="main-stat">
              <span className="stat-value">{fmt.int(myResult.wpm)}</span>
              <span className="stat-label">wpm</span>
            </div>
            <div className="main-stat">
              <span className="stat-value">{fmt.dec(myResult.accuracy, 1)}</span>
              <span className="stat-label">accuracy</span>
            </div>
            <div className="main-stat">
              <span className="stat-value">{formatTime(myResult.time)}</span>
              <span className="stat-label">time</span>
            </div>
          </div>
        </div>
      )}

      {/* Head to Head (2 players) */}
      {isHeadToHead && myResult && opponent && (
        <div className="pvp-h2h">
          <div className="h2h-row">
            <span className="h2h-you">{fmt.int(myResult.wpm)}</span>
            <span className="h2h-label">wpm</span>
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
            <span className="h2h-label">accuracy</span>
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
            <span className="h2h-label">time</span>
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
          <div className="insight">
            <span className="insight-value">{fmt.dec(marginOfVictory, 1)}</span>
            <span className="insight-label">wpm margin</span>
          </div>
        )}
        {marginTime > 0 && (
          <div className="insight">
            <span className="insight-value">{(marginTime / 1000).toFixed(1)}s</span>
            <span className="insight-label">time gap</span>
          </div>
        )}
        <div className="insight">
          <span className="insight-value">{fmt.int(wpmSpread)}</span>
          <span className="insight-label">wpm spread</span>
        </div>
        <div className="insight">
          <span className="insight-value">{fmt.dec(avgWpm, 0)}</span>
          <span className="insight-label">field avg</span>
        </div>
      </div>

      {/* Standings */}
      <div className="pvp-standings">
        {allResults.map((racer, index) => {
          const barWidth = wpmSpread > 0 
            ? ((racer.wpm - slowestWpm) / wpmSpread) * 100 
            : 100;
          return (
            <div 
              key={racer.id} 
              className={`standing ${racer.id === myResult?.id ? 'you' : ''}`}
            >
              <span className="standing-pos">{index + 1}</span>
              <div className="standing-info">
                <span className="standing-name">{racer.name}</span>
                <div className="standing-bar">
                  <div className="standing-fill" style={{ width: `${barWidth}%` }} />
                </div>
              </div>
              <span className="standing-wpm">{fmt.int(racer.wpm)}</span>
            </div>
          );
        })}
      </div>

      {/* Text Info */}
      <div className="pvp-text-info">
        <span>{paragraph?.length || 0} chars</span>
        <span>·</span>
        <span>{Math.round((paragraph?.length || 0) / 5)} words</span>
      </div>
    </div>
  );
}

// Parse shared results from URL
export function parseSharedResults(encoded) {
  try {
    const decoded = decodeURIComponent(atob(encoded));
    const [meta, resultsStr] = decoded.split('::');
    const [chars, words] = meta.split('|').map(Number);
    
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
    
    return { results, chars, words };
  } catch (e) {
    console.error('Failed to parse shared results:', e);
    return null;
  }
}

// Shared Results View - standalone page for shared links
export function SharedResultsView({ encoded, onGoToApp }) {
  const data = parseSharedResults(encoded);
  
  if (!data) {
    return (
      <div className="shared-results-error">
        <p>invalid results link</p>
        <button onClick={onGoToApp} className="go-to-app-btn">go to typometry</button>
      </div>
    );
  }
  
  const { results, chars, words } = data;
  const winner = results[0];
  const avgWpm = results.reduce((a, r) => a + r.wpm, 0) / results.length;
  const wpmSpread = Math.max(...results.map(r => r.wpm)) - Math.min(...results.map(r => r.wpm));
  const slowestWpm = Math.min(...results.map(r => r.wpm));

  const formatTime = (ms) => {
    const seconds = ms / 1000;
    if (seconds < 60) return `${seconds.toFixed(1)}s`;
    const mins = Math.floor(seconds / 60);
    const secs = (seconds % 60).toFixed(1);
    return `${mins}m ${secs}s`;
  };
  
  return (
    <div className="shared-results">
      <div className="shared-header">
        <span className="shared-title">race results</span>
        <button onClick={onGoToApp} className="go-to-app-btn">try typometry</button>
      </div>
      
      <div className="shared-winner">
        <span className="winner-label">winner</span>
        <span className="winner-name">{winner.name}</span>
        <div className="winner-stats">
          <span>{winner.wpm} wpm</span>
          <span>{winner.accuracy}%</span>
          <span>{formatTime(winner.time)}</span>
        </div>
      </div>
      
      <div className="shared-standings">
        {results.map((racer, index) => {
          const barWidth = wpmSpread > 0 
            ? ((racer.wpm - slowestWpm) / wpmSpread) * 100 
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
              <span className="standing-wpm">{racer.wpm}</span>
            </div>
          );
        })}
      </div>
      
      <div className="shared-meta">
        <span>{results.length} racers</span>
        <span>·</span>
        <span>{chars} chars</span>
        <span>·</span>
        <span>~{words} words</span>
      </div>
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
  parseSharedResults,
};
