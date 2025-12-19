import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import sentences from './sentences.json'
import { getKeyDistance } from './keyboard'
import { KeyboardHeatmap, KeyboardFlowMap } from './KeyboardViz'
import { Tooltip, TipTitle, TipText, TipHint } from './Tooltip'

// Flatten all paragraphs into one pool with indices
const ALL_PARAGRAPHS = Object.values(sentences).flat()

// localStorage keys
const STORAGE_KEYS = {
  COMPLETED: 'typometry_completed',
  HISTORY: 'typometry_history',
}

// Tooltip content for stats
const TIPS = {
  // Basic stats
  wpm: (
    <>
      <TipTitle>Words Per Minute</TipTitle>
      <TipText>Your typing speed, calculated as (characters / 5) / minutes.</TipText>
      <TipText>The standard "word" is 5 characters including spaces.</TipText>
      <TipHint>Average: 40 WPM | Good: 60+ | Fast: 80+</TipHint>
    </>
  ),
  accuracy: (
    <>
      <TipTitle>Accuracy</TipTitle>
      <TipText>Percentage of characters typed correctly on the first attempt.</TipText>
      <TipText>Backspaced corrections count against accuracy.</TipText>
      <TipHint>95%+ is considered good accuracy</TipHint>
    </>
  ),
  consistency: (
    <>
      <TipTitle>Consistency</TipTitle>
      <TipText>How steady your typing speed is throughout the text.</TipText>
      <TipText>Based on the coefficient of variation of your keystroke intervals.</TipText>
      <TipHint>Higher % = more even, metronomic typing</TipHint>
    </>
  ),
  time: (
    <>
      <TipTitle>Time</TipTitle>
      <TipText>Total time from first keystroke to last keystroke.</TipText>
    </>
  ),
  avgKeystroke: (
    <>
      <TipTitle>Average Keystroke</TipTitle>
      <TipText>Mean time between consecutive keystrokes in milliseconds.</TipText>
      <TipText>Lower = faster typing.</TipText>
      <TipHint>100ms ≈ 120 WPM | 200ms ≈ 60 WPM</TipHint>
    </>
  ),
  avgWordTime: (
    <>
      <TipTitle>Average Word Time</TipTitle>
      <TipText>Mean time to complete each word (space to space).</TipText>
      <TipText>Includes thinking time between words.</TipText>
    </>
  ),
  errors: (
    <>
      <TipTitle>Errors</TipTitle>
      <TipText>Number of incorrect keystrokes detected.</TipText>
      <TipText>Each backspace after a wrong character counts as recovering from an error.</TipText>
    </>
  ),
  totalChars: (
    <>
      <TipTitle>Total Characters</TipTitle>
      <TipText>Cumulative characters typed across all sessions.</TipText>
    </>
  ),
  totalTime: (
    <>
      <TipTitle>Total Time</TipTitle>
      <TipText>Cumulative typing time across all sessions.</TipText>
    </>
  ),
  sessions: (
    <>
      <TipTitle>Sessions</TipTitle>
      <TipText>Number of completed paragraphs/typing tests.</TipText>
    </>
  ),
  profileStrength: (
    <>
      <TipTitle>Profile Strength</TipTitle>
      <TipText>How strongly your typing matches this archetype, based on:</TipText>
      <TipText>• Flow consistency (30%)</TipText>
      <TipText>• Rhythm regularity (20%)</TipText>
      <TipText>• Accuracy (30%)</TipText>
      <TipText>• Error recovery (20%)</TipText>
      <TipHint>Higher % = more consistent typing pattern</TipHint>
    </>
  ),
  correctionStyle: (label) => ({
    perfectionist: (
      <>
        <TipTitle>Correction Style: Perfectionist</TipTitle>
        <TipText>You fix errors immediately, never letting mistakes slip by. Your backspace finger is always ready.</TipText>
        <TipHint>~0 characters typed past errors</TipHint>
      </>
    ),
    'quick corrector': (
      <>
        <TipTitle>Correction Style: Quick Corrector</TipTitle>
        <TipText>You catch errors quickly, usually within a character or two. Good balance of speed and accuracy.</TipText>
        <TipHint>~1-2 characters typed past errors</TipHint>
      </>
    ),
    steady: (
      <>
        <TipTitle>Correction Style: Steady</TipTitle>
        <TipText>Balanced approach—you notice errors but don't obsess over instant fixes. You correct when it feels natural.</TipText>
        <TipHint>~2-3 characters typed past errors</TipHint>
      </>
    ),
    'flow typer': (
      <>
        <TipTitle>Correction Style: Flow Typer</TipTitle>
        <TipText>You prioritize momentum, fixing errors in batches rather than immediately. Flow state matters more than perfection.</TipText>
        <TipHint>~3-5 characters typed past errors</TipHint>
      </>
    ),
    bulldozer: (
      <>
        <TipTitle>Correction Style: Bulldozer</TipTitle>
        <TipText>You power through mistakes, correcting them later (or not at all). Speed is king.</TipText>
        <TipHint>5+ characters typed past errors</TipHint>
      </>
    ),
  }[label] || (
    <>
      <TipTitle>Correction Style</TipTitle>
      <TipText>How you handle mistakes—from instant fixes to powering through.</TipText>
    </>
  )),
  flowState: (
    <>
      <TipTitle>Flow State</TipTitle>
      <TipText>Percentage of keystrokes within ±30% of your average speed.</TipText>
      <TipText>Higher = more consistent rhythm, you're "in the zone".</TipText>
      <TipHint>70%+ is excellent flow</TipHint>
    </>
  ),
  maxBurst: (
    <>
      <TipTitle>Max Burst</TipTitle>
      <TipText>Longest streak of consecutive fast keystrokes (faster than 80% of your average).</TipText>
      <TipText>Shows your peak performance potential when you're really cooking.</TipText>
      <TipHint>Bursts often happen on familiar words</TipHint>
    </>
  ),
  speedProfile: (label) => ({
    metronome: (
      <>
        <TipTitle>Speed Profile: Metronome</TipTitle>
        <TipText>Extremely consistent timing, like a human metronome. Your keystrokes are remarkably regular.</TipText>
        <TipHint>Variance under 30%</TipHint>
      </>
    ),
    consistent: (
      <>
        <TipTitle>Speed Profile: Consistent</TipTitle>
        <TipText>Steady pace with minimal variation. You maintain good rhythm throughout.</TipText>
        <TipHint>Variance 30-50%</TipHint>
      </>
    ),
    variable: (
      <>
        <TipTitle>Speed Profile: Variable</TipTitle>
        <TipText>Natural variation in speed, adapting to content. You speed up on easy parts and slow down on hard ones.</TipText>
        <TipHint>Variance 50-70%</TipHint>
      </>
    ),
    erratic: (
      <>
        <TipTitle>Speed Profile: Erratic</TipTitle>
        <TipText>Highly variable timing—could indicate unfamiliar content, thinking pauses, or natural typing style.</TipText>
        <TipHint>Variance over 70%</TipHint>
      </>
    ),
  }[label] || (
    <>
      <TipTitle>Speed Profile</TipTitle>
      <TipText>How consistent your typing speed is over time.</TipText>
    </>
  )),
  handBalance: (
    <>
      <TipTitle>Hand Balance</TipTitle>
      <TipText>Compares typing speed between left-hand keys (QWERTASDFGZXCVB) and right-hand keys.</TipText>
      <TipText>Shows which hand is faster on average.</TipText>
      <TipHint>Most people have a slight dominant hand advantage</TipHint>
    </>
  ),
  homeRow: (
    <>
      <TipTitle>Home Row Speed</TipTitle>
      <TipText>Speed difference on home row keys (ASDFGHJKL;) vs your overall average.</TipText>
      <TipText>Positive = faster on home row (good form). Negative = reaching might be faster for you.</TipText>
      <TipHint>Touch typists usually show +10-20% here</TipHint>
    </>
  ),
  numberRow: (
    <>
      <TipTitle>Number Row Speed</TipTitle>
      <TipText>Speed difference on number row (1234567890) vs your overall average.</TipText>
      <TipText>Most people are slower on numbers due to the reach.</TipText>
      <TipHint>+20-40% slower is typical</TipHint>
    </>
  ),
  endurance: (label) => ({
    'warming up': (
      <>
        <TipTitle>Endurance: Warming Up</TipTitle>
        <TipText>You start slow and speed up significantly as you go. Your fingers need time to get in the groove.</TipText>
        <TipHint>10%+ speed increase from start to finish</TipHint>
      </>
    ),
    accelerating: (
      <>
        <TipTitle>Endurance: Accelerating</TipTitle>
        <TipText>You gain speed as you settle into rhythm. Slight warm-up effect.</TipText>
        <TipHint>5-10% speed increase</TipHint>
      </>
    ),
    steady: (
      <>
        <TipTitle>Endurance: Steady</TipTitle>
        <TipText>Consistent speed throughout—you maintain the same pace from start to finish.</TipText>
        <TipHint>Less than ±5% change</TipHint>
      </>
    ),
    slowing: (
      <>
        <TipTitle>Endurance: Slowing</TipTitle>
        <TipText>Slight decrease in speed toward the end. Minor fatigue or attention drift.</TipText>
        <TipHint>5-15% slowdown</TipHint>
      </>
    ),
    fatigued: (
      <>
        <TipTitle>Endurance: Fatigued</TipTitle>
        <TipText>Notable slowdown as you progress. Mental or physical fatigue setting in.</TipText>
        <TipHint>15%+ slowdown</TipHint>
      </>
    ),
  }[label] || (
    <>
      <TipTitle>Endurance</TipTitle>
      <TipText>How your speed changes from start to finish.</TipText>
    </>
  )),
  capitalPenalty: (
    <>
      <TipTitle>Capital Letter Penalty</TipTitle>
      <TipText>How much slower you type capital letters compared to lowercase.</TipText>
      <TipText>Includes the time to coordinate the Shift key.</TipText>
      <TipHint>40-80% slower is typical</TipHint>
    </>
  ),
  punctuationPenalty: (
    <>
      <TipTitle>Punctuation Penalty</TipTitle>
      <TipText>How much slower you type punctuation marks compared to letters.</TipText>
      <TipText>Many punctuation keys require Shift or are in awkward positions.</TipText>
      <TipHint>50-100% slower is typical</TipHint>
    </>
  ),
  errorRecovery: (
    <>
      <TipTitle>Error Recovery</TipTitle>
      <TipText>How much your speed drops in the 3 keystrokes after making an error.</TipText>
      <TipText>Shows how much errors disrupt your flow.</TipText>
      <TipHint>10-30% slowdown is typical</TipHint>
    </>
  ),
  hesitations: (
    <>
      <TipTitle>Hesitations</TipTitle>
      <TipText>Pauses longer than 500ms between keystrokes.</TipText>
      <TipText>Could indicate thinking, difficult sequences, unfamiliar words, or distractions.</TipText>
      <TipHint>Some hesitation is normal, especially on hard words</TipHint>
    </>
  ),
  errorDistribution: (
    <>
      <TipTitle>Error Distribution</TipTitle>
      <TipText>How your errors are spread throughout the text.</TipText>
      <TipText>• Clustered: errors come in groups—one mistake leads to more</TipText>
      <TipText>• Spread out: errors evenly distributed</TipText>
      <TipText>• Random: no pattern to when errors occur</TipText>
    </>
  ),
  backspaceBehavior: (label) => ({
    efficient: (
      <>
        <TipTitle>Backspace: Efficient</TipTitle>
        <TipText>About 1 backspace per error—precise corrections. You hit backspace exactly as many times as needed.</TipText>
      </>
    ),
    cautious: (
      <>
        <TipTitle>Backspace: Cautious</TipTitle>
        <TipText>1.5+ backspaces per error—you double-check your corrections or delete a bit extra to be safe.</TipText>
      </>
    ),
    'over-corrector': (
      <>
        <TipTitle>Backspace: Over-Corrector</TipTitle>
        <TipText>2+ backspaces per error—you may over-correct, re-type sections, or use backspace preemptively.</TipText>
      </>
    ),
    'incomplete fixes': (
      <>
        <TipTitle>Backspace: Incomplete Fixes</TipTitle>
        <TipText>Less than 1 backspace per error—some errors left uncorrected. Speed over perfection.</TipText>
      </>
    ),
  }[label] || (
    <>
      <TipTitle>Backspace Behavior</TipTitle>
      <TipText>How you use backspace relative to errors made.</TipText>
    </>
  )),
  avgTravel: (
    <>
      <TipTitle>Average Travel Distance</TipTitle>
      <TipText>Average physical distance between consecutive keys on a QWERTY keyboard.</TipText>
      <TipText>Measured in key-widths (1.0 = adjacent keys).</TipText>
      <TipHint>Lower = more efficient finger movement</TipHint>
    </>
  ),
  rhythmScore: (
    <>
      <TipTitle>Rhythm Score</TipTitle>
      <TipText>How regular your keystroke timing is—like measuring if you're typing to a beat.</TipText>
      <TipText>Based on how similar each interval is to the previous one.</TipText>
      <TipHint>70%+ = very rhythmic typing</TipHint>
    </>
  ),
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
  const [clearHoldProgress, setClearHoldProgress] = useState(0)
  const [showHistory, setShowHistory] = useState(false)
  
  const lastKeystrokeTime = useRef(null)
  const startTime = useRef(null)
  const containerRef = useRef(null)
  const clearHoldTimer = useRef(null)
  const clearHoldInterval = useRef(null)

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
    
    // Aggregate counts
    const counts = {
      words: history.reduce((sum, h) => sum + (h.counts?.words || 0), 0),
      correctWords: history.reduce((sum, h) => sum + (h.counts?.correctWords || 0), 0),
      letters: history.reduce((sum, h) => sum + (h.counts?.letters || 0), 0),
      correctLetters: history.reduce((sum, h) => sum + (h.counts?.correctLetters || 0), 0),
      numbers: history.reduce((sum, h) => sum + (h.counts?.numbers || 0), 0),
      correctNumbers: history.reduce((sum, h) => sum + (h.counts?.correctNumbers || 0), 0),
      punctuation: history.reduce((sum, h) => sum + (h.counts?.punctuation || 0), 0),
      correctPunctuation: history.reduce((sum, h) => sum + (h.counts?.correctPunctuation || 0), 0),
      capitals: history.reduce((sum, h) => sum + (h.counts?.capitals || 0), 0),
      correctCapitals: history.reduce((sum, h) => sum + (h.counts?.correctCapitals || 0), 0),
      spaces: history.reduce((sum, h) => sum + (h.counts?.spaces || 0), 0),
      correctSpaces: history.reduce((sum, h) => sum + (h.counts?.correctSpaces || 0), 0),
    }
    
    // Aggregate keyStats for keyboard heatmap
    const keyStats = {}
    history.forEach(h => {
      if (h.keyStats) {
        Object.entries(h.keyStats).forEach(([key, data]) => {
          if (!keyStats[key]) {
            keyStats[key] = { times: [], count: 0 }
          }
          // Add all times and count from this session
          if (data.times) {
            keyStats[key].times.push(...data.times)
          }
          keyStats[key].count += data.count || 0
        })
      }
    })
    // Calculate averages for aggregated keyStats
    Object.keys(keyStats).forEach(key => {
      const times = keyStats[key].times
      keyStats[key].avgInterval = times.length > 0
        ? times.reduce((a, b) => a + b, 0) / times.length
        : 0
    })
    
    // Aggregate behavioral stats (weighted averages by char count)
    const behavioralHistory = history.filter(h => h.behavioral)
    const totalBehavioralChars = behavioralHistory.reduce((sum, h) => sum + h.charCount, 0)
    
    const weightedAvg = (key) => {
      if (totalBehavioralChars === 0) return 0
      return behavioralHistory.reduce((sum, h) => 
        sum + ((h.behavioral?.[key] || 0) * h.charCount), 0
      ) / totalBehavioralChars
    }
    
    const avgMomentum = weightedAvg('momentum')
    const avgFlowRatio = Math.round(weightedAvg('flowRatio'))
    const avgRhythmScore = Math.round(weightedAvg('rhythmScore'))
    const avgFatiguePercent = Math.round(weightedAvg('fatiguePercent'))
    const avgRecoveryPenalty = Math.round(weightedAvg('recoveryPenalty'))
    const avgCapitalPenalty = Math.round(weightedAvg('capitalPenalty'))
    const avgPunctuationPenalty = Math.round(weightedAvg('punctuationPenalty'))
    const avgHandBalance = Math.round(weightedAvg('handBalance'))
    const avgHomeRowAdvantage = Math.round(weightedAvg('homeRowAdvantage'))
    const avgNumberRowPenalty = Math.round(weightedAvg('numberRowPenalty'))
    const avgBackspaceEfficiency = Math.round(weightedAvg('backspaceEfficiency') * 10) / 10
    
    const totalBursts = behavioralHistory.reduce((sum, h) => sum + (h.behavioral?.burstCount || 0), 0)
    const maxBurstEver = Math.max(...behavioralHistory.map(h => h.behavioral?.maxBurst || 0), 0)
    const totalHesitations = behavioralHistory.reduce((sum, h) => sum + (h.behavioral?.hesitationCount || 0), 0)
    
    // Determine overall archetype from most common or weighted
    let momentumLabel = 'balanced'
    if (avgMomentum < 0.5) momentumLabel = 'perfectionist'
    else if (avgMomentum < 1.5) momentumLabel = 'quick corrector'
    else if (avgMomentum < 3) momentumLabel = 'steady'
    else if (avgMomentum < 5) momentumLabel = 'flow typer'
    else momentumLabel = 'bulldozer'
    
    let fatigueLabel = 'steady'
    if (avgFatiguePercent < -10) fatigueLabel = 'warming up'
    else if (avgFatiguePercent < -5) fatigueLabel = 'accelerating'
    else if (avgFatiguePercent > 15) fatigueLabel = 'fatigued'
    else if (avgFatiguePercent > 8) fatigueLabel = 'slowing'
    
    let dominantHand = 'balanced'
    if (avgHandBalance > 15) dominantHand = 'left faster'
    else if (avgHandBalance < -15) dominantHand = 'right faster'
    
    let speedProfile = 'steady'
    const avgConsistency = history.reduce((sum, h) => sum + (h.consistency || 0), 0) / history.length
    if (avgConsistency > 80) speedProfile = 'metronome'
    else if (avgConsistency > 65) speedProfile = 'consistent'
    else if (avgConsistency > 50) speedProfile = 'variable'
    else speedProfile = 'erratic'
    
    let backspaceLabel = 'efficient'
    if (avgBackspaceEfficiency > 2) backspaceLabel = 'over-corrector'
    else if (avgBackspaceEfficiency > 1.5) backspaceLabel = 'cautious'
    else if (avgBackspaceEfficiency < 1 && totalErrors > 0) backspaceLabel = 'incomplete fixes'
    
    // Generate overall archetype
    let archetype = 'The Typist'
    let archetypeDesc = ''
    
    if (avgRhythmScore > 70 && avgConsistency > 70) {
      archetype = 'The Metronome'
      archetypeDesc = 'Steady, rhythmic, predictable timing'
    } else if (avgMomentum < 1 && accuracy > 95) {
      archetype = 'The Surgeon'
      archetypeDesc = 'Precise, careful, catches every error instantly'
    } else if (avgMomentum > 4 && wpm > 60) {
      archetype = 'The Steamroller'
      archetypeDesc = 'Powers through mistakes, prioritizes speed'
    } else if (maxBurstEver > 15 && avgFlowRatio > 60) {
      archetype = 'The Sprinter'
      archetypeDesc = 'Explosive bursts of speed, then regroups'
    } else if (avgFatiguePercent < -10) {
      archetype = 'The Slow Starter'
      archetypeDesc = 'Warms up over time, finishes strong'
    } else if (avgFatiguePercent > 15) {
      archetype = 'The Fader'
      archetypeDesc = 'Strong start, loses steam as they go'
    } else if (avgFlowRatio > 70 && avgConsistency > 60) {
      archetype = 'The Flow State'
      archetypeDesc = 'Locked in, consistent rhythm, in the zone'
    } else if (avgRecoveryPenalty > 30) {
      archetype = 'The Rattled'
      archetypeDesc = 'Errors throw off their groove'
    } else if (avgRecoveryPenalty < 10 && totalErrors > 0) {
      archetype = 'The Unfazed'
      archetypeDesc = 'Errors don\'t break their stride'
    } else if (wpm > 80) {
      archetype = 'The Speedster'
      archetypeDesc = 'Raw speed is the name of the game'
    } else if (accuracy > 98) {
      archetype = 'The Perfectionist'
      archetypeDesc = 'Accuracy above all else'
    }
    
    const confidenceScore = Math.round(
      (avgFlowRatio * 0.3) + 
      (avgRhythmScore * 0.2) + 
      (accuracy * 0.3) + 
      ((100 - Math.min(avgRecoveryPenalty, 100)) * 0.2)
    )
    
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
    
    // Average errors per session
    const avgErrors = totalErrors / history.length
    
    return {
      sessions: history.length,
      totalChars,
      totalErrors,
      totalTime: Math.round(totalTime / 1000),
      wpm,
      accuracy,
      consistency: Math.round(avgConsistency),
      avgErrors: Math.round(avgErrors * 10) / 10,
      avgInterval: Math.round(avgInterval),
      avgWordInterval: Math.round(avgWordInterval),
      avgDistance: Math.round(avgDistance * 100) / 100,
      slowestBigrams,
      fastestBigrams,
      impressiveBigrams,
      counts,
      keyStats,
      history, // Include history for review
      behavioral: {
        momentum: Math.round(avgMomentum * 10) / 10,
        momentumLabel,
        flowRatio: avgFlowRatio,
        rhythmScore: avgRhythmScore,
        fatiguePercent: avgFatiguePercent,
        fatigueLabel,
        maxBurst: maxBurstEver,
        totalBursts,
        totalHesitations,
        recoveryPenalty: avgRecoveryPenalty,
        capitalPenalty: avgCapitalPenalty,
        punctuationPenalty: avgPunctuationPenalty,
        handBalance: avgHandBalance,
        dominantHand,
        homeRowAdvantage: avgHomeRowAdvantage,
        numberRowPenalty: avgNumberRowPenalty,
        backspaceEfficiency: avgBackspaceEfficiency,
        backspaceLabel,
        speedProfile,
        archetype,
        archetypeDesc,
        confidenceScore,
      }
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
    
    // --- Hand balance (left vs right side of keyboard) ---
    const leftKeys = 'qwertasdfgzxcvb`12345'
    const rightKeys = 'yuiophjklnm67890-=[];\'\\,./'
    let leftTotal = 0, leftCount = 0, rightTotal = 0, rightCount = 0
    
    data.forEach(d => {
      if (d.correct && d.interval && d.expected) {
        const key = d.expected.toLowerCase()
        if (leftKeys.includes(key)) {
          leftTotal += d.interval
          leftCount++
        } else if (rightKeys.includes(key)) {
          rightTotal += d.interval
          rightCount++
        }
      }
    })
    
    const leftAvg = leftCount > 0 ? leftTotal / leftCount : avgInterval
    const rightAvg = rightCount > 0 ? rightTotal / rightCount : avgInterval
    const handBalance = leftAvg > 0 && rightAvg > 0
      ? Math.round((rightAvg / leftAvg) * 100 - 100)
      : 0
    
    let dominantHand = 'balanced'
    if (handBalance > 15) dominantHand = 'left faster'
    else if (handBalance < -15) dominantHand = 'right faster'
    
    // --- Home row affinity ---
    const homeRow = 'asdfghjkl;\''
    let homeTotal = 0, homeCount = 0
    data.forEach(d => {
      if (d.correct && d.interval && d.expected) {
        if (homeRow.includes(d.expected.toLowerCase())) {
          homeTotal += d.interval
          homeCount++
        }
      }
    })
    const homeRowAvg = homeCount > 0 ? homeTotal / homeCount : avgInterval
    const homeRowAdvantage = avgInterval > 0 
      ? Math.round((1 - homeRowAvg / avgInterval) * 100)
      : 0
    
    // --- Number row comfort ---
    const numberRow = '1234567890'
    let numTotal = 0, numCount = 0
    data.forEach(d => {
      if (d.correct && d.interval && d.expected) {
        if (numberRow.includes(d.expected)) {
          numTotal += d.interval
          numCount++
        }
      }
    })
    const numberRowAvg = numCount > 0 ? numTotal / numCount : avgInterval
    const numberRowPenalty = avgInterval > 0 
      ? Math.round((numberRowAvg / avgInterval - 1) * 100)
      : 0
    
    // --- Speed variance analysis ---
    const speedVariance = stdDev / avgInterval
    let speedProfile = 'steady'
    if (speedVariance < 0.3) speedProfile = 'metronome'
    else if (speedVariance < 0.5) speedProfile = 'consistent'
    else if (speedVariance < 0.7) speedProfile = 'variable'
    else speedProfile = 'erratic'
    
    // --- Generate typing archetype ---
    let archetype = 'The Typist'
    let archetypeDesc = ''
    
    // Determine primary archetype based on key characteristics
    if (rhythmScore > 70 && consistency > 70) {
      archetype = 'The Metronome'
      archetypeDesc = 'Steady, rhythmic, predictable timing'
    } else if (avgMomentum < 1 && accuracy > 95) {
      archetype = 'The Surgeon'
      archetypeDesc = 'Precise, careful, catches every error instantly'
    } else if (avgMomentum > 4 && wpm > 60) {
      archetype = 'The Steamroller'
      archetypeDesc = 'Powers through mistakes, prioritizes speed'
    } else if (maxBurst > 15 && flowRatio > 60) {
      archetype = 'The Sprinter'
      archetypeDesc = 'Explosive bursts of speed, then regroups'
    } else if (fatiguePercent < -10) {
      archetype = 'The Slow Starter'
      archetypeDesc = 'Warms up over time, finishes strong'
    } else if (fatiguePercent > 15) {
      archetype = 'The Fader'
      archetypeDesc = 'Strong start, loses steam as they go'
    } else if (hesitationCount > charCount / 50) {
      archetype = 'The Thinker'
      archetypeDesc = 'Pauses to consider, deliberate approach'
    } else if (flowRatio > 70 && consistency > 60) {
      archetype = 'The Flow State'
      archetypeDesc = 'Locked in, consistent rhythm, in the zone'
    } else if (recoveryPenalty > 30) {
      archetype = 'The Rattled'
      archetypeDesc = 'Errors throw off their groove'
    } else if (recoveryPenalty < 10 && errorCount > 0) {
      archetype = 'The Unfazed'
      archetypeDesc = 'Errors don\'t break their stride'
    } else if (wpm > 80) {
      archetype = 'The Speedster'
      archetypeDesc = 'Raw speed is the name of the game'
    } else if (accuracy > 98) {
      archetype = 'The Perfectionist'
      archetypeDesc = 'Accuracy above all else'
    }
    
    // --- Confidence score (composite metric) ---
    const confidenceScore = Math.round(
      (flowRatio * 0.3) + 
      (rhythmScore * 0.2) + 
      (accuracy * 0.3) + 
      ((100 - Math.min(recoveryPenalty, 100)) * 0.2)
    )
    
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
      // Counts
      counts: {
        words: wordIntervals.length + 1,
        correctWords: data.filter((d, i) => {
          // A word is correct if all chars up to the next space are correct
          if (d.expected !== ' ') return false
          let wordStart = i - 1
          while (wordStart >= 0 && data[wordStart].expected !== ' ') wordStart--
          wordStart++
          return data.slice(wordStart, i).every(k => k.correct)
        }).length + (data.length > 0 && data[data.length - 1].correct ? 1 : 0),
        letters: data.filter(d => d.expected && /[a-zA-Z]/.test(d.expected)).length,
        correctLetters: data.filter(d => d.correct && d.expected && /[a-zA-Z]/.test(d.expected)).length,
        numbers: data.filter(d => d.expected && /[0-9]/.test(d.expected)).length,
        correctNumbers: data.filter(d => d.correct && d.expected && /[0-9]/.test(d.expected)).length,
        punctuation: data.filter(d => d.expected && /[.,;:!?'"()\-]/.test(d.expected)).length,
        correctPunctuation: data.filter(d => d.correct && d.expected && /[.,;:!?'"()\-]/.test(d.expected)).length,
        capitals: data.filter(d => d.expected && d.expected === d.expected.toUpperCase() && d.expected !== d.expected.toLowerCase()).length,
        correctCapitals: data.filter(d => d.correct && d.expected && d.expected === d.expected.toUpperCase() && d.expected !== d.expected.toLowerCase()).length,
        spaces: data.filter(d => d.expected === ' ').length,
        correctSpaces: data.filter(d => d.correct && d.expected === ' ').length,
      },
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
        // New stats
        handBalance,
        dominantHand,
        homeRowAdvantage,
        numberRowPenalty,
        speedProfile,
        archetype,
        archetypeDesc,
        confidenceScore,
        burstCount: bursts.length,
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
        wpm: finalStats.wpm,
        accuracy: finalStats.accuracy,
        consistency: finalStats.consistency,
        intervals: finalStats.intervals,
        wordIntervals: finalStats.wordIntervals,
        distances: finalStats.distances,
        bigrams: finalStats.bigrams,
        counts: finalStats.counts,
        keyStats: finalStats.keyStats,
        behavioral: {
          momentum: finalStats.behavioral.momentum,
          flowRatio: finalStats.behavioral.flowRatio,
          maxBurst: finalStats.behavioral.maxBurst,
          burstCount: finalStats.behavioral.burstCount,
          rhythmScore: finalStats.behavioral.rhythmScore,
          fatiguePercent: finalStats.behavioral.fatiguePercent,
          hesitationCount: finalStats.behavioral.hesitationCount,
          recoveryPenalty: finalStats.behavioral.recoveryPenalty,
          capitalPenalty: finalStats.behavioral.capitalPenalty,
          punctuationPenalty: finalStats.behavioral.punctuationPenalty,
          handBalance: finalStats.behavioral.handBalance,
          homeRowAdvantage: finalStats.behavioral.homeRowAdvantage,
          numberRowPenalty: finalStats.behavioral.numberRowPenalty,
          backspaceEfficiency: finalStats.behavioral.backspaceEfficiency,
        }
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
    resetTest(true)
    setCumulativeStats(null)
    setCompletedCount(0)
  }
  
  const startClearHold = () => {
    setClearHoldProgress(0)
    clearHoldInterval.current = setInterval(() => {
      setClearHoldProgress(prev => {
        if (prev >= 100) {
          clearInterval(clearHoldInterval.current)
          clearHistory()
          return 0
        }
        return prev + 5 // 20 steps over ~1 second
      })
    }, 50)
  }
  
  const cancelClearHold = () => {
    if (clearHoldInterval.current) {
      clearInterval(clearHoldInterval.current)
    }
    setClearHoldProgress(0)
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
        <p className="tagline">absurdly detailed stats about how you type</p>
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
            <div className="stats-header">
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
              <button 
                className="history-btn"
                onClick={() => setShowHistory(true)}
                title="View session history"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <polyline points="12 6 12 12 16 14"/>
                </svg>
                History
              </button>
            </div>
          )}
          
          {statsView === 'current' ? (
            <>
              {/* Current paragraph stats */}
              <div className="stat-grid primary">
                <Tooltip content={TIPS.wpm}>
                  <div className="stat">
                    <span className="stat-value">
                      {stats.wpm}
                      {cumulativeStats && cumulativeStats.sessions > 1 && (
                        <span className={`stat-delta ${stats.wpm >= cumulativeStats.wpm ? 'positive' : 'negative'}`}>
                          {stats.wpm >= cumulativeStats.wpm ? '↑' : '↓'}{Math.abs(stats.wpm - cumulativeStats.wpm)}
                        </span>
                      )}
                    </span>
                    <span className="stat-label">wpm</span>
                  </div>
                </Tooltip>
                <Tooltip content={TIPS.accuracy}>
                  <div className="stat">
                    <span className="stat-value">
                      {stats.accuracy}%
                      {cumulativeStats && cumulativeStats.sessions > 1 && (
                        <span className={`stat-delta ${stats.accuracy >= cumulativeStats.accuracy ? 'positive' : 'negative'}`}>
                          {stats.accuracy >= cumulativeStats.accuracy ? '↑' : '↓'}{Math.abs(stats.accuracy - cumulativeStats.accuracy)}
                        </span>
                      )}
                    </span>
                    <span className="stat-label">accuracy</span>
                  </div>
                </Tooltip>
                <Tooltip content={TIPS.consistency}>
                  <div className="stat">
                    <span className="stat-value">
                      {stats.consistency}%
                      {cumulativeStats && cumulativeStats.sessions > 1 && (
                        <span className={`stat-delta ${stats.consistency >= cumulativeStats.consistency ? 'positive' : 'negative'}`}>
                          {stats.consistency >= cumulativeStats.consistency ? '↑' : '↓'}{Math.abs(stats.consistency - cumulativeStats.consistency)}
                        </span>
                      )}
                    </span>
                    <span className="stat-label">consistency</span>
                  </div>
                </Tooltip>
                <Tooltip content={TIPS.time}>
                  <div className="stat">
                    <span className="stat-value">{stats.totalTime}s</span>
                    <span className="stat-label">time</span>
                  </div>
                </Tooltip>
              </div>
              
              <div className="stat-grid secondary">
                <Tooltip content={TIPS.avgKeystroke}>
                  <div className="stat small">
                    <span className="stat-value">
                      {stats.avgInterval}ms
                      {cumulativeStats && cumulativeStats.sessions > 1 && (
                        <span className={`stat-delta ${stats.avgInterval <= cumulativeStats.avgInterval ? 'positive' : 'negative'}`}>
                          {stats.avgInterval <= cumulativeStats.avgInterval ? '↓' : '↑'}{Math.abs(stats.avgInterval - cumulativeStats.avgInterval)}
                        </span>
                      )}
                    </span>
                    <span className="stat-label">avg keystroke</span>
                  </div>
                </Tooltip>
                <Tooltip content={TIPS.avgWordTime}>
                  <div className="stat small">
                    <span className="stat-value">{stats.avgWordInterval}ms</span>
                    <span className="stat-label">avg word time</span>
                  </div>
                </Tooltip>
                <Tooltip content={TIPS.avgTravel}>
                  <div className="stat small">
                    <span className="stat-value">{stats.avgDistance}</span>
                    <span className="stat-label">avg travel <span className="label-hint">(keys apart)</span></span>
                  </div>
                </Tooltip>
                <Tooltip content={TIPS.errors}>
                  <div className="stat small">
                    <span className="stat-value">
                      {stats.errorCount}
                      {cumulativeStats && cumulativeStats.sessions > 1 && (
                        <span className={`stat-delta ${stats.errorCount <= cumulativeStats.avgErrors ? 'positive' : 'negative'}`}>
                          {stats.errorCount <= cumulativeStats.avgErrors ? '↓' : '↑'}{Math.abs(Math.round((stats.errorCount - cumulativeStats.avgErrors) * 10) / 10)}
                        </span>
                      )}
                    </span>
                    <span className="stat-label">errors</span>
                  </div>
                </Tooltip>
              </div>
              
              {/* Character Counts */}
              {stats.counts && (
                <div className="counts-section">
                  <h3 className="counts-header">Character Breakdown</h3>
                  <div className="counts-grid">
                    <div className="count-item">
                      <span className="count-value">{stats.counts.correctWords || 0}</span>
                      <span className="count-label">words</span>
                      <span className="count-accuracy">
                        {stats.counts.words > 0 
                          ? Math.round((stats.counts.correctWords / stats.counts.words) * 100) 
                          : 0}% ✓
                      </span>
                    </div>
                    <div className="count-item">
                      <span className="count-value">{stats.counts.correctLetters || 0}</span>
                      <span className="count-label">letters</span>
                      <span className="count-accuracy">
                        {stats.counts.letters > 0 
                          ? Math.round((stats.counts.correctLetters / stats.counts.letters) * 100) 
                          : 0}% ✓
                      </span>
                    </div>
                    <div className="count-item">
                      <span className="count-value">{stats.counts.correctNumbers || 0}</span>
                      <span className="count-label">numbers</span>
                      <span className="count-accuracy">
                        {stats.counts.numbers > 0 
                          ? Math.round((stats.counts.correctNumbers / stats.counts.numbers) * 100) 
                          : 0}% ✓
                      </span>
                    </div>
                    <div className="count-item">
                      <span className="count-value">{stats.counts.correctPunctuation || 0}</span>
                      <span className="count-label">punctuation</span>
                      <span className="count-accuracy">
                        {stats.counts.punctuation > 0 
                          ? Math.round((stats.counts.correctPunctuation / stats.counts.punctuation) * 100) 
                          : 0}% ✓
                      </span>
                    </div>
                    <div className="count-item">
                      <span className="count-value">{stats.counts.correctCapitals || 0}</span>
                      <span className="count-label">capitals</span>
                      <span className="count-accuracy">
                        {stats.counts.capitals > 0 
                          ? Math.round((stats.counts.correctCapitals / stats.counts.capitals) * 100) 
                          : 0}% ✓
                      </span>
                    </div>
                    <div className="count-item">
                      <span className="count-value">{stats.counts.correctSpaces || 0}</span>
                      <span className="count-label">spaces</span>
                      <span className="count-accuracy">
                        {stats.counts.spaces > 0 
                          ? Math.round((stats.counts.correctSpaces / stats.counts.spaces) * 100) 
                          : 0}% ✓
                      </span>
                    </div>
                  </div>
                </div>
              )}
              
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
                      {distance && <span className="bigram-distance" title="Physical distance on keyboard">{distance.toFixed(1)} keys apart</span>}
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
                      {distance && <span className="bigram-distance" title="Physical distance on keyboard">{distance.toFixed(1)} keys apart</span>}
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
                      <span className="bigram-distance" title="Physical distance on keyboard">{distance.toFixed(1)} keys apart</span>
                    </span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Behavioral Insights */}
          {stats.behavioral && (
            <div className="behavioral-section">
              {/* Archetype Header */}
              <div className="archetype-card">
                <span className="archetype-name">{stats.behavioral.archetype}</span>
                <span className="archetype-desc">{stats.behavioral.archetypeDesc}</span>
                <Tooltip content={TIPS.profileStrength}>
                  <div className="profile-strength">
                    <span className="strength-label">profile strength</span>
                    <div className="strength-bar">
                      <div 
                        className="strength-fill" 
                        style={{ width: `${stats.behavioral.confidenceScore}%` }}
                      />
                    </div>
                    <span className="strength-value">{stats.behavioral.confidenceScore}%</span>
                  </div>
                </Tooltip>
              </div>
              
              <h3 className="behavioral-header">Typing Profile</h3>
              
              <div className="behavioral-grid">
                <Tooltip content={TIPS.correctionStyle(stats.behavioral.momentumLabel)}>
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
                </Tooltip>
                
                <Tooltip content={TIPS.flowState}>
                  <div className="behavioral-card">
                    <div className="behavioral-main">
                      <span className="behavioral-value">{stats.behavioral.flowRatio}%</span>
                      <span className="behavioral-label">flow state</span>
                    </div>
                    <p className="behavioral-detail">keystrokes in rhythm zone</p>
                  </div>
                </Tooltip>
                
                <Tooltip content={TIPS.maxBurst}>
                  <div className="behavioral-card">
                    <div className="behavioral-main">
                      <span className="behavioral-value">{stats.behavioral.maxBurst}</span>
                      <span className="behavioral-label">max burst</span>
                    </div>
                    <p className="behavioral-detail">
                      {stats.behavioral.burstCount} bursts total
                    </p>
                  </div>
                </Tooltip>
                
                <Tooltip content={TIPS.speedProfile(stats.behavioral.speedProfile)}>
                  <div className="behavioral-card">
                    <div className="behavioral-main">
                      <span className="behavioral-value">{stats.behavioral.speedProfile}</span>
                      <span className="behavioral-label">speed profile</span>
                    </div>
                    <p className="behavioral-detail">{stats.behavioral.rhythmScore}% rhythm score</p>
                  </div>
                </Tooltip>
              </div>
              
              <div className="behavioral-grid">
                <Tooltip content={TIPS.handBalance}>
                  <div className="behavioral-card">
                    <div className="behavioral-main">
                      <span className="behavioral-value">{stats.behavioral.dominantHand}</span>
                      <span className="behavioral-label">hand balance</span>
                    </div>
                    <p className="behavioral-detail">
                      {Math.abs(stats.behavioral.handBalance)}% {stats.behavioral.handBalance > 0 ? 'left' : 'right'} advantage
                    </p>
                  </div>
                </Tooltip>
                
                <Tooltip content={TIPS.homeRow}>
                  <div className="behavioral-card">
                    <div className="behavioral-main">
                      <span className="behavioral-value">
                        {stats.behavioral.homeRowAdvantage > 0 ? '+' : ''}{stats.behavioral.homeRowAdvantage}%
                      </span>
                      <span className="behavioral-label">home row</span>
                    </div>
                    <p className="behavioral-detail">
                      {stats.behavioral.homeRowAdvantage > 0 ? 'faster' : 'slower'} than average
                    </p>
                  </div>
                </Tooltip>
                
                <Tooltip content={TIPS.numberRow}>
                  <div className="behavioral-card">
                    <div className="behavioral-main">
                      <span className="behavioral-value">
                        {stats.behavioral.numberRowPenalty > 0 ? '+' : ''}{stats.behavioral.numberRowPenalty}%
                      </span>
                      <span className="behavioral-label">number row</span>
                    </div>
                    <p className="behavioral-detail">
                      {stats.behavioral.numberRowPenalty > 0 ? 'slower' : 'faster'} than average
                    </p>
                  </div>
                </Tooltip>
                
                <Tooltip content={TIPS.endurance(stats.behavioral.fatigueLabel)}>
                  <div className="behavioral-card">
                    <div className="behavioral-main">
                      <span className="behavioral-value">{stats.behavioral.fatigueLabel}</span>
                      <span className="behavioral-label">endurance</span>
                    </div>
                    <p className="behavioral-detail">
                      {stats.behavioral.fatiguePercent > 0 ? '+' : ''}{stats.behavioral.fatiguePercent}% speed change
                    </p>
                  </div>
                </Tooltip>
              </div>
              
              <div className="behavioral-details">
                <Tooltip content={TIPS.capitalPenalty}>
                  <div className="detail-row">
                    <span className="detail-label">capital letter penalty</span>
                    <span className="detail-value">
                      <span className={stats.behavioral.capitalPenalty > 80 ? 'text-warn' : ''}>
                        {stats.behavioral.capitalPenalty > 0 ? '+' : ''}{stats.behavioral.capitalPenalty}%
                      </span>
                      <span className="detail-note">slower on capitals</span>
                    </span>
                  </div>
                </Tooltip>
                
                <Tooltip content={TIPS.punctuationPenalty}>
                  <div className="detail-row">
                    <span className="detail-label">punctuation penalty</span>
                    <span className="detail-value">
                      <span className={stats.behavioral.punctuationPenalty > 100 ? 'text-warn' : ''}>
                        {stats.behavioral.punctuationPenalty > 0 ? '+' : ''}{stats.behavioral.punctuationPenalty}%
                      </span>
                      <span className="detail-note">slower on symbols</span>
                    </span>
                  </div>
                </Tooltip>
                
                <Tooltip content={TIPS.errorRecovery}>
                  <div className="detail-row">
                    <span className="detail-label">error recovery</span>
                    <span className="detail-value">
                      <span className={stats.behavioral.recoveryPenalty > 40 ? 'text-warn' : ''}>
                        {stats.behavioral.recoveryPenalty > 0 ? '+' : ''}{stats.behavioral.recoveryPenalty}%
                      </span>
                      <span className="detail-note">slower after mistakes</span>
                    </span>
                  </div>
                </Tooltip>
                
                <Tooltip content={TIPS.hesitations}>
                  <div className="detail-row">
                    <span className="detail-label">hesitations</span>
                    <span className="detail-value">
                      {stats.behavioral.hesitationCount}
                      {stats.behavioral.hesitationCount > 0 && (
                        <span className="detail-note">pauses &gt;500ms (avg {stats.behavioral.avgHesitation}ms)</span>
                      )}
                    </span>
                  </div>
                </Tooltip>
                
                <Tooltip content={TIPS.errorDistribution}>
                  <div className="detail-row">
                    <span className="detail-label">error distribution</span>
                    <span className="detail-value">{stats.behavioral.errorPattern}</span>
                  </div>
                </Tooltip>
                
                <Tooltip content={TIPS.backspaceBehavior(stats.behavioral.backspaceLabel)}>
                  <div className="detail-row">
                    <span className="detail-label">backspace behavior</span>
                    <span className="detail-value">
                      {stats.behavioral.backspaceLabel}
                      <span className="detail-note">{stats.behavioral.backspaceEfficiency}× per error</span>
                    </span>
                  </div>
                </Tooltip>
              </div>
            </div>
          )}
            </>
          ) : (
            /* All-time stats view */
            cumulativeStats && (
              <>
                <div className="stat-grid primary">
                  <Tooltip content={TIPS.wpm}>
                    <div className="stat">
                      <span className="stat-value">{cumulativeStats.wpm}</span>
                      <span className="stat-label">avg wpm</span>
                    </div>
                  </Tooltip>
                  <Tooltip content={TIPS.accuracy}>
                    <div className="stat">
                      <span className="stat-value">{cumulativeStats.accuracy}%</span>
                      <span className="stat-label">accuracy</span>
                    </div>
                  </Tooltip>
                  <Tooltip content={TIPS.totalChars}>
                    <div className="stat">
                      <span className="stat-value">{cumulativeStats.totalChars.toLocaleString()}</span>
                      <span className="stat-label">total chars</span>
                    </div>
                  </Tooltip>
                  <Tooltip content={TIPS.totalTime}>
                    <div className="stat">
                      <span className="stat-value">{Math.round(cumulativeStats.totalTime / 60)}m</span>
                      <span className="stat-label">total time</span>
                    </div>
                  </Tooltip>
                </div>
                
                <div className="stat-grid secondary">
                  <Tooltip content={TIPS.avgKeystroke}>
                    <div className="stat small">
                      <span className="stat-value">{cumulativeStats.avgInterval}ms</span>
                      <span className="stat-label">avg keystroke</span>
                    </div>
                  </Tooltip>
                  <Tooltip content={TIPS.avgWordTime}>
                    <div className="stat small">
                      <span className="stat-value">{cumulativeStats.avgWordInterval}ms</span>
                      <span className="stat-label">avg word time</span>
                    </div>
                  </Tooltip>
                  <Tooltip content={TIPS.avgTravel}>
                    <div className="stat small">
                      <span className="stat-value">{cumulativeStats.avgDistance}</span>
                      <span className="stat-label">avg travel <span className="label-hint">(keys apart)</span></span>
                    </div>
                  </Tooltip>
                  <Tooltip content={TIPS.sessions}>
                    <div className="stat small">
                      <span className="stat-value">{cumulativeStats.sessions}</span>
                      <span className="stat-label">sessions</span>
                    </div>
                  </Tooltip>
                </div>
                
                {/* Counts breakdown */}
                {cumulativeStats.counts && (
                  <div className="counts-section">
                    <h3 className="counts-header">Character Breakdown</h3>
                    <div className="counts-grid">
                      <div className="count-item">
                        <span className="count-value">{cumulativeStats.counts.correctWords || 0}</span>
                        <span className="count-label">words</span>
                        <span className="count-accuracy">
                          {cumulativeStats.counts.words > 0 
                            ? Math.round((cumulativeStats.counts.correctWords / cumulativeStats.counts.words) * 100) 
                            : 0}% correct
                        </span>
                      </div>
                      <div className="count-item">
                        <span className="count-value">{cumulativeStats.counts.correctLetters || 0}</span>
                        <span className="count-label">letters</span>
                        <span className="count-accuracy">
                          {cumulativeStats.counts.letters > 0 
                            ? Math.round((cumulativeStats.counts.correctLetters / cumulativeStats.counts.letters) * 100) 
                            : 0}% correct
                        </span>
                      </div>
                      <div className="count-item">
                        <span className="count-value">{cumulativeStats.counts.correctNumbers || 0}</span>
                        <span className="count-label">numbers</span>
                        <span className="count-accuracy">
                          {cumulativeStats.counts.numbers > 0 
                            ? Math.round((cumulativeStats.counts.correctNumbers / cumulativeStats.counts.numbers) * 100) 
                            : 0}% correct
                        </span>
                      </div>
                      <div className="count-item">
                        <span className="count-value">{cumulativeStats.counts.correctPunctuation || 0}</span>
                        <span className="count-label">punctuation</span>
                        <span className="count-accuracy">
                          {cumulativeStats.counts.punctuation > 0 
                            ? Math.round((cumulativeStats.counts.correctPunctuation / cumulativeStats.counts.punctuation) * 100) 
                            : 0}% correct
                        </span>
                      </div>
                      <div className="count-item">
                        <span className="count-value">{cumulativeStats.counts.correctCapitals || 0}</span>
                        <span className="count-label">capitals</span>
                        <span className="count-accuracy">
                          {cumulativeStats.counts.capitals > 0 
                            ? Math.round((cumulativeStats.counts.correctCapitals / cumulativeStats.counts.capitals) * 100) 
                            : 0}% correct
                        </span>
                      </div>
                      <div className="count-item">
                        <span className="count-value">{cumulativeStats.counts.correctSpaces || 0}</span>
                        <span className="count-label">spaces</span>
                        <span className="count-accuracy">
                          {cumulativeStats.counts.spaces > 0 
                            ? Math.round((cumulativeStats.counts.correctSpaces / cumulativeStats.counts.spaces) * 100) 
                            : 0}% correct
                        </span>
                      </div>
                    </div>
                  </div>
                )}
                
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
                            <span className="bigram-distance" title="Keys apart on keyboard">{distance.toFixed(1)} apart</span>
                          </span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Keyboard Analysis for All Time */}
                {cumulativeStats.keyStats && Object.keys(cumulativeStats.keyStats).length > 0 && (
                  <div className="keyboard-section">
                    <div className="keyboard-header">
                      <h3>Keyboard Analysis (All Time)</h3>
                      <div className="mini-toggles">
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
                    <KeyboardHeatmap keyStats={cumulativeStats.keyStats} mode={heatmapMode} />
                    
                    <div className="keyboard-flows">
                      <KeyboardFlowMap topBigrams={cumulativeStats.slowestBigrams} flowType="slow" />
                      <KeyboardFlowMap topBigrams={cumulativeStats.fastestBigrams} flowType="fast" />
                    </div>
                  </div>
                )}
                
                {/* Behavioral Insights for All Time */}
                {cumulativeStats.behavioral && (
                  <div className="behavioral-section">
                    {/* Archetype Header */}
                    <div className="archetype-card">
                      <span className="archetype-name">{cumulativeStats.behavioral.archetype}</span>
                      <span className="archetype-desc">{cumulativeStats.behavioral.archetypeDesc}</span>
                      <Tooltip content={TIPS.profileStrength}>
                        <div className="profile-strength">
                          <span className="strength-label">profile strength</span>
                          <div className="strength-bar">
                            <div 
                              className="strength-fill" 
                              style={{ width: `${cumulativeStats.behavioral.confidenceScore}%` }}
                            />
                          </div>
                          <span className="strength-value">{cumulativeStats.behavioral.confidenceScore}%</span>
                        </div>
                      </Tooltip>
                    </div>
                    
                    <h3 className="behavioral-header">Typing Profile (All Time)</h3>
                    
                    <div className="behavioral-grid">
                      <Tooltip content={TIPS.correctionStyle(cumulativeStats.behavioral.momentumLabel)}>
                        <div className="behavioral-card">
                          <div className="behavioral-main">
                            <span className="behavioral-value">{cumulativeStats.behavioral.momentumLabel}</span>
                            <span className="behavioral-label">correction style</span>
                          </div>
                          <p className="behavioral-detail">
                            {cumulativeStats.behavioral.momentum > 0 
                              ? `~${cumulativeStats.behavioral.momentum} chars past errors`
                              : 'Instant corrections'}
                          </p>
                        </div>
                      </Tooltip>
                      
                      <Tooltip content={TIPS.flowState}>
                        <div className="behavioral-card">
                          <div className="behavioral-main">
                            <span className="behavioral-value">{cumulativeStats.behavioral.flowRatio}%</span>
                            <span className="behavioral-label">flow state</span>
                          </div>
                          <p className="behavioral-detail">keystrokes in rhythm zone</p>
                        </div>
                      </Tooltip>
                      
                      <Tooltip content={TIPS.maxBurst}>
                        <div className="behavioral-card">
                          <div className="behavioral-main">
                            <span className="behavioral-value">{cumulativeStats.behavioral.maxBurst}</span>
                            <span className="behavioral-label">best burst</span>
                          </div>
                          <p className="behavioral-detail">
                            {cumulativeStats.behavioral.totalBursts} total bursts
                          </p>
                        </div>
                      </Tooltip>
                      
                      <Tooltip content={TIPS.speedProfile(cumulativeStats.behavioral.speedProfile)}>
                        <div className="behavioral-card">
                          <div className="behavioral-main">
                            <span className="behavioral-value">{cumulativeStats.behavioral.speedProfile}</span>
                            <span className="behavioral-label">speed profile</span>
                          </div>
                          <p className="behavioral-detail">{cumulativeStats.behavioral.rhythmScore}% rhythm score</p>
                        </div>
                      </Tooltip>
                    </div>
                    
                    <div className="behavioral-grid">
                      <Tooltip content={TIPS.handBalance}>
                        <div className="behavioral-card">
                          <div className="behavioral-main">
                            <span className="behavioral-value">{cumulativeStats.behavioral.dominantHand}</span>
                            <span className="behavioral-label">hand balance</span>
                          </div>
                          <p className="behavioral-detail">
                            {Math.abs(cumulativeStats.behavioral.handBalance)}% {cumulativeStats.behavioral.handBalance > 0 ? 'left' : 'right'} advantage
                          </p>
                        </div>
                      </Tooltip>
                      
                      <Tooltip content={TIPS.homeRow}>
                        <div className="behavioral-card">
                          <div className="behavioral-main">
                            <span className="behavioral-value">
                              {cumulativeStats.behavioral.homeRowAdvantage > 0 ? '+' : ''}{cumulativeStats.behavioral.homeRowAdvantage}%
                            </span>
                            <span className="behavioral-label">home row</span>
                          </div>
                          <p className="behavioral-detail">
                            {cumulativeStats.behavioral.homeRowAdvantage > 0 ? 'faster' : 'slower'} than average
                          </p>
                        </div>
                      </Tooltip>
                      
                      <Tooltip content={TIPS.numberRow}>
                        <div className="behavioral-card">
                          <div className="behavioral-main">
                            <span className="behavioral-value">
                              {cumulativeStats.behavioral.numberRowPenalty > 0 ? '+' : ''}{cumulativeStats.behavioral.numberRowPenalty}%
                            </span>
                            <span className="behavioral-label">number row</span>
                          </div>
                          <p className="behavioral-detail">
                            {cumulativeStats.behavioral.numberRowPenalty > 0 ? 'slower' : 'faster'} than average
                          </p>
                        </div>
                      </Tooltip>
                      
                      <Tooltip content={TIPS.endurance(cumulativeStats.behavioral.fatigueLabel)}>
                        <div className="behavioral-card">
                          <div className="behavioral-main">
                            <span className="behavioral-value">{cumulativeStats.behavioral.fatigueLabel}</span>
                            <span className="behavioral-label">endurance</span>
                          </div>
                          <p className="behavioral-detail">
                            {cumulativeStats.behavioral.fatiguePercent > 0 ? '+' : ''}{cumulativeStats.behavioral.fatiguePercent}% avg change
                          </p>
                        </div>
                      </Tooltip>
                    </div>
                    
                    <div className="behavioral-details">
                      <Tooltip content={TIPS.capitalPenalty}>
                        <div className="detail-row">
                          <span className="detail-label">capital letter penalty</span>
                          <span className="detail-value">
                            <span className={cumulativeStats.behavioral.capitalPenalty > 80 ? 'text-warn' : ''}>
                              {cumulativeStats.behavioral.capitalPenalty > 0 ? '+' : ''}{cumulativeStats.behavioral.capitalPenalty}%
                            </span>
                            <span className="detail-note">slower on capitals</span>
                          </span>
                        </div>
                      </Tooltip>
                      
                      <Tooltip content={TIPS.punctuationPenalty}>
                        <div className="detail-row">
                          <span className="detail-label">punctuation penalty</span>
                          <span className="detail-value">
                            <span className={cumulativeStats.behavioral.punctuationPenalty > 100 ? 'text-warn' : ''}>
                              {cumulativeStats.behavioral.punctuationPenalty > 0 ? '+' : ''}{cumulativeStats.behavioral.punctuationPenalty}%
                            </span>
                            <span className="detail-note">slower on symbols</span>
                          </span>
                        </div>
                      </Tooltip>
                      
                      <Tooltip content={TIPS.errorRecovery}>
                        <div className="detail-row">
                          <span className="detail-label">error recovery</span>
                          <span className="detail-value">
                            <span className={cumulativeStats.behavioral.recoveryPenalty > 40 ? 'text-warn' : ''}>
                              {cumulativeStats.behavioral.recoveryPenalty > 0 ? '+' : ''}{cumulativeStats.behavioral.recoveryPenalty}%
                            </span>
                            <span className="detail-note">slower after mistakes</span>
                          </span>
                        </div>
                      </Tooltip>
                      
                      <Tooltip content={TIPS.hesitations}>
                        <div className="detail-row">
                          <span className="detail-label">total hesitations</span>
                          <span className="detail-value">
                            {cumulativeStats.behavioral.totalHesitations}
                            <span className="detail-note">pauses &gt;500ms</span>
                          </span>
                        </div>
                      </Tooltip>
                      
                      <Tooltip content={TIPS.backspaceBehavior(cumulativeStats.behavioral.backspaceLabel)}>
                        <div className="detail-row">
                          <span className="detail-label">backspace behavior</span>
                          <span className="detail-value">
                            {cumulativeStats.behavioral.backspaceLabel}
                            <span className="detail-note">{cumulativeStats.behavioral.backspaceEfficiency}× per error avg</span>
                          </span>
                        </div>
                      </Tooltip>
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
        <button 
          className="reset-btn danger hold-btn"
          onMouseDown={startClearHold}
          onMouseUp={cancelClearHold}
          onMouseLeave={cancelClearHold}
          onTouchStart={startClearHold}
          onTouchEnd={cancelClearHold}
        >
          <span className="hold-btn-text">
            {clearHoldProgress > 0 ? 'clearing...' : 'hold to clear history'}
          </span>
          {clearHoldProgress > 0 && (
            <span 
              className="hold-progress" 
              style={{ width: `${clearHoldProgress}%` }}
            />
          )}
        </button>
      </footer>
      
      {/* History Modal */}
      {showHistory && cumulativeStats && cumulativeStats.history && (
        <div className="modal-overlay" onClick={() => setShowHistory(false)}>
          <div className="modal history-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Session History</h2>
              <button className="modal-close" onClick={() => setShowHistory(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="history-list">
                {[...cumulativeStats.history].reverse().map((session, i) => {
                  const date = new Date(session.timestamp)
                  const minutes = session.totalTime / 60000
                  const wpm = minutes > 0 ? Math.round((session.charCount / 5) / minutes) : 0
                  const accuracy = session.charCount > 0 
                    ? Math.round(((session.charCount - session.errorCount) / session.charCount) * 100) 
                    : 0
                  
                  return (
                    <div key={session.timestamp} className="history-item">
                      <div className="history-item-header">
                        <span className="history-date">
                          {date.toLocaleDateString()} {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <span className="history-session">#{cumulativeStats.history.length - i}</span>
                      </div>
                      <div className="history-item-stats">
                        <span className="history-stat">
                          <span className="history-stat-value">{wpm}</span>
                          <span className="history-stat-label">wpm</span>
                        </span>
                        <span className="history-stat">
                          <span className="history-stat-value">{accuracy}%</span>
                          <span className="history-stat-label">accuracy</span>
                        </span>
                        <span className="history-stat">
                          <span className="history-stat-value">{session.consistency || '—'}%</span>
                          <span className="history-stat-label">consistency</span>
                        </span>
                        <span className="history-stat">
                          <span className="history-stat-value">{session.errorCount}</span>
                          <span className="history-stat-label">errors</span>
                        </span>
                        <span className="history-stat">
                          <span className="history-stat-value">{Math.round(session.totalTime / 1000)}s</span>
                          <span className="history-stat-label">time</span>
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
