import { useState, useEffect, useCallback, useRef } from 'react'
import sentences from './sentences.json'

// Flatten all paragraphs into one pool
const ALL_PARAGRAPHS = Object.values(sentences).flat()

// Get a random paragraph
const getRandomParagraph = () => {
  return ALL_PARAGRAPHS[Math.floor(Math.random() * ALL_PARAGRAPHS.length)]
}

// Mini sparkline component
const Sparkline = ({ data, width = 200, height = 40, color = '#e2b714' }) => {
  if (!data || data.length < 2) return null
  
  const max = Math.max(...data)
  const min = Math.min(...data)
  const range = max - min || 1
  
  const points = data.map((val, i) => {
    const x = (i / (data.length - 1)) * width
    const y = height - ((val - min) / range) * (height - 4) - 2
    return `${x},${y}`
  }).join(' ')
  
  return (
    <svg width={width} height={height} className="sparkline">
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="2"
        points={points}
      />
    </svg>
  )
}

// Histogram component
const Histogram = ({ data, width = 200, height = 60, bins = 15, color = '#e2b714' }) => {
  if (!data || data.length < 2) return null
  
  const max = Math.max(...data)
  const min = Math.min(...data)
  const binWidth = (max - min) / bins || 1
  
  // Create bins
  const histogram = Array(bins).fill(0)
  data.forEach(val => {
    const binIndex = Math.min(Math.floor((val - min) / binWidth), bins - 1)
    histogram[binIndex]++
  })
  
  const maxCount = Math.max(...histogram)
  const barWidth = width / bins - 2
  
  return (
    <svg width={width} height={height} className="histogram">
      {histogram.map((count, i) => {
        const barHeight = (count / maxCount) * (height - 10)
        return (
          <rect
            key={i}
            x={i * (width / bins) + 1}
            y={height - barHeight - 5}
            width={barWidth}
            height={barHeight}
            fill={color}
            opacity={0.7 + (count / maxCount) * 0.3}
          />
        )
      })}
    </svg>
  )
}

