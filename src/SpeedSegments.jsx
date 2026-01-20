import { useMemo, useState, useRef, useEffect } from 'react'
import { Tooltip } from './Tooltip'

// Tooltip content
const TipTitle = ({ children }) => <div className="tooltip-title">{children}</div>
const TipText = ({ children }) => <p className="tooltip-text">{children}</p>
const TipHint = ({ children }) => <p className="tooltip-hint">{children}</p>

const SPEED_FLOW_TIP = (
  <>
    <TipTitle>Speed Flow</TipTitle>
    <TipText>
      Visualizes your typing rhythm throughout the paragraph. Each segment 
      represents a continuous stretch of similar-speed keystrokes.
    </TipText>
    <TipText>
      • <span style={{ color: "#98c379" }}>Green</span> = fast bursts (&lt;70% of avg)
    </TipText>
    <TipText>
      • <span style={{ color: "#888" }}>Gray</span> = normal pace
    </TipText>
    <TipText>
      • <span style={{ color: "#e06c75" }}>Red</span> = pauses/slow (&gt;150% of avg)
    </TipText>
    <TipHint>Hover segments to see where in the text</TipHint>
  </>
)

// Speed Segments - shows what % of typing was fast bursts vs pauses
const SpeedSegments = ({ intervals, text }) => {
  const [hoveredSegment, setHoveredSegment] = useState(null)
  const highlightRef = useRef(null)
  const previewRef = useRef(null)
  
  // Auto-scroll to highlighted text
  useEffect(() => {
    if (hoveredSegment && highlightRef.current && previewRef.current) {
      const container = previewRef.current
      const highlight = highlightRef.current
      const containerRect = container.getBoundingClientRect()
      const highlightRect = highlight.getBoundingClientRect()
      
      // Check if highlight is outside visible area
      const relativeLeft = highlightRect.left - containerRect.left + container.scrollLeft
      const relativeRight = relativeLeft + highlightRect.width
      
      // Scroll to center the highlight
      const targetScroll = relativeLeft - (containerRect.width / 2) + (highlightRect.width / 2)
      container.scrollTo({ left: Math.max(0, targetScroll), behavior: 'smooth' })
    }
  }, [hoveredSegment])
  
  const analysis = useMemo(() => {
    if (!intervals || intervals.length < 5) {
      return null
    }
    
    const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length
    
    // Classify each keystroke
    const classified = intervals.map((d, i) => ({
      type: d < avg * 0.7 ? 'burst' : d > avg * 1.5 ? 'pause' : 'normal',
      interval: d,
      index: i
    }))
    
    // Group into segments with timing info
    const segments = []
    let currentType = classified[0].type
    let segmentIntervals = [classified[0].interval]
    let startIndex = 0
    
    classified.forEach((item, i) => {
      if (i === 0) return
      if (item.type === currentType) {
        segmentIntervals.push(item.interval)
      } else {
        const segAvg = segmentIntervals.reduce((a, b) => a + b, 0) / segmentIntervals.length
        segments.push({ 
          type: currentType, 
          width: segmentIntervals.length,
          avgInterval: Math.round(segAvg),
          keystrokes: segmentIntervals.length,
          startIndex
        })
        currentType = item.type
        segmentIntervals = [item.interval]
        startIndex = i
      }
    })
    // Push final segment
    const segAvg = segmentIntervals.reduce((a, b) => a + b, 0) / segmentIntervals.length
    segments.push({ 
      type: currentType, 
      width: segmentIntervals.length,
      avgInterval: Math.round(segAvg),
      keystrokes: segmentIntervals.length,
      startIndex
    })
    
    const totalWidth = segments.reduce((a, s) => a + s.width, 0)
    
    const burstPercent = Math.round(classified.filter(c => c.type === 'burst').length / intervals.length * 100)
    const pausePercent = Math.round(classified.filter(c => c.type === 'pause').length / intervals.length * 100)
    
    return { segments, totalWidth, burstPercent, pausePercent, avg: Math.round(avg) }
  }, [intervals])
  
  if (!analysis) {
    return null
  }
  
  const { segments, totalWidth, burstPercent, pausePercent } = analysis
  
  const getTypeLabel = (type) => {
    if (type === 'burst') return 'Fast'
    if (type === 'pause') return 'Slow'
    return 'Normal'
  }
  
  // Build paragraph with segments for highlighting
  const renderParagraphWithHighlight = () => {
    if (!text) return null
    
    // Build ranges for all segments
    const segmentRanges = segments.map(seg => ({
      start: seg.startIndex,
      end: seg.startIndex + seg.keystrokes,
      type: seg.type,
      isHovered: hoveredSegment === seg
    }))
    
    // Render character by character with appropriate styling
    const chars = text.split('')
    let result = []
    let i = 0
    
    for (const range of segmentRanges) {
      // Add any characters before this segment (shouldn't happen normally)
      if (i < range.start) {
        result.push(
          <span key={`pre-${i}`} className="para-text-dim">
            {chars.slice(i, range.start).join('')}
          </span>
        )
        i = range.start
      }
      
      // Add the segment
      const segmentText = chars.slice(range.start, range.end).join('')
      if (range.isHovered) {
        result.push(
          <span 
            key={`seg-${range.start}`} 
            ref={highlightRef}
            className={`para-highlight ${range.type}`}
          >
            {segmentText}
          </span>
        )
      } else {
        result.push(
          <span key={`seg-${range.start}`} className="para-text-dim">
            {segmentText}
          </span>
        )
      }
      i = range.end
    }
    
    // Add remaining characters
    if (i < chars.length) {
      result.push(
        <span key={`post-${i}`} className="para-text-dim">
          {chars.slice(i).join('')}
        </span>
      )
    }
    
    return result
  }
  
  return (
    <div className="speed-segments">
      <div className="speed-segments-header">
        <div className="speed-segments-title-row">
          <span className="speed-segments-title">Speed Flow</span>
          {hoveredSegment && (
            <span className="speed-segments-hover-info">
              <span className={`hover-type ${hoveredSegment.type}`}>{getTypeLabel(hoveredSegment.type)}</span>
              <span className="hover-detail hover-keys">{hoveredSegment.keystrokes} keys</span>
              <span className="hover-detail hover-time">{hoveredSegment.avgInterval}ms</span>
            </span>
          )}
        </div>
        <Tooltip content={SPEED_FLOW_TIP}>
          <button className="help-btn" type="button" aria-label="Help">?</button>
        </Tooltip>
      </div>
      
      {/* Full paragraph preview with highlighting */}
      {text && (
        <div className="speed-segments-para-preview" ref={previewRef}>
          {renderParagraphWithHighlight()}
        </div>
      )}
      
      <div className="speed-segments-bar-container">
        <div className="speed-segments-bar">
          {segments.map((seg, i) => (
            <div
              key={i}
              className={`speed-segment ${seg.type} ${hoveredSegment === seg ? 'hovered' : ''}`}
              style={{
                width: `${(seg.width / totalWidth) * 100}%`,
              }}
              onMouseEnter={() => setHoveredSegment(seg)}
              onMouseLeave={() => setHoveredSegment(null)}
            />
          ))}
        </div>
      </div>
      
      <div className="speed-segments-legend">
        <span className="legend-item burst">
          <span className="legend-dot"></span>
          Bursts: {burstPercent}%
        </span>
        <span className="legend-item normal">
          <span className="legend-dot"></span>
          Normal
        </span>
        <span className="legend-item pause">
          <span className="legend-dot"></span>
          Pauses: {pausePercent}%
        </span>
      </div>
    </div>
  )
}

export default SpeedSegments
