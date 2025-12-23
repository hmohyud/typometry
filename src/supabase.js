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
// SESSION SUBMISSION - MINIMAL! Only keystrokes needed
// Everything else is derived by the database trigger
// ============================================================

export async function submitSession(sessionData) {
  const userId = getUserId()
  
  // Only send keystrokes - the DB trigger derives everything else!
  const { data, error } = await supabase
    .from('keystroke_sessions')
    .insert([{
      user_id: userId,
      sentence_id: sessionData.sentenceId,
      keystrokes: sessionData.keystrokes,
    }])
    .select()

  if (error) {
    console.error('Error submitting session:', error)
    return null
  }
  
  console.log('Session submitted, auto-processed by trigger:', data[0]?.id)
  return data[0]
}

// ============================================================
// STATS QUERIES - From views backed by running_stats
// ============================================================

/**
 * Get session stats (global averages)
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
 * Get bigram stats
 */
export async function getBigramStats(limit = 100) {
  const { data, error } = await supabase
    .from('bigram_stats_view')
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
    .from('finger_stats_view')
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
export async function getFingerTransitionStats(limit = 100) {
  const { data, error } = await supabase
    .from('finger_transition_stats_view')
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
 * Get behavioral stats
 */
export async function getBehavioralStats() {
  const { data, error } = await supabase
    .from('behavioral_stats_view')
    .select('*')

  if (error) {
    console.error('Error fetching behavioral stats:', error)
    return []
  }
  return data || []
}

/**
 * Get per-key stats for keyboard heatmap
 */
export async function getKeyStats() {
  const { data, error } = await supabase
    .from('key_stats_view')
    .select('*')

  if (error) {
    console.error('Error fetching key stats:', error)
    return []
  }
  return data || []
}

/**
 * Get user-specific stats
 */
export async function getUserStats(userId = null) {
  const uid = userId || getUserId()
  
  const { data, error } = await supabase
    .from('user_stats_view')
    .select('*')
    .eq('user_id', uid)

  if (error) {
    console.error('Error fetching user stats:', error)
    return null
  }
  
  // Convert to object keyed by stat name
  const stats = {}
  data?.forEach(row => {
    stats[row.stat_name] = {
      avg: parseFloat(row.avg_value) || 0,
      count: row.total_samples || 0,
    }
  })
  
  return stats
}

/**
 * Get session count from global WPM stat
 */
export async function getSessionCount() {
  const stats = await getSessionStats()
  return stats?.total_sessions || 0
}

/**
 * Calculate percentile using normal distribution approximation
 */
export function calculatePercentile(value, avg, stdDev) {
  if (!stdDev || stdDev === 0) return 50
  
  const z = (value - avg) / stdDev
  // Approximate CDF using logistics function
  const percentile = 100 / (1 + Math.exp(-1.7 * z))
  
  return Math.round(Math.max(1, Math.min(99, percentile)))
}

/**
 * Cleanup old sessions (call periodically if needed)
 */
export async function cleanupOldSessions(daysToKeep = 30) {
  const { data, error } = await supabase
    .rpc('cleanup_old_sessions', { days_to_keep: daysToKeep })

  if (error) {
    console.error('Error cleaning up sessions:', error)
    return null
  }
  
  console.log('Cleanup result:', data)
  return data
}

/**
 * Get global histograms for all metrics
 * Returns histogram data that can be displayed in the UI
 */
export async function getGlobalHistograms() {
  const { data, error } = await supabase
    .from('global_histograms_view')
    .select('*')

  if (error) {
    console.error('Error fetching global histograms:', error)
    return null
  }

  if (!data || data.length === 0) return null

  // Convert to object keyed by metric name
  const histograms = {}
  data.forEach(row => {
    if (row.histogram && Object.keys(row.histogram).length > 0) {
      histograms[row.metric] = {
        data: row.histogram,
        totalSessions: row.total_sessions || 0,
        avg: parseFloat(row.avg_value) || 0,
        stdDev: parseFloat(row.std_dev) || 0,
        min: parseFloat(row.min_value) || 0,
        max: parseFloat(row.max_value) || 0,
      }
    }
  })

  return histograms
}

// ============================================================
// NEW VIEWS - Extended statistics
// ============================================================

/**
 * Get character breakdown (words, letters, numbers, punctuation, etc.)
 */
export async function getCharacterBreakdown() {
  const { data, error } = await supabase
    .from('character_breakdown_view')
    .select('*')
    .single()

  if (error) {
    console.error('Error fetching character breakdown:', error)
    return null
  }
  return data
}

/**
 * Get lifetime stats (total keystrokes, errors, time)
 */
export async function getLifetimeStats() {
  const { data, error } = await supabase
    .from('lifetime_stats_view')
    .select('*')
    .single()

  if (error) {
    console.error('Error fetching lifetime stats:', error)
    return null
  }
  return data
}

/**
 * Get records (fastest WPM, longest streak, etc.)
 */
export async function getRecords() {
  const { data, error } = await supabase
    .from('records_view')
    .select('*')
    .single()

  if (error) {
    console.error('Error fetching records:', error)
    return null
  }
  return data
}

/**
 * Get error confusion matrix (most common typos)
 */
export async function getErrorConfusion(limit = 50) {
  const { data, error } = await supabase
    .from('error_confusion_view')
    .select('*')
    .limit(limit)

  if (error) {
    console.error('Error fetching error confusion:', error)
    return []
  }
  return data || []
}

/**
 * Get accuracy by character type
 */
export async function getAccuracyByType() {
  const { data, error } = await supabase
    .from('accuracy_by_type_view')
    .select('*')

  if (error) {
    console.error('Error fetching accuracy by type:', error)
    return []
  }
  return data || []
}

/**
 * Get row performance (top/home/bottom keyboard rows)
 */
export async function getRowPerformance() {
  const { data, error } = await supabase
    .from('row_performance_view')
    .select('*')

  if (error) {
    console.error('Error fetching row performance:', error)
    return []
  }
  return data || []
}

/**
 * Get typing patterns (double letters, alternating hands)
 */
export async function getTypingPatterns() {
  const { data, error } = await supabase
    .from('typing_patterns_view')
    .select('*')

  if (error) {
    console.error('Error fetching typing patterns:', error)
    return []
  }
  return data || []
}

/**
 * Get time patterns (performance by hour and day of week)
 */
export async function getTimePatterns() {
  const { data, error } = await supabase
    .from('time_patterns_view')
    .select('*')

  if (error) {
    console.error('Error fetching time patterns:', error)
    return []
  }
  return data || []
}

export default supabase
