import { useState, useEffect, useCallback } from 'react'
import { 
  submitSession,
  getSessionStats,
  getSessionCount,
  getBigramStats,
  getFingerStats,
  getFingerTransitionStats,
  getBehavioralStats,
  getKeyStats,
  getUserStats,
  getGlobalHistograms,
  calculatePercentile,
  resetUserId as resetSupabaseUserId,
  // New fetchers
  getCharacterBreakdown,
  getLifetimeStats,
  getRecords,
  getErrorConfusion,
  getAccuracyByType,
  getSpeedByType,
  getRowPerformance,
  getTypingPatterns,
  getTimePatterns,
} from './supabase'

export function useGlobalStats() {
  const [globalAverages, setGlobalAverages] = useState(null)
  const [globalHistograms, setGlobalHistograms] = useState(null)
  const [behavioralAverages, setBehavioralAverages] = useState(null)
  const [bigramAverages, setBigramAverages] = useState(null)
  const [fingerAverages, setFingerAverages] = useState(null)
  const [transitionAverages, setTransitionAverages] = useState(null)
  const [keyAverages, setKeyAverages] = useState(null)
  const [sessionCount, setSessionCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  
  // New state for extended stats
  const [characterBreakdown, setCharacterBreakdown] = useState(null)
  const [lifetimeStats, setLifetimeStats] = useState(null)
  const [records, setRecords] = useState(null)
  const [errorConfusion, setErrorConfusion] = useState(null)
  const [accuracyByType, setAccuracyByType] = useState(null)
  const [speedByType, setSpeedByType] = useState(null)
  const [rowPerformance, setRowPerformance] = useState(null)
  const [typingPatterns, setTypingPatterns] = useState(null)
  const [timePatterns, setTimePatterns] = useState(null)

  const fetchStats = useCallback(async () => {
    try {
      setLoading(true)
      
      // Fetch all stats in parallel
      const [
        stats, 
        bigrams, 
        fingers, 
        transitions, 
        behavioral, 
        keys, 
        histograms,
        // New fetches
        charBreakdown,
        lifetime,
        recs,
        errConfusion,
        accByType,
        spdByType,
        rowPerf,
        typPatterns,
        timePatts,
      ] = await Promise.all([
        getSessionStats(),
        getBigramStats(200),
        getFingerStats(),
        getFingerTransitionStats(100),
        getBehavioralStats(),
        getKeyStats(),
        getGlobalHistograms(),
        // New fetches
        getCharacterBreakdown(),
        getLifetimeStats(),
        getRecords(),
        getErrorConfusion(50),
        getAccuracyByType(),
        getSpeedByType(),
        getRowPerformance(),
        getTypingPatterns(),
        getTimePatterns(),
      ])

      if (stats) {
        setGlobalAverages({
          total_sessions: stats.total_sessions || 0,
          total_users: stats.total_users || 0,
          avg_wpm: parseFloat(stats.avg_wpm) || 0,
          avg_accuracy: parseFloat(stats.avg_accuracy) || 0,
          avg_interval: parseFloat(stats.avg_interval) || 0,
          avg_consistency: parseFloat(stats.avg_consistency) || 0,
          wpm_std_dev: parseFloat(stats.wpm_std_dev) || 0,
          min_wpm: parseFloat(stats.min_wpm) || 0,
          max_wpm: parseFloat(stats.max_wpm) || 0,
          p25_wpm: parseFloat(stats.p25_wpm) || 0,
          p50_wpm: parseFloat(stats.median_wpm) || 0,
          p75_wpm: parseFloat(stats.p75_wpm) || 0,
          p90_wpm: parseFloat(stats.p90_wpm) || 0,
        })
        setSessionCount(stats.total_sessions || 0)
      }

      // Set global histograms
      if (histograms) {
        setGlobalHistograms(histograms)
      }

      // Convert bigram stats array to object for easy lookup
      if (bigrams && bigrams.length > 0) {
        const bigramObj = {}
        bigrams.forEach(stat => {
          bigramObj[stat.bigram] = {
            avg_time: parseFloat(stat.avg_time) || 0,
            std_dev: parseFloat(stat.std_dev) || 0,
            avg_accuracy: parseFloat(stat.avg_accuracy) || 0,
            total_occurrences: stat.total_occurrences || 0,
          }
        })
        setBigramAverages(bigramObj)
      }

      // Convert finger stats array to object for easy lookup
      if (fingers && fingers.length > 0) {
        const fingerObj = {}
        fingers.forEach(stat => {
          fingerObj[stat.finger] = {
            avg_interval: parseFloat(stat.avg_interval) || 0,
            std_dev: parseFloat(stat.std_dev) || 0,
            avg_accuracy: parseFloat(stat.avg_accuracy) || 0,
            total_presses: stat.total_presses || 0,
          }
        })
        setFingerAverages(fingerObj)
      }

      // Convert transition stats array to object for easy lookup
      if (transitions && transitions.length > 0) {
        const transitionObj = {}
        transitions.forEach(stat => {
          transitionObj[stat.transition_key] = {
            avg_time: parseFloat(stat.avg_time) || 0,
            std_dev: parseFloat(stat.std_dev) || 0,
            from_finger: stat.from_finger,
            to_finger: stat.to_finger,
            total_occurrences: stat.total_occurrences || 0,
          }
        })
        setTransitionAverages(transitionObj)
      }

      // Convert behavioral stats array to object
      if (behavioral && behavioral.length > 0) {
        const behavioralObj = {}
        behavioral.forEach(stat => {
          behavioralObj[stat.stat_name] = {
            avg: parseFloat(stat.avg_value) || 0,
            std_dev: parseFloat(stat.std_dev) || 0,
            min: parseFloat(stat.min_value) || 0,
            max: parseFloat(stat.max_value) || 0,
            count: stat.total_samples || 0,
          }
        })
        setBehavioralAverages(behavioralObj)
      }

      // Convert key stats array to object for keyboard heatmap
      if (keys && keys.length > 0) {
        const keyObj = {}
        keys.forEach(stat => {
          keyObj[stat.key_char] = {
            avgInterval: parseFloat(stat.avg_interval) || 0,
            std_dev: parseFloat(stat.std_dev) || 0,
            accuracy: parseFloat(stat.avg_accuracy) || 0,
            count: stat.total_presses || 0,
          }
        })
        setKeyAverages(keyObj)
      }

      // Set new extended stats
      if (charBreakdown) {
        setCharacterBreakdown({
          totalWords: parseInt(charBreakdown.total_words) || 0,
          correctWords: parseInt(charBreakdown.correct_words) || 0,
          totalLetters: parseInt(charBreakdown.total_letters) || 0,
          correctLetters: parseInt(charBreakdown.correct_letters) || 0,
          totalNumbers: parseInt(charBreakdown.total_numbers) || 0,
          correctNumbers: parseInt(charBreakdown.correct_numbers) || 0,
          totalPunctuation: parseInt(charBreakdown.total_punctuation) || 0,
          correctPunctuation: parseInt(charBreakdown.correct_punctuation) || 0,
          totalCapitals: parseInt(charBreakdown.total_capitals) || 0,
          correctCapitals: parseInt(charBreakdown.correct_capitals) || 0,
          totalSpaces: parseInt(charBreakdown.total_spaces) || 0,
          correctSpaces: parseInt(charBreakdown.correct_spaces) || 0,
        })
      }

      if (lifetime) {
        setLifetimeStats({
          totalKeystrokes: parseInt(lifetime.total_keystrokes) || 0,
          totalErrors: parseInt(lifetime.total_errors) || 0,
          totalBackspaces: parseInt(lifetime.total_backspaces) || 0,
          totalTypingTimeMs: parseInt(lifetime.total_typing_time_ms) || 0,
          totalTypingHours: parseFloat(lifetime.total_typing_hours) || 0,
          lifetimeAccuracy: parseFloat(lifetime.lifetime_accuracy) || 0,
        })
      }

      if (recs) {
        setRecords({
          fastestWpm: parseFloat(recs.fastest_wpm) || 0,
          longestStreak: parseInt(recs.longest_streak) || 0,
          longestBurst: parseInt(recs.longest_burst) || 0,
          fastestKeystrokeMs: parseFloat(recs.fastest_keystroke_ms) || 0,
          totalSessions: parseInt(recs.total_sessions) || 0,
        })
      }

      if (errConfusion && errConfusion.length > 0) {
        // Convert to array of { expected, typed, count }
        const confusionArr = errConfusion.map(row => ({
          expected: row.expected,
          typed: row.typed,
          count: parseInt(row.occurrences) || 0,
        }))
        setErrorConfusion(confusionArr)
      }

      // accuracyByType now returns an object directly from supabase.js
      if (accByType) {
        setAccuracyByType(accByType)
      }

      // speedByType returns an object directly from supabase.js
      if (spdByType) {
        setSpeedByType(spdByType)
      }

      if (rowPerf && rowPerf.length > 0) {
        const rowObj = {}
        rowPerf.forEach(stat => {
          rowObj[stat.row_name] = {
            avgIntervalMs: parseFloat(stat.avg_interval_ms) || 0,
            stdDev: parseFloat(stat.std_dev) || 0,
            minValue: parseFloat(stat.min_value) || 0,
            maxValue: parseFloat(stat.max_value) || 0,
            sampleSessions: parseInt(stat.sample_sessions) || 0,
          }
        })
        setRowPerformance(rowObj)
      }

      if (typPatterns && typPatterns.length > 0) {
        const patternObj = {}
        typPatterns.forEach(stat => {
          patternObj[stat.pattern_name] = {
            avgValue: parseFloat(stat.avg_value) || 0,
            stdDev: parseFloat(stat.std_dev) || 0,
            minValue: parseFloat(stat.min_value) || 0,
            maxValue: parseFloat(stat.max_value) || 0,
            sampleSessions: parseInt(stat.sample_sessions) || 0,
          }
        })
        setTypingPatterns(patternObj)
      }

      if (timePatts && timePatts.length > 0) {
        // Separate hourly and daily patterns
        const hourly = {}
        const daily = {}
        timePatts.forEach(stat => {
          if (stat.pattern_type === 'hourly') {
            hourly[stat.time_value] = {
              avgWpm: parseFloat(stat.avg_wpm) || 0,
              stdDev: parseFloat(stat.wpm_std_dev) || 0,
              sampleSessions: parseInt(stat.sample_sessions) || 0,
            }
          } else if (stat.pattern_type === 'daily') {
            daily[stat.time_value] = {
              avgWpm: parseFloat(stat.avg_wpm) || 0,
              stdDev: parseFloat(stat.wpm_std_dev) || 0,
              sampleSessions: parseInt(stat.sample_sessions) || 0,
            }
          }
        })
        setTimePatterns({ hourly, daily })
      }

    } catch (err) {
      console.error('Error fetching global stats:', err)
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  // Submit session - only keystrokes needed!
  const submitStats = useCallback(async (stats) => {
    const result = await submitSession({
      sentenceId: stats.sentenceId,
      keystrokes: stats.keystrokes,
    })
    
    if (result) {
      setSessionCount(prev => prev + 1)
      // Refresh stats every 5 sessions
      if ((sessionCount + 1) % 5 === 0) {
        fetchStats()
      }
    }
    
    return !!result
  }, [sessionCount, fetchStats])

  const resetUserId = useCallback(() => {
    return resetSupabaseUserId()
  }, [])

  // Calculate percentile using global stats
  const getPercentile = useCallback((wpm) => {
    if (!globalAverages || !globalAverages.wpm_std_dev) return null
    return calculatePercentile(wpm, globalAverages.avg_wpm, globalAverages.wpm_std_dev)
  }, [globalAverages])

  // Compare a value to global average
  const compareToGlobal = useCallback((type, value) => {
    if (!globalAverages || globalAverages.total_sessions < 1) return null

    let baseline, better, diff, percentDiff

    switch (type) {
      case 'wpm':
        baseline = globalAverages.avg_wpm
        if (!baseline) return null
        diff = value - baseline
        better = diff > 0
        percentDiff = Math.round((diff / baseline) * 100)
        break
      case 'interval':
        baseline = globalAverages.avg_interval
        if (!baseline) return null
        diff = baseline - value // Lower is better
        better = diff > 0
        percentDiff = Math.round((diff / baseline) * 100)
        break
      case 'accuracy':
        baseline = globalAverages.avg_accuracy
        if (!baseline) return null
        diff = value - baseline
        better = diff > 0
        percentDiff = Math.round(diff * 10) / 10
        break
      case 'consistency':
        baseline = globalAverages.avg_consistency
        if (!baseline) return null
        diff = value - baseline
        better = diff > 0
        percentDiff = Math.round(diff * 10) / 10
        break
      default:
        return null
    }

    return {
      baseline,
      diff,
      percentDiff,
      better,
      label: better 
        ? `+${Math.abs(percentDiff)}% ${type === 'interval' ? 'faster' : 'higher'}`
        : `-${Math.abs(percentDiff)}% ${type === 'interval' ? 'slower' : 'lower'}`,
    }
  }, [globalAverages])

  // Compare a behavioral stat to global average
  const compareBehavioral = useCallback((statName, value) => {
    if (!behavioralAverages || !behavioralAverages[statName]) return null
    
    const stat = behavioralAverages[statName]
    const diff = value - stat.avg
    
    // Determine if higher is better based on stat type
    const higherIsBetter = ['flowRatio', 'rhythmScore', 'consistency', 'handBalance', 'homeRowAdvantage', 'confidenceScore'].includes(statName)
    const better = higherIsBetter ? diff > 0 : diff < 0
    
    return {
      avg: stat.avg,
      diff,
      better,
    }
  }, [behavioralAverages])

  // Compare a bigram time to global average
  const compareBigram = useCallback((bigram, avgTime) => {
    if (!bigramAverages || !bigramAverages[bigram]) return null
    
    const stat = bigramAverages[bigram]
    const diff = stat.avg_time - avgTime // Lower is better
    const better = diff > 0
    
    return {
      globalAvg: stat.avg_time,
      diff,
      better,
      percentFaster: Math.round((diff / stat.avg_time) * 100),
    }
  }, [bigramAverages])

  // Compare a finger stat to global average
  const compareFinger = useCallback((finger, avgInterval) => {
    if (!fingerAverages || !fingerAverages[finger]) return null
    
    const stat = fingerAverages[finger]
    const diff = stat.avg_interval - avgInterval // Lower is better
    const better = diff > 0
    
    return {
      globalAvg: stat.avg_interval,
      globalAccuracy: stat.avg_accuracy,
      diff,
      better,
      percentFaster: Math.round((diff / stat.avg_interval) * 100),
    }
  }, [fingerAverages])

  return {
    // Data
    globalAverages,
    globalHistograms,
    behavioralAverages,
    bigramAverages,
    fingerAverages,
    transitionAverages,
    keyAverages,
    sessionCount,
    
    // New extended data
    characterBreakdown,
    lifetimeStats,
    records,
    errorConfusion,
    accuracyByType,
    speedByType,
    rowPerformance,
    typingPatterns,
    timePatterns,
    
    // State
    loading,
    error,
    
    // Actions
    submitStats,
    resetUserId,
    refreshStats: fetchStats,
    
    // Comparisons
    getPercentile,
    compareToGlobal,
    compareBehavioral,
    compareBigram,
    compareFinger,
  }
}

export default useGlobalStats
