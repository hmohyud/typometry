import React, { useState } from 'react';
import { Tooltip, TipTitle, TipText, TipHint } from './Tooltip';

// 5 axes (pentagon). Order is clockwise from top.
const AXES = [
  {
    key: 'speed',
    label: 'speed',
    rangeKey: 'wpm',
    format: (v) => `${Math.round(v)}`,
    suffix: 'wpm',
    description: 'Words per minute. 1 word = 5 characters including spaces.',
    defaultMin: 0,
    defaultMax: 150,
  },
  {
    key: 'accuracy',
    label: 'accuracy',
    rangeKey: 'accuracy',
    format: (v) => `${v.toFixed(1)}`,
    suffix: '%',
    description: 'Percentage of keystrokes typed correctly.',
    defaultMin: 0,
    defaultMax: 100,
  },
  {
    key: 'consistency',
    label: 'consistency',
    rangeKey: 'consistency',
    format: (v) => `${Math.round(v)}`,
    suffix: '%',
    description:
      'Steadiness of speed (1 − coefficient of variation). 100% = perfectly metronomic.',
    defaultMin: 0,
    defaultMax: 100,
  },
  {
    key: 'flow',
    label: 'flow',
    rangeKey: 'flow',
    format: (v) => `${Math.round(v)}`,
    suffix: '%',
    description:
      "Percentage of keystrokes within ±30% of average speed — how often you're 'in the zone.'",
    defaultMin: 0,
    defaultMax: 100,
  },
  {
    key: 'rhythm',
    label: 'rhythm',
    rangeKey: 'rhythm',
    format: (v) => `${Math.round(v)}`,
    suffix: '%',
    description:
      'Regularity of keystroke timing (interval-to-interval). 100% = perfectly even pulse.',
    defaultMin: 0,
    defaultMax: 100,
  },
];

const HELP_CONTENT = (
  <>
    <TipTitle>Skill Radar</TipTitle>
    <TipText>
      A 5-axis snapshot of your typing across distinct skill dimensions.
    </TipText>
    <TipText>
      The outer ring of each axis is the current global record for that metric;
      the center is the global minimum.
    </TipText>
    <TipHint>
      Hover any axis label for stats · Click to switch which polygon is the
      focus
    </TipHint>
  </>
);

function getValues(stats) {
  if (!stats) return null;
  return {
    speed: stats.wpm || 0,
    accuracy: stats.accuracy || 0,
    consistency: stats.consistency || 0,
    flow: stats.behavioral?.flowRatio || 0,
    rhythm: stats.behavioral?.rhythmScore || 0,
  };
}

function pointFor(angleDeg, radius, cx, cy) {
  const a = (angleDeg * Math.PI) / 180;
  return {
    x: cx + Math.cos(a) * radius,
    y: cy + Math.sin(a) * radius,
  };
}

function normalize(v, min, max) {
  if (max <= min) return 0;
  return Math.max(0, Math.min(1, (v - min) / (max - min)));
}

function polygonPoints(values, axes, cx, cy, radius) {
  return axes
    .map((axis, i) => {
      const angle = -90 + i * (360 / axes.length);
      const v = values[axis.key];
      const r = normalize(v, axis.min, axis.max) * radius;
      const p = pointFor(angle, r, cx, cy);
      return `${p.x.toFixed(2)},${p.y.toFixed(2)}`;
    })
    .join(' ');
}

// Tooltip body for a hovered axis. Shows both values; active is highlighted.
function AxisTooltipBody({
  axis,
  values,
  compareValues,
  activeFocus,
  currentLabel,
  compareLabel,
  hasCompare,
}) {
  const fmt = (v) => `${axis.format(v)}${axis.suffix ? ' ' + axis.suffix : ''}`;
  const userActive = activeFocus === 'current';
  const cmpActive = activeFocus === 'compare';
  return (
    <>
      <TipTitle>{axis.label}</TipTitle>
      <TipText>{axis.description}</TipText>
      <div className="skill-radar-tip-rows">
        <div
          className={`skill-radar-tip-row${userActive ? ' active' : ''}`}
        >
          <span
            className="skill-radar-tip-swatch"
            style={{ background: 'var(--accent)' }}
          />
          <span className="skill-radar-tip-label">{currentLabel}</span>
          <span
            className="skill-radar-tip-value"
            style={{ color: userActive ? 'var(--accent)' : 'var(--text-muted)' }}
          >
            {fmt(values[axis.key])}
          </span>
        </div>
        {compareValues != null && (
          <div
            className={`skill-radar-tip-row${cmpActive ? ' active' : ''}`}
          >
            <span
              className="skill-radar-tip-swatch skill-radar-tip-swatch-dashed"
            />
            <span className="skill-radar-tip-label">{compareLabel}</span>
            <span
              className="skill-radar-tip-value"
              style={{ color: cmpActive ? '#5b9eff' : 'var(--text-muted)' }}
            >
              {fmt(compareValues[axis.key])}
            </span>
          </div>
        )}
      </div>
      <TipHint>
        Range: {fmt(axis.min)} – {fmt(axis.max)}
        {hasCompare ? ' · click to switch focus' : ''}
      </TipHint>
    </>
  );
}

