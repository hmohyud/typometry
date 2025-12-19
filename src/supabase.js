import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://ldzoyqgqmwfbqfaxdwce.supabase.co'
const supabaseAnonKey = 'sb_publishable_GE5Qlhn-IyiBoVG9iyTW6A_nXF-9Bp5'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// ============================================================
// USER ID MANAGEMENT
// ============================================================

const USER_ID_KEY = 'typometry_user_id'

function generateUserId() {
  return 'user_' + crypto.randomUUID()
}

export function getUserId() {
  let userId = localStorage.getItem(USER_ID_KEY)
  if (!userId) {
    userId = generateUserId()
    localStorage.setItem(USER_ID_KEY, userId)
  }
  return userId
}

export function resetUserId() {
  const newId = generateUserId()
  localStorage.setItem(USER_ID_KEY, newId)
  return newId
}

// ============================================================
// SESSION SUBMISSION
// ============================================================

/**
 * Submit a completed session with ALL stats
 */
export async function submitSession(sessionData) {
  const userId = getUserId()
  
  console.log('Submitting session:', {
    userId,
    wpm: sessionData.wpm,
    keystrokesCount: sessionData.keystrokes?.length,
    hasBehavioral: !!sessionData.behavioral,
    hasFingerTransitions: !!sessionData.fingerTransitions,
  })
  
  const { data, error } = await supabase
    .from('raw_sessions')
    .insert([{
      user_id: userId,
      
      // Core stats
      wpm: Math.round(sessionData.wpm || 0),
      accuracy: sessionData.accuracy || 0,
      avg_interval: sessionData.avgInterval || 0,
      total_chars: Math.round(sessionData.totalChars || 0),
      total_time_ms: Math.round(sessionData.totalTime || 0),
      error_count: Math.round(sessionData.errorCount || 0),
      sentence_id: sessionData.sentenceId,
      
      // Variance stats
      std_dev: sessionData.stdDev || null,
      consistency: sessionData.consistency || null,
      
      // JSONB columns
      percentiles: sessionData.percentiles || null,
      counts: sessionData.counts || null,
      bigrams: sessionData.bigrams || [],
      finger_stats: sessionData.fingerStats || {},
      finger_transitions: sessionData.fingerTransitions || {},
      behavioral: sessionData.behavioral || null,
      keystrokes: sessionData.keystrokes || [],
      
      processed: false,
    }])
    .select()

  if (error) {
    console.error('Error submitting session:', error)
    return null
  }
  
  console.log('Session submitted successfully:', data[0]?.id)
  return data[0]
}

// ============================================================
// STATS QUERIES
// ============================================================

/**
 * Get basic stats from all sessions
 */
export async function getSessionStats() {
  const { data, error } = await supabase
    .from('session_stats')
    .select('*')
    .single()

  if (error) {
    console.error('Error fetching session stats:', error)
    return null
  }
  return data
}

/**
 * Get global percentiles for a specific stat
 */
export async function getGlobalPercentiles(statName = 'wpm') {
  const { data, error } = await supabase
    .from('global_percentiles')
    .select('*')
    .eq('stat_name', statName)
    .single()

  if (error) {
    console.error('Error fetching percentiles:', error)
    return null
  }
  return data
}

/**
 * Get all behavioral stats
 */
export async function getBehavioralStats() {
  const { data, error } = await supabase
    .from('behavioral_global_stats')
    .select('*')

  if (error) {
    console.error('Error fetching behavioral stats:', error)
    return []
  }
  return data || []
}

/**
 * Get bigram stats (top N by occurrences)
 */
export async function getBigramStats(limit = 100) {
  const { data, error } = await supabase
    .from('bigram_global_stats')
    .select('*')
    .order('total_occurrences', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('Error fetching bigram stats:', error)
    return []
  }
  return data || []
}

/**
 * Get finger stats
 */
export async function getFingerStats() {
  const { data, error } = await supabase
    .from('finger_global_stats')
    .select('*')

  if (error) {
    console.error('Error fetching finger stats:', error)
    return []
  }
  return data || []
}

/**
 * Get finger transition stats
 */
export async function getFingerTransitionStats(limit = 50) {
  const { data, error } = await supabase
    .from('finger_transition_stats')
    .select('*')
    .order('total_occurrences', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('Error fetching finger transition stats:', error)
    return []
  }
  return data || []
}

/**
 * Get total session count
 */
export async function getSessionCount() {
  const { count, error } = await supabase
    .from('raw_sessions')
    .select('*', { count: 'exact', head: true })

  if (error) {
    console.error('Error fetching session count:', error)
    return 0
  }
  return count || 0
}

/**
 * Get recent WPMs for percentile calculation (client-side)
 */
export async function getRecentWpms(limit = 1000) {
  const { data, error } = await supabase
    .from('raw_sessions')
    .select('wpm, user_id')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('Error fetching WPMs:', error)
    return []
  }
  return data || []
}

/**
 * Calculate percentile from raw data (client-side fallback)
 */
export function calculatePercentile(wpm, allWpms) {
  if (!allWpms || allWpms.length === 0) return null
  
  // Get unique user averages to weight by user, not session
  const userAvgs = {}
  allWpms.forEach(row => {
    if (!userAvgs[row.user_id]) {
      userAvgs[row.user_id] = { total: 0, count: 0 }
    }
    userAvgs[row.user_id].total += row.wpm
    userAvgs[row.user_id].count += 1
  })
  
  const avgWpms = Object.values(userAvgs).map(u => u.total / u.count)
  const below = avgWpms.filter(avg => avg < wpm).length
  
  return Math.round((below / avgWpms.length) * 100)
}

/**
 * Trigger server-side stats processing (if you have an edge function)
 */
export async function triggerStatsProcessing() {
  // This would call an edge function that runs process_all_stats()
  // For now, you can run it manually in SQL editor:
  // SELECT * FROM process_all_stats();
  console.log('Stats processing should be triggered via SQL: SELECT * FROM process_all_stats();')
}

export default supabase
