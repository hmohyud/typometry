import { useMemo, useState } from 'react'

// Keyboard layout for rendering
const KEYBOARD_ROWS = [
  ['`', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '='],
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p', '[', ']', '\\'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ';', "'"],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '/'],
  [' ']
]

const ROW_OFFSETS = [0, 0.5, 0.75, 1.25, 3.5]
const KEY_WIDTH = 32
const KEY_HEIGHT = 32
const KEY_GAP = 4

// Key coordinates for arrow drawing
const KEY_COORDS = {}
KEYBOARD_ROWS.forEach((row, rowIndex) => {
  let x = ROW_OFFSETS[rowIndex] * (KEY_WIDTH + KEY_GAP)
  row.forEach((key) => {
    const width = key === ' ' ? KEY_WIDTH * 6 + KEY_GAP * 5 : KEY_WIDTH
    KEY_COORDS[key] = {
      x: x + width / 2,
      y: rowIndex * (KEY_HEIGHT + KEY_GAP) + KEY_HEIGHT / 2,
      width
    }
    KEY_COORDS[key.toUpperCase()] = KEY_COORDS[key]
    x += width + KEY_GAP
  })
})

// Color interpolation
const interpolateColor = (value, min, max, coldColor, hotColor) => {
  const ratio = Math.min(1, Math.max(0, (value - min) / (max - min || 1)))
  const cold = coldColor.match(/\d+/g).map(Number)
  const hot = hotColor.match(/\d+/g).map(Number)
  const r = Math.round(cold[0] + (hot[0] - cold[0]) * ratio)
  const g = Math.round(cold[1] + (hot[1] - cold[1]) * ratio)
  const b = Math.round(cold[2] + (hot[2] - cold[2]) * ratio)
  return `rgb(${r}, ${g}, ${b})`
}

