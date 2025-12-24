-- ============================================================
-- TYPOMETRY STREAMING STATISTICS - COMPLETE SETUP V2
-- Run this to DELETE EVERYTHING and start fresh
-- Includes: Core stats, histograms, character breakdown, 
--           lifetime stats, records, error tracking
-- ============================================================

-- ============================================================
-- STEP 1: DROP ALL EXISTING TABLES AND FUNCTIONS
-- ============================================================

-- Drop triggers first (wrap in DO block to handle missing tables)
DO $$ 
BEGIN
  DROP TRIGGER IF EXISTS auto_process_session ON keystroke_sessions;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ 
BEGIN
  DROP TRIGGER IF EXISTS auto_cleanup_sessions ON keystroke_sessions;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$ 
BEGIN
  DROP TRIGGER IF EXISTS validate_session ON raw_sessions;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- Drop views
DROP VIEW IF EXISTS global_stats_view CASCADE;
DROP VIEW IF EXISTS bigram_stats_view CASCADE;
DROP VIEW IF EXISTS user_stats_view CASCADE;
DROP VIEW IF EXISTS finger_stats_view CASCADE;
DROP VIEW IF EXISTS finger_transition_stats_view CASCADE;
DROP VIEW IF EXISTS behavioral_stats_view CASCADE;
DROP VIEW IF EXISTS key_stats_view CASCADE;
DROP VIEW IF EXISTS session_stats CASCADE;
DROP VIEW IF EXISTS global_histograms_view CASCADE;
DROP VIEW IF EXISTS character_breakdown_view CASCADE;
DROP VIEW IF EXISTS lifetime_stats_view CASCADE;
DROP VIEW IF EXISTS records_view CASCADE;
DROP VIEW IF EXISTS error_confusion_view CASCADE;
DROP VIEW IF EXISTS accuracy_by_type_view CASCADE;
DROP VIEW IF EXISTS row_performance_view CASCADE;
DROP VIEW IF EXISTS typing_patterns_view CASCADE;
DROP VIEW IF EXISTS time_patterns_view CASCADE;
DROP VIEW IF EXISTS speed_by_type_view CASCADE;

-- Drop functions
DROP FUNCTION IF EXISTS process_keystroke_session(UUID) CASCADE;
DROP FUNCTION IF EXISTS process_on_insert() CASCADE;
DROP FUNCTION IF EXISTS update_running_stat(TEXT, TEXT, DECIMAL, INTEGER) CASCADE;
DROP FUNCTION IF EXISTS update_running_stat_with_accuracy(TEXT, TEXT, DECIMAL, INTEGER, INTEGER) CASCADE;
DROP FUNCTION IF EXISTS update_histogram(TEXT, DECIMAL, DECIMAL) CASCADE;
DROP FUNCTION IF EXISTS cleanup_old_sessions(INTEGER) CASCADE;
DROP FUNCTION IF EXISTS cleanup_sessions_by_count(INTEGER) CASCADE;
DROP FUNCTION IF EXISTS get_percentile_from_histogram(TEXT, DECIMAL) CASCADE;
DROP FUNCTION IF EXISTS get_global_stats_json() CASCADE;
DROP FUNCTION IF EXISTS get_finger(TEXT) CASCADE;
DROP FUNCTION IF EXISTS validate_session_data() CASCADE;
DROP FUNCTION IF EXISTS process_all_stats() CASCADE;
DROP FUNCTION IF EXISTS process_global_stats() CASCADE;
DROP FUNCTION IF EXISTS process_bigram_stats() CASCADE;
DROP FUNCTION IF EXISTS process_finger_stats() CASCADE;
DROP FUNCTION IF EXISTS process_finger_transition_stats() CASCADE;
DROP FUNCTION IF EXISTS process_behavioral_stats() CASCADE;
DROP FUNCTION IF EXISTS compute_percentiles_for_column(TEXT, TEXT) CASCADE;
DROP FUNCTION IF EXISTS update_running_totals_incremental() CASCADE;
DROP FUNCTION IF EXISTS process_stats_smart() CASCADE;
DROP FUNCTION IF EXISTS auto_cleanup_old_sessions() CASCADE;

-- Drop old tables
DROP TABLE IF EXISTS raw_sessions CASCADE;
DROP TABLE IF EXISTS keystroke_sessions CASCADE;
DROP TABLE IF EXISTS running_stats CASCADE;
DROP TABLE IF EXISTS running_totals CASCADE;
DROP TABLE IF EXISTS global_percentiles CASCADE;
DROP TABLE IF EXISTS bigram_global_stats CASCADE;
DROP TABLE IF EXISTS finger_global_stats CASCADE;
DROP TABLE IF EXISTS finger_transition_stats CASCADE;
DROP TABLE IF EXISTS behavioral_global_stats CASCADE;
DROP TABLE IF EXISTS processing_metadata CASCADE;
DROP TABLE IF EXISTS key_finger_map CASCADE;

-- ============================================================
-- STEP 2: CREATE KEY-TO-FINGER MAPPING TABLE
-- ============================================================

CREATE TABLE key_finger_map (
  key_char TEXT PRIMARY KEY,
  finger TEXT NOT NULL  -- 'L-pinky', 'L-ring', 'L-middle', 'L-index', 'R-index', 'R-middle', 'R-ring', 'R-pinky', 'thumb'
);

