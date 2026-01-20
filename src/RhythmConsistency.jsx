import { useMemo } from 'react'
import { Tooltip } from './Tooltip'

// Tooltip content for rhythm consistency
const TipTitle = ({ children }) => <div className="tooltip-title">{children}</div>
const TipText = ({ children }) => <p className="tooltip-text">{children}</p>
const TipHint = ({ children }) => <p className="tooltip-hint">{children}</p>

const RHYTHM_TIP = (
  <>
    <TipTitle>Rhythm Consistency</TipTitle>
    <TipText>
      Measures how steady your typing rhythm is. Based on the coefficient of 
      variation of your keystroke intervals.
    </TipText>
    <TipText>
      • <span style={{ color: "#98c379" }}>High score</span> = smooth, consistent timing
    </TipText>
    <TipText>
      • <span style={{ color: "#e06c75" }}>Low score</span> = erratic, lots of pauses and bursts
    </TipText>
    <TipHint>Fast typists typically have scores above 70%</TipHint>
  </>
)

// Calculate rhythm stats from intervals array or from pre-calculated values
const RhythmConsistency = ({ intervals, consistency, showStats = true, size = 'normal' }) => {
  const stats = useMemo(() => {
    // If we have intervals, calculate everything fresh
    if (intervals && intervals.length > 0) {
      const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length
      const variance = intervals.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / intervals.length
      const stdDev = Math.sqrt(variance)
      const cv = stdDev / avg // Coefficient of variation
      const consistencyScore = Math.max(0, Math.min(100, Math.round((1 - cv) * 100)))
      
      // Count pauses (intervals > 400ms)
      const pauses = intervals.filter(d => d > 400).length
      
      return {
        consistencyScore,
        avgInterval: Math.round(avg),
        stdDev: Math.round(stdDev),
        pauses,
      }
    }
    
    // Otherwise use pre-calculated consistency value
    return {
      consistencyScore: Math.round(consistency || 0),
      avgInterval: null,
      stdDev: null,
      pauses: null,
    }
  }, [intervals, consistency])
  
  const { consistencyScore, stdDev, pauses } = stats
  
  const isSmall = size === 'small'
  const radius = isSmall ? 28 : 36
  const svgSize = isSmall ? 70 : 90
  const fontSize = isSmall ? 14 : 18
  const labelSize = isSmall ? 8 : 9
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (consistencyScore / 100) * circumference
  
  const getColor = (score) => {
    if (score >= 70) return 'var(--fast, #98c379)'
    if (score >= 50) return '#e5c07b'
    return 'var(--incorrect, #e06c75)'
  }
  
  const getLabel = (score) => {
    if (score >= 80) return 'metronomic'
    if (score >= 70) return 'smooth'
    if (score >= 55) return 'steady'
    if (score >= 40) return 'variable'
    return 'erratic'
  }
  
  return (
    <div className={`rhythm-consistency ${isSmall ? 'small' : ''}`}>
      <div className="rhythm-header">
        <span className="rhythm-title">Rhythm</span>
        <Tooltip content={RHYTHM_TIP}>
          <button className="help-btn" type="button" aria-label="Help">
            ?
          </button>
        </Tooltip>
      </div>
      
      <div className="rhythm-content">
        <svg width={svgSize} height={svgSize} viewBox={`0 0 ${svgSize} ${svgSize}`} className="rhythm-ring">
          <circle
            cx={svgSize/2} cy={svgSize/2} r={radius}
            fill="none"
            stroke="var(--bg-tertiary, #333)"
            strokeWidth={isSmall ? 5 : 6}
          />
          <circle
            cx={svgSize/2} cy={svgSize/2} r={radius}
            fill="none"
            stroke={getColor(consistencyScore)}
            strokeWidth={isSmall ? 5 : 6}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            transform={`rotate(-90 ${svgSize/2} ${svgSize/2})`}
            style={{ transition: 'stroke-dashoffset 0.5s ease' }}
          />
          <text 
            x={svgSize/2} y={svgSize/2 - 4} 
            textAnchor="middle" 
            dominantBaseline="middle"
            fill="var(--text-primary, #ccc)"
            fontSize={fontSize}
            fontWeight="600"
          >
            {consistencyScore}%
          </text>
          <text 
            x={svgSize/2} y={svgSize/2 + (isSmall ? 10 : 14)} 
            textAnchor="middle" 
            dominantBaseline="middle"
            fill="var(--text-muted, #888)"
            fontSize={labelSize}
          >
            {getLabel(consistencyScore)}
          </text>
        </svg>
        
        {showStats && (stdDev !== null || pauses !== null) && (
          <div className="rhythm-stats">
            {stdDev !== null && (
              <div className="rhythm-stat">
                <span className="rhythm-stat-label">std dev</span>
                <span className="rhythm-stat-value">{stdDev}ms</span>
              </div>
            )}
            {pauses !== null && (
              <div className="rhythm-stat">
                <span className="rhythm-stat-label">pauses</span>
                <span className="rhythm-stat-value" style={{ color: pauses > 10 ? 'var(--incorrect, #e06c75)' : 'inherit' }}>
                  {pauses}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default RhythmConsistency
