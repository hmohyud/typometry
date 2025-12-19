import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import sentences from './sentences.json'
import { getKeyDistance } from './keyboard'
import { KeyboardHeatmap, KeyboardFlowMap } from './KeyboardViz'

// Flatten all paragraphs into one pool with indices
const ALL_PARAGRAPHS = Object.values(sentences).flat()

// localStorage keys
const STORAGE_KEYS = {
  COMPLETED: 'typometry_completed',
  HISTORY: 'typometry_history',
}

// Load/save helpers
const loadFromStorage = (key, defaultValue) => {
  try {
    const stored = localStorage.getItem(key)
    return stored ? JSON.parse(stored) : defaultValue
  } catch {
    return defaultValue
  }
}

const saveToStorage = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch (e) {
    console.warn('Failed to save to localStorage:', e)
  }
}

// Get next paragraph (avoiding completed ones)
const getNextParagraph = (completedIndices) => {
  const available = ALL_PARAGRAPHS
    .map((text, index) => ({ text, index }))
    .filter(({ index }) => !completedIndices.includes(index))
  
  if (available.length === 0) {
    // All done - reset and start over
    return { text: ALL_PARAGRAPHS[0], index: 0, reset: true }
  }
  
  const choice = available[Math.floor(Math.random() * available.length)]
  return { text: choice.text, index: choice.index, reset: false }
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
  const [currentIndex, setCurrentIndex] = useState(-1)
  const [typed, setTyped] = useState('')
  const [isActive, setIsActive] = useState(false)
  const [isComplete, setIsComplete] = useState(false)
  const [keystrokeData, setKeystrokeData] = useState([])
  const [stats, setStats] = useState(null)
  const [cumulativeStats, setCumulativeStats] = useState(null)
  const [completedCount, setCompletedCount] = useState(0)
  const [totalParagraphs] = useState(ALL_PARAGRAPHS.length)
  const [statsView, setStatsView] = useState('current') // 'current' | 'alltime'
  const [heatmapMode, setHeatmapMode] = useState('speed') // 'speed' | 'frequency'
  
  const lastKeystrokeTime = useRef(null)
  const startTime = useRef(null)
  const containerRef = useRef(null)

  // Load completed indices on mount
  const [completedIndices, setCompletedIndices] = useState(() => 
    loadFromStorage(STORAGE_KEYS.COMPLETED, [])
  )

  const resetTest = useCallback((forceNew = false) => {
    let indices = completedIndices
    if (forceNew) {
      indices = []
      setCompletedIndices([])
      saveToStorage(STORAGE_KEYS.COMPLETED, [])
      saveToStorage(STORAGE_KEYS.HISTORY, [])
    }
    
    const { text, index, reset } = getNextParagraph(indices)
    
    if (reset && !forceNew) {
      // All paragraphs completed - clear and restart
      setCompletedIndices([])
      saveToStorage(STORAGE_KEYS.COMPLETED, [])
    }
    
    setCurrentText(text)
    setCurrentIndex(index)
    setTyped('')
    setIsActive(false)
    setIsComplete(false)
    setKeystrokeData([])
    setRawKeyEvents([])
    setStats(null)
    lastKeystrokeTime.current = null
    startTime.current = null
    containerRef.current?.focus()
  }, [completedIndices])

  // Load cumulative stats on mount
  useEffect(() => {
    const history = loadFromStorage(STORAGE_KEYS.HISTORY, [])
    setCompletedCount(completedIndices.length)
    if (history.length > 0) {
      setCumulativeStats(calculateCumulativeStats(history))
    }
    resetTest()
  }, [])

  useEffect(() => {
    containerRef.current?.focus()
  }, [])

  const calculateCumulativeStats = (history) => {
    if (history.length === 0) return null
    
    const allIntervals = history.flatMap(h => h.intervals)
    const allWordIntervals = history.flatMap(h => h.wordIntervals || [])
    const allDistances = history.flatMap(h => h.distances || [])
    
    const totalChars = history.reduce((sum, h) => sum + h.charCount, 0)
    const totalTime = history.reduce((sum, h) => sum + h.totalTime, 0)
    const totalErrors = history.reduce((sum, h) => sum + h.errorCount, 0)
    
    const avgInterval = allIntervals.length > 0
      ? allIntervals.reduce((a, b) => a + b, 0) / allIntervals.length
      : 0
    
    const avgWordInterval = allWordIntervals.length > 0
      ? allWordIntervals.reduce((a, b) => a + b, 0) / allWordIntervals.length
      : 0
    
    const avgDistance = allDistances.length > 0
      ? allDistances.reduce((a, b) => a + b, 0) / allDistances.length
      : 0
    
    const minutes = totalTime / 60000
    const wpm = minutes > 0 ? Math.round((totalChars / 5) / minutes) : 0
    const accuracy = totalChars > 0 ? Math.round(((totalChars - totalErrors) / totalChars) * 100) : 0
    
    // Aggregate bigrams across all sessions
    const bigramMap = {}
    history.forEach(h => {
      if (h.bigrams) {
        h.bigrams.forEach(({ bigram, avg, distance }) => {
          if (!bigramMap[bigram]) {
            bigramMap[bigram] = { times: [], distance }
          }
          bigramMap[bigram].times.push(avg)
        })
      }
    })
    
    const aggregatedBigrams = Object.entries(bigramMap).map(([bigram, data]) => ({
      bigram,
      avg: data.times.reduce((a, b) => a + b, 0) / data.times.length,
      distance: data.distance
    }))
    
    const slowestBigrams = [...aggregatedBigrams].sort((a, b) => b.avg - a.avg).slice(0, 5)
    const fastestBigrams = [...aggregatedBigrams].sort((a, b) => a.avg - b.avg).slice(0, 5)
    
    // Impressive bigrams: fast but far (distance > 3, time < median)
    const medianTime = allIntervals.length > 0
      ? [...allIntervals].sort((a, b) => a - b)[Math.floor(allIntervals.length / 2)]
      : 100
    
    const impressiveBigrams = aggregatedBigrams
      .filter(b => b.distance && b.distance > 3 && b.avg < medianTime)
      .sort((a, b) => (b.distance / b.avg) - (a.distance / a.avg))
      .slice(0, 5)
    
    return {
      sessions: history.length,
      totalChars,
      totalTime: Math.round(totalTime / 1000),
      wpm,
      accuracy,
      avgInterval: Math.round(avgInterval),
      avgWordInterval: Math.round(avgWordInterval),
      avgDistance: Math.round(avgDistance * 100) / 100,
      slowestBigrams,
      fastestBigrams,
      impressiveBigrams,
    }
  }

  const calculateStats = useCallback((data, totalTime, rawEvents = []) => {
    const intervals = data.map(d => d.interval).filter(i => i !== null)
    const avgInterval = intervals.length > 0 
      ? intervals.reduce((a, b) => a + b, 0) / intervals.length 
      : 0
    
    // Standard deviation
    const variance = intervals.length > 0
      ? intervals.reduce((sum, val) => sum + Math.pow(val - avgInterval, 2), 0) / intervals.length
      : 0
    const stdDev = Math.sqrt(variance)
    
    // Consistency score
    const cv = avgInterval > 0 ? stdDev / avgInterval : 0
    const consistency = Math.max(0, Math.round((1 - Math.min(cv, 1)) * 100))
    
    const correctChars = data.filter(d => d.correct).length
    const accuracy = data.length > 0 ? (correctChars / data.length) * 100 : 0
    
    const charCount = data.length
    const minutes = totalTime / 60000
    const wpm = minutes > 0 ? Math.round((charCount / 5) / minutes) : 0
    const cpm = minutes > 0 ? Math.round(charCount / minutes) : 0
    
    // ============ BEHAVIORAL STATS ============
    
    // --- Momentum: letters typed after error before first backspace ---
    // High momentum = you power through mistakes, low = immediate corrector
    const momentumValues = []
    let charsSinceError = 0
    let inErrorState = false
    
    for (const event of rawEvents) {
      if (event.isBackspace) {
        if (inErrorState && charsSinceError > 0) {
          momentumValues.push(charsSinceError)
        }
        charsSinceError = 0
        inErrorState = false
      } else {
        // Check if this keystroke was an error
        const keystroke = data.find(d => Math.abs(d.timestamp - event.timestamp) < 5)
        if (keystroke && !keystroke.correct) {
          inErrorState = true
          charsSinceError = 1
        } else if (inErrorState) {
          charsSinceError++
        }
      }
    }
    
    const avgMomentum = momentumValues.length > 0
      ? momentumValues.reduce((a, b) => a + b, 0) / momentumValues.length
      : 0
    
    // Momentum personality label
    let momentumLabel = 'balanced'
    if (avgMomentum < 0.5) momentumLabel = 'perfectionist'
    else if (avgMomentum < 1.5) momentumLabel = 'quick corrector'
    else if (avgMomentum < 3) momentumLabel = 'steady'
    else if (avgMomentum < 5) momentumLabel = 'flow typer'
    else momentumLabel = 'bulldozer'
    
    // --- Burst detection: longest streak of fast correct keystrokes ---
    const burstThreshold = avgInterval * 0.8 // faster than 80% of average
    let currentBurst = 0
    let maxBurst = 0
    let bursts = []
    
    for (let i = 0; i < data.length; i++) {
      if (data[i].correct && data[i].interval && data[i].interval < burstThreshold) {
        currentBurst++
      } else {
        if (currentBurst > 2) bursts.push(currentBurst)
        maxBurst = Math.max(maxBurst, currentBurst)
        currentBurst = 0
      }
    }
    if (currentBurst > 2) bursts.push(currentBurst)
    maxBurst = Math.max(maxBurst, currentBurst)
    
    const avgBurstLength = bursts.length > 0
      ? bursts.reduce((a, b) => a + b, 0) / bursts.length
      : 0
    
    // --- Flow state: % of keystrokes within tight timing band ---
    const flowBandLow = avgInterval * 0.7
    const flowBandHigh = avgInterval * 1.3
    const flowKeystrokes = intervals.filter(i => i >= flowBandLow && i <= flowBandHigh)
    const flowRatio = intervals.length > 0 
      ? Math.round((flowKeystrokes.length / intervals.length) * 100)
      : 0
    
    // --- Fatigue: speed difference between first and second half ---
    const halfPoint = Math.floor(intervals.length / 2)
    const firstHalfAvg = halfPoint > 0
      ? intervals.slice(0, halfPoint).reduce((a, b) => a + b, 0) / halfPoint
      : avgInterval
    const secondHalfAvg = halfPoint > 0
      ? intervals.slice(halfPoint).reduce((a, b) => a + b, 0) / (intervals.length - halfPoint)
      : avgInterval
    const fatigueRatio = firstHalfAvg > 0 ? (secondHalfAvg / firstHalfAvg) : 1
    const fatiguePercent = Math.round((fatigueRatio - 1) * 100)
    
    let fatigueLabel = 'steady'
    if (fatiguePercent < -10) fatigueLabel = 'warming up'
    else if (fatiguePercent < -5) fatigueLabel = 'accelerating'
    else if (fatiguePercent > 15) fatigueLabel = 'fatigued'
    else if (fatiguePercent > 8) fatigueLabel = 'slowing'
    
    // --- Hesitation points: pauses > 500ms ---
    const hesitationThreshold = 500
    const hesitations = intervals.filter(i => i > hesitationThreshold)
    const hesitationCount = hesitations.length
    const avgHesitation = hesitations.length > 0
      ? hesitations.reduce((a, b) => a + b, 0) / hesitations.length
      : 0
    
    // --- Recovery time: average interval of 3 keystrokes after an error ---
    const recoveryTimes = []
    for (let i = 0; i < data.length; i++) {
      if (!data[i].correct && i + 3 < data.length) {
        const nextThree = data.slice(i + 1, i + 4)
          .map(d => d.interval)
          .filter(i => i !== null)
        if (nextThree.length > 0) {
          recoveryTimes.push(nextThree.reduce((a, b) => a + b, 0) / nextThree.length)
        }
      }
    }
    const avgRecoveryTime = recoveryTimes.length > 0
      ? recoveryTimes.reduce((a, b) => a + b, 0) / recoveryTimes.length
      : avgInterval
    const recoveryPenalty = avgInterval > 0 
      ? Math.round(((avgRecoveryTime / avgInterval) - 1) * 100)
      : 0
    
    // --- Capital letter penalty ---
    const capitalIntervals = data
      .filter(d => d.expected && d.expected === d.expected.toUpperCase() && d.expected !== d.expected.toLowerCase())
      .map(d => d.interval)
      .filter(i => i !== null)
    const avgCapitalInterval = capitalIntervals.length > 0
      ? capitalIntervals.reduce((a, b) => a + b, 0) / capitalIntervals.length
      : avgInterval
    const capitalPenalty = avgInterval > 0
      ? Math.round(((avgCapitalInterval / avgInterval) - 1) * 100)
      : 0
    
    // --- Punctuation penalty ---
    const punctuation = '.,;:!?\'"-()[]{}/'
    const punctIntervals = data
      .filter(d => d.expected && punctuation.includes(d.expected))
      .map(d => d.interval)
      .filter(i => i !== null)
    const avgPunctInterval = punctIntervals.length > 0
      ? punctIntervals.reduce((a, b) => a + b, 0) / punctIntervals.length
      : avgInterval
    const punctuationPenalty = avgInterval > 0
      ? Math.round(((avgPunctInterval / avgInterval) - 1) * 100)
      : 0
    
    // --- Error clustering: do errors come in bursts? ---
    const errorPositions = data
      .map((d, i) => d.correct ? null : i)
      .filter(i => i !== null)
    
    let errorGaps = []
    for (let i = 1; i < errorPositions.length; i++) {
      errorGaps.push(errorPositions[i] - errorPositions[i - 1])
    }
    const avgErrorGap = errorGaps.length > 0
      ? errorGaps.reduce((a, b) => a + b, 0) / errorGaps.length
      : charCount
    const errorClustering = errorGaps.length > 0
      ? Math.round((charCount / errorPositions.length) / avgErrorGap * 10) / 10
      : 1
    
    let errorPattern = 'random'
    if (errorClustering > 1.5) errorPattern = 'clustered'
    else if (errorClustering < 0.7) errorPattern = 'spread out'
    
    // --- Backspace efficiency: backspaces per error ---
    const backspaceCount = rawEvents.filter(e => e.isBackspace).length
    const errorCount = data.length - correctChars
    const backspaceEfficiency = errorCount > 0
      ? Math.round((backspaceCount / errorCount) * 10) / 10
      : 1
    
    let backspaceLabel = 'efficient'
    if (backspaceEfficiency > 2) backspaceLabel = 'over-corrector'
    else if (backspaceEfficiency > 1.5) backspaceLabel = 'cautious'
    else if (backspaceEfficiency < 1 && errorCount > 0) backspaceLabel = 'incomplete fixes'
    
    // --- Rhythm regularity (autocorrelation-like measure) ---
    let rhythmScore = 0
    if (intervals.length > 10) {
      const diffs = []
      for (let i = 1; i < intervals.length; i++) {
        diffs.push(Math.abs(intervals[i] - intervals[i-1]))
      }
      const avgDiff = diffs.reduce((a, b) => a + b, 0) / diffs.length
      rhythmScore = avgInterval > 0 
        ? Math.max(0, Math.round((1 - avgDiff / avgInterval) * 100))
        : 0
    }
    
    // ============ END BEHAVIORAL STATS ============
    
    // Word intervals (time from space to space)
    const wordIntervals = []
    let lastSpaceTime = null
    data.forEach((d, i) => {
      if (d.expected === ' ' && d.timestamp !== undefined) {
        if (lastSpaceTime !== null) {
          wordIntervals.push(d.timestamp - lastSpaceTime)
        }
        lastSpaceTime = d.timestamp
      }
    })
    
    const avgWordInterval = wordIntervals.length > 0
      ? wordIntervals.reduce((a, b) => a + b, 0) / wordIntervals.length
      : 0
    
    // Keyboard distances - only track CORRECT consecutive keystrokes
    const distances = []
    const bigramsWithDistance = []
    
    // Build list of correct keystrokes only
    const correctKeystrokes = data.filter(d => d.correct)
    
    for (let i = 1; i < correctKeystrokes.length; i++) {
      const prev = correctKeystrokes[i - 1]
      const curr = correctKeystrokes[i]
      
      if (curr.interval && curr.expected && prev.expected) {
        // Skip same-character transitions (not meaningful)
        if (curr.expected === prev.expected) continue
        
        const distance = getKeyDistance(prev.expected, curr.expected)
        if (distance !== null) {
          distances.push(distance)
          bigramsWithDistance.push({
            bigram: prev.expected + curr.expected,
            interval: curr.interval,
            distance
          })
        }
      }
    }
    
    const avgDistance = distances.length > 0
      ? distances.reduce((a, b) => a + b, 0) / distances.length
      : 0
    
    // Per-key statistics for heatmap
    const keyStats = {}
    data.forEach(d => {
      if (d.expected && d.interval && d.correct) {
        const key = d.expected.toLowerCase()
        if (!keyStats[key]) {
          keyStats[key] = { times: [], count: 0 }
        }
        keyStats[key].times.push(d.interval)
        keyStats[key].count++
      }
    })
    
    // Calculate averages per key
    Object.keys(keyStats).forEach(key => {
      const times = keyStats[key].times
      keyStats[key].avgInterval = times.length > 0
        ? times.reduce((a, b) => a + b, 0) / times.length
        : 0
    })
    
    // Aggregate bigrams
    const bigramMap = {}
    bigramsWithDistance.forEach(({ bigram, interval, distance }) => {
      if (!bigramMap[bigram]) {
        bigramMap[bigram] = { times: [], distance }
      }
      bigramMap[bigram].times.push(interval)
    })
    
    const bigramAvgs = Object.entries(bigramMap).map(([bigram, data]) => ({
      bigram,
      avg: data.times.reduce((a, b) => a + b, 0) / data.times.length,
      count: data.times.length,
      distance: data.distance
    }))
    
    const slowestBigrams = [...bigramAvgs].sort((a, b) => b.avg - a.avg).slice(0, 5)
    const fastestBigrams = [...bigramAvgs].sort((a, b) => a.avg - b.avg).slice(0, 5)
    
    // Impressive bigrams: fast relative to distance
    const medianInterval = intervals.length > 0
      ? [...intervals].sort((a, b) => a - b)[Math.floor(intervals.length / 2)]
      : 100
    
    const impressiveBigrams = bigramAvgs
      .filter(b => b.distance > 3 && b.avg < medianInterval)
      .sort((a, b) => (b.distance / b.avg) - (a.distance / a.avg))
      .slice(0, 5)
    
    // Speed over time
    const windowSize = 20
    const speedOverTime = []
    for (let i = windowSize; i < intervals.length; i++) {
      const window = intervals.slice(i - windowSize, i)
      const avgMs = window.reduce((a, b) => a + b, 0) / window.length
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
      slowestBigrams,
      fastestBigrams,
      impressiveBigrams,
      totalTime: Math.round(totalTime / 1000 * 10) / 10,
      charCount,
      errorCount,
      intervals,
      speedOverTime,
      percentiles: {
        p50: Math.round(p50),
        p90: Math.round(p90),
        p99: Math.round(p99),
        fastest: Math.round(fastest)
      },
      wordIntervals,
      avgWordInterval: Math.round(avgWordInterval),
      distances,
      avgDistance: Math.round(avgDistance * 100) / 100,
      bigrams: bigramAvgs,
      // Behavioral stats
      behavioral: {
        momentum: Math.round(avgMomentum * 10) / 10,
        momentumLabel,
        maxBurst,
        avgBurstLength: Math.round(avgBurstLength * 10) / 10,
        flowRatio,
        fatiguePercent,
        fatigueLabel,
        hesitationCount,
        avgHesitation: Math.round(avgHesitation),
        recoveryPenalty,
        capitalPenalty,
        punctuationPenalty,
        errorPattern,
        errorClustering,
        backspaceEfficiency,
        backspaceLabel,
        rhythmScore,
      },
      keyStats,
    }
  }, [])

  // Track raw key events for momentum calculation
  const [rawKeyEvents, setRawKeyEvents] = useState([])
  
  const handleKeyDown = useCallback((e) => {
    if (isComplete) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        resetTest()
      }
      return
    }

    if (e.ctrlKey || e.metaKey || e.altKey) return
    if (['Shift', 'CapsLock', 'Tab', 'Escape'].includes(e.key)) return

    e.preventDefault()

    const now = performance.now()
    
    if (!isActive) {
      setIsActive(true)
      startTime.current = now
    }

    // Track ALL key events including backspaces for momentum analysis
    const rawEvent = {
      key: e.key,
      timestamp: now - (startTime.current || now),
      isBackspace: e.key === 'Backspace'
    }
    setRawKeyEvents(prev => [...prev, rawEvent])

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
      timestamp: now - startTime.current,
      position: typed.length
    }

    setKeystrokeData(prev => [...prev, keystroke])
    setTyped(prev => prev + e.key)

    // Check completion
    if (typed.length + 1 === currentText.length) {
      const totalTime = now - startTime.current
      const allRawEvents = [...rawKeyEvents, rawEvent]
      const finalStats = calculateStats([...keystrokeData, keystroke], totalTime, allRawEvents)
      setIsComplete(true)
      setStats(finalStats)
      
      // Save to history
      const newCompleted = [...completedIndices, currentIndex]
      setCompletedIndices(newCompleted)
      setCompletedCount(newCompleted.length)
      saveToStorage(STORAGE_KEYS.COMPLETED, newCompleted)
      
      // Save stats to history
      const history = loadFromStorage(STORAGE_KEYS.HISTORY, [])
      const historyEntry = {
        timestamp: Date.now(),
        paragraphIndex: currentIndex,
        charCount: finalStats.charCount,
        errorCount: finalStats.errorCount,
        totalTime,
        intervals: finalStats.intervals,
        wordIntervals: finalStats.wordIntervals,
        distances: finalStats.distances,
        bigrams: finalStats.bigrams,
      }
      const newHistory = [...history, historyEntry]
      saveToStorage(STORAGE_KEYS.HISTORY, newHistory)
      
      // Update cumulative stats
      setCumulativeStats(calculateCumulativeStats(newHistory))
    }
  }, [isActive, isComplete, typed, currentText, currentIndex, keystrokeData, rawKeyEvents, calculateStats, resetTest, completedIndices])

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
      
      if (char === ' ') {
        className += ' space'
      }
      
      return (
        <span key={i} className={className}>
          {char}
        </span>
      )
    })
  }

  const formatBigram = (bigram) => {
    const char1 = bigram[0] === ' ' ? '␣' : bigram[0]
    const char2 = bigram[1] === ' ' ? '␣' : bigram[1]
    return `${char1} → ${char2}`
  }

  const clearHistory = () => {
    if (window.confirm('Clear all history and start fresh?')) {
      resetTest(true)
      setCumulativeStats(null)
      setCompletedCount(0)
    }
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
        <p className="progress">{completedCount} / {totalParagraphs} paragraphs completed</p>
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
          {/* Stats View Toggle */}
          {cumulativeStats && cumulativeStats.sessions > 1 && (
            <div className="stats-toggle">
              <button 
                className={`toggle-btn ${statsView === 'current' ? 'active' : ''}`}
                onClick={() => setStatsView('current')}
              >
                This Paragraph
              </button>
              <button 
                className={`toggle-btn ${statsView === 'alltime' ? 'active' : ''}`}
                onClick={() => setStatsView('alltime')}
              >
                All Time ({cumulativeStats.sessions})
              </button>
            </div>
          )}
          
          {statsView === 'current' ? (
            <>
              {/* Current paragraph stats */}
              <div className="stat-grid primary">
                <div className="stat">
                  <span className="stat-value">
                    {stats.wpm}
                    {cumulativeStats && (
                      <span className={`stat-delta ${stats.wpm >= cumulativeStats.wpm ? 'positive' : 'negative'}`}>
                        {stats.wpm >= cumulativeStats.wpm ? '↑' : '↓'}{Math.abs(stats.wpm - cumulativeStats.wpm)}
                      </span>
                    )}
                  </span>
                  <span className="stat-label">wpm</span>
                </div>
                <div className="stat">
                  <span className="stat-value">
                    {stats.accuracy}%
                    {cumulativeStats && (
                      <span className={`stat-delta ${stats.accuracy >= cumulativeStats.accuracy ? 'positive' : 'negative'}`}>
                        {stats.accuracy >= cumulativeStats.accuracy ? '↑' : '↓'}{Math.abs(stats.accuracy - cumulativeStats.accuracy)}
                      </span>
                    )}
                  </span>
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
                  <span className="stat-value">
                    {stats.avgInterval}ms
                    {cumulativeStats && (
                      <span className={`stat-delta ${stats.avgInterval <= cumulativeStats.avgInterval ? 'positive' : 'negative'}`}>
                        {stats.avgInterval <= cumulativeStats.avgInterval ? '↓' : '↑'}{Math.abs(stats.avgInterval - cumulativeStats.avgInterval)}
                      </span>
                    )}
                  </span>
                  <span className="stat-label">avg keystroke</span>
                </div>
                <div className="stat small">
                  <span className="stat-value">{stats.avgWordInterval}ms</span>
                  <span className="stat-label">avg word time</span>
                </div>
                <div className="stat small" title="Average physical distance between consecutive keys on the keyboard">
                  <span className="stat-value">{stats.avgDistance}</span>
                  <span className="stat-label">avg travel <span className="label-hint">(keys apart)</span></span>
                </div>
                <div className="stat small">
                  <span className="stat-value">{stats.errorCount}</span>
                  <span className="stat-label">errors</span>
                </div>
              </div>
              
              {/* Keyboard Visualizations */}
              <div className="keyboard-section">
                <div className="keyboard-header">
                  <h3>Keyboard Analysis</h3>
                  <div className="heatmap-toggle">
                    <button 
                      className={`mini-toggle ${heatmapMode === 'speed' ? 'active' : ''}`}
                      onClick={() => setHeatmapMode('speed')}
                    >
                      Speed
                    </button>
                    <button 
                      className={`mini-toggle ${heatmapMode === 'frequency' ? 'active' : ''}`}
                      onClick={() => setHeatmapMode('frequency')}
                    >
                      Frequency
                    </button>
                  </div>
                </div>
                <KeyboardHeatmap keyStats={stats.keyStats} mode={heatmapMode} />
                
                <div className="keyboard-flows">
                  <KeyboardFlowMap topBigrams={stats.slowestBigrams} flowType="slow" />
                  <KeyboardFlowMap topBigrams={stats.fastestBigrams} flowType="fast" />
                </div>
              </div>
              
              <div className="graphs-section">
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
              <span className="percentile-label">median</span>
              <span className="percentile-value">{stats.percentiles.p50}ms</span>
            </span>
            <span className="percentile">
              <span className="percentile-label">slow (90%)</span>
              <span className="percentile-value">{stats.percentiles.p90}ms</span>
            </span>
            <span className="percentile">
              <span className="percentile-label">slowest (99%)</span>
              <span className="percentile-value">{stats.percentiles.p99}ms</span>
            </span>
          </div>
          
          <div className="bigrams-container">
            <div className="bigrams">
              <p className="bigram-label">slowest transitions</p>
              <div className="bigram-list">
                {stats.slowestBigrams.map(({ bigram, avg, distance }, i) => (
                  <span key={i} className="bigram">
                    <code>{formatBigram(bigram)}</code>
                    <span className="bigram-meta">
                      <span className="bigram-time">{Math.round(avg)}ms</span>
                      {distance && <span className="bigram-distance" title="Physical distance on keyboard">{distance.toFixed(1)} apart</span>}
                    </span>
                  </span>
                ))}
              </div>
            </div>
            <div className="bigrams">
              <p className="bigram-label">fastest transitions</p>
              <div className="bigram-list">
                {stats.fastestBigrams.map(({ bigram, avg, distance }, i) => (
                  <span key={i} className="bigram fast">
                    <code>{formatBigram(bigram)}</code>
                    <span className="bigram-meta">
                      <span className="bigram-time">{Math.round(avg)}ms</span>
                      {distance && <span className="bigram-distance" title="Physical distance on keyboard">{distance.toFixed(1)} apart</span>}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          </div>
          
          {stats.impressiveBigrams.length > 0 && (
            <div className="bigrams impressive-section">
              <p className="bigram-label">🏆 impressive reaches (fast + far)</p>
              <div className="bigram-list horizontal">
                {stats.impressiveBigrams.map(({ bigram, avg, distance }, i) => (
                  <span key={i} className="bigram impressive">
                    <code>{formatBigram(bigram)}</code>
                    <span className="bigram-meta">
                      <span className="bigram-time">{Math.round(avg)}ms</span>
                      <span className="bigram-distance" title="Physical distance on keyboard">{distance.toFixed(1)} apart</span>
                    </span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Behavioral Insights */}
          {stats.behavioral && (
            <div className="behavioral-section">
              <h3 className="behavioral-header">Typing Personality</h3>
              
              <div className="behavioral-grid">
                <div className="behavioral-card">
                  <div className="behavioral-main">
                    <span className="behavioral-value">{stats.behavioral.momentumLabel}</span>
                    <span className="behavioral-label">correction style</span>
                  </div>
                  <p className="behavioral-detail">
                    {stats.behavioral.momentum > 0 
                      ? `~${stats.behavioral.momentum} chars past errors before fixing`
                      : 'Instant corrections'}
                  </p>
                </div>
                
                <div className="behavioral-card">
                  <div className="behavioral-main">
                    <span className="behavioral-value">{stats.behavioral.flowRatio}%</span>
                    <span className="behavioral-label">flow state</span>
                  </div>
                  <p className="behavioral-detail">keystrokes in your rhythm zone</p>
                </div>
                
                <div className="behavioral-card">
                  <div className="behavioral-main">
                    <span className="behavioral-value">{stats.behavioral.maxBurst}</span>
                    <span className="behavioral-label">max burst</span>
                  </div>
                  <p className="behavioral-detail">longest fast streak</p>
                </div>
                
                <div className="behavioral-card">
                  <div className="behavioral-main">
                    <span className="behavioral-value">{stats.behavioral.rhythmScore}%</span>
                    <span className="behavioral-label">rhythm</span>
                  </div>
                  <p className="behavioral-detail">keystroke regularity</p>
                </div>
              </div>
              
              <div className="behavioral-details">
                <div className="detail-row">
                  <span className="detail-label">fatigue</span>
                  <span className="detail-value">
                    {stats.behavioral.fatigueLabel}
                    {stats.behavioral.fatiguePercent !== 0 && (
                      <span className={`detail-delta ${stats.behavioral.fatiguePercent > 0 ? 'negative' : 'positive'}`}>
                        {stats.behavioral.fatiguePercent > 0 ? '+' : ''}{stats.behavioral.fatiguePercent}%
                      </span>
                    )}
                  </span>
                </div>
                
                <div className="detail-row">
                  <span className="detail-label">capital penalty</span>
                  <span className="detail-value">
                    {stats.behavioral.capitalPenalty > 0 ? '+' : ''}{stats.behavioral.capitalPenalty}%
                    <span className="detail-note">slower on caps</span>
                  </span>
                </div>
                
                <div className="detail-row">
                  <span className="detail-label">punctuation penalty</span>
                  <span className="detail-value">
                    {stats.behavioral.punctuationPenalty > 0 ? '+' : ''}{stats.behavioral.punctuationPenalty}%
                    <span className="detail-note">slower on symbols</span>
                  </span>
                </div>
                
                <div className="detail-row">
                  <span className="detail-label">recovery time</span>
                  <span className="detail-value">
                    {stats.behavioral.recoveryPenalty > 0 ? '+' : ''}{stats.behavioral.recoveryPenalty}%
                    <span className="detail-note">slower after errors</span>
                  </span>
                </div>
                
                <div className="detail-row">
                  <span className="detail-label">hesitations</span>
                  <span className="detail-value">
                    {stats.behavioral.hesitationCount}
                    {stats.behavioral.hesitationCount > 0 && (
                      <span className="detail-note">pauses &gt;500ms (avg {stats.behavioral.avgHesitation}ms)</span>
                    )}
                  </span>
                </div>
                
                <div className="detail-row">
                  <span className="detail-label">error pattern</span>
                  <span className="detail-value">{stats.behavioral.errorPattern}</span>
                </div>
                
                <div className="detail-row">
                  <span className="detail-label">backspace style</span>
                  <span className="detail-value">
                    {stats.behavioral.backspaceLabel}
                    <span className="detail-note">{stats.behavioral.backspaceEfficiency}x per error</span>
                  </span>
                </div>
              </div>
            </div>
          )}
            </>
          ) : (
            /* All-time stats view */
            cumulativeStats && (
              <>
                <div className="stat-grid primary">
                  <div className="stat">
                    <span className="stat-value">{cumulativeStats.wpm}</span>
                    <span className="stat-label">avg wpm</span>
                  </div>
                  <div className="stat">
                    <span className="stat-value">{cumulativeStats.accuracy}%</span>
                    <span className="stat-label">accuracy</span>
                  </div>
                  <div className="stat">
                    <span className="stat-value">{cumulativeStats.totalChars}</span>
                    <span className="stat-label">total chars</span>
                  </div>
                  <div className="stat">
                    <span className="stat-value">{cumulativeStats.totalTime}s</span>
                    <span className="stat-label">total time</span>
                  </div>
                </div>
                
                <div className="stat-grid secondary">
                  <div className="stat small">
                    <span className="stat-value">{cumulativeStats.avgInterval}ms</span>
                    <span className="stat-label">avg keystroke</span>
                  </div>
                  <div className="stat small">
                    <span className="stat-value">{cumulativeStats.avgWordInterval}ms</span>
                    <span className="stat-label">avg word time</span>
                  </div>
                  <div className="stat small" title="Average physical distance between consecutive keys">
                    <span className="stat-value">{cumulativeStats.avgDistance}</span>
                    <span className="stat-label">avg travel <span className="label-hint">(keys apart)</span></span>
                  </div>
                  <div className="stat small">
                    <span className="stat-value">{cumulativeStats.sessions}</span>
                    <span className="stat-label">sessions</span>
                  </div>
                </div>
                
                <div className="bigrams-container">
                  <div className="bigrams">
                    <p className="bigram-label">all-time slowest</p>
                    <div className="bigram-list">
                      {cumulativeStats.slowestBigrams.map(({ bigram, avg }, i) => (
                        <span key={i} className="bigram">
                          <code>{formatBigram(bigram)}</code>
                          <span className="bigram-meta">
                            <span className="bigram-time">{Math.round(avg)}ms</span>
                          </span>
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="bigrams">
                    <p className="bigram-label">all-time fastest</p>
                    <div className="bigram-list">
                      {cumulativeStats.fastestBigrams.map(({ bigram, avg }, i) => (
                        <span key={i} className="bigram fast">
                          <code>{formatBigram(bigram)}</code>
                          <span className="bigram-meta">
                            <span className="bigram-time">{Math.round(avg)}ms</span>
                          </span>
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                
                {cumulativeStats.impressiveBigrams && cumulativeStats.impressiveBigrams.length > 0 && (
                  <div className="bigrams impressive-section">
                    <p className="bigram-label">🏆 all-time impressive reaches</p>
                    <div className="bigram-list horizontal">
                      {cumulativeStats.impressiveBigrams.map(({ bigram, avg, distance }, i) => (
                        <span key={i} className="bigram impressive">
                          <code>{formatBigram(bigram)}</code>
                          <span className="bigram-meta">
                            <span className="bigram-time">{Math.round(avg)}ms</span>
                            <span className="bigram-distance" title="Keys apart on keyboard">{distance.toFixed(1)} keys</span>
                          </span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )
          )}
          
          <p className="restart-hint">press enter or space to continue</p>
        </section>
      )}

      <footer>
        <button className="reset-btn" onClick={() => resetTest()}>next</button>
        <button className="reset-btn danger" onClick={clearHistory}>clear history</button>
      </footer>
    </div>
  )
}

export default App
