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
      • <span style={{ color: "#98c379" }}>Green</span> = fast bursts (&lt;70% of avg interval)
    </TipText>
    <TipText>
      • <span style={{ color: "#888" }}>Gray</span> = normal pace
    </TipText>
    <TipText>
      • <span style={{ color: "#e06c75" }}>Red</span> = pauses/slow (&gt;150% of avg interval)
    </TipText>
    <TipText>
      Hover over segments or text to see details. The numbers shown are 
      individual keystroke intervals in milliseconds.
    </TipText>
    <TipHint>Lower ms = faster typing</TipHint>
  </>
)

// Speed Segments - shows what % of typing was fast bursts vs pauses
const SpeedSegments = ({ intervals, text }) => {
  const [hoveredSegmentIndex, setHoveredSegmentIndex] = useState(null)
  const [hoverSource, setHoverSource] = useState(null) // 'bar' or 'text'
  const highlightRef = useRef(null)
  const previewRef = useRef(null)
  
  // Auto-scroll to highlighted text only when hovering from bar
  useEffect(() => {
    if (hoveredSegmentIndex !== null && hoverSource === 'bar' && highlightRef.current && previewRef.current) {
      const container = previewRef.current
      const highlight = highlightRef.current
      const containerRect = container.getBoundingClientRect()
      const highlightRect = highlight.getBoundingClientRect()
      
      // Scroll to center the highlight
      const relativeLeft = highlightRect.left - containerRect.left + container.scrollLeft
      const targetScroll = relativeLeft - (containerRect.width / 2) + (highlightRect.width / 2)
      container.scrollTo({ left: Math.max(0, targetScroll), behavior: 'smooth' })
    }
  }, [hoveredSegmentIndex, hoverSource])
  
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
          startIndex,
          intervals: [...segmentIntervals] // Store individual intervals
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
      startIndex,
      intervals: [...segmentIntervals]
    })
    
    const totalWidth = segments.reduce((a, s) => a + s.width, 0)
    
    const burstPercent = Math.round(classified.filter(c => c.type === 'burst').length / intervals.length * 100)
    const pausePercent = Math.round(classified.filter(c => c.type === 'pause').length / intervals.length * 100)
    
    // Create char-to-segment mapping for bidirectional hover
    const charToSegment = []
    segments.forEach((seg, segIndex) => {
      for (let i = seg.startIndex; i < seg.startIndex + seg.keystrokes; i++) {
        charToSegment[i] = segIndex
      }
    })
    
    return { segments, totalWidth, burstPercent, pausePercent, avg: Math.round(avg), charToSegment }
  }, [intervals])
  
  if (!analysis) {
    return null
  }
  
  const { segments, totalWidth, burstPercent, pausePercent, charToSegment } = analysis
  
  const hoveredSegment = hoveredSegmentIndex !== null ? segments[hoveredSegmentIndex] : null
  
  const getTypeLabel = (type) => {
    if (type === 'burst') return 'Fast'
    if (type === 'pause') return 'Slow'
    return 'Normal'
  }
  
  // Format per-key intervals for display
  const formatKeyIntervals = (seg) => {
    if (!seg || !seg.intervals) return null
    // Show up to 8 intervals, then summarize
    const display = seg.intervals.slice(0, 8)
    const remaining = seg.intervals.length - 8
    return (
      <span className="hover-key-intervals">
        {display.map((ms, i) => (
          <span key={i} className="key-interval">{Math.round(ms)}</span>
        ))}
        {remaining > 0 && <span className="key-interval more">+{remaining}</span>}
      </span>
    )
  }
  
  // Build paragraph with segments for highlighting
  const renderParagraphWithHighlight = () => {
    if (!text) return null
    
    const chars = text.split('')
    let result = []
    let i = 0
    
    segments.forEach((seg, segIndex) => {
      // Add any characters before this segment
      if (i < seg.startIndex) {
        result.push(
          <span key={`pre-${i}`} className="para-text-dim">
            {chars.slice(i, seg.startIndex).join('')}
          </span>
        )
        i = seg.startIndex
      }
      
      // Add the segment (interactive)
      const segmentText = chars.slice(seg.startIndex, seg.startIndex + seg.keystrokes).join('')
      const isHovered = hoveredSegmentIndex === segIndex
      result.push(
        <span 
          key={`seg-${seg.startIndex}`} 
          ref={isHovered ? highlightRef : null}
          className={`para-segment ${isHovered ? `para-highlight ${seg.type}` : 'para-text-dim'}`}
          onMouseEnter={() => { setHoveredSegmentIndex(segIndex); setHoverSource('text'); }}
          onMouseLeave={() => { setHoveredSegmentIndex(null); setHoverSource(null); }}
        >
          {segmentText}
        </span>
      )
      i = seg.startIndex + seg.keystrokes
    })
    
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
          {hoveredSegment ? (
            <span className="speed-segments-hover-info">
              <span className={`hover-type ${hoveredSegment.type}`}>{getTypeLabel(hoveredSegment.type)}</span>
              <span className="hover-detail hover-keys">{hoveredSegment.keystrokes} keys</span>
              <span className="hover-detail hover-time">{hoveredSegment.avgInterval}ms</span>
              {formatKeyIntervals(hoveredSegment)}
            </span>
          ) : null}
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
              className={`speed-segment ${seg.type} ${hoveredSegmentIndex === i ? 'hovered' : ''}`}
              style={{
                width: `${(seg.width / totalWidth) * 100}%`,
              }}
              onMouseEnter={() => { setHoveredSegmentIndex(i); setHoverSource('bar'); }}
              onMouseLeave={() => { setHoveredSegmentIndex(null); setHoverSource(null); }}
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
