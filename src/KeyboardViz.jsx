import { useMemo } from 'react'

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
  const { colors, maxVal, minVal } = useMemo(() => {
    if (!keyStats || Object.keys(keyStats).length === 0) {
      return { colors: {}, maxVal: 0, minVal: 0 }
    }
    
    const values = Object.values(keyStats).map(s => 
      mode === 'speed' ? s.avgInterval : s.count
    )
    const max = Math.max(...values)
    const min = Math.min(...values)
    
    const cols = {}
    Object.entries(keyStats).forEach(([key, stats]) => {
      const val = mode === 'speed' ? stats.avgInterval : stats.count
      // For speed: slower = hotter (red), faster = cooler (green)
      // For frequency: more = hotter
      const coldColor = mode === 'speed' ? 'rgb(110, 207, 110)' : 'rgb(30, 30, 30)'
      const hotColor = mode === 'speed' ? 'rgb(232, 92, 92)' : 'rgb(226, 183, 20)'
      cols[key.toLowerCase()] = interpolateColor(val, min, max, coldColor, hotColor)
    })
    
    return { colors: cols, maxVal: max, minVal: min }
  }, [keyStats, mode])

  const totalWidth = 14 * (KEY_WIDTH + KEY_GAP)
  const totalHeight = 5 * (KEY_HEIGHT + KEY_GAP)

  return (
    <div className="keyboard-viz">
      <svg width={totalWidth} height={totalHeight} viewBox={`0 0 ${totalWidth} ${totalHeight}`}>
        {KEYBOARD_ROWS.map((row, rowIndex) => {
          let x = ROW_OFFSETS[rowIndex] * (KEY_WIDTH + KEY_GAP)
          return row.map((key, keyIndex) => {
            const width = key === ' ' ? KEY_WIDTH * 6 + KEY_GAP * 5 : KEY_WIDTH
            const bgColor = colors[key.toLowerCase()] || 'var(--bg-tertiary)'
            const keyX = x
            x += width + KEY_GAP
            
            const stats = keyStats?.[key] || keyStats?.[key.toLowerCase()]
            const label = key === ' ' ? 'space' : key
            
            return (
              <g key={`${rowIndex}-${keyIndex}`}>
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
                >
                  {label}
                </text>
                {stats && (
                  <title>
                    {key === ' ' ? 'space' : key}: {mode === 'speed' ? `${Math.round(stats.avgInterval)}ms avg` : `${stats.count} times`}
                  </title>
                )}
              </g>
            )
          })
        })}
      </svg>
      <div className="keyboard-legend">
        <span className="legend-label">{mode === 'speed' ? 'fast' : 'rare'}</span>
        <div className="legend-gradient" style={{
          background: mode === 'speed' 
            ? 'linear-gradient(to right, rgb(110, 207, 110), rgb(232, 92, 92))'
            : 'linear-gradient(to right, rgb(30, 30, 30), rgb(226, 183, 20))'
        }} />
        <span className="legend-label">{mode === 'speed' ? 'slow' : 'frequent'}</span>
      </div>
    </div>
  )
}

export const KeyboardFlowMap = ({ topBigrams = [], flowType = 'slow' }) => {
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
      .map(({ bigram, avg }, index) => {
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
          opacity: 1 - (index * 0.15)
        }
      })
  }, [topBigrams])

  const color = flowType === 'slow' ? 'var(--incorrect)' : 'var(--fast)'

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
            id={`arrow-${flowType}`}
            markerWidth="8"
            markerHeight="8"
            refX="6"
            refY="4"
            orient="auto"
          >
            <path d="M 0 0 L 8 4 L 0 8 z" fill={color} />
          </marker>
        </defs>
        
        {arrows.map(({ key, path, opacity, avg }) => (
          <g key={key}>
            <path
              d={path}
              fill="none"
              stroke={color}
              strokeWidth={2}
              opacity={opacity}
              markerEnd={`url(#arrow-${flowType})`}
            />
            <title>{key[0]} → {key[1]}: {Math.round(avg)}ms</title>
          </g>
        ))}
      </svg>
      <p className="flow-label">{flowType === 'slow' ? 'slowest' : 'fastest'} transitions</p>
    </div>
  )
}

export default KeyboardHeatmap
