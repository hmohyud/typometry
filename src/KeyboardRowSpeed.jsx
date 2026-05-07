import React, { useState } from 'react';
import { Tooltip, TipTitle, TipText, TipHint } from './Tooltip';

const ROW_DEFS = {
  numberRow: {
    label: 'Number Row',
    baseKeys: '`1234567890-=',
    shiftedKeys: '~!@#$%^&*()_+',
    baseDisplay: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
    shiftedDisplay: ['!', '@', '#', '$', '%', '^', '&', '*', '(', ')'],
    offset: 0,
  },
  topRow: {
    label: 'Top Row',
    baseKeys: 'qwertyuiop[]\\',
    shiftedKeys: 'QWERTYUIOP{}|',
    baseDisplay: ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
    shiftedDisplay: ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
    offset: 0.5,
  },
  homeRow: {
    label: 'Home Row',
    baseKeys: "asdfghjkl;'",
    shiftedKeys: 'ASDFGHJKL:"',
    baseDisplay: ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
    shiftedDisplay: ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
    offset: 0.75,
  },
  bottomRow: {
    label: 'Bottom Row',
    baseKeys: 'zxcvbnm,./',
    shiftedKeys: 'ZXCVBNM<>?',
    baseDisplay: ['z', 'x', 'c', 'v', 'b', 'n', 'm'],
    shiftedDisplay: ['Z', 'X', 'C', 'V', 'B', 'N', 'M'],
    offset: 1.25,
  },
};

const HELP_CONTENT = (
  <>
    <TipTitle>Keyboard Row Speed</TipTitle>
    <TipText>Average keystroke time for each row of the keyboard.</TipText>
    <TipText>
      Green border = faster, yellow = slower. Time shown in milliseconds.
    </TipText>
    <TipHint>Home row is usually fastest for touch typists</TipHint>
  </>
);

function calculateRowSpeeds(keyAverages, useShifted) {
  const speeds = {};
  Object.entries(ROW_DEFS).forEach(([rowName, def]) => {
    let totalTime = 0;
    let totalCount = 0;
    const keys = useShifted ? def.shiftedKeys : def.baseKeys;
    for (const char of keys) {
      const stats = keyAverages?.[char];
      if (stats && stats.avgInterval > 0 && stats.count > 0) {
        totalTime += stats.avgInterval * stats.count;
        totalCount += stats.count;
      }
    }
    if (totalCount >= 5) {
      speeds[rowName] = {
        avgIntervalMs: totalTime / totalCount,
        count: totalCount,
      };
    }
  });
  return speeds;
}

/**
 * KeyboardRowSpeed — visualizes typing speed per QWERTY row, with shift toggle.
 *
 * Shape of keyAverages: { [char]: { avgInterval, count, ... } }
 * Same shape works for global, all-time, or per-session keyStats.
 */
export default function KeyboardRowSpeed({ keyAverages, title = 'Keyboard Row Speed' }) {
  const [shiftMode, setShiftMode] = useState(false);

  if (!keyAverages || Object.keys(keyAverages).length === 0) return null;

  const baseSpeeds = calculateRowSpeeds(keyAverages, false);
  const shiftedSpeeds = calculateRowSpeeds(keyAverages, true);

  const rowSpeeds = shiftMode ? shiftedSpeeds : baseSpeeds;
  const hasShiftedData = Object.keys(shiftedSpeeds).length > 0;

  const validRows = ['numberRow', 'topRow', 'homeRow', 'bottomRow'].filter(
    (r) => rowSpeeds[r]
  );

  if (validRows.length === 0 && !hasShiftedData) return null;

  const allTimes = validRows.map((r) => rowSpeeds[r].avgIntervalMs);
  const minTime = allTimes.length > 0 ? Math.min(...allTimes) : 100;
  const maxTime = allTimes.length > 0 ? Math.max(...allTimes) : 200;

  const getRowColor = (time) => {
    if (maxTime === minTime) return 'var(--accent)';
    const t = (time - minTime) / (maxTime - minTime);
    // Green (fast) → yellow (slow)
    const r = Math.round(145 + (226 - 145) * t);
    const g = Math.round(216 - (216 - 183) * t);
    const b = Math.round(145 - (145 - 20) * t);
    return `rgb(${r}, ${g}, ${b})`;
  };

  return (
    <div className="row-performance-section">
      <div className="section-header-row">
        <h3>{title}</h3>
        <div className="header-controls">
          {hasShiftedData && (
            <div className="mini-toggle-group">
              <button
                className={`mini-toggle ${!shiftMode ? 'active' : ''}`}
                onClick={() => setShiftMode(false)}
              >
                Base
              </button>
              <button
                className={`mini-toggle ${shiftMode ? 'active' : ''}`}
                onClick={() => setShiftMode(true)}
              >
                ⇧ Shift
              </button>
            </div>
          )}
          <Tooltip content={HELP_CONTENT}>
            <button
              className="help-btn"
              type="button"
              aria-label="Help"
            >
              ?
            </button>
          </Tooltip>
        </div>
      </div>
      <div className="keyboard-rows-visual">
        {validRows.length > 0 ? (
          validRows.map((rowName) => {
            const data = rowSpeeds[rowName];
            const def = ROW_DEFS[rowName];
            const displayKeys = shiftMode ? def.shiftedDisplay : def.baseDisplay;

            return (
              <div key={rowName} className="keyboard-row-item">
                <span className="keyboard-row-label">{def.label}</span>
                <div
                  className="keyboard-row-keys"
                  style={{ paddingLeft: `${def.offset * 1.2}rem` }}
                >
                  {displayKeys.map((key) => (
                    <span
                      key={key}
                      className="keyboard-row-key"
                      style={{
                        borderColor: getRowColor(data.avgIntervalMs),
                      }}
                    >
                      {key}
                    </span>
                  ))}
                </div>
                <span
                  className="keyboard-row-time"
                  style={{ color: getRowColor(data.avgIntervalMs) }}
                >
                  {Math.round(data.avgIntervalMs)}ms
                </span>
              </div>
            );
          })
        ) : (
          <div
            className="no-data-message"
            style={{ padding: '1rem', opacity: 0.6, textAlign: 'center' }}
          >
            No {shiftMode ? 'shifted' : 'base'} key data yet
          </div>
        )}
      </div>
    </div>
  );
}