-- Populate the mapping (QWERTY layout)
INSERT INTO key_finger_map (key_char, finger) VALUES
  -- Left pinky
  ('`', 'L-pinky'), ('1', 'L-pinky'), ('q', 'L-pinky'), ('a', 'L-pinky'), ('z', 'L-pinky'),
  ('~', 'L-pinky'), ('!', 'L-pinky'), ('Q', 'L-pinky'), ('A', 'L-pinky'), ('Z', 'L-pinky'),
  -- Left ring
  ('2', 'L-ring'), ('w', 'L-ring'), ('s', 'L-ring'), ('x', 'L-ring'),
  ('@', 'L-ring'), ('W', 'L-ring'), ('S', 'L-ring'), ('X', 'L-ring'),
  -- Left middle
  ('3', 'L-middle'), ('e', 'L-middle'), ('d', 'L-middle'), ('c', 'L-middle'),
  ('#', 'L-middle'), ('E', 'L-middle'), ('D', 'L-middle'), ('C', 'L-middle'),
  -- Left index
  ('4', 'L-index'), ('5', 'L-index'), ('r', 'L-index'), ('t', 'L-index'),
  ('f', 'L-index'), ('g', 'L-index'), ('v', 'L-index'), ('b', 'L-index'),
  ('$', 'L-index'), ('%', 'L-index'), ('R', 'L-index'), ('T', 'L-index'),
  ('F', 'L-index'), ('G', 'L-index'), ('V', 'L-index'), ('B', 'L-index'),
  -- Right index
  ('6', 'R-index'), ('7', 'R-index'), ('y', 'R-index'), ('u', 'R-index'),
  ('h', 'R-index'), ('j', 'R-index'), ('n', 'R-index'), ('m', 'R-index'),
  ('^', 'R-index'), ('&', 'R-index'), ('Y', 'R-index'), ('U', 'R-index'),
  ('H', 'R-index'), ('J', 'R-index'), ('N', 'R-index'), ('M', 'R-index'),
  -- Right middle
  ('8', 'R-middle'), ('i', 'R-middle'), ('k', 'R-middle'), (',', 'R-middle'),
  ('*', 'R-middle'), ('I', 'R-middle'), ('K', 'R-middle'), ('<', 'R-middle'),
  -- Right ring
  ('9', 'R-ring'), ('o', 'R-ring'), ('l', 'R-ring'), ('.', 'R-ring'),
  ('(', 'R-ring'), ('O', 'R-ring'), ('L', 'R-ring'), ('>', 'R-ring'),
  -- Right pinky
  ('0', 'R-pinky'), ('-', 'R-pinky'), ('=', 'R-pinky'), ('p', 'R-pinky'),
  ('[', 'R-pinky'), (']', 'R-pinky'), (E'\\', 'R-pinky'), (';', 'R-pinky'),
  ('''', 'R-pinky'), ('/', 'R-pinky'),
  (')', 'R-pinky'), ('_', 'R-pinky'), ('+', 'R-pinky'), ('P', 'R-pinky'),
  ('{', 'R-pinky'), ('}', 'R-pinky'), ('|', 'R-pinky'), (':', 'R-pinky'),
  ('"', 'R-pinky'), ('?', 'R-pinky'),
  -- Thumbs (space)
  (' ', 'thumb');

-- ============================================================
-- STEP 3: CREATE RUNNING STATS TABLE
-- Stores weighted running averages for ALL stats
-- Categories: 'global', 'bigram', 'finger', 'finger_transition', 
--             'behavioral', 'user', 'key', 'counts', 'lifetime',
--             'records', 'error_confusion', 'accuracy_breakdown', 
--             'speed_breakdown', 'sessions'
-- ============================================================

CREATE TABLE running_stats (
  stat_key TEXT PRIMARY KEY,  -- e.g., 'global:wpm', 'bigram:th', 'finger:L-index', 'key:a'
  category TEXT NOT NULL,      
  
  -- Running totals for Welford's online algorithm
  count BIGINT DEFAULT 0,
  sum_value DECIMAL(20,6) DEFAULT 0,
  sum_squared DECIMAL(30,10) DEFAULT 0,
  
  -- Min/Max tracking
  min_value DECIMAL(12,4),
  max_value DECIMAL(12,4),
  
  -- For accuracy stats (correct/total)
  correct_count BIGINT DEFAULT 0,
  total_count BIGINT DEFAULT 0,
  
  -- Histogram for percentile approximation
  histogram JSONB DEFAULT '{}',
  
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Computed columns
  avg_value DECIMAL(12,4) GENERATED ALWAYS AS (
    CASE WHEN count > 0 THEN ROUND((sum_value / count)::numeric, 4) ELSE NULL END
  ) STORED,
  std_dev DECIMAL(12,4) GENERATED ALWAYS AS (
    CASE WHEN count > 1 THEN 
      ROUND(SQRT(GREATEST(0, (sum_squared / count) - POWER(sum_value / count, 2)))::numeric, 4) 
    ELSE NULL END
  ) STORED,
  accuracy DECIMAL(6,4) GENERATED ALWAYS AS (
    CASE WHEN total_count > 0 THEN ROUND((correct_count::decimal / total_count)::numeric, 4) ELSE NULL END
  ) STORED
);

CREATE INDEX idx_running_stats_category ON running_stats(category);

-- ============================================================
-- STEP 4: CREATE KEYSTROKE SESSIONS TABLE (MINIMAL RAW DATA)
-- ============================================================

CREATE TABLE keystroke_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  sentence_id INTEGER,
  
  -- The raw keystroke data - everything else is derived
  keystrokes JSONB NOT NULL,
  -- Format: [{key, expected, correct, interval, timestamp, position}, ...]
  
  -- Processing status
  processed BOOLEAN DEFAULT FALSE,
  processed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_ks_user ON keystroke_sessions(user_id);
CREATE INDEX idx_ks_created ON keystroke_sessions(created_at);
CREATE INDEX idx_ks_processed ON keystroke_sessions(processed) WHERE processed = FALSE;

-- RLS policies
ALTER TABLE keystroke_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow inserts" ON keystroke_sessions;
DROP POLICY IF EXISTS "Allow reads" ON keystroke_sessions;
CREATE POLICY "Allow inserts" ON keystroke_sessions FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow reads" ON keystroke_sessions FOR SELECT USING (true);

-- ============================================================
-- STEP 5: HELPER FUNCTIONS
-- ============================================================

-- Update a running stat with a new value
CREATE OR REPLACE FUNCTION update_running_stat(
  p_stat_key TEXT,
  p_category TEXT,
  p_value DECIMAL,
  p_weight INTEGER DEFAULT 1
) RETURNS void AS $$
BEGIN
  INSERT INTO running_stats (stat_key, category, count, sum_value, sum_squared, min_value, max_value, updated_at)
  VALUES (
    p_stat_key,
    p_category,
    p_weight,
    p_value * p_weight,
    p_value * p_value * p_weight,
    p_value,
    p_value,
    NOW()
  )
  ON CONFLICT (stat_key) DO UPDATE SET
    count = running_stats.count + p_weight,
    sum_value = running_stats.sum_value + (p_value * p_weight),
    sum_squared = running_stats.sum_squared + (p_value * p_value * p_weight),
    min_value = LEAST(running_stats.min_value, p_value),
    max_value = GREATEST(running_stats.max_value, p_value),
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- Update running stat with accuracy tracking
CREATE OR REPLACE FUNCTION update_running_stat_with_accuracy(
  p_stat_key TEXT,
  p_category TEXT,
  p_value DECIMAL,
  p_correct INTEGER,
  p_total INTEGER
) RETURNS void AS $$
BEGIN
  INSERT INTO running_stats (stat_key, category, count, sum_value, sum_squared, min_value, max_value, correct_count, total_count, updated_at)
  VALUES (
    p_stat_key,
    p_category,
    1,
    p_value,
    p_value * p_value,
    p_value,
    p_value,
    p_correct,
    p_total,
    NOW()
  )
  ON CONFLICT (stat_key) DO UPDATE SET
    count = running_stats.count + 1,
    sum_value = running_stats.sum_value + p_value,
    sum_squared = running_stats.sum_squared + (p_value * p_value),
    min_value = LEAST(running_stats.min_value, p_value),
    max_value = GREATEST(running_stats.max_value, p_value),
    correct_count = running_stats.correct_count + p_correct,
    total_count = running_stats.total_count + p_total,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- Update histogram bucket
CREATE OR REPLACE FUNCTION update_histogram(
  p_stat_key TEXT,
  p_value DECIMAL,
  p_bucket_size DECIMAL DEFAULT 10
) RETURNS void AS $$
DECLARE
  bucket_key TEXT;
  current_count INTEGER;
BEGIN
  bucket_key := FLOOR(p_value / p_bucket_size)::TEXT;
  
  UPDATE running_stats
  SET histogram = jsonb_set(
    COALESCE(histogram, '{}'),
    ARRAY[bucket_key],
    to_jsonb(COALESCE((histogram->>bucket_key)::integer, 0) + 1)
  )
  WHERE stat_key = p_stat_key;
END;
$$ LANGUAGE plpgsql;

-- Get finger for a key
CREATE OR REPLACE FUNCTION get_finger(p_key TEXT)
RETURNS TEXT AS $$
BEGIN
  RETURN (SELECT finger FROM key_finger_map WHERE key_char = p_key LIMIT 1);
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================
-- STEP 6: MAIN PROCESSING FUNCTION
-- Derives ALL stats from keystrokes
-- ============================================================

CREATE OR REPLACE FUNCTION process_keystroke_session(p_session_id UUID)
RETURNS void AS $$
DECLARE
  session_rec RECORD;
  ks JSONB;
  ks_arr JSONB;
  ks_len INTEGER;
  i INTEGER;
  curr JSONB;
  prev JSONB;
  
  -- Derived stats
  v_wpm DECIMAL;
  v_accuracy DECIMAL;
  v_total_time DECIMAL;
  v_correct_count INTEGER := 0;
  v_error_count INTEGER := 0;
  v_total_count INTEGER := 0;
  v_intervals DECIMAL[] := '{}';
  v_avg_interval DECIMAL;
  v_std_dev DECIMAL;
  v_consistency DECIMAL;
  
  -- For bigrams
  v_bigram TEXT;
  v_bigram_time DECIMAL;
  v_bigram_correct BOOLEAN;
  
  -- For fingers and keys
  v_finger TEXT;
  v_prev_finger TEXT;
  v_transition_key TEXT;
  
  -- For behavioral stats
  v_backspace_count INTEGER := 0;
  v_burst_count INTEGER := 0;
  v_current_burst INTEGER := 0;
  v_max_burst INTEGER := 0;
  v_burst_lengths INTEGER[] := '{}';
  v_hesitation_count INTEGER := 0;
  v_hesitation_times DECIMAL[] := '{}';
  v_left_hand INTEGER := 0;
  v_right_hand INTEGER := 0;
  v_left_time DECIMAL := 0;
  v_right_time DECIMAL := 0;
  v_home_row INTEGER := 0;
  v_home_row_time DECIMAL := 0;
  v_non_home_time DECIMAL := 0;
  v_total_keys INTEGER := 0;
  
  -- Row tracking
  v_top_row_count INTEGER := 0;
  v_top_row_time DECIMAL := 0;
  v_bottom_row_count INTEGER := 0;
  v_bottom_row_time DECIMAL := 0;
  
  -- Alternating hand tracking
  v_prev_hand TEXT := NULL;
  v_alternating_count INTEGER := 0;
  v_same_hand_count INTEGER := 0;
  
  -- Double letter tracking
  v_prev_expected TEXT := NULL;
  v_double_letter_count INTEGER := 0;
  v_double_letter_time DECIMAL := 0;
  
  -- Flow and rhythm
  v_flow_count INTEGER := 0;
  v_rhythm_diffs DECIMAL[] := '{}';
  v_prev_interval DECIMAL;
  
  -- Computed behavioral
  v_flow_ratio DECIMAL;
  v_rhythm_score DECIMAL;
  v_hand_balance DECIMAL;
  v_home_row_advantage DECIMAL;
  
  -- Character breakdown counts
  v_word_count INTEGER := 0;
  v_correct_words INTEGER := 0;
  v_letter_count INTEGER := 0;
  v_correct_letters INTEGER := 0;
  v_number_count INTEGER := 0;
  v_correct_numbers INTEGER := 0;
  v_punct_count INTEGER := 0;
  v_correct_punct INTEGER := 0;
  v_capital_count INTEGER := 0;
  v_correct_capitals INTEGER := 0;
  v_space_count INTEGER := 0;
  v_correct_spaces INTEGER := 0;
  v_symbol_count INTEGER := 0;
  v_correct_symbols INTEGER := 0;
  
  -- Speed tracking for character types (timing aggregates)
  v_letter_time DECIMAL := 0;
  v_letter_time_count INTEGER := 0;
  v_number_time DECIMAL := 0;
  v_number_time_count INTEGER := 0;
  v_punct_time DECIMAL := 0;
  v_punct_time_count INTEGER := 0;
  v_capital_time DECIMAL := 0;
  v_capital_time_count INTEGER := 0;
  v_space_time DECIMAL := 0;
  v_space_time_count INTEGER := 0;
  v_symbol_time DECIMAL := 0;
  v_symbol_time_count INTEGER := 0;
  
  -- Streak tracking
  v_current_streak INTEGER := 0;
  v_max_streak INTEGER := 0;
  
  -- Error confusion tracking
  v_expected_char TEXT;
  v_actual_char TEXT;
  
  -- Word tracking
  v_in_word BOOLEAN := TRUE;
  v_word_correct BOOLEAN := TRUE;
  
  -- Speed records
  v_fastest_interval DECIMAL := 9999;
  v_slowest_interval DECIMAL := 0;
  
  -- Session timing
  v_first_timestamp DECIMAL;
  v_last_timestamp DECIMAL;
  v_session_duration DECIMAL;
  
  -- Track previous keystroke correctness for clean bigram/transition data
  v_prev_was_correct BOOLEAN := FALSE;
  
  -- Current interval for reuse
  v_current_interval DECIMAL;
  
BEGIN
  -- Get the session
  SELECT * INTO session_rec FROM keystroke_sessions WHERE id = p_session_id;
  IF NOT FOUND THEN RETURN; END IF;
  IF session_rec.processed THEN RETURN; END IF;
  
  ks_arr := session_rec.keystrokes;
  ks_len := jsonb_array_length(ks_arr);
  
  IF ks_len = 0 THEN
    UPDATE keystroke_sessions SET processed = TRUE, processed_at = NOW() WHERE id = p_session_id;
    RETURN;
  END IF;
  
  -- Get session duration
  SELECT (value->>'timestamp')::decimal INTO v_first_timestamp
  FROM jsonb_array_elements(ks_arr) WITH ORDINALITY AS x(value, idx)
  WHERE value->>'timestamp' IS NOT NULL
  ORDER BY idx ASC LIMIT 1;
  
  SELECT (value->>'timestamp')::decimal INTO v_last_timestamp
  FROM jsonb_array_elements(ks_arr) WITH ORDINALITY AS x(value, idx)
  WHERE value->>'timestamp' IS NOT NULL
  ORDER BY idx DESC LIMIT 1;
  
  v_session_duration := COALESCE(v_last_timestamp, 0);
  
  -- Process keystrokes
  FOR i IN 0..(ks_len - 1) LOOP
    curr := ks_arr->i;
    
    -- Basic counts - handle backspaces
    IF curr->>'key' = 'Backspace' OR (curr->>'isBackspace')::boolean THEN
      v_backspace_count := v_backspace_count + 1;
      v_current_streak := 0;
      v_prev_was_correct := FALSE;
      CONTINUE;
    END IF;
    
    IF curr->>'expected' IS NOT NULL THEN
      v_total_count := v_total_count + 1;
      v_expected_char := curr->>'expected';
      v_actual_char := curr->>'key';
      
      -- Get current interval once for reuse
      v_current_interval := NULL;
      IF curr->>'interval' IS NOT NULL AND (curr->>'interval')::decimal > 0 AND (curr->>'interval')::decimal < 2000 THEN
        v_current_interval := (curr->>'interval')::decimal;
      END IF;
      
      IF (curr->>'correct')::boolean THEN
        v_correct_count := v_correct_count + 1;
        v_current_streak := v_current_streak + 1;
        v_max_streak := GREATEST(v_max_streak, v_current_streak);
      ELSE
        v_error_count := v_error_count + 1;
        v_current_streak := 0;
        
        -- Track error confusion (which key was pressed instead)
        IF v_actual_char IS NOT NULL AND v_expected_char IS NOT NULL 
           AND v_actual_char != v_expected_char 
           AND LENGTH(v_actual_char) = 1 AND LENGTH(v_expected_char) = 1 THEN
          PERFORM update_running_stat(
            'error:' || LOWER(v_expected_char) || '→' || LOWER(v_actual_char),
            'error_confusion',
            1,
            1
          );
        END IF;
      END IF;
      
      -- === CHARACTER BREAKDOWN ===
      -- Letters (a-z, A-Z)
      IF v_expected_char ~ '^[a-zA-Z]$' THEN
        v_letter_count := v_letter_count + 1;
        IF (curr->>'correct')::boolean THEN
          v_correct_letters := v_correct_letters + 1;
        END IF;
        -- Accumulate letter timing
        IF v_current_interval IS NOT NULL THEN
          v_letter_time := v_letter_time + v_current_interval;
          v_letter_time_count := v_letter_time_count + 1;
        END IF;
        
        -- Capitals (A-Z)
        IF v_expected_char ~ '^[A-Z]$' THEN
          v_capital_count := v_capital_count + 1;
          IF (curr->>'correct')::boolean THEN
            v_correct_capitals := v_correct_capitals + 1;
          END IF;
          -- Accumulate capital timing
          IF v_current_interval IS NOT NULL THEN
            v_capital_time := v_capital_time + v_current_interval;
            v_capital_time_count := v_capital_time_count + 1;
          END IF;
        END IF;
      
      -- Numbers (0-9)
      ELSIF v_expected_char ~ '^[0-9]$' THEN
        v_number_count := v_number_count + 1;
        IF (curr->>'correct')::boolean THEN
          v_correct_numbers := v_correct_numbers + 1;
        END IF;
        -- Accumulate number timing
        IF v_current_interval IS NOT NULL THEN
          v_number_time := v_number_time + v_current_interval;
          v_number_time_count := v_number_time_count + 1;
        END IF;
      
      -- Spaces
      ELSIF v_expected_char = ' ' THEN
        v_space_count := v_space_count + 1;
        IF (curr->>'correct')::boolean THEN
          v_correct_spaces := v_correct_spaces + 1;
        END IF;
        -- Accumulate space timing
        IF v_current_interval IS NOT NULL THEN
          v_space_time := v_space_time + v_current_interval;
          v_space_time_count := v_space_time_count + 1;
        END IF;
        
        -- Word boundary - count the word
        IF v_in_word THEN
          v_word_count := v_word_count + 1;
          IF v_word_correct THEN
            v_correct_words := v_correct_words + 1;
          END IF;
        END IF;
        v_in_word := FALSE;
        v_word_correct := TRUE;
      
      -- Symbols (@#$%^&*_+=[]{}|<>`~)
      ELSIF v_expected_char ~ '^[@#$%^&*_+=\[\]{}|<>`~]$' THEN
        v_symbol_count := v_symbol_count + 1;
        IF (curr->>'correct')::boolean THEN
          v_correct_symbols := v_correct_symbols + 1;
        END IF;
        -- Accumulate symbol timing
        IF v_current_interval IS NOT NULL THEN
          v_symbol_time := v_symbol_time + v_current_interval;
          v_symbol_time_count := v_symbol_time_count + 1;
        END IF;
      
      -- Punctuation (everything else - .,;:!?'"-()/\)
      ELSE
        v_punct_count := v_punct_count + 1;
        IF (curr->>'correct')::boolean THEN
          v_correct_punct := v_correct_punct + 1;
        END IF;
        -- Accumulate punctuation timing
        IF v_current_interval IS NOT NULL THEN
          v_punct_time := v_punct_time + v_current_interval;
          v_punct_time_count := v_punct_time_count + 1;
        END IF;
      END IF;
      
      -- Track if current word has errors
      IF v_expected_char != ' ' THEN
        v_in_word := TRUE;
        IF NOT (curr->>'correct')::boolean THEN
          v_word_correct := FALSE;
        END IF;
      END IF;
      
      -- Per-key stats (use v_expected_char to preserve original case for capitals/symbols)
      IF v_current_interval IS NOT NULL THEN
        PERFORM update_running_stat_with_accuracy(
          'key:' || v_expected_char,
          'key',
          v_current_interval,
          CASE WHEN (curr->>'correct')::boolean THEN 1 ELSE 0 END,
          1
        );
        
        -- Track fastest/slowest
        v_fastest_interval := LEAST(v_fastest_interval, v_current_interval);
        v_slowest_interval := GREATEST(v_slowest_interval, v_current_interval);
      END IF;
    END IF;
    
    -- Collect intervals
    IF curr->>'interval' IS NOT NULL AND (curr->>'interval')::decimal > 0 THEN
      v_intervals := array_append(v_intervals, (curr->>'interval')::decimal);
      
      -- Rhythm tracking
      IF v_prev_interval IS NOT NULL THEN
        v_rhythm_diffs := array_append(v_rhythm_diffs, ABS((curr->>'interval')::decimal - v_prev_interval));
      END IF;
      v_prev_interval := (curr->>'interval')::decimal;
      
      -- Detect bursts and hesitations
      IF (curr->>'interval')::decimal < 100 THEN
        v_current_burst := v_current_burst + 1;
        v_max_burst := GREATEST(v_max_burst, v_current_burst);
      ELSE
        IF v_current_burst > 2 THEN
          v_burst_count := v_burst_count + 1;
          v_burst_lengths := array_append(v_burst_lengths, v_current_burst);
        END IF;
        v_current_burst := 0;
        
        IF (curr->>'interval')::decimal > 500 THEN
          v_hesitation_count := v_hesitation_count + 1;
          v_hesitation_times := array_append(v_hesitation_times, (curr->>'interval')::decimal);
        END IF;
      END IF;
    END IF;
    
    -- Finger stats with timing for hand balance
    v_finger := get_finger(curr->>'expected');
    IF v_finger IS NOT NULL THEN
      v_total_keys := v_total_keys + 1;
      
      IF v_finger LIKE 'L-%' THEN
        v_left_hand := v_left_hand + 1;
        IF curr->>'interval' IS NOT NULL THEN
          v_left_time := v_left_time + (curr->>'interval')::decimal;
        END IF;
      ELSIF v_finger LIKE 'R-%' THEN
        v_right_hand := v_right_hand + 1;
        IF curr->>'interval' IS NOT NULL THEN
          v_right_time := v_right_time + (curr->>'interval')::decimal;
        END IF;
      END IF;
      
      -- Home row tracking with timing
      IF curr->>'expected' IN ('a','s','d','f','g','h','j','k','l',';','A','S','D','F','G','H','J','K','L',':') THEN
        v_home_row := v_home_row + 1;
        IF curr->>'interval' IS NOT NULL THEN
          v_home_row_time := v_home_row_time + (curr->>'interval')::decimal;
        END IF;
      ELSE
        IF curr->>'interval' IS NOT NULL THEN
          v_non_home_time := v_non_home_time + (curr->>'interval')::decimal;
        END IF;
      END IF;
      
      -- Top row tracking (qwertyuiop and their shifts)
      IF curr->>'expected' IN ('q','w','e','r','t','y','u','i','o','p','Q','W','E','R','T','Y','U','I','O','P') THEN
        v_top_row_count := v_top_row_count + 1;
        IF curr->>'interval' IS NOT NULL THEN
          v_top_row_time := v_top_row_time + (curr->>'interval')::decimal;
        END IF;
      END IF;
      
      -- Bottom row tracking (zxcvbnm and their shifts)
      IF curr->>'expected' IN ('z','x','c','v','b','n','m','Z','X','C','V','B','N','M') THEN
        v_bottom_row_count := v_bottom_row_count + 1;
        IF curr->>'interval' IS NOT NULL THEN
          v_bottom_row_time := v_bottom_row_time + (curr->>'interval')::decimal;
        END IF;
      END IF;
      
      -- Track alternating hands vs same hand
      DECLARE
        v_curr_hand TEXT;
      BEGIN
        IF v_finger LIKE 'L-%' THEN v_curr_hand := 'L';
        ELSIF v_finger LIKE 'R-%' THEN v_curr_hand := 'R';
        ELSE v_curr_hand := NULL;
        END IF;
        
        IF v_curr_hand IS NOT NULL AND v_prev_hand IS NOT NULL THEN
          IF v_curr_hand = v_prev_hand THEN
            v_same_hand_count := v_same_hand_count + 1;
          ELSE
            v_alternating_count := v_alternating_count + 1;
          END IF;
        END IF;
        v_prev_hand := v_curr_hand;
      END;
      
      -- Track double letters (same key twice)
      IF v_prev_expected IS NOT NULL AND LOWER(curr->>'expected') = LOWER(v_prev_expected) THEN
        IF curr->>'interval' IS NOT NULL AND (curr->>'interval')::decimal > 0 THEN
          v_double_letter_count := v_double_letter_count + 1;
          v_double_letter_time := v_double_letter_time + (curr->>'interval')::decimal;
        END IF;
      END IF;
      v_prev_expected := curr->>'expected';
      
      -- Update finger stat
      IF curr->>'interval' IS NOT NULL AND (curr->>'interval')::decimal > 0 AND (curr->>'interval')::decimal < 2000 THEN
        PERFORM update_running_stat_with_accuracy(
          'finger:' || v_finger,
          'finger',
          (curr->>'interval')::decimal,
          CASE WHEN (curr->>'correct')::boolean THEN 1 ELSE 0 END,
          1
        );
      END IF;
      
      -- Finger transitions (ONLY if both current and previous were correct - clean data)
      IF i > 0 AND v_prev_was_correct AND (curr->>'correct')::boolean THEN
        prev := ks_arr->(i-1);
        v_prev_finger := get_finger(prev->>'expected');
        
        IF v_prev_finger IS NOT NULL AND v_finger IS NOT NULL AND v_prev_finger != v_finger THEN
          v_transition_key := v_prev_finger || '→' || v_finger;
          
          IF curr->>'interval' IS NOT NULL AND (curr->>'interval')::decimal > 0 AND (curr->>'interval')::decimal < 2000 THEN
            PERFORM update_running_stat(
              'transition:' || v_transition_key,
              'finger_transition',
              (curr->>'interval')::decimal
            );
          END IF;
        END IF;
      END IF;
    END IF;
    
    -- Bigrams (ONLY if both current and previous were correct - clean data)
    IF i > 0 AND v_prev_was_correct AND (curr->>'correct')::boolean THEN
      prev := ks_arr->(i-1);
      IF prev->>'expected' IS NOT NULL AND curr->>'expected' IS NOT NULL THEN
        -- Skip same-character bigrams (case-insensitive)
        IF LOWER(prev->>'expected') != LOWER(curr->>'expected') THEN
          v_bigram := (prev->>'expected') || (curr->>'expected');
          
          IF curr->>'interval' IS NOT NULL AND (curr->>'interval')::decimal > 0 AND (curr->>'interval')::decimal < 2000 THEN
            PERFORM update_running_stat_with_accuracy(
              'bigram:' || v_bigram,
              'bigram',
              (curr->>'interval')::decimal,
              1,  -- Both correct, so bigram is correct
              1
            );
          END IF;
        END IF;
      END IF;
    END IF;
    
    -- Track previous correctness for next iteration
    v_prev_was_correct := (curr->>'correct')::boolean;
  END LOOP;
  
  -- Count final word if we ended in a word
  IF v_in_word AND v_total_count > 0 THEN
    v_word_count := v_word_count + 1;
    IF v_word_correct THEN
      v_correct_words := v_correct_words + 1;
    END IF;
  END IF;
  
  -- Calculate session-level derived stats
  IF v_total_count > 0 THEN
    v_total_time := v_session_duration;
    
    -- WPM
    IF v_total_time > 0 THEN
      v_wpm := (v_total_count / 5.0) / (v_total_time / 60000.0);
    END IF;
    
    -- Accuracy
    v_accuracy := (v_correct_count::decimal / v_total_count) * 100;
    
    -- Interval stats
    IF array_length(v_intervals, 1) > 0 THEN
      SELECT AVG(val), STDDEV(val) INTO v_avg_interval, v_std_dev
      FROM unnest(v_intervals) AS val;
      
      IF v_avg_interval > 0 AND v_std_dev IS NOT NULL THEN
        v_consistency := GREATEST(0, 100 - (v_std_dev / v_avg_interval * 100));
      END IF;
      
      -- Flow ratio
      SELECT COUNT(*) INTO v_flow_count
      FROM unnest(v_intervals) AS val
      WHERE val >= v_avg_interval * 0.7 AND val <= v_avg_interval * 1.3;
      
      v_flow_ratio := (v_flow_count::decimal / array_length(v_intervals, 1)) * 100;
      
      -- Rhythm score
      IF array_length(v_rhythm_diffs, 1) > 0 THEN
        DECLARE
          v_avg_diff DECIMAL;
        BEGIN
          SELECT AVG(val) INTO v_avg_diff FROM unnest(v_rhythm_diffs) AS val;
          v_rhythm_score := GREATEST(0, LEAST(100, 100 - (v_avg_diff / v_avg_interval * 100)));
        END;
      END IF;
    END IF;
    
    -- Hand balance
    IF v_left_hand > 0 AND v_right_hand > 0 THEN
      DECLARE
        v_left_avg DECIMAL := v_left_time / v_left_hand;
        v_right_avg DECIMAL := v_right_time / v_right_hand;
      BEGIN
        v_hand_balance := ROUND(((v_right_avg / v_left_avg) * 100 - 100)::numeric, 0);
        v_hand_balance := GREATEST(-50, LEAST(50, v_hand_balance));
      END;
    ELSE
      v_hand_balance := 0;
    END IF;
    
    -- Home row advantage
    IF v_home_row > 0 AND (v_total_keys - v_home_row) > 0 THEN
      DECLARE
        v_home_avg DECIMAL := v_home_row_time / v_home_row;
        v_non_home_count INTEGER := v_total_keys - v_home_row;
        v_non_home_avg DECIMAL := CASE WHEN v_non_home_count > 0 THEN v_non_home_time / v_non_home_count ELSE v_home_avg END;
      BEGIN
        v_home_row_advantage := ROUND(((1 - v_home_avg / v_non_home_avg) * 100)::numeric, 0);
        v_home_row_advantage := GREATEST(-50, LEAST(50, v_home_row_advantage));
      END;
    ELSE
      v_home_row_advantage := 0;
    END IF;
    
    -- ============================================================
    -- UPDATE GLOBAL STATS
    -- ============================================================
    
    -- Core metrics with histograms
    IF v_wpm IS NOT NULL AND v_wpm > 0 AND v_wpm < 300 THEN
      PERFORM update_running_stat('global:wpm', 'global', v_wpm);
      PERFORM update_histogram('global:wpm', v_wpm, 1);
    END IF;
    
    IF v_accuracy IS NOT NULL THEN
      PERFORM update_running_stat('global:accuracy', 'global', v_accuracy);
      PERFORM update_histogram('global:accuracy', v_accuracy, 1);
    END IF;
    
    IF v_avg_interval IS NOT NULL AND v_avg_interval > 0 AND v_avg_interval < 1000 THEN
      PERFORM update_running_stat('global:avgInterval', 'global', v_avg_interval);
      PERFORM update_histogram('global:avgInterval', v_avg_interval, 5);
    END IF;
    
    IF v_consistency IS NOT NULL THEN
      PERFORM update_running_stat('global:consistency', 'global', v_consistency);
      PERFORM update_histogram('global:consistency', v_consistency, 1);
    END IF;
    
    IF v_std_dev IS NOT NULL THEN
      PERFORM update_running_stat('global:stdDev', 'global', v_std_dev);
    END IF;
    
    IF v_flow_ratio IS NOT NULL THEN
      PERFORM update_running_stat('global:flowRatio', 'global', v_flow_ratio);
      PERFORM update_histogram('global:flowRatio', v_flow_ratio, 1);
    END IF;
    
    IF v_rhythm_score IS NOT NULL THEN
      PERFORM update_running_stat('global:rhythmScore', 'global', v_rhythm_score);
      PERFORM update_histogram('global:rhythmScore', v_rhythm_score, 1);
    END IF;
    
    IF v_hand_balance IS NOT NULL THEN
      PERFORM update_running_stat('global:handBalance', 'global', v_hand_balance);
      PERFORM update_histogram('global:handBalance', v_hand_balance + 50, 1);
    END IF;
    
    IF v_home_row_advantage IS NOT NULL THEN
      PERFORM update_running_stat('global:homeRowAdvantage', 'global', v_home_row_advantage);
      PERFORM update_histogram('global:homeRowAdvantage', v_home_row_advantage + 50, 1);
    END IF;
    
    -- Character breakdown totals
    PERFORM update_running_stat('counts:words', 'counts', v_word_count);
    PERFORM update_running_stat('counts:correctWords', 'counts', v_correct_words);
    PERFORM update_running_stat('counts:letters', 'counts', v_letter_count);
    PERFORM update_running_stat('counts:correctLetters', 'counts', v_correct_letters);
    PERFORM update_running_stat('counts:numbers', 'counts', v_number_count);
    PERFORM update_running_stat('counts:correctNumbers', 'counts', v_correct_numbers);
    PERFORM update_running_stat('counts:punctuation', 'counts', v_punct_count);
    PERFORM update_running_stat('counts:correctPunctuation', 'counts', v_correct_punct);
    PERFORM update_running_stat('counts:capitals', 'counts', v_capital_count);
    PERFORM update_running_stat('counts:correctCapitals', 'counts', v_correct_capitals);
    PERFORM update_running_stat('counts:spaces', 'counts', v_space_count);
    PERFORM update_running_stat('counts:correctSpaces', 'counts', v_correct_spaces);
    PERFORM update_running_stat('counts:symbols', 'counts', v_symbol_count);
    PERFORM update_running_stat('counts:correctSymbols', 'counts', v_correct_symbols);
    
    -- Lifetime totals
    PERFORM update_running_stat('lifetime:keystrokes', 'lifetime', v_total_count);
    PERFORM update_running_stat('lifetime:errors', 'lifetime', v_error_count);
    PERFORM update_running_stat('lifetime:backspaces', 'lifetime', v_backspace_count);
    PERFORM update_running_stat('lifetime:typingTimeMs', 'lifetime', v_session_duration);
    
    -- Records (using max/min tracking)
    INSERT INTO running_stats (stat_key, category, count, max_value, updated_at)
    VALUES ('records:fastestWpm', 'records', 1, v_wpm, NOW())
    ON CONFLICT (stat_key) DO UPDATE SET
      max_value = GREATEST(running_stats.max_value, EXCLUDED.max_value),
      count = running_stats.count + 1,
      updated_at = NOW();
    
    INSERT INTO running_stats (stat_key, category, count, max_value, updated_at)
    VALUES ('records:longestStreak', 'records', 1, v_max_streak, NOW())
    ON CONFLICT (stat_key) DO UPDATE SET
      max_value = GREATEST(running_stats.max_value, EXCLUDED.max_value),
      count = running_stats.count + 1,
      updated_at = NOW();
    
    INSERT INTO running_stats (stat_key, category, count, max_value, updated_at)
    VALUES ('records:longestBurst', 'records', 1, v_max_burst, NOW())
    ON CONFLICT (stat_key) DO UPDATE SET
      max_value = GREATEST(running_stats.max_value, EXCLUDED.max_value),
      count = running_stats.count + 1,
      updated_at = NOW();
    
    IF v_fastest_interval < 9999 THEN
      INSERT INTO running_stats (stat_key, category, count, min_value, updated_at)
      VALUES ('records:fastestKeystroke', 'records', 1, v_fastest_interval, NOW())
      ON CONFLICT (stat_key) DO UPDATE SET
        min_value = LEAST(running_stats.min_value, EXCLUDED.min_value),
        count = running_stats.count + 1,
        updated_at = NOW();
    END IF;
    
    -- Session duration stats
    IF v_session_duration > 0 THEN
      PERFORM update_running_stat('sessions:durationMs', 'sessions', v_session_duration);
    END IF;
    
    -- === FUTURE-PROOF TRACKING ===
    
    -- Time-of-day tracking (hour bucket 0-23)
    PERFORM update_running_stat(
      'time:hour:' || EXTRACT(HOUR FROM NOW())::integer,
      'time_patterns',
      v_wpm
    );
    
    -- Day-of-week tracking (0=Sunday, 6=Saturday)
    PERFORM update_running_stat(
      'time:dow:' || EXTRACT(DOW FROM NOW())::integer,
      'time_patterns',
      v_wpm
    );
    
    -- Session position stats (how well do users start vs finish?)
    -- First 20% of keystrokes vs last 20%
    IF array_length(v_intervals, 1) >= 10 THEN
      DECLARE
        v_first_fifth DECIMAL[];
        v_last_fifth DECIMAL[];
        v_fifth_size INTEGER := GREATEST(1, array_length(v_intervals, 1) / 5);
        v_first_avg DECIMAL;
        v_last_avg DECIMAL;
      BEGIN
        v_first_fifth := v_intervals[1:v_fifth_size];
        v_last_fifth := v_intervals[array_length(v_intervals, 1) - v_fifth_size + 1:array_length(v_intervals, 1)];
        
        SELECT AVG(val) INTO v_first_avg FROM unnest(v_first_fifth) AS val;
        SELECT AVG(val) INTO v_last_avg FROM unnest(v_last_fifth) AS val;
        
        IF v_first_avg > 0 AND v_last_avg > 0 THEN
          -- Warmup effect: positive = got faster, negative = got slower
          PERFORM update_running_stat('sessions:warmupEffect', 'sessions', 
            ((v_first_avg - v_last_avg) / v_first_avg) * 100);
        END IF;
      END;
    END IF;
    
    -- Row-based performance (avg speed per row)
    IF v_home_row > 0 THEN
      PERFORM update_running_stat('rows:homeRow', 'row_performance', 
        v_home_row_time / v_home_row);
    END IF;
    IF v_top_row_count > 0 THEN
      PERFORM update_running_stat('rows:topRow', 'row_performance',
        v_top_row_time / v_top_row_count);
    END IF;
    IF v_bottom_row_count > 0 THEN
      PERFORM update_running_stat('rows:bottomRow', 'row_performance',
        v_bottom_row_time / v_bottom_row_count);
    END IF;
    
    -- Double letter performance (same key twice - e.g., "ll", "ee")
    IF v_double_letter_count > 0 THEN
      PERFORM update_running_stat('patterns:doubleLetter', 'patterns',
        v_double_letter_time / v_double_letter_count);
      PERFORM update_running_stat('patterns:doubleLetterCount', 'patterns',
        v_double_letter_count);
    END IF;
    
    -- Alternating hands vs same hand sequences
    IF v_alternating_count + v_same_hand_count > 0 THEN
      PERFORM update_running_stat('patterns:alternatingRatio', 'patterns',
        (v_alternating_count::decimal / (v_alternating_count + v_same_hand_count)) * 100);
    END IF;
    
    -- Accuracy by character type
    IF v_letter_count > 0 THEN
      PERFORM update_running_stat('accuracy:letters', 'accuracy_breakdown', 
        (v_correct_letters::decimal / v_letter_count) * 100);
    END IF;
    IF v_number_count > 0 THEN
      PERFORM update_running_stat('accuracy:numbers', 'accuracy_breakdown',
        (v_correct_numbers::decimal / v_number_count) * 100);
    END IF;
    IF v_punct_count > 0 THEN
      PERFORM update_running_stat('accuracy:punctuation', 'accuracy_breakdown',
        (v_correct_punct::decimal / v_punct_count) * 100);
    END IF;
    IF v_capital_count > 0 THEN
      PERFORM update_running_stat('accuracy:capitals', 'accuracy_breakdown',
        (v_correct_capitals::decimal / v_capital_count) * 100);
    END IF;
    IF v_space_count > 0 THEN
      PERFORM update_running_stat('accuracy:spaces', 'accuracy_breakdown',
        (v_correct_spaces::decimal / v_space_count) * 100);
    END IF;
    IF v_word_count > 0 THEN
      PERFORM update_running_stat('accuracy:words', 'accuracy_breakdown',
        (v_correct_words::decimal / v_word_count) * 100);
    END IF;
    IF v_symbol_count > 0 THEN
      PERFORM update_running_stat('accuracy:symbols', 'accuracy_breakdown',
        (v_correct_symbols::decimal / v_symbol_count) * 100);
    END IF;
    
    -- Speed by character type (rolling averages - no storage growth)
    IF v_letter_time_count > 0 THEN
      PERFORM update_running_stat('speed:letters', 'speed_breakdown',
        v_letter_time / v_letter_time_count);
    END IF;
    IF v_number_time_count > 0 THEN
      PERFORM update_running_stat('speed:numbers', 'speed_breakdown',
        v_number_time / v_number_time_count);
    END IF;
    IF v_punct_time_count > 0 THEN
      PERFORM update_running_stat('speed:punctuation', 'speed_breakdown',
        v_punct_time / v_punct_time_count);
    END IF;
    IF v_capital_time_count > 0 THEN
      PERFORM update_running_stat('speed:capitals', 'speed_breakdown',
        v_capital_time / v_capital_time_count);
    END IF;
    IF v_space_time_count > 0 THEN
      PERFORM update_running_stat('speed:spaces', 'speed_breakdown',
        v_space_time / v_space_time_count);
    END IF;
    IF v_symbol_time_count > 0 THEN
      PERFORM update_running_stat('speed:symbols', 'speed_breakdown',
        v_symbol_time / v_symbol_time_count);
    END IF;
    
    -- User-specific stats
    PERFORM update_running_stat('user:' || session_rec.user_id || ':wpm', 'user', COALESCE(v_wpm, 0));
    PERFORM update_running_stat('user:' || session_rec.user_id || ':accuracy', 'user', COALESCE(v_accuracy, 0));
    PERFORM update_running_stat('user:' || session_rec.user_id || ':consistency', 'user', COALESCE(v_consistency, 0));
    
    -- Behavioral stats
    IF v_burst_count > 0 THEN
      PERFORM update_running_stat('behavioral:burstCount', 'behavioral', v_burst_count);
      PERFORM update_running_stat('behavioral:avgBurstLength', 'behavioral',
        (SELECT AVG(val) FROM unnest(v_burst_lengths) AS val));
    END IF;
    
    IF v_hesitation_count > 0 THEN
      PERFORM update_running_stat('behavioral:hesitationCount', 'behavioral', v_hesitation_count);
      PERFORM update_running_stat('behavioral:avgHesitation', 'behavioral',
        (SELECT AVG(val) FROM unnest(v_hesitation_times) AS val));
    END IF;
    
    IF v_error_count > 0 THEN
      PERFORM update_running_stat('behavioral:backspaceEfficiency', 'behavioral',
        v_backspace_count::decimal / v_error_count);
    END IF;
    
    PERFORM update_running_stat('behavioral:errorRate', 'behavioral', v_error_count);
  END IF;
  
  -- Mark as processed
  UPDATE keystroke_sessions 
  SET processed = TRUE, processed_at = NOW()
  WHERE id = p_session_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- STEP 7: AUTO-PROCESS TRIGGER
-- ============================================================

CREATE OR REPLACE FUNCTION process_on_insert()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM process_keystroke_session(NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER auto_process_session
  AFTER INSERT ON keystroke_sessions
  FOR EACH ROW
  EXECUTE FUNCTION process_on_insert();

-- ============================================================
-- STEP 8: CLEANUP FUNCTIONS
-- ============================================================

-- Manual cleanup: delete sessions older than N days
CREATE OR REPLACE FUNCTION cleanup_old_sessions(days_to_keep INTEGER DEFAULT 30)
RETURNS TABLE(deleted_count BIGINT, freed_approx_mb DECIMAL) AS $$
DECLARE
  v_deleted BIGINT;
  v_avg_size DECIMAL;
BEGIN
  -- Get average row size before deletion
  SELECT AVG(pg_column_size(keystroke_sessions.*)) INTO v_avg_size FROM keystroke_sessions LIMIT 1000;
  
  DELETE FROM keystroke_sessions
  WHERE processed = TRUE
    AND processed_at < NOW() - (days_to_keep || ' days')::interval;
  
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  
  deleted_count := v_deleted;
  freed_approx_mb := ROUND((v_deleted * COALESCE(v_avg_size, 1000) / 1048576.0)::numeric, 2);
  RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

-- Manual cleanup: keep only the most recent N sessions
CREATE OR REPLACE FUNCTION cleanup_sessions_by_count(max_sessions INTEGER DEFAULT 10000)
RETURNS TABLE(deleted_count BIGINT, remaining_count BIGINT) AS $$
DECLARE
  v_deleted BIGINT;
  v_total BIGINT;
BEGIN
  SELECT COUNT(*) INTO v_total FROM keystroke_sessions;
  
  IF v_total > max_sessions THEN
    DELETE FROM keystroke_sessions
    WHERE id IN (
      SELECT id FROM keystroke_sessions
      WHERE processed = TRUE
      ORDER BY created_at ASC
      LIMIT (v_total - max_sessions)
    );
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
  ELSE
    v_deleted := 0;
  END IF;
  
  deleted_count := v_deleted;
  remaining_count := v_total - v_deleted;
  RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

-- Auto cleanup function - called on every insert, cleans up if > threshold
CREATE OR REPLACE FUNCTION auto_cleanup_old_sessions()
RETURNS TRIGGER AS $$
DECLARE
  v_count BIGINT;
  v_max_sessions INTEGER := 50000;
  v_cleanup_batch INTEGER := 5000;
BEGIN
  -- Only check occasionally (roughly every 100 inserts based on random)
  IF random() > 0.01 THEN
    RETURN NEW;
  END IF;
  
  SELECT COUNT(*) INTO v_count FROM keystroke_sessions;
  
  IF v_count > v_max_sessions THEN
    DELETE FROM keystroke_sessions
    WHERE id IN (
      SELECT id FROM keystroke_sessions
      WHERE processed = TRUE
      ORDER BY created_at ASC
      LIMIT v_cleanup_batch
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER auto_cleanup_sessions
  AFTER INSERT ON keystroke_sessions
  FOR EACH ROW
  EXECUTE FUNCTION auto_cleanup_old_sessions();

-- ============================================================
-- STEP 9: PERCENTILE HELPER
-- ============================================================

CREATE OR REPLACE FUNCTION get_percentile_from_histogram(
  p_stat_key TEXT,
  p_percentile DECIMAL
) RETURNS DECIMAL AS $$
DECLARE
  v_histogram JSONB;
  v_total BIGINT;
  v_target BIGINT;
  v_running_count BIGINT := 0;
  v_bucket RECORD;
  v_bucket_size DECIMAL := 1;  -- Must match update_histogram bucket size for WPM
BEGIN
  SELECT histogram, count INTO v_histogram, v_total
  FROM running_stats WHERE stat_key = p_stat_key;
  
  IF v_histogram IS NULL OR v_histogram = '{}' OR v_total = 0 THEN RETURN NULL; END IF;
  
  v_target := CEIL(v_total * p_percentile);
  
  FOR v_bucket IN 
    SELECT key::integer as bucket, value::integer as cnt
    FROM jsonb_each_text(v_histogram)
    ORDER BY key::integer
  LOOP
    v_running_count := v_running_count + v_bucket.cnt;
    IF v_running_count >= v_target THEN
      RETURN (v_bucket.bucket * v_bucket_size) + (v_bucket_size / 2);
    END IF;
  END LOOP;
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- STEP 10: VIEWS FOR EASY QUERYING
-- ============================================================

-- Main session stats view
CREATE OR REPLACE VIEW session_stats AS
SELECT 
  (SELECT count FROM running_stats WHERE stat_key = 'global:wpm') as total_sessions,
  (SELECT COUNT(DISTINCT SPLIT_PART(stat_key, ':', 2)) FROM running_stats WHERE category = 'user') as total_users,
  (SELECT avg_value FROM running_stats WHERE stat_key = 'global:wpm') as avg_wpm,
  (SELECT avg_value FROM running_stats WHERE stat_key = 'global:accuracy') as avg_accuracy,
  (SELECT COALESCE(
    (SELECT avg_value FROM running_stats WHERE stat_key = 'global:avgInterval'),
    (SELECT avg_value FROM running_stats WHERE stat_key = 'global:avg_interval')
  )) as avg_interval,
  (SELECT avg_value FROM running_stats WHERE stat_key = 'global:consistency') as avg_consistency,
  (SELECT std_dev FROM running_stats WHERE stat_key = 'global:wpm') as wpm_std_dev,
  (SELECT min_value FROM running_stats WHERE stat_key = 'global:wpm') as min_wpm,
  (SELECT max_value FROM running_stats WHERE stat_key = 'global:wpm') as max_wpm,
  get_percentile_from_histogram('global:wpm', 0.10) as p10_wpm,
  get_percentile_from_histogram('global:wpm', 0.25) as p25_wpm,
  get_percentile_from_histogram('global:wpm', 0.50) as median_wpm,
  get_percentile_from_histogram('global:wpm', 0.75) as p75_wpm,
  get_percentile_from_histogram('global:wpm', 0.90) as p90_wpm;

-- Bigram stats view
CREATE OR REPLACE VIEW bigram_stats_view AS
SELECT 
  REPLACE(stat_key, 'bigram:', '') as bigram,
  count as total_occurrences,
  avg_value as avg_time,
  std_dev,
  min_value as min_time,
  max_value as max_time,
  accuracy as avg_accuracy,
  updated_at
FROM running_stats
WHERE category = 'bigram'
ORDER BY count DESC;

-- Finger stats view
CREATE OR REPLACE VIEW finger_stats_view AS
SELECT 
  REPLACE(stat_key, 'finger:', '') as finger,
  count as total_presses,
  avg_value as avg_interval,
  std_dev,
  accuracy as avg_accuracy,
  updated_at
FROM running_stats
WHERE category = 'finger'
ORDER BY count DESC;

-- Finger transition stats view
CREATE OR REPLACE VIEW finger_transition_stats_view AS
SELECT 
  REPLACE(stat_key, 'transition:', '') as transition_key,
  SPLIT_PART(REPLACE(stat_key, 'transition:', ''), '→', 1) as from_finger,
  SPLIT_PART(REPLACE(stat_key, 'transition:', ''), '→', 2) as to_finger,
  count as total_occurrences,
  avg_value as avg_time,
  std_dev,
  min_value as min_time,
  max_value as max_time,
  updated_at
FROM running_stats
WHERE category = 'finger_transition'
ORDER BY count DESC;

-- Behavioral stats view
CREATE OR REPLACE VIEW behavioral_stats_view AS
SELECT 
  REPLACE(stat_key, 'behavioral:', '') as stat_name,
  count as total_samples,
  avg_value,
  std_dev,
  min_value,
  max_value,
  updated_at
FROM running_stats
WHERE category = 'behavioral'
ORDER BY stat_key;

-- User stats view
CREATE OR REPLACE VIEW user_stats_view AS
SELECT 
  SPLIT_PART(REPLACE(stat_key, 'user:', ''), ':', 1) as user_id,
  SPLIT_PART(REPLACE(stat_key, 'user:', ''), ':', 2) as stat_name,
  count as total_samples,
  avg_value,
  std_dev,
  updated_at
FROM running_stats
WHERE category = 'user';

-- Per-key stats view
CREATE OR REPLACE VIEW key_stats_view AS
SELECT 
  REPLACE(stat_key, 'key:', '') as key_char,
  count as total_presses,
  avg_value as avg_interval,
  std_dev,
  min_value as min_time,
  max_value as max_time,
  accuracy as avg_accuracy,
  updated_at
FROM running_stats
WHERE category = 'key'
ORDER BY count DESC;

-- Global histograms view
CREATE OR REPLACE VIEW global_histograms_view AS
SELECT 
  REPLACE(stat_key, 'global:', '') as metric,
  histogram,
  count as total_sessions,
  avg_value,
  std_dev,
  min_value,
  max_value
FROM running_stats
WHERE category = 'global' AND histogram IS NOT NULL AND histogram != '{}';

-- Character breakdown view
CREATE OR REPLACE VIEW character_breakdown_view AS
SELECT 
  (SELECT sum_value FROM running_stats WHERE stat_key = 'counts:words')::bigint as total_words,
  (SELECT sum_value FROM running_stats WHERE stat_key = 'counts:correctWords')::bigint as correct_words,
  (SELECT sum_value FROM running_stats WHERE stat_key = 'counts:letters')::bigint as total_letters,
  (SELECT sum_value FROM running_stats WHERE stat_key = 'counts:correctLetters')::bigint as correct_letters,
  (SELECT sum_value FROM running_stats WHERE stat_key = 'counts:numbers')::bigint as total_numbers,
  (SELECT sum_value FROM running_stats WHERE stat_key = 'counts:correctNumbers')::bigint as correct_numbers,
  (SELECT sum_value FROM running_stats WHERE stat_key = 'counts:punctuation')::bigint as total_punctuation,
  (SELECT sum_value FROM running_stats WHERE stat_key = 'counts:correctPunctuation')::bigint as correct_punctuation,
  (SELECT sum_value FROM running_stats WHERE stat_key = 'counts:capitals')::bigint as total_capitals,
  (SELECT sum_value FROM running_stats WHERE stat_key = 'counts:correctCapitals')::bigint as correct_capitals,
  (SELECT sum_value FROM running_stats WHERE stat_key = 'counts:spaces')::bigint as total_spaces,
  (SELECT sum_value FROM running_stats WHERE stat_key = 'counts:correctSpaces')::bigint as correct_spaces,
  (SELECT sum_value FROM running_stats WHERE stat_key = 'counts:symbols')::bigint as total_symbols,
  (SELECT sum_value FROM running_stats WHERE stat_key = 'counts:correctSymbols')::bigint as correct_symbols;

-- Lifetime stats view
CREATE OR REPLACE VIEW lifetime_stats_view AS
SELECT 
  (SELECT sum_value FROM running_stats WHERE stat_key = 'lifetime:keystrokes')::bigint as total_keystrokes,
  (SELECT sum_value FROM running_stats WHERE stat_key = 'lifetime:errors')::bigint as total_errors,
  (SELECT sum_value FROM running_stats WHERE stat_key = 'lifetime:backspaces')::bigint as total_backspaces,
  (SELECT sum_value FROM running_stats WHERE stat_key = 'lifetime:typingTimeMs')::bigint as total_typing_time_ms,
  ROUND(((SELECT sum_value FROM running_stats WHERE stat_key = 'lifetime:typingTimeMs') / 3600000.0)::numeric, 2) as total_typing_hours,
  CASE 
    WHEN (SELECT sum_value FROM running_stats WHERE stat_key = 'lifetime:keystrokes') > 0 
    THEN ROUND((1 - (SELECT sum_value FROM running_stats WHERE stat_key = 'lifetime:errors')::decimal / 
         (SELECT sum_value FROM running_stats WHERE stat_key = 'lifetime:keystrokes'))::numeric * 100, 2)
    ELSE NULL 
  END as lifetime_accuracy;

-- Records view
CREATE OR REPLACE VIEW records_view AS
SELECT 
  (SELECT max_value FROM running_stats WHERE stat_key = 'records:fastestWpm') as fastest_wpm,
  (SELECT max_value FROM running_stats WHERE stat_key = 'records:longestStreak')::integer as longest_streak,
  (SELECT max_value FROM running_stats WHERE stat_key = 'records:longestBurst')::integer as longest_burst,
  (SELECT min_value FROM running_stats WHERE stat_key = 'records:fastestKeystroke') as fastest_keystroke_ms,
  (SELECT count FROM running_stats WHERE stat_key = 'global:wpm') as total_sessions;

-- Error confusion view (most common mistakes)
CREATE OR REPLACE VIEW error_confusion_view AS
SELECT 
  SPLIT_PART(REPLACE(stat_key, 'error:', ''), '→', 1) as expected,
  SPLIT_PART(REPLACE(stat_key, 'error:', ''), '→', 2) as typed,
  sum_value::bigint as occurrences
FROM running_stats
WHERE category = 'error_confusion'
ORDER BY sum_value DESC
LIMIT 50;

-- Accuracy by character type view
CREATE OR REPLACE VIEW accuracy_by_type_view AS
SELECT 
  REPLACE(stat_key, 'accuracy:', '') as char_type,
  count as sample_sessions,
  avg_value as avg_accuracy,
  std_dev as accuracy_std_dev,
  min_value as min_accuracy,
  max_value as max_accuracy
FROM running_stats
WHERE category = 'accuracy_breakdown'
ORDER BY avg_value ASC;

-- Speed by character type view
CREATE OR REPLACE VIEW speed_by_type_view AS
SELECT 
  REPLACE(stat_key, 'speed:', '') as char_type,
  count as sample_sessions,
  avg_value as avg_interval,
  std_dev as interval_std_dev,
  min_value as min_interval,
  max_value as max_interval
FROM running_stats
WHERE category = 'speed_breakdown'
ORDER BY avg_value ASC;

-- Row performance view (top/home/bottom keyboard rows)
CREATE OR REPLACE VIEW row_performance_view AS
SELECT 
  REPLACE(stat_key, 'rows:', '') as row_name,
  count as sample_sessions,
  avg_value as avg_interval_ms,
  std_dev,
  min_value,
  max_value
FROM running_stats
WHERE category = 'row_performance'
ORDER BY avg_value ASC;

-- Typing patterns view (double letters, alternating hands)
CREATE OR REPLACE VIEW typing_patterns_view AS
SELECT 
  REPLACE(stat_key, 'patterns:', '') as pattern_name,
  count as sample_sessions,
  avg_value,
  std_dev,
  min_value,
  max_value
FROM running_stats
WHERE category = 'patterns'
ORDER BY stat_key;

-- Time-of-day performance view
CREATE OR REPLACE VIEW time_patterns_view AS
SELECT 
  stat_key,
  CASE 
    WHEN stat_key LIKE 'time:hour:%' THEN 'hourly'
    WHEN stat_key LIKE 'time:dow:%' THEN 'daily'
  END as pattern_type,
  CASE 
    WHEN stat_key LIKE 'time:hour:%' THEN REPLACE(stat_key, 'time:hour:', '')::integer
    WHEN stat_key LIKE 'time:dow:%' THEN REPLACE(stat_key, 'time:dow:', '')::integer
  END as time_value,
  count as sample_sessions,
  avg_value as avg_wpm,
  std_dev as wpm_std_dev
FROM running_stats
WHERE category = 'time_patterns'
ORDER BY stat_key;

-- ============================================================
-- STEP 11: GRANT ACCESS
-- ============================================================

GRANT SELECT ON session_stats TO anon;
GRANT SELECT ON bigram_stats_view TO anon;
GRANT SELECT ON finger_stats_view TO anon;
GRANT SELECT ON finger_transition_stats_view TO anon;
GRANT SELECT ON behavioral_stats_view TO anon;
GRANT SELECT ON user_stats_view TO anon;
GRANT SELECT ON key_stats_view TO anon;
GRANT SELECT ON global_histograms_view TO anon;
GRANT SELECT ON character_breakdown_view TO anon;
GRANT SELECT ON lifetime_stats_view TO anon;
GRANT SELECT ON records_view TO anon;
GRANT SELECT ON error_confusion_view TO anon;
GRANT SELECT ON accuracy_by_type_view TO anon;
GRANT SELECT ON speed_by_type_view TO anon;
GRANT SELECT ON row_performance_view TO anon;
GRANT SELECT ON typing_patterns_view TO anon;
GRANT SELECT ON time_patterns_view TO anon;
GRANT SELECT ON running_stats TO anon;
GRANT SELECT ON key_finger_map TO anon;
GRANT INSERT, SELECT ON keystroke_sessions TO anon;

-- ============================================================
-- DONE!
-- ============================================================

SELECT 'Setup complete!' as status;
SELECT COUNT(*) as finger_mappings FROM key_finger_map;

-- Show available views
SELECT 'Available views:' as info
UNION ALL SELECT '  - session_stats: core global averages and percentiles'
UNION ALL SELECT '  - bigram_stats_view: two-letter combination stats'
UNION ALL SELECT '  - finger_stats_view: per-finger performance'
UNION ALL SELECT '  - finger_transition_stats_view: finger-to-finger transitions'
UNION ALL SELECT '  - behavioral_stats_view: bursts, hesitations, etc.'
UNION ALL SELECT '  - key_stats_view: per-key performance'
UNION ALL SELECT '  - global_histograms_view: distribution histograms'
UNION ALL SELECT '  - character_breakdown_view: words/letters/numbers/punct counts'
UNION ALL SELECT '  - lifetime_stats_view: total keystrokes, time, accuracy'
UNION ALL SELECT '  - records_view: fastest WPM, longest streak, etc.'
UNION ALL SELECT '  - error_confusion_view: most common typos'
UNION ALL SELECT '  - accuracy_by_type_view: accuracy by character type'
UNION ALL SELECT '  - speed_by_type_view: speed by character type'
UNION ALL SELECT '  - row_performance_view: speed by keyboard row (top/home/bottom)'
UNION ALL SELECT '  - typing_patterns_view: double letters, hand alternation'
UNION ALL SELECT '  - time_patterns_view: performance by hour and day of week';