export const KeyboardHeatmap = ({ keyStats, mode = 'speed' }) => {
  const [hoveredKey, setHoveredKey] = useState(null)
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
  
  const { colors } = useMemo(() => {
    if (!keyStats || Object.keys(keyStats).length === 0) {
      return { colors: {} }
    }
    
    const values = Object.values(keyStats).map(s => 
      mode === 'speed' ? s.avgInterval : (s.accuracy !== undefined ? s.accuracy : 1)
    )
    const max = Math.max(...values)
    const min = Math.min(...values)
    
    const cols = {}
    Object.entries(keyStats).forEach(([key, stats]) => {
      const val = mode === 'speed' ? stats.avgInterval : (stats.accuracy !== undefined ? stats.accuracy : 1)
      // For speed: slower (high value) = red, faster (low value) = green
      // For accuracy: high accuracy = green, low accuracy = red
      let coldColor, hotColor
      if (mode === 'speed') {
        coldColor = 'rgb(110, 207, 110)'  // green for fast (low ms)
        hotColor = 'rgb(232, 92, 92)'     // red for slow (high ms)
      } else {
        // Accuracy: low value (0) = red, high value (1) = green
        coldColor = 'rgb(232, 92, 92)'    // red for low accuracy
        hotColor = 'rgb(110, 207, 110)'   // green for high accuracy
      }
      cols[key.toLowerCase()] = interpolateColor(val, min, max, coldColor, hotColor)
    })
    
    return { colors: cols }
  }, [keyStats, mode])

  const totalWidth = 14 * (KEY_WIDTH + KEY_GAP)
  const totalHeight = 5 * (KEY_HEIGHT + KEY_GAP)
  
  const handleMouseMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    setMousePos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    })
  }
  
  // Get color for a value on the green-red scale
  const getSpeedColor = (avgInterval) => {
    if (!keyStats || Object.keys(keyStats).length === 0) return 'var(--text)'
    const speeds = Object.values(keyStats).map(s => s.avgInterval).filter(v => v > 0)
    if (speeds.length === 0) return 'var(--text)'
    const min = Math.min(...speeds)
    const max = Math.max(...speeds)
    if (max === min) return 'rgb(110, 207, 110)'
    const ratio = (avgInterval - min) / (max - min)
    // Green (fast) to red (slow)
    if (ratio < 0.5) {
      const r = Math.round(110 + 122 * ratio * 2)
      const g = Math.round(207 - 24 * ratio * 2)
      const b = Math.round(110 - 90 * ratio * 2)
      return `rgb(${r},${g},${b})`
    } else {
      const r = Math.round(232)
      const g = Math.round(183 - 91 * (ratio - 0.5) * 2)
      const b = Math.round(20 + 72 * (ratio - 0.5) * 2)
      return `rgb(${r},${g},${b})`
    }
  }
  
  const getAccuracyColor = (accuracy) => {
    // Green (high accuracy) to red (low accuracy)
    if (accuracy >= 0.95) return 'rgb(110, 207, 110)'
    if (accuracy >= 0.9) return 'rgb(180, 195, 80)'
    if (accuracy >= 0.8) return 'rgb(226, 183, 20)'
    if (accuracy >= 0.7) return 'rgb(232, 140, 60)'
    return 'rgb(232, 92, 92)'
  }
  
  const hoveredStats = hoveredKey ? (keyStats?.[hoveredKey] || keyStats?.[hoveredKey.toLowerCase()]) : null

  return (
    <div className="keyboard-viz">
      <svg 
        width={totalWidth} 
        height={totalHeight} 
        viewBox={`0 0 ${totalWidth} ${totalHeight}`}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoveredKey(null)}
      >
        {KEYBOARD_ROWS.map((row, rowIndex) => {
          let x = ROW_OFFSETS[rowIndex] * (KEY_WIDTH + KEY_GAP)
          return row.map((key, keyIndex) => {
            const width = key === ' ' ? KEY_WIDTH * 6 + KEY_GAP * 5 : KEY_WIDTH
            const bgColor = colors[key.toLowerCase()] || 'var(--bg-tertiary)'
            const keyX = x
            x += width + KEY_GAP
            
            const label = key === ' ' ? 'space' : key
            
            return (
              <g 
                key={`${rowIndex}-${keyIndex}`}
                onMouseEnter={() => setHoveredKey(key)}
                style={{ cursor: 'default' }}
              >
                <rect
                  x={keyX}
                  y={rowIndex * (KEY_HEIGHT + KEY_GAP)}
                  width={width}
                  height={KEY_HEIGHT}
                  rx={4}
                  fill={bgColor}
                  stroke="var(--bg-secondary)"
                  strokeWidth={1}
                />
                <text
                  x={keyX + width / 2}
                  y={rowIndex * (KEY_HEIGHT + KEY_GAP) + KEY_HEIGHT / 2 + 1}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={key === ' ' ? 10 : 12}
                  fill="var(--text)"
                  opacity={0.8}
                  style={{ pointerEvents: 'none' }}
                >
                  {label}
                </text>
              </g>
            )
          })
        })}
      </svg>
      
      {/* Mouse-following tooltip */}
      {hoveredKey && hoveredStats && (
        <div 
          className="keyboard-key-tooltip"
          style={{
            position: 'absolute',
            left: mousePos.x + 12,
            top: mousePos.y + 12,
            background: 'rgba(30, 33, 36, 0.95)',
            border: '1px solid #444',
            borderRadius: '6px',
            padding: '0.4rem 0.6rem',
            pointerEvents: 'none',
            zIndex: 100,
            whiteSpace: 'nowrap',
            fontSize: '0.75rem',
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: '0.25rem', color: 'var(--text)' }}>
            {hoveredKey === ' ' ? 'space' : hoveredKey}
          </div>
          <div style={{ color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
            <span><span style={{ color: getSpeedColor(hoveredStats.avgInterval || 0), fontWeight: 500 }}>{Math.round(hoveredStats.avgInterval || 0)}ms</span> avg speed</span>
            <span><span style={{ color: getAccuracyColor(hoveredStats.accuracy || 1), fontWeight: 500 }}>{Math.round((hoveredStats.accuracy || 1) * 100)}%</span> accurate ({hoveredStats.errors || 0} errors)</span>
            <span><span style={{ color: 'var(--text)' }}>{hoveredStats.count || 0}</span> presses</span>
          </div>
        </div>
      )}
      
      <div className="keyboard-legend">
        <span className="legend-label">{mode === 'speed' ? 'fast' : 'accurate'}</span>
        <div className="legend-gradient" style={{
          background: 'linear-gradient(to right, rgb(110, 207, 110), rgb(232, 92, 92))'
        }} />
        <span className="legend-label">{mode === 'speed' ? 'slow' : 'error-prone'}</span>
      </div>
    </div>
  )
}