export default function SkillRadar({
  stats,
  compareStats,
  axisRanges,
  currentLabel = 'this session',
  compareLabel = 'global avg',
  title = 'Skill Radar',
}) {
  const size = 360;
  const cx = size / 2;
  const cy = size / 2;
  const radius = size / 2 - 65; // slightly tighter so HTML cards don't clip
  const angleStep = 360 / AXES.length;

  const axes = AXES.map((axis) => {
    const range = axisRanges?.[axis.rangeKey];
    let min = axis.defaultMin;
    let max = axis.defaultMax;
    if (range && typeof range.max === 'number' && range.max > (range.min ?? 0)) {
      min = range.min ?? 0;
      max = range.max;
    }
    // Accuracy is bounded by its theoretical maximum, not whatever the highest
    // session happened to reach.
    if (axis.key === 'accuracy') {
      max = 100;
    }
    return { ...axis, min, max };
  });

  const values = getValues(stats);
  const compareValues = compareStats ? getValues(compareStats) : null;
  const hasCompare = !!compareValues;

  const [activeFocus, setActiveFocus] = useState('current');
  const toggleFocus = () => {
    if (!hasCompare) return;
    setActiveFocus((prev) => (prev === 'current' ? 'compare' : 'current'));
  };

  if (!values) return null;

  const gridLevels = [0.25, 0.5, 0.75, 1.0];

  // Pre-compute card + corner positions (in % of svg viewBox, for HTML overlay layout)
  const labelCards = axes.map((axis, i) => {
    const angle = -90 + i * angleStep;
    const cardCenter = pointFor(angle, radius + 32, cx, cy);
    const cornerP = pointFor(angle, radius, cx, cy);
    const cosA = Math.cos((angle * Math.PI) / 180);
    const sinA = Math.sin((angle * Math.PI) / 180);
    // Translate so the card sits OUTSIDE the radar, anchored toward the radar
    const tx = -50 + cosA * 50;
    const ty = -50 + sinA * 50;
    let textAlign = 'center';
    if (cosA > 0.3) textAlign = 'left';
    else if (cosA < -0.3) textAlign = 'right';
    return {
      axis,
      idx: i,
      xPct: (cardCenter.x / size) * 100,
      yPct: (cardCenter.y / size) * 100,
      cornerXPct: (cornerP.x / size) * 100,
      cornerYPct: (cornerP.y / size) * 100,
      transform: `translate(${tx}%, ${ty}%)`,
      textAlign,
    };
  });

  // Polygon styling based on activeFocus
  const currentActive = activeFocus === 'current';
  const compareActive = activeFocus === 'compare';

  return (
    <div className="skill-radar">
      <div className="section-header-row">
        <h3>{title}</h3>
        <div className="header-controls">
          <Tooltip content={HELP_CONTENT}>
            <button className="help-btn" type="button" aria-label="Help">
              ?
            </button>
          </Tooltip>
        </div>
      </div>
      <div className="skill-radar-wrap">
        <svg
          viewBox={`0 0 ${size} ${size}`}
          className="skill-radar-svg"
          role="img"
          aria-label="skill radar chart"
        >
          {/* Background grid pentagons */}
          {gridLevels.map((level, i) => {
            const points = axes
              .map((_, j) => {
                const angle = -90 + j * angleStep;
                const p = pointFor(angle, radius * level, cx, cy);
                return `${p.x.toFixed(2)},${p.y.toFixed(2)}`;
              })
              .join(' ');
            return (
              <polygon
                key={`grid-${i}`}
                points={points}
                fill="none"
                stroke="var(--bg-tertiary)"
                strokeWidth={i === gridLevels.length - 1 ? 1.5 : 1}
              />
            );
          })}

          {/* Axis spokes */}
          {axes.map((_, i) => {
            const angle = -90 + i * angleStep;
            const p = pointFor(angle, radius, cx, cy);
            return (
              <line
                key={`axis-${i}`}
                x1={cx}
                y1={cy}
                x2={p.x}
                y2={p.y}
                stroke="var(--bg-tertiary)"
                strokeWidth="1"
              />
            );
          })}

          {/* Comparison polygon */}
          {compareValues && (
            <polygon
              points={polygonPoints(compareValues, axes, cx, cy, radius)}
              fill={
                compareActive
                  ? 'rgba(91, 158, 255, 0.32)'
                  : 'rgba(91, 158, 255, 0.12)'
              }
              stroke="#5b9eff"
              strokeWidth={compareActive ? 2.5 : 1.5}
              strokeDasharray="5 3"
              opacity={compareActive ? 1 : 0.6}
              style={{
                filter: compareActive
                  ? 'drop-shadow(0 0 6px rgba(91, 158, 255, 0.35))'
                  : 'none',
                transition: 'opacity 0.2s, stroke-width 0.2s',
              }}
            />
          )}

          {/* Current polygon */}
          <polygon
            points={polygonPoints(values, axes, cx, cy, radius)}
            fill={
              currentActive
                ? 'rgba(226, 183, 20, 0.32)'
                : 'rgba(226, 183, 20, 0.14)'
            }
            stroke="var(--accent)"
            strokeWidth={currentActive ? 2.5 : 1.5}
            opacity={currentActive ? 1 : 0.6}
            style={{
              filter: currentActive
                ? 'drop-shadow(0 0 6px rgba(226, 183, 20, 0.35))'
                : 'none',
              transition: 'opacity 0.2s, stroke-width 0.2s',
            }}
          />

          {/* Comparison vertex dots */}
          {compareValues &&
            axes.map((axis, i) => {
              const angle = -90 + i * angleStep;
              const r =
                normalize(compareValues[axis.key], axis.min, axis.max) * radius;
              const p = pointFor(angle, r, cx, cy);
              return (
                <circle
                  key={`cmp-dot-${i}`}
                  cx={p.x}
                  cy={p.y}
                  r="3"
                  fill="#5b9eff"
                  opacity={compareActive ? 1 : 0.55}
                />
              );
            })}

          {/* Current vertex dots */}
          {axes.map((axis, i) => {
            const angle = -90 + i * angleStep;
            const r = normalize(values[axis.key], axis.min, axis.max) * radius;
            const p = pointFor(angle, r, cx, cy);
            return (
              <circle
                key={`dot-${i}`}
                cx={p.x}
                cy={p.y}
                r="4"
                fill="var(--accent)"
                stroke="var(--bg-secondary)"
                strokeWidth="1.5"
                opacity={currentActive ? 1 : 0.55}
              />
            );
          })}
        </svg>

        {/* HTML label cards — each axis's label + value lives in its own div */}
        {labelCards.map(({ axis, idx, xPct, yPct, transform, textAlign }) => (
          <Tooltip
            key={`card-${idx}`}
            followMouse
            content={
              <AxisTooltipBody
                axis={axis}
                values={values}
                compareValues={compareValues}
                activeFocus={activeFocus}
                currentLabel={currentLabel}
                compareLabel={compareLabel}
                hasCompare={hasCompare}
              />
            }
          >
            <div
              className="skill-radar-axis-card"
              style={{
                left: `${xPct}%`,
                top: `${yPct}%`,
                transform,
                textAlign,
              }}
              onClick={toggleFocus}
              role={hasCompare ? 'button' : undefined}
              tabIndex={hasCompare ? 0 : undefined}
              onKeyDown={
                hasCompare
                  ? (e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        toggleFocus();
                      }
                    }
                  : undefined
              }
            >
              <div className="skill-radar-axis-label">{axis.label}</div>
              <div className="skill-radar-axis-value">
                <span
                  className="skill-radar-axis-value-num"
                  style={{
                    color:
                      activeFocus === 'current'
                        ? 'var(--accent)'
                        : '#5b9eff',
                  }}
                >
                  {axis.format(
                    activeFocus === 'current' || !compareValues
                      ? values[axis.key]
                      : compareValues[axis.key]
                  )}
                </span>
                {axis.suffix && (
                  <span className="skill-radar-axis-value-unit">
                    {axis.suffix}
                  </span>
                )}
              </div>
            </div>
          </Tooltip>
        ))}

        {/* Pentagon-corner hover zones — explain what the outer ring max means */}
        {labelCards.map(({ axis, idx, cornerXPct, cornerYPct }) => {
          const isCappedAt100 = axis.key === 'accuracy';
          return (
            <Tooltip
              key={`corner-${idx}`}
              followMouse
              content={
                <>
                  <TipTitle>{axis.label} max</TipTitle>
                  <TipText>
                    {isCappedAt100
                      ? 'Theoretical maximum: '
                      : 'Current global record: '}
                    <span
                      style={{ color: 'var(--accent)', fontWeight: 600 }}
                    >
                      {axis.format(axis.max)}
                      {axis.suffix ? ' ' + axis.suffix : ''}
                    </span>
                  </TipText>
                  <TipText>
                    The outer ring of this axis represents this value.
                  </TipText>
                  <TipHint>The center of the radar = global minimum</TipHint>
                </>
              }
            >
              <div
                className="skill-radar-corner-zone"
                style={{
                  left: `${cornerXPct}%`,
                  top: `${cornerYPct}%`,
                }}
              />
            </Tooltip>
          );
        })}
      </div>

      <div className="skill-radar-legend">
        <span
          className={`skill-radar-legend-item${currentActive ? ' active' : ''}`}
          onClick={() => setActiveFocus('current')}
          role={hasCompare ? 'button' : undefined}
          tabIndex={hasCompare ? 0 : undefined}
        >
          <span
            className="skill-radar-legend-dot"
            style={{ background: 'var(--accent)' }}
          />
          {currentLabel}
        </span>
        {compareValues && (
          <span
            className={`skill-radar-legend-item${compareActive ? ' active' : ''}`}
            onClick={() => setActiveFocus('compare')}
            role="button"
            tabIndex={0}
          >
            <span className="skill-radar-legend-dot skill-radar-legend-dashed" />
            {compareLabel}
          </span>
        )}
      </div>
    </div>
  );
}