function App() {
  const [currentText, setCurrentText] = useState('')
  const [typed, setTyped] = useState('')
  const [isActive, setIsActive] = useState(false)
  const [isComplete, setIsComplete] = useState(false)
  const [keystrokeData, setKeystrokeData] = useState([])
  const [stats, setStats] = useState(null)
  
  const lastKeystrokeTime = useRef(null)
  const startTime = useRef(null)
  const containerRef = useRef(null)

  const resetTest = useCallback(() => {
    setCurrentText(getRandomParagraph())
    setTyped('')
    setIsActive(false)
    setIsComplete(false)
    setKeystrokeData([])
    setStats(null)
    lastKeystrokeTime.current = null
    startTime.current = null
    containerRef.current?.focus()
  }, [])

  useEffect(() => {
    resetTest()
  }, [])

  useEffect(() => {
    containerRef.current?.focus()
  }, [])

  const calculateStats = useCallback((data, totalTime) => {
    const intervals = data.map(d => d.interval).filter(i => i !== null)
    const avgInterval = intervals.length > 0 
      ? intervals.reduce((a, b) => a + b, 0) / intervals.length 
      : 0
    
    // Standard deviation
    const variance = intervals.length > 0
      ? intervals.reduce((sum, val) => sum + Math.pow(val - avgInterval, 2), 0) / intervals.length
      : 0
    const stdDev = Math.sqrt(variance)
    
    // Consistency score (inverse of coefficient of variation, scaled to 0-100)
    const cv = avgInterval > 0 ? stdDev / avgInterval : 0
    const consistency = Math.max(0, Math.round((1 - Math.min(cv, 1)) * 100))
    
    const correctChars = data.filter(d => d.correct).length
    const accuracy = data.length > 0 ? (correctChars / data.length) * 100 : 0
    
    // Character count and WPM (standard: 5 chars = 1 word)
    const charCount = data.length
    const minutes = totalTime / 60000
    const wpm = minutes > 0 ? Math.round((charCount / 5) / minutes) : 0
    const cpm = minutes > 0 ? Math.round(charCount / minutes) : 0
    
    // Find slowest bigrams
    const bigrams = {}
    for (let i = 1; i < data.length; i++) {
      if (data[i].interval && data[i].expected && data[i-1].expected) {
        const bigram = data[i-1].expected + data[i].expected
        if (!bigrams[bigram]) bigrams[bigram] = []
        bigrams[bigram].push(data[i].interval)
      }
    }
    
    const bigramAvgs = Object.entries(bigrams).map(([bigram, times]) => ({
      bigram,
      avg: times.reduce((a, b) => a + b, 0) / times.length,
      count: times.length
    })).sort((a, b) => b.avg - a.avg)
    
    // Find fastest bigrams
    const fastestBigrams = [...bigramAvgs].sort((a, b) => a.avg - b.avg).slice(0, 5)
    
    // Errors by position (split into chunks)
    const chunkSize = Math.ceil(data.length / 10)
    const errorsByChunk = []
    for (let i = 0; i < data.length; i += chunkSize) {
      const chunk = data.slice(i, i + chunkSize)
      const errors = chunk.filter(d => !d.correct).length
      errorsByChunk.push(errors)
    }
    
    // Speed over time (rolling average of intervals)
    const windowSize = 20
    const speedOverTime = []
    for (let i = windowSize; i < intervals.length; i++) {
      const window = intervals.slice(i - windowSize, i)
      const avgMs = window.reduce((a, b) => a + b, 0) / window.length
      // Convert to relative speed (higher = faster)
      speedOverTime.push(avgMs > 0 ? 1000 / avgMs : 0)
    }
    
    // Percentiles
    const sortedIntervals = [...intervals].sort((a, b) => a - b)
    const p50 = sortedIntervals[Math.floor(sortedIntervals.length * 0.5)] || 0
    const p90 = sortedIntervals[Math.floor(sortedIntervals.length * 0.9)] || 0
    const p99 = sortedIntervals[Math.floor(sortedIntervals.length * 0.99)] || 0
    const fastest = sortedIntervals[0] || 0
    
    return {
      wpm,
      cpm,
      accuracy: Math.round(accuracy),
      avgInterval: Math.round(avgInterval),
      stdDev: Math.round(stdDev),
      consistency,
      slowestBigrams: bigramAvgs.slice(0, 5),
      fastestBigrams,
      totalTime: Math.round(totalTime / 1000 * 10) / 10,
      charCount,
      errorCount: data.length - correctChars,
      intervals,
      speedOverTime,
      errorsByChunk,
      percentiles: {
        p50: Math.round(p50),
        p90: Math.round(p90),
        p99: Math.round(p99),
        fastest: Math.round(fastest)
      }
    }
  }, [currentText])

  const handleKeyDown = useCallback((e) => {
    if (isComplete) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        resetTest()
      }
      return
    }

    // Ignore modifier keys and special keys
    if (e.ctrlKey || e.metaKey || e.altKey) return
    if (['Shift', 'CapsLock', 'Tab', 'Escape'].includes(e.key)) return

    e.preventDefault()

    const now = performance.now()
    
    if (!isActive) {
      setIsActive(true)
      startTime.current = now
    }

    if (e.key === 'Backspace') {
      setTyped(prev => prev.slice(0, -1))
      return
    }

    if (e.key.length !== 1) return

    const expectedChar = currentText[typed.length]
    const isCorrect = e.key === expectedChar
    const interval = lastKeystrokeTime.current !== null 
      ? now - lastKeystrokeTime.current 
      : null

    lastKeystrokeTime.current = now

    const keystroke = {
      key: e.key,
      expected: expectedChar,
      correct: isCorrect,
      interval,
      timestamp: now - startTime.current
    }

    setKeystrokeData(prev => [...prev, keystroke])
    setTyped(prev => prev + e.key)

    // Check completion
    if (typed.length + 1 === currentText.length) {
      const totalTime = now - startTime.current
      setIsComplete(true)
      setStats(calculateStats([...keystrokeData, keystroke], totalTime))
    }
  }, [isActive, isComplete, typed, currentText, keystrokeData, calculateStats, resetTest])

  const renderText = () => {
    return currentText.split('').map((char, i) => {
      let className = 'char'
      
      if (i < typed.length) {
        className += typed[i] === char ? ' correct' : ' incorrect'
      } else if (i === typed.length) {
        className += ' current'
      } else {
        className += ' pending'
      }
      
      return (
        <span key={i} className={className}>
          {char === ' ' ? '\u00A0' : char}
        </span>
      )
    })
  }

  return (
    <div 
      className="container" 
      ref={containerRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      <header>
        <h1>typometry</h1>
        <p className="tagline">your typing, measured</p>
      </header>

      <main className="typing-area">
        <div className="text-display">
          {renderText()}
        </div>
        
        {!isActive && !isComplete && (
          <p className="hint">start typing...</p>
        )}
        
        {isActive && !isComplete && (
          <div className="live-stats">
            <span>{typed.length} / {currentText.length}</span>
          </div>
        )}
      </main>

      {isComplete && stats && (
        <section className="stats">
          <div className="stat-grid primary">
            <div className="stat">
              <span className="stat-value">{stats.wpm}</span>
              <span className="stat-label">wpm</span>
            </div>
            <div className="stat">
              <span className="stat-value">{stats.accuracy}%</span>
              <span className="stat-label">accuracy</span>
            </div>
            <div className="stat">
              <span className="stat-value">{stats.consistency}%</span>
              <span className="stat-label">consistency</span>
            </div>
            <div className="stat">
              <span className="stat-value">{stats.totalTime}s</span>
              <span className="stat-label">time</span>
            </div>
          </div>
          
          <div className="stat-grid secondary">
            <div className="stat small">
              <span className="stat-value">{stats.cpm}</span>
              <span className="stat-label">chars/min</span>
            </div>
            <div className="stat small">
              <span className="stat-value">{stats.avgInterval}ms</span>
              <span className="stat-label">avg interval</span>
            </div>
            <div className="stat small">
              <span className="stat-value">±{stats.stdDev}ms</span>
              <span className="stat-label">std dev</span>
            </div>
            <div className="stat small">
              <span className="stat-value">{stats.errorCount}</span>
              <span className="stat-label">errors</span>
            </div>
          </div>
          
          <div className="graphs-section">
            <div className="graph-card">
              <p className="graph-label">speed over time</p>
              <Sparkline data={stats.speedOverTime} width={280} height={50} />
            </div>
            <div className="graph-card">
              <p className="graph-label">interval distribution</p>
              <Histogram data={stats.intervals} width={280} height={50} />
            </div>
          </div>
          
          <div className="percentiles">
            <span className="percentile">
              <span className="percentile-label">fastest</span>
              <span className="percentile-value">{stats.percentiles.fastest}ms</span>
            </span>
            <span className="percentile">
              <span className="percentile-label">p50</span>
              <span className="percentile-value">{stats.percentiles.p50}ms</span>
            </span>
            <span className="percentile">
              <span className="percentile-label">p90</span>
              <span className="percentile-value">{stats.percentiles.p90}ms</span>
            </span>
            <span className="percentile">
              <span className="percentile-label">p99</span>
              <span className="percentile-value">{stats.percentiles.p99}ms</span>
            </span>
          </div>
          
          <div className="bigrams-container">
            <div className="bigrams">
              <p className="bigram-label">slowest transitions</p>
              <div className="bigram-list">
                {stats.slowestBigrams.map(({ bigram, avg }, i) => (
                  <span key={i} className="bigram">
                    <code>{bigram.replace(/ /g, '␣')}</code>
                    <span className="bigram-time">{Math.round(avg)}ms</span>
                  </span>
                ))}
              </div>
            </div>
            <div className="bigrams">
              <p className="bigram-label">fastest transitions</p>
              <div className="bigram-list">
                {stats.fastestBigrams.map(({ bigram, avg }, i) => (
                  <span key={i} className="bigram fast">
                    <code>{bigram.replace(/ /g, '␣')}</code>
                    <span className="bigram-time">{Math.round(avg)}ms</span>
                  </span>
                ))}
              </div>
            </div>
          </div>
          
          <p className="restart-hint">press enter or space to continue</p>
        </section>
      )}

      <footer>
        <button className="reset-btn" onClick={resetTest}>reset</button>
      </footer>
    </div>
  )
}

export default App
