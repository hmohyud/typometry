import { useState, useEffect, useCallback, useRef } from 'react'
import sentences from './sentences.json'

const CATEGORIES = Object.keys(sentences)

function App() {
  const [category, setCategory] = useState('common')
  const [currentSentence, setCurrentSentence] = useState('')
  const [typed, setTyped] = useState('')
  const [isActive, setIsActive] = useState(false)
  const [isComplete, setIsComplete] = useState(false)
  const [keystrokeData, setKeystrokeData] = useState([])
  const [stats, setStats] = useState(null)
  
  const lastKeystrokeTime = useRef(null)
  const startTime = useRef(null)
  const containerRef = useRef(null)

  const getRandomSentence = useCallback((cat) => {
    const pool = sentences[cat]
    return pool[Math.floor(Math.random() * pool.length)]
  }, [])

  const resetTest = useCallback(() => {
    setCurrentSentence(getRandomSentence(category))
    setTyped('')
    setIsActive(false)
    setIsComplete(false)
    setKeystrokeData([])
    setStats(null)
    lastKeystrokeTime.current = null
    startTime.current = null
    containerRef.current?.focus()
  }, [category, getRandomSentence])

  useEffect(() => {
    resetTest()
  }, [category])

  useEffect(() => {
    containerRef.current?.focus()
  }, [])

  const calculateStats = useCallback((data, totalTime) => {
    const intervals = data.map(d => d.interval).filter(i => i !== null)
    const avgInterval = intervals.length > 0 
      ? intervals.reduce((a, b) => a + b, 0) / intervals.length 
      : 0
    
    const correctChars = data.filter(d => d.correct).length
    const accuracy = data.length > 0 ? (correctChars / data.length) * 100 : 0
    
    const words = currentSentence.split(' ').length
    const minutes = totalTime / 60000
    const wpm = minutes > 0 ? Math.round(words / minutes) : 0
    
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
      avg: times.reduce((a, b) => a + b, 0) / times.length
    })).sort((a, b) => b.avg - a.avg)
    
    return {
      wpm,
      accuracy: Math.round(accuracy),
      avgInterval: Math.round(avgInterval),
      slowestBigrams: bigramAvgs.slice(0, 5),
      totalTime: Math.round(totalTime / 1000 * 10) / 10
    }
  }, [currentSentence])

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

    const expectedChar = currentSentence[typed.length]
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
    if (typed.length + 1 === currentSentence.length) {
      const totalTime = now - startTime.current
      setIsComplete(true)
      setStats(calculateStats([...keystrokeData, keystroke], totalTime))
    }
  }, [isActive, isComplete, typed, currentSentence, keystrokeData, calculateStats, resetTest])

  const renderSentence = () => {
    return currentSentence.split('').map((char, i) => {
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

      <nav className="categories">
        {CATEGORIES.map(cat => (
          <button
            key={cat}
            className={`cat-btn ${category === cat ? 'active' : ''}`}
            onClick={() => setCategory(cat)}
          >
            {cat}
          </button>
        ))}
      </nav>

      <main className="typing-area">
        <div className="sentence">
          {renderSentence()}
        </div>
        
        {!isActive && !isComplete && (
          <p className="hint">start typing...</p>
        )}
      </main>

      {isComplete && stats && (
        <section className="stats">
          <div className="stat-grid">
            <div className="stat">
              <span className="stat-value">{stats.wpm}</span>
              <span className="stat-label">wpm</span>
            </div>
            <div className="stat">
              <span className="stat-value">{stats.accuracy}%</span>
              <span className="stat-label">accuracy</span>
            </div>
            <div className="stat">
              <span className="stat-value">{stats.avgInterval}ms</span>
              <span className="stat-label">avg interval</span>
            </div>
            <div className="stat">
              <span className="stat-value">{stats.totalTime}s</span>
              <span className="stat-label">time</span>
            </div>
          </div>
          
          {stats.slowestBigrams.length > 0 && (
            <div className="bigrams">
              <p className="bigram-label">slowest transitions</p>
              <div className="bigram-list">
                {stats.slowestBigrams.map(({ bigram, avg }, i) => (
                  <span key={i} className="bigram">
                    <code>{bigram.replace(' ', '␣')}</code>
                    <span className="bigram-time">{Math.round(avg)}ms</span>
                  </span>
                ))}
              </div>
            </div>
          )}
          
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
