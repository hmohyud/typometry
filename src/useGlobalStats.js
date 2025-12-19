import { useState, useEffect, useCallback } from 'react'
import { 
  submitSession,
  getSessionStats,
  getSessionCount,
  getRecentWpms,
  calculatePercentile,
  getGlobalPercentiles,
  getBehavioralStats,
  getBigramStats,
  getFingerStats,
  getFingerTransitionStats,
  resetUserId as resetSupabaseUserId
} from './supabase'

export function useGlobalStats() {
  const [globalAverages, setGlobalAverages] = useState(null)
  const [behavioralAverages, setBehavioralAverages] = useState(null)
  const [bigramAverages, setBigramAverages] = useState(null)
  const [fingerAverages, setFingerAverages] = useState(null)
  const [transitionAverages, setTransitionAverages] = useState(null)
  const [sessionCount, setSessionCount] = useState(0)
  const [recentWpms, setRecentWpms] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchStats = useCallback(async () => {
    try {
      setLoading(true)
      
      // Fetch all stats in parallel
      const [stats, count, wpms, behavioral, bigrams, fingers, transitions] = await Promise.all([
        getSessionStats(),
        getSessionCount(),
        getRecentWpms(1000),
        getBehavioralStats(),
        getBigramStats(200),
        getFingerStats(),
        getFingerTransitionStats(100),
      ])

      if (stats) {
        setGlobalAverages({
          total_sessions: stats.total_sessions,
          total_users: stats.total_users,
          avg_wpm: parseFloat(stats.avg_wpm) || 0,
          avg_accuracy: parseFloat(stats.avg_accuracy) || 0,
          avg_interval: parseFloat(stats.avg_interval) || 0,
          avg_consistency: parseFloat(stats.avg_consistency) || 0,
          p25_wpm: parseFloat(stats.p25_wpm) || 0,
          p50_wpm: parseFloat(stats.median_wpm) || 0,
          p75_wpm: parseFloat(stats.p75_wpm) || 0,
          p90_wpm: parseFloat(stats.p90_wpm) || 0,
        })
      }
      
      // Convert behavioral stats array to object for easy lookup
      if (behavioral && behavioral.length > 0) {
        const behavioralObj = {}
        behavioral.forEach(stat => {
          behavioralObj[stat.stat_name] = {
            avg: parseFloat(stat.avg_value) || 0,
            p25: parseFloat(stat.p25) || 0,
            p50: parseFloat(stat.p50) || 0,
            p75: parseFloat(stat.p75) || 0,
            p90: parseFloat(stat.p90) || 0,
          }
        })
        setBehavioralAverages(behavioralObj)
      }

      // Convert bigram stats array to object for easy lookup
      if (bigrams && bigrams.length > 0) {
        const bigramObj = {}
        bigrams.forEach(stat => {
          bigramObj[stat.bigram] = {
            avg_time: parseFloat(stat.avg_time) || 0,
            p50_time: parseFloat(stat.p50_time) || 0,
            avg_accuracy: parseFloat(stat.avg_accuracy) || 0,
            total_occurrences: stat.total_occurrences,
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
            p50_interval: parseFloat(stat.p50_interval) || 0,
            avg_accuracy: parseFloat(stat.avg_accuracy) || 0,
            total_presses: stat.total_presses,
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
            p50_time: parseFloat(stat.p50_time) || 0,
            from_finger: stat.from_finger,
            to_finger: stat.to_finger,
            total_occurrences: stat.total_occurrences,
          }
        })
        setTransitionAverages(transitionObj)
      }
      
      setSessionCount(count)
      setRecentWpms(wpms)

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

  const submitStats = useCallback(async (stats) => {
    const result = await submitSession({
      // Core stats
      wpm: stats.wpm,
      accuracy: stats.accuracy,
      avgInterval: stats.avgInterval,
      totalChars: stats.totalChars,
      totalTime: stats.totalTime,
      errorCount: stats.errorCount,
      sentenceId: stats.sentenceId,
      
      // Variance stats
      stdDev: stats.stdDev,
      consistency: stats.consistency,
      
      // Complex data
      percentiles: stats.percentiles,
      counts: stats.counts,
      bigrams: stats.bigrams,
      fingerStats: stats.fingerStats,
      fingerTransitions: stats.fingerTransitions,
      behavioral: stats.behavioral,
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

  const getPercentile = useCallback((wpm) => {
    return calculatePercentile(wpm, recentWpms)
  }, [recentWpms])

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
      p50: stat.p50,
      diff,
      better,
      percentile: value > stat.p90 ? 90 : value > stat.p75 ? 75 : value > stat.p50 ? 50 : value > stat.p25 ? 25 : 10,
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
      globalP50: stat.p50_time,
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
      globalP50: stat.p50_interval,
      globalAccuracy: stat.avg_accuracy,
      diff,
      better,
      percentFaster: Math.round((diff / stat.avg_interval) * 100),
    }
  }, [fingerAverages])

  return {
    // Data
    globalAverages,
    behavioralAverages,
    bigramAverages,
    fingerAverages,
    transitionAverages,
    sessionCount,
    
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