export const KeyboardFlowMap = ({ topBigrams = [], flowType = 'slow', mode = 'speed' }) => {
  // Original dimensions (will be scaled via viewBox and CSS)
  const fullWidth = 14 * (KEY_WIDTH + KEY_GAP)
  const fullHeight = 5 * (KEY_HEIGHT + KEY_GAP)
  
  // Display dimensions (smaller for side-by-side)
  const displayWidth = fullWidth * 0.65
  const displayHeight = fullHeight * 0.65

  const arrows = useMemo(() => {
    if (!topBigrams || topBigrams.length === 0) return []
    
    return topBigrams
      .filter(({ bigram }) => {
        const from = KEY_COORDS[bigram[0]]
        const to = KEY_COORDS[bigram[1]]
        return from && to && bigram[0] !== bigram[1]
      })
      .map(({ bigram, avg, accuracy }, index) => {
        const from = KEY_COORDS[bigram[0]]
        const to = KEY_COORDS[bigram[1]]
        
        // Calculate arrow with slight curve for visibility
        const dx = to.x - from.x
        const dy = to.y - from.y
        const len = Math.sqrt(dx * dx + dy * dy)
        
        // Shorten arrow to not overlap keys
        const shortenBy = 14
        const startX = from.x + (dx / len) * shortenBy
        const startY = from.y + (dy / len) * shortenBy
        const endX = to.x - (dx / len) * shortenBy
        const endY = to.y - (dy / len) * shortenBy
        
        // Control point for curve (perpendicular offset)
        const midX = (startX + endX) / 2
        const midY = (startY + endY) / 2
        const perpX = -dy / len * 15 * (index % 2 === 0 ? 1 : -1)
        const perpY = dx / len * 15 * (index % 2 === 0 ? 1 : -1)
        
        return {
          key: bigram,
          path: `M ${startX} ${startY} Q ${midX + perpX} ${midY + perpY} ${endX} ${endY}`,
          endX,
          endY,
          angle: Math.atan2(endY - (midY + perpY), endX - (midX + perpX)),
          avg,
          accuracy,
          opacity: 1 - (index * 0.15)
        }
      })
  }, [topBigrams])

  // Colors: green for good (fast/accurate), red for bad (slow/error-prone)
  const color = flowType === 'slow' ? 'var(--incorrect)' : 'var(--fast)'
  
  // Label based on mode
  let label
  if (mode === 'accuracy') {
    label = flowType === 'slow' ? 'error-prone' : 'most accurate'
  } else {
    label = flowType === 'slow' ? 'slowest' : 'fastest'
  }

  return (
    <div className="keyboard-viz flow-viz">
      <svg width={displayWidth} height={displayHeight} viewBox={`0 0 ${fullWidth} ${fullHeight}`} preserveAspectRatio="xMidYMid meet">
        {/* Draw keys first */}
        {KEYBOARD_ROWS.map((row, rowIndex) => {
          let x = ROW_OFFSETS[rowIndex] * (KEY_WIDTH + KEY_GAP)
          return row.map((key, keyIndex) => {
            const width = key === ' ' ? KEY_WIDTH * 6 + KEY_GAP * 5 : KEY_WIDTH
            const keyX = x
            x += width + KEY_GAP
            
            return (
              <rect
                key={`${rowIndex}-${keyIndex}`}
                x={keyX}
                y={rowIndex * (KEY_HEIGHT + KEY_GAP)}
                width={width}
                height={KEY_HEIGHT}
                rx={4}
                fill="var(--bg-tertiary)"
                stroke="var(--bg-secondary)"
                strokeWidth={1}
                opacity={0.5}
              />
            )
          })
        })}
        
        {/* Draw arrows */}
        <defs>
          <marker
            id={`arrow-${flowType}-${mode}`}
            markerWidth="8"
            markerHeight="8"
            refX="6"
            refY="4"
            orient="auto"
          >
            <path d="M 0 0 L 8 4 L 0 8 z" fill={color} />
          </marker>
        </defs>
        
        {arrows.map(({ key, path, opacity, avg, accuracy }) => (
          <g key={key}>
            <path
              d={path}
              fill="none"
              stroke={color}
              strokeWidth={2}
              opacity={opacity}
              markerEnd={`url(#arrow-${flowType}-${mode})`}
            />
            <title>{key[0]} → {key[1]}: {mode === 'accuracy' 
              ? `${Math.round((accuracy || 1) * 100)}% accurate` 
              : `${Math.round(avg)}ms avg`}</title>
          </g>
        ))}
      </svg>
      <p className="flow-label">{label} transitions</p>
    </div>
  )
}

export default KeyboardHeatmap
