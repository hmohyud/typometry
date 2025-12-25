import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import sentences from "./sentences.json";
import { getKeyDistance } from "./keyboard";
import { KeyboardHeatmap, KeyboardFlowMap } from "./KeyboardViz";
import { Tooltip, TipTitle, TipText, TipHint } from "./Tooltip";
import { useGlobalStats } from "./useGlobalStats";
import { useRace } from "./useRace";
import {
  RaceLobby,
  RaceCountdown,
  RaceProgressPanel,
  RaceResults,
  RaceStatsPanel,
  SharedResultsView,
} from "./RaceMode";

// Number formatting utilities
const formatNumber = (num, options = {}) => {
  if (num === null || num === undefined || isNaN(num)) return "—";

  const {
    decimals = 0, // decimal places for normal display
    compact = false, // use K, M, B for large numbers
    maxLength = 6, // auto-compact if longer than this
    percent = false, // treat as percentage (append %)
    ms = false, // treat as milliseconds (append ms)
  } = options;

  // Handle percentages
  if (percent) {
    const rounded = Math.round(num * 10) / 10;
    return `${rounded}%`;
  }

  // Handle milliseconds
  if (ms) {
    return `${Math.round(num)}ms`;
  }

  // Auto-detect if we should compact
  const absNum = Math.abs(num);
  const shouldCompact =
    compact || String(Math.round(absNum)).length > maxLength;

  if (shouldCompact && absNum >= 1000) {
    if (absNum >= 1e9) {
      return `${(num / 1e9).toFixed(1)}B`;
    } else if (absNum >= 1e6) {
      return `${(num / 1e6).toFixed(1)}M`;
    } else if (absNum >= 1e3) {
      return `${(num / 1e3).toFixed(1)}K`;
    }
  }

  // Normal formatting
  if (decimals > 0) {
    return num.toFixed(decimals);
  }
  return Math.round(num).toString();
};

// Shorthand formatters
const fmt = {
  count: (n) => formatNumber(n, { compact: true }),
  pct: (n) => formatNumber(n, { percent: true }),
  ms: (n) => formatNumber(n, { ms: true }),
  int: (n) => formatNumber(n),
  dec: (n, d = 1) => formatNumber(n, { decimals: d }),
};

// Unified stat rounding - use these everywhere for consistency
// This ensures local stats and global stats match when comparing
const STAT_ROUND = {
  wpm: (v) => Math.round(v), // integer
  accuracy: (v) => Math.round(v * 10) / 10, // 1 decimal
  consistency: (v) => Math.round(v * 10) / 10, // 1 decimal
  avgInterval: (v) => Math.round(v), // integer ms
  flowRatio: (v) => Math.round(v), // integer %
  rhythmScore: (v) => Math.round(v), // integer %
  handBalance: (v) => Math.round(v), // integer %
  homeRowAdvantage: (v) => Math.round(v), // integer %
  stdDev: (v) => Math.round(v), // integer
  backspaceEfficiency: (v) => Math.round(v * 10) / 10, // 1 decimal
  distance: (v) => Math.round(v * 100) / 100, // 2 decimals
  time: (v) => Math.round(v * 10) / 10, // 1 decimal seconds
};

// Flatten all paragraphs into one pool with indices
const ALL_PARAGRAPHS = Object.values(sentences).flat();

// localStorage keys
const STORAGE_KEYS = {
  COMPLETED: "typometry_completed",
  HISTORY: "typometry_history",
  HISTOGRAMS: "typometry_histograms",
  HISTOGRAM_ZOOM: "typometry_histogram_zoom",
};

// Histogram bucket configurations - fine granularity for smooth distributions
const HISTOGRAM_CONFIG = {
  wpm: {
    label: "WPM",
    min: 0,
    max: 300,
    step: 1,
    unit: "",
    get buckets() {
      return this.generateBuckets();
    },
    generateBuckets() {
      const b = [];
      for (let i = this.min; i < this.max; i += this.step) b.push(i);
      b.push(Infinity);
      return b;
    },
    getBucketCount() {
      return Math.ceil((this.max - this.min) / this.step);
    },
  },
  accuracy: {
    label: "Accuracy",
    min: 0,
    max: 100,
    step: 1,
    unit: "%",
    get buckets() {
      return this.generateBuckets();
    },
    generateBuckets() {
      const b = [];
      for (let i = this.min; i < this.max; i += this.step) b.push(i);
      b.push(100.1);
      return b;
    },
    getBucketCount() {
      return Math.ceil((this.max - this.min) / this.step);
    },
  },
  consistency: {
    label: "Consistency",
    min: 0,
    max: 100,
    step: 1,
    unit: "%",
    get buckets() {
      return this.generateBuckets();
    },
    generateBuckets() {
      const b = [];
      for (let i = this.min; i < this.max; i += this.step) b.push(i);
      b.push(100.1);
      return b;
    },
    getBucketCount() {
      return Math.ceil((this.max - this.min) / this.step);
    },
  },
  avgInterval: {
    label: "Keystroke",
    min: 50,
    max: 350,
    step: 5,
    unit: "ms",
    lowerIsBetter: true,
    get buckets() {
      return this.generateBuckets();
    },
    generateBuckets() {
      const b = [];
      for (let i = this.min; i < this.max; i += this.step) b.push(i);
      b.push(Infinity);
      return b;
    },
    getBucketCount() {
      return Math.ceil((this.max - this.min) / this.step);
    },
  },
  flowRatio: {
    label: "Flow State",
    min: 0,
    max: 100,
    step: 1,
    unit: "%",
    get buckets() {
      return this.generateBuckets();
    },
    generateBuckets() {
      const b = [];
      for (let i = this.min; i < this.max; i += this.step) b.push(i);
      b.push(100.1);
      return b;
    },
    getBucketCount() {
      return Math.ceil((this.max - this.min) / this.step);
    },
  },
  rhythmScore: {
    label: "Rhythm",
    min: 0,
    max: 100,
    step: 1,
    unit: "%",
    get buckets() {
      return this.generateBuckets();
    },
    generateBuckets() {
      const b = [];
      for (let i = this.min; i < this.max; i += this.step) b.push(i);
      b.push(100.1);
      return b;
    },
    getBucketCount() {
      return Math.ceil((this.max - this.min) / this.step);
    },
  },
  handBalance: {
    label: "Hand Balance",
    min: -50,
    max: 50,
    step: 1,
    unit: "%",
    centered: true, // 0% is balanced
    get buckets() {
      return this.generateBuckets();
    },
    generateBuckets() {
      const b = [];
      for (let i = this.min; i < this.max; i += this.step) b.push(i);
      b.push(Infinity);
      return b;
    },
    getBucketCount() {
      return Math.ceil((this.max - this.min) / this.step);
    },
  },
  homeRowAdvantage: {
    label: "Home Row",
    min: -50,
    max: 50,
    step: 1,
    unit: "%",
    centered: true, // 0 is neutral
    get buckets() {
      return this.generateBuckets();
    },
    generateBuckets() {
      const b = [];
      for (let i = this.min; i < this.max; i += this.step) b.push(i);
      b.push(Infinity);
      return b;
    },
    getBucketCount() {
      return Math.ceil((this.max - this.min) / this.step);
    },
  },
};

// Finger assignments for conventional touch typing
const FINGER_MAP = {
  "`": "L-pinky",
  1: "L-pinky",
  q: "L-pinky",
  a: "L-pinky",
  z: "L-pinky",
  2: "L-ring",
  w: "L-ring",
  s: "L-ring",
  x: "L-ring",
  3: "L-middle",
  e: "L-middle",
  d: "L-middle",
  c: "L-middle",
  4: "L-index",
  5: "L-index",
  r: "L-index",
  t: "L-index",
  f: "L-index",
  g: "L-index",
  v: "L-index",
  b: "L-index",
  6: "R-index",
  7: "R-index",
  y: "R-index",
  u: "R-index",
  h: "R-index",
  j: "R-index",
  n: "R-index",
  m: "R-index",
  8: "R-middle",
  i: "R-middle",
  k: "R-middle",
  ",": "R-middle",
  9: "R-ring",
  o: "R-ring",
  l: "R-ring",
  ".": "R-ring",
  0: "R-pinky",
  "-": "R-pinky",
  "=": "R-pinky",
  p: "R-pinky",
  "[": "R-pinky",
  "]": "R-pinky",
  ";": "R-pinky",
  "'": "R-pinky",
  "/": "R-pinky",
  "\\": "R-pinky",
  " ": "thumb",
};

const FINGER_KEYS = {
  "L-pinky": ["`", "1", "Q", "A", "Z"],
  "L-ring": ["2", "W", "S", "X"],
  "L-middle": ["3", "E", "D", "C"],
  "L-index": ["4", "5", "R", "T", "F", "G", "V", "B"],
  "R-index": ["6", "7", "Y", "U", "H", "J", "N", "M"],
  "R-middle": ["8", "I", "K", ","],
  "R-ring": ["9", "O", "L", "."],
  "R-pinky": ["0", "-", "=", "P", "[", "]", ";", "'", "/", "\\"],
  thumb: ["space"],
};

const FINGER_NAMES = {
  "L-pinky": "Left Pinky",
  "L-ring": "Left Ring",
  "L-middle": "Left Middle",
  "L-index": "Left Index",
  "R-index": "Right Index",
  "R-middle": "Right Middle",
  "R-ring": "Right Ring",
  "R-pinky": "Right Pinky",
  thumb: "Thumbs",
};

// ============================================================
// FINGERTIP POSITIONS - Edit these to adjust circle placement
// These are in SVG coordinates (viewBox 0 0 540.501 640.304)
// The SVG shows a RIGHT hand, mirrored for left hand display
// ============================================================
const FINGERTIP_POSITIONS = {
  pinky: { cx: 495, cy: 220 },
  ring: { cx: 398, cy: 121 },
  middle: { cx: 304, cy: 49 },
  index: { cx: 178, cy: 95 },
  thumb: { cx: 50, cy: 340 },
};
// ============================================================

// Tooltip content for stats
const TIPS = {
  // Basic stats
  wpm: (
    <>
      <TipTitle>Words Per Minute</TipTitle>
      <TipText>
        Your typing speed, calculated as (characters / 5) / minutes.
      </TipText>
      <TipText>The standard "word" is 5 characters including spaces.</TipText>
      <TipHint>Average: 40 WPM | Good: 60+ | Fast: 80+</TipHint>
    </>
  ),
  accuracy: (
    <>
      <TipTitle>Accuracy</TipTitle>
      <TipText>
        Percentage of characters typed correctly on the first attempt.
      </TipText>
      <TipText>Backspaced corrections count against accuracy.</TipText>
      <TipHint>95%+ is considered good accuracy</TipHint>
    </>
  ),
  consistency: (
    <>
      <TipTitle>Consistency</TipTitle>
      <TipText>
        Measures how uniform your typing rhythm is — do you type at a steady
        pace or with lots of speed variation?
      </TipText>
      <TipText>
        100% = perfectly metronomic (every keystroke takes the same time)
      </TipText>
      <TipText>
        Lower scores mean your typing speed varies more between keystrokes.
      </TipText>
      <TipHint>
        Based on coefficient of variation: 100% - (stdDev / avg × 100)
      </TipHint>
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
      <TipText>
        Mean time between consecutive keystrokes in milliseconds.
      </TipText>
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
      <TipText>
        Each backspace after a wrong character counts as recovering from an
        error.
      </TipText>
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
      <TipTitle>Profile Match</TipTitle>
      <TipText>
        How strongly your typing matches this archetype, based on:
      </TipText>
      <TipText>• Flow consistency (30%)</TipText>
      <TipText>• Rhythm regularity (20%)</TipText>
      <TipText>• Accuracy (30%)</TipText>
      <TipText>• Error recovery (20%)</TipText>
      <TipHint>Higher % = more consistent typing pattern</TipHint>
    </>
  ),
  correctionStyle: (label) =>
    ({
      perfectionist: (
        <>
          <TipTitle>Correction Style: Perfectionist</TipTitle>
          <TipText>
            You fix errors immediately, never letting mistakes slip by. Your
            backspace finger is always ready.
          </TipText>
          <TipHint>~0 characters typed past errors</TipHint>
        </>
      ),
      "quick corrector": (
        <>
          <TipTitle>Correction Style: Quick Corrector</TipTitle>
          <TipText>
            You catch errors quickly, usually within a character or two. Good
            balance of speed and accuracy.
          </TipText>
          <TipHint>~1-2 characters typed past errors</TipHint>
        </>
      ),
      steady: (
        <>
          <TipTitle>Correction Style: Steady</TipTitle>
          <TipText>
            Balanced approach—you notice errors but don't obsess over instant
            fixes. You correct when it feels natural.
          </TipText>
          <TipHint>~2-3 characters typed past errors</TipHint>
        </>
      ),
      "flow typer": (
        <>
          <TipTitle>Correction Style: Flow Typer</TipTitle>
          <TipText>
            You prioritize momentum, fixing errors in batches rather than
            immediately. Flow state matters more than perfection.
          </TipText>
          <TipHint>~3-5 characters typed past errors</TipHint>
        </>
      ),
      bulldozer: (
        <>
          <TipTitle>Correction Style: Bulldozer</TipTitle>
          <TipText>
            You power through mistakes, correcting them later (or not at all).
            Speed is king.
          </TipText>
          <TipHint>5+ characters typed past errors</TipHint>
        </>
      ),
    }[label] || (
      <>
        <TipTitle>Correction Style</TipTitle>
        <TipText>
          How you handle mistakes—from instant fixes to powering through.
        </TipText>
      </>
    )),
  flowState: (
    <>
      <TipTitle>Flow State</TipTitle>
      <TipText>
        Percentage of keystrokes within ±30% of your average speed.
      </TipText>
      <TipText>Higher = more consistent rhythm, you're "in the zone".</TipText>
      <TipHint>70%+ is excellent flow</TipHint>
    </>
  ),
  maxBurst: (
    <>
      <TipTitle>Max Burst</TipTitle>
      <TipText>
        Longest streak of consecutive fast keystrokes (faster than 80% of your
        average).
      </TipText>
      <TipText>
        Shows your peak performance potential when you're really cooking.
      </TipText>
      <TipHint>Bursts often happen on familiar words</TipHint>
    </>
  ),
  speedProfile: (label) =>
    ({
      metronome: (
        <>
          <TipTitle>Speed Profile: Metronome</TipTitle>
          <TipText>
            Extremely consistent timing, like a human metronome. Your keystrokes
            are remarkably regular.
          </TipText>
          <TipHint>Variance under 30%</TipHint>
        </>
      ),
      consistent: (
        <>
          <TipTitle>Speed Profile: Consistent</TipTitle>
          <TipText>
            Steady pace with minimal variation. You maintain good rhythm
            throughout.
          </TipText>
          <TipHint>Variance 30-50%</TipHint>
        </>
      ),
      variable: (
        <>
          <TipTitle>Speed Profile: Variable</TipTitle>
          <TipText>
            Natural variation in speed, adapting to content. You speed up on
            easy parts and slow down on hard ones.
          </TipText>
          <TipHint>Variance 50-70%</TipHint>
        </>
      ),
      erratic: (
        <>
          <TipTitle>Speed Profile: Erratic</TipTitle>
          <TipText>
            Highly variable timing—could indicate unfamiliar content, thinking
            pauses, or natural typing style.
          </TipText>
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
      <TipText>
        Compares typing speed between left-hand keys (QWERTASDFGZXCVB) and
        right-hand keys.
      </TipText>
      <TipText>Shows which hand is faster on average.</TipText>
      <TipHint>Most people have a slight dominant hand advantage</TipHint>
    </>
  ),
  homeRow: (
    <>
      <TipTitle>Home Row Speed</TipTitle>
      <TipText>
        Speed difference on home row keys (ASDFGHJKL;) vs your overall average.
      </TipText>
      <TipText>
        Positive = faster on home row (good form). Negative = reaching might be
        faster for you.
      </TipText>
      <TipHint>Touch typists usually show +10-20% here</TipHint>
    </>
  ),
  numberRow: (
    <>
      <TipTitle>Number Row Speed</TipTitle>
      <TipText>
        Speed difference on number row (1234567890) vs your overall average.
      </TipText>
      <TipText>Most people are slower on numbers due to the reach.</TipText>
      <TipHint>+20-40% slower is typical</TipHint>
    </>
  ),
  endurance: (label) =>
    ({
      "warming up": (
        <>
          <TipTitle>Endurance: Warming Up</TipTitle>
          <TipText>
            You start slow and speed up significantly as you go. Your fingers
            need time to get in the groove.
          </TipText>
          <TipHint>10%+ speed increase from start to finish</TipHint>
        </>
      ),
      accelerating: (
        <>
          <TipTitle>Endurance: Accelerating</TipTitle>
          <TipText>
            You gain speed as you settle into rhythm. Slight warm-up effect.
          </TipText>
          <TipHint>5-10% speed increase</TipHint>
        </>
      ),
      steady: (
        <>
          <TipTitle>Endurance: Steady</TipTitle>
          <TipText>
            Consistent speed throughout—you maintain the same pace from start to
            finish.
          </TipText>
          <TipHint>Less than ±5% change</TipHint>
        </>
      ),
      slowing: (
        <>
          <TipTitle>Endurance: Slowing</TipTitle>
          <TipText>
            Slight decrease in speed toward the end. Minor fatigue or attention
            drift.
          </TipText>
          <TipHint>5-15% slowdown</TipHint>
        </>
      ),
      fatigued: (
        <>
          <TipTitle>Endurance: Fatigued</TipTitle>
          <TipText>
            Notable slowdown as you progress. Mental or physical fatigue setting
            in.
          </TipText>
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
      <TipText>
        How much slower you type capital letters compared to lowercase.
      </TipText>
      <TipText>Includes the time to coordinate the Shift key.</TipText>
      <TipHint>80-150% slower is typical</TipHint>
    </>
  ),
  punctuationPenalty: (
    <>
      <TipTitle>Punctuation Penalty</TipTitle>
      <TipText>
        How much slower you type punctuation marks compared to letters.
      </TipText>
      <TipText>
        Many punctuation keys require Shift or are in awkward positions.
      </TipText>
      <TipHint>50-100% slower is typical</TipHint>
    </>
  ),
  errorRecovery: (
    <>
      <TipTitle>Error Recovery</TipTitle>
      <TipText>
        How much your speed drops in the 3 keystrokes after making an error.
      </TipText>
      <TipText>Shows how much errors disrupt your flow.</TipText>
      <TipHint>60-90% slowdown is typical</TipHint>
    </>
  ),
  hesitations: (
    <>
      <TipTitle>Hesitations</TipTitle>
      <TipText>Pauses longer than 500ms between keystrokes.</TipText>
      <TipText>
        Could indicate thinking, difficult sequences, unfamiliar words, or
        distractions.
      </TipText>
      <TipHint>Some hesitation is normal, especially on hard words</TipHint>
    </>
  ),
  errorDistribution: (
    <>
      <TipTitle>Error Distribution</TipTitle>
      <TipText>How your errors are spread throughout the text.</TipText>
      <TipText>
        • Clustered: errors come in groups—one mistake leads to more
      </TipText>
      <TipText>• Spread out: errors evenly distributed</TipText>
      <TipText>• Random: no pattern to when errors occur</TipText>
    </>
  ),
  backspaceBehavior: (label) =>
    ({
      efficient: (
        <>
          <TipTitle>Backspace: Efficient</TipTitle>
          <TipText>
            About 1 backspace per error—precise corrections. You hit backspace
            exactly as many times as needed.
          </TipText>
        </>
      ),
      cautious: (
        <>
          <TipTitle>Backspace: Cautious</TipTitle>
          <TipText>
            1.5+ backspaces per error—you double-check your corrections or
            delete a bit extra to be safe.
          </TipText>
        </>
      ),
      "over-corrector": (
        <>
          <TipTitle>Backspace: Over-Corrector</TipTitle>
          <TipText>
            2+ backspaces per error—you may over-correct, re-type sections, or
            use backspace preemptively.
          </TipText>
        </>
      ),
      "incomplete fixes": (
        <>
          <TipTitle>Backspace: Incomplete Fixes</TipTitle>
          <TipText>
            Less than 1 backspace per error—some errors left uncorrected. Speed
            over perfection.
          </TipText>
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
      <TipText>
        Average physical distance between consecutive keys on a QWERTY keyboard.
      </TipText>
      <TipText>Measured in key-widths (1.0 = adjacent keys).</TipText>
      <TipHint>Lower = more efficient finger movement</TipHint>
    </>
  ),
  rhythmScore: (
    <>
      <TipTitle>Rhythm Score</TipTitle>
      <TipText>
        How regular your keystroke timing is—like measuring if you're typing to
        a beat.
      </TipText>
      <TipText>
        Based on how similar each interval is to the previous one.
      </TipText>
      <TipHint>70%+ = very rhythmic typing</TipHint>
    </>
  ),
  // Visualization explanations
  fingerTransitions: (
    <>
      <TipTitle>Finger Transitions</TipTitle>
      <TipText>
        Shows how quickly you transition between different fingers. Each line
        connects two fingers, colored by speed.
      </TipText>
      <TipText>
        • <span style={{ color: "#98c379" }}>Green</span> = fast transitions •{" "}
        <span style={{ color: "#e2b714" }}>Yellow</span> = medium •{" "}
        <span style={{ color: "#e06c75" }}>Red</span> = slow transitions
      </TipText>
      <TipText>Thicker lines = more frequent transitions.</TipText>
      <TipHint>Hover lines to see timing details</TipHint>
    </>
  ),
  fingerSpeed: (
    <>
      <TipTitle>Finger Speed</TipTitle>
      <TipText>
        Shows average typing speed for each finger. Finger color indicates speed
        relative to your overall average.
      </TipText>
      <TipText>
        • <span style={{ color: "#98c379" }}>Green</span> = faster than average
        • <span style={{ color: "#e06c75" }}>Red</span> = slower than average
      </TipText>
      <TipHint>Hover fingers to see detailed timing</TipHint>
    </>
  ),
  keyboardHeatmap: (
    <>
      <TipTitle>Keyboard Heatmap</TipTitle>
      <TipText>
        Visualizes your typing performance key-by-key. Toggle between:
      </TipText>
      <TipText>
        • <strong>Speed mode:</strong> Green = fast keys, Red = slow keys
      </TipText>
      <TipText>
        • <strong>Accuracy mode:</strong> Green = accurate, Red = error-prone
      </TipText>
      <TipHint>Hover keys to see exact timing and accuracy</TipHint>
    </>
  ),
  bigramTiming: (
    <>
      <TipTitle>Bigram Timing</TipTitle>
      <TipText>
        Shows your fastest and slowest two-letter combinations (bigrams). These
        reveal which key pairs flow naturally vs. cause hesitation.
      </TipText>
      <TipText>
        Common slow bigrams often involve awkward finger reaches or same-finger
        sequences.
      </TipText>
      <TipHint>Times are in milliseconds between the two keys</TipHint>
    </>
  ),
  sessionDistributions: (
    <>
      <TipTitle>Session Distributions</TipTitle>
      <TipText>
        Shows how your typing performance varies across all sessions. Each bar
        represents how many sessions fell into that range.
      </TipText>
      <TipText>
        • <span style={{ color: "#e2b714" }}>Gold line</span> = current session
        • <span style={{ color: "#98c379" }}>Green line</span> = your average
      </TipText>
      <TipHint>Hover bars to see exact counts</TipHint>
    </>
  ),
  commonTypos: (
    <>
      <TipTitle>Most Common Typos</TipTitle>
      <TipText>
        Shows which characters you most frequently mistype, aggregated across
        all users.
      </TipText>
      <TipText>Format: expected → what was typed (count)</TipText>
      <TipHint>Use this to identify problem keys to practice</TipHint>
    </>
  ),
  uselessStats: (
    <>
      <TipTitle>Useless Stats</TipTitle>
      <TipText>
        Fun but arguably not very useful metrics. Included because why not?
      </TipText>
      <TipHint>Don't take these too seriously</TipHint>
    </>
  ),
  rowSpeed: (
    <>
      <TipTitle>Keyboard Row Speed</TipTitle>
      <TipText>Average keystroke time for each row of the keyboard.</TipText>
      <TipText>
        Green border = faster, yellow = slower. Time shown in milliseconds.
      </TipText>
      <TipHint>Home row is usually fastest for touch typists</TipHint>
    </>
  ),
  accuracyByType: (
    <>
      <TipTitle>Accuracy by Character Type</TipTitle>
      <TipText>
        Shows your accuracy broken down by character category. Hover over each
        bar to see which characters are included.
      </TipText>
      <TipText>Green = high accuracy, red = low accuracy.</TipText>
      <TipHint>Most people struggle with symbols and numbers</TipHint>
    </>
  ),
  speedByType: (
    <>
      <TipTitle>Speed by Character Type</TipTitle>
      <TipText>
        Average keystroke time for each character category. Hover over each bar
        to see which characters are included.
      </TipText>
      <TipText>Green = fast, red = slow. Longer bars = faster typing.</TipText>
      <TipHint>Letters are usually fastest, symbols slowest</TipHint>
    </>
  ),
  fastestTransitions: (
    <>
      <TipTitle>Globally Fastest Transitions</TipTitle>
      <TipText>
        The quickest finger-to-finger transitions recorded across all users.
      </TipText>
      <TipText>
        These are typically comfortable letter combinations or muscle-memory
        patterns.
      </TipText>
    </>
  ),
  slowestTransitions: (
    <>
      <TipTitle>Globally Slowest Transitions</TipTitle>
      <TipText>
        The slowest finger-to-finger transitions recorded across all users.
      </TipText>
      <TipText>
        Often involves reaching for uncommon keys or awkward finger movements.
      </TipText>
    </>
  ),
  allTimeFastest: (
    <>
      <TipTitle>All-Time Fastest</TipTitle>
      <TipText>
        Your personal fastest character transitions across all sessions.
      </TipText>
      <TipText>These are your most fluid, muscle-memory combinations.</TipText>
    </>
  ),
  allTimeSlowest: (
    <>
      <TipTitle>All-Time Slowest</TipTitle>
      <TipText>
        Your personal slowest character transitions across all sessions.
      </TipText>
      <TipText>
        May indicate awkward reaches or less practiced combinations.
      </TipText>
    </>
  ),
  globalAvgPause: (
    <>
      <TipTitle>Average Pause Duration</TipTitle>
      <TipText>
        Mean length of hesitations (pauses &gt;500ms) across all users.
      </TipText>
      <TipText>Shorter pauses suggest more confident, fluid typing.</TipText>
    </>
  ),
  globalBurstLength: (
    <>
      <TipTitle>Average Burst Length</TipTitle>
      <TipText>
        Average number of consecutive fast keystrokes (&lt;100ms) per burst.
      </TipText>
      <TipText>
        Longer bursts indicate sustained flow and muscle memory.
      </TipText>
    </>
  ),
  globalBurstCount: (
    <>
      <TipTitle>Total Bursts</TipTitle>
      <TipText>Average number of fast typing sequences per session.</TipText>
      <TipText>
        More bursts suggest frequent periods of confident, rapid typing.
      </TipText>
    </>
  ),
  globalRhythm: (
    <>
      <TipTitle>Rhythm Score</TipTitle>
      <TipText>How consistent the timing is between keystrokes.</TipText>
      <TipText>Higher scores mean more metronomic, even-paced typing.</TipText>
    </>
  ),
  globalHandBalance: (
    <>
      <TipTitle>Hand Balance</TipTitle>
      <TipText>
        Speed comparison between left and right hand keystrokes.
      </TipText>
      <TipText>Most people have a slight dominant hand advantage.</TipText>
    </>
  ),
  globalHomeRow: (
    <>
      <TipTitle>Home Row Usage</TipTitle>
      <TipText>Percentage of keystrokes on the home row (ASDFGHJKL).</TipText>
      <TipText>Touch typists tend to have higher home row usage.</TipText>
    </>
  ),
  globalHesitations: (
    <>
      <TipTitle>Hesitations</TipTitle>
      <TipText>Average number of pauses longer than 500ms per session.</TipText>
      <TipText>
        Fewer hesitations indicate smoother, more confident typing.
      </TipText>
    </>
  ),
  globalErrorRate: (
    <>
      <TipTitle>Error Rate</TipTitle>
      <TipText>
        Average number of typing errors per session across all users.
      </TipText>
      <TipText>Lower is better — indicates more accurate typing.</TipText>
    </>
  ),
  globalCorrectionRatio: (
    <>
      <TipTitle>Correction Ratio</TipTitle>
      <TipText>Average backspaces used per error.</TipText>
      <TipText>
        ~1.0 = efficient (one backspace per error) &gt;1.5 = over-correcting
        &lt;1.0 = incomplete fixes
      </TipText>
    </>
  ),
  globalKeyboardAnalysis: (
    <>
      <TipTitle>Keyboard Analysis</TipTitle>
      <TipText>
        Heatmap showing average typing speed or accuracy for each key across all
        users.
      </TipText>
      <TipText>
        Speed mode: Green = fast, Red = slow. Accuracy mode: Green = accurate,
        Red = error-prone.
      </TipText>
    </>
  ),
  speedOverTime:
    "Shows how your typing speed changed throughout this paragraph. Upward trend = speeding up, downward = slowing down.",
  intervalDistribution:
    "Distribution of time between keystrokes. Tighter clusters indicate more consistent rhythm.",
  sessionFastestTransitions:
    "Your quickest two-letter combinations in this session. Distance shows how far apart the keys are on the keyboard.",
  sessionSlowestTransitions:
    "Your slowest two-letter combinations. Often caused by awkward finger movements or hesitation.",
};

// Load/save helpers
const loadFromStorage = (key, defaultValue) => {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : defaultValue;
  } catch {
    return defaultValue;
  }
};

const saveToStorage = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn("Failed to save to localStorage:", e);
  }
};

// Get next paragraph (avoiding completed ones)
const getNextParagraph = (completedIndices) => {
  const available = ALL_PARAGRAPHS.map((text, index) => ({
    text,
    index,
  })).filter(({ index }) => !completedIndices.includes(index));

  if (available.length === 0) {
    // All done - reset and start over
    return { text: ALL_PARAGRAPHS[0], index: 0, reset: true };
  }

  const choice = available[Math.floor(Math.random() * available.length)];
  return { text: choice.text, index: choice.index, reset: false };
};

// Mini sparkline component
const Sparkline = ({ data, width = 200, height = 40, color = "#e2b714" }) => {
  if (!data || data.length < 2) return null;

  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;

  const points = data
    .map((val, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((val - min) / range) * (height - 4) - 2;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg width={width} height={height} className="sparkline">
      <polyline fill="none" stroke={color} strokeWidth="2" points={points} />
    </svg>
  );
};

// Character Type Breakdown with toggle between accuracy and speed
const CharTypeBreakdown = ({
  charTypeInfo,
  allAccuracyTypes,
  validAccuracyTypes,
  typeSpeeds,
  validSpeedTypes,
  getAccuracyColor,
  getSpeedColor,
  getSpeedBarWidth,
  fmt,
}) => {
  const [showSpeed, setShowSpeed] = useState(false);

  const validTypes = showSpeed ? validSpeedTypes : validAccuracyTypes;
  const hasSpeedData = validSpeedTypes.length > 0;

  if (validTypes.length === 0) return null;

  return (
    <div className="accuracy-breakdown-section">
      <div className="section-header-row">
        <h3>By Character Type</h3>
        <div className="header-controls">
          {hasSpeedData && (
            <div className="mini-toggle-group">
              <button
                className={`mini-toggle ${showSpeed ? "active" : ""}`}
                onClick={() => setShowSpeed(true)}
              >
                Speed
              </button>
              <button
                className={`mini-toggle ${!showSpeed ? "active" : ""}`}
                onClick={() => setShowSpeed(false)}
              >
                Accuracy
              </button>
            </div>
          )}
          <Tooltip content={showSpeed ? TIPS.speedByType : TIPS.accuracyByType}>
            <button className="help-btn" type="button" aria-label="Help">
              ?
            </button>
          </Tooltip>
        </div>
      </div>
      <div className="accuracy-type-grid">
        {validTypes.map((charType) => {
          const info = charTypeInfo[charType];

          if (showSpeed) {
            const data = typeSpeeds[charType];
            return (
              <Tooltip key={charType} content={info.chars}>
                <div className="accuracy-type-item">
                  <div className="accuracy-type-header">
                    <span className="accuracy-type-label">{info.label}</span>
                    <span className="accuracy-type-value">
                      {fmt.int(data.avgInterval)}ms
                    </span>
                  </div>
                  <div className="accuracy-type-bar">
                    <div
                      className="accuracy-type-fill"
                      style={{
                        width: `${getSpeedBarWidth(data.avgInterval)}%`,
                        backgroundColor: getSpeedColor(data.avgInterval),
                      }}
                    />
                  </div>
                </div>
              </Tooltip>
            );
          } else {
            const data = allAccuracyTypes[charType];
            const accuracyPct =
              data.avgAccuracy <= 1 ? data.avgAccuracy * 100 : data.avgAccuracy;
            return (
              <Tooltip key={charType} content={info.chars}>
                <div className="accuracy-type-item">
                  <div className="accuracy-type-header">
                    <span className="accuracy-type-label">{info.label}</span>
                    <span className="accuracy-type-value">
                      {fmt.dec(accuracyPct)}%
                    </span>
                  </div>
                  <div className="accuracy-type-bar">
                    <div
                      className="accuracy-type-fill"
                      style={{
                        width: `${Math.min(100, accuracyPct)}%`,
                        backgroundColor: getAccuracyColor(accuracyPct),
                      }}
                    />
                  </div>
                </div>
              </Tooltip>
            );
          }
        })}
      </div>
    </div>
  );
};

// Histogram component
const Histogram = ({
  data,
  width = 200,
  height = 60,
  bins = 15,
  color = "#e2b714",
}) => {
  if (!data || data.length < 2) return null;

  const max = Math.max(...data);
  const min = Math.min(...data);
  const binWidth = (max - min) / bins || 1;

  const histogram = Array(bins).fill(0);
  data.forEach((val) => {
    const binIndex = Math.min(Math.floor((val - min) / binWidth), bins - 1);
    histogram[binIndex]++;
  });

  const maxCount = Math.max(...histogram);
  const barWidth = width / bins - 2;

  return (
    <svg width={width} height={height} className="histogram">
      {histogram.map((count, i) => {
        const barHeight = (count / maxCount) * (height - 10);
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
        );
      })}
    </svg>
  );
};

// Graph icon for stats button
const GraphIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M3 3v18h18" />
    <path d="M18 17V9" />
    <path d="M13 17V5" />
    <path d="M8 17v-3" />
  </svg>
);

// Custom Comparison Dropdown
const ComparisonDropdown = ({ value, onChange, options }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  const selectedOption =
    options.find((opt) => opt.value === value) || options[0];

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div
      className={`comparison-select ${isOpen ? "open" : ""}`}
      ref={dropdownRef}
    >
      <button
        className="comparison-select-button"
        onClick={() => setIsOpen(!isOpen)}
        type="button"
        title="Compare your stats"
      >
        <svg
          className="comparison-icon"
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M18 20V10M12 20V4M6 20v-6" />
        </svg>
        {selectedOption?.label}
      </button>
      <div className="comparison-select-dropdown">
        {options.map((option) => (
          <div
            key={option.value}
            className={`comparison-select-option ${
              value === option.value ? "selected" : ""
            }`}
            onClick={() => {
              onChange(option.value);
              setIsOpen(false);
            }}
          >
            {option.label}
          </div>
        ))}
      </div>
    </div>
  );
};

// Global Distribution Bar - shows where the average falls with IQR markers
const GlobalDistributionBar = ({
  value,
  min,
  max,
  stdDev,
  lowerIsBetter = false,
  centered = false,
  isPercent = false,
}) => {
  // Calculate positions for mean and ±1 std dev (roughly 68% of data)
  const range = max - min || 1;
  const valuePos = centered
    ? ((value - min) / range) * 100
    : ((value - min) / range) * 100;

  // For centered values (like hand balance), 50% is the center
  const centerPos = centered ? ((0 - min) / range) * 100 : null;

  // Calculate quartile positions (approximated from std dev)
  // Q1 ≈ mean - 0.675*stdDev, Q3 ≈ mean + 0.675*stdDev
  const q1Pos = Math.max(0, ((value - 0.675 * stdDev - min) / range) * 100);
  const q3Pos = Math.min(100, ((value + 0.675 * stdDev - min) / range) * 100);

  // P10 ≈ mean - 1.28*stdDev, P90 ≈ mean + 1.28*stdDev
  const p10Pos = Math.max(0, ((value - 1.28 * stdDev - min) / range) * 100);
  const p90Pos = Math.min(100, ((value + 1.28 * stdDev - min) / range) * 100);

  return (
    <div className="global-distribution-bar">
      <div className="distribution-track">
        {/* P10-P90 range (80% of users) */}
        <div
          className="distribution-range p10-p90"
          style={{ left: `${p10Pos}%`, width: `${p90Pos - p10Pos}%` }}
        />
        {/* IQR range (50% of users) */}
        <div
          className="distribution-range iqr"
          style={{ left: `${q1Pos}%`, width: `${q3Pos - q1Pos}%` }}
        />
        {/* Center line for balanced metrics */}
        {centered && centerPos !== null && (
          <div
            className="distribution-center"
            style={{ left: `${centerPos}%` }}
          />
        )}
        {/* Mean marker */}
        <div
          className={`distribution-mean ${lowerIsBetter ? "lower-better" : ""}`}
          style={{ left: `${valuePos}%` }}
        />
      </div>
      <div className="distribution-labels">
        <span className="distribution-min">
          {isPercent ? `${fmt.int(min * 100)}%` : fmt.count(min)}
        </span>
        <span className="distribution-max">
          {isPercent ? `${fmt.int(max * 100)}%` : fmt.count(max)}
        </span>
      </div>
    </div>
  );
};

// Convert global histogram JSON from Supabase to array format for SessionHistogram
// Global histograms are stored as { "0": count, "1": count, ... } where keys are bucket indices
const globalHistogramToArray = (globalHist, configKey) => {
  if (!globalHist || !globalHist.data) return null;

  const config = HISTOGRAM_CONFIG[configKey];
  if (!config) return null;

  const bucketCount = config.getBucketCount();
  const arr = new Array(bucketCount).fill(0);

  // The global histogram keys are bucket indices based on bucket_size in SQL
  // We need to map them to our local bucket structure
  // SQL uses: bucket_key = FLOOR(value / bucket_size)
  // Our local uses: bucketIdx = FLOOR((value - min) / step)

  Object.entries(globalHist.data).forEach(([bucketKey, count]) => {
    const sqlBucket = parseInt(bucketKey, 10);
    if (isNaN(sqlBucket)) return;

    // Map SQL bucket to local bucket
    let localIdx;

    if (configKey === "handBalance" || configKey === "homeRowAdvantage") {
      // SQL stores as 0-100 (value + 50), local stores as -50 to 50
      // SQL bucket 0 = local -50, SQL bucket 50 = local 0, SQL bucket 100 = local 50
      // Clamp to valid range since SQL bucket 100 would be out of bounds
      localIdx = Math.min(sqlBucket, bucketCount - 1);
    } else if (configKey === "avgInterval") {
      // SQL bucket_size is 5, so bucket 10 = 50ms, bucket 20 = 100ms, etc.
      // Local min is 50, step is 5
      // SQL bucket corresponds to value range [bucket*5, (bucket+1)*5)
      // Local idx for value v: FLOOR((v - 50) / 5)
      const approxValue = sqlBucket * 5;
      localIdx = Math.floor((approxValue - config.min) / config.step);
    } else {
      // For wpm, accuracy, consistency, flowRatio, rhythmScore
      // SQL bucket_size is 1, local step is 1
      localIdx = sqlBucket - config.min;
    }

    if (localIdx >= 0 && localIdx < bucketCount) {
      arr[localIdx] += count;
    }
  });

  return arr;
};

// Session distribution histogram component - actual bar chart with smart zoom
const SessionHistogram = ({
  data,
  configKey,
  currentValue,
  average,
  smartZoom = true,
  xAxisLabels = null,
  formatValue = null,
  reversed = false,
  expanded = false,
  showCurve = true,
}) => {
  const config = HISTOGRAM_CONFIG[configKey];
  const [hoverInfo, setHoverInfo] = useState(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  if (!config || !data || !Array.isArray(data) || data.length === 0)
    return null;

  // Validate data array - filter out any non-numbers
  const validData = data.map((v) =>
    typeof v === "number" && !isNaN(v) ? v : 0
  );

  // Check if bucket count matches - if not, data is from old format
  const expectedBuckets = config.getBucketCount();
  if (validData.length !== expectedBuckets) {
    return null; // Skip rendering if data doesn't match current bucket structure
  }

  const totalSessions = validData.reduce((a, b) => a + b, 0);
  if (totalSessions === 0 || isNaN(totalSessions)) return null;

  // Calculate distribution stats for expanded view
  const calculateStats = () => {
    if (!expanded) return null;

    // Weighted mean
    let weightedSum = 0;
    validData.forEach((count, idx) => {
      const bucketValue = config.min + idx * config.step + config.step / 2;
      weightedSum += bucketValue * count;
    });
    const mean = weightedSum / totalSessions;

    // Median (50th percentile)
    let cumulative = 0;
    let medianBucket = 0;
    for (let i = 0; i < validData.length; i++) {
      cumulative += validData[i];
      if (cumulative >= totalSessions / 2) {
        medianBucket = i;
        break;
      }
    }
    const median = config.min + medianBucket * config.step + config.step / 2;

    // Mode (most common bucket)
    const maxIdx = validData.indexOf(Math.max(...validData));
    const mode = config.min + maxIdx * config.step + config.step / 2;

    // User's percentile
    let userPercentile = null;
    if (
      currentValue !== null &&
      currentValue !== undefined &&
      !isNaN(currentValue)
    ) {
      const userBucket = Math.floor((currentValue - config.min) / config.step);
      let below = 0;
      for (let i = 0; i < Math.min(userBucket, validData.length); i++) {
        below += validData[i];
      }
      userPercentile = Math.round((below / totalSessions) * 100);
    }

    // Standard deviation
    let varianceSum = 0;
    validData.forEach((count, idx) => {
      const bucketValue = config.min + idx * config.step + config.step / 2;
      varianceSum += count * Math.pow(bucketValue - mean, 2);
    });
    const stdDev = Math.sqrt(varianceSum / totalSessions);

    return { mean, median, mode, userPercentile, stdDev, totalSessions };
  };

  const stats = calculateStats();

  // Find which bucket the current/average values fall into (in original indices)
  const getBucketIndex = (value) => {
    if (value === null || value === undefined || isNaN(value)) return -1;
    // Use Math.round to match updateHistogram bucket assignment
    const idx = Math.round((value - config.min) / config.step);
    return Math.max(0, Math.min(idx, validData.length - 1));
  };

  const currentBucket = getBucketIndex(currentValue);
  const averageBucket = getBucketIndex(average);

  // Find the range of non-zero buckets for smart zoom
  let startIdx = 0;
  let endIdx = validData.length - 1;

  if (smartZoom) {
    // Find first and last non-zero bucket
    let firstNonZero = validData.findIndex((c) => c > 0);
    let lastNonZero =
      validData.length - 1 - [...validData].reverse().findIndex((c) => c > 0);

    if (firstNonZero === -1) firstNonZero = 0;
    if (lastNonZero === -1 || lastNonZero < firstNonZero)
      lastNonZero = validData.length - 1;

    // Expand range to include current and average values if they exist
    if (currentBucket >= 0) {
      firstNonZero = Math.min(firstNonZero, currentBucket);
      lastNonZero = Math.max(lastNonZero, currentBucket);
    }
    if (averageBucket >= 0) {
      firstNonZero = Math.min(firstNonZero, averageBucket);
      lastNonZero = Math.max(lastNonZero, averageBucket);
    }

    // Add some padding (15% of range on each side, minimum 5 buckets)
    const range = lastNonZero - firstNonZero;
    const padding = Math.max(5, Math.ceil(range * 0.2));

    startIdx = Math.max(0, firstNonZero - padding);
    endIdx = Math.min(validData.length - 1, lastNonZero + padding);
  }

  // Slice the data to the visible range
  let visibleData = validData.slice(startIdx, endIdx + 1);

  // If reversed, flip the data order (for intuitive left/right displays)
  if (reversed) {
    visibleData = [...visibleData].reverse();
  }

  const maxCount = Math.max(...visibleData, 1);

  // Calculate display range values
  const displayMin = config.min + startIdx * config.step;
  const displayMax = Math.min(
    config.min + (endIdx + 1) * config.step,
    config.max
  );

  // Generate smooth trend curve using moving average then spline
  const generateCurvePath = () => {
    if (visibleData.length < 4) return "";

    // Apply gaussian-weighted moving average for smoother trend
    const windowSize = Math.max(3, Math.floor(visibleData.length / 8));
    const smoothed = [];

    for (let i = 0; i < visibleData.length; i++) {
      let sum = 0;
      let weightSum = 0;
      for (let j = -windowSize; j <= windowSize; j++) {
        const idx = i + j;
        if (idx >= 0 && idx < visibleData.length) {
          // Gaussian weight
          const weight = Math.exp(
            -(j * j) / (2 * (windowSize / 2) * (windowSize / 2))
          );
          sum += visibleData[idx] * weight;
          weightSum += weight;
        }
      }
      smoothed.push(sum / weightSum);
    }

    // Sample fewer points for even looser fit
    const sampleRate = Math.max(1, Math.floor(visibleData.length / 12));
    const sampledPoints = [];
    for (let i = 0; i < smoothed.length; i += sampleRate) {
      sampledPoints.push({
        x: ((i + 0.5) / visibleData.length) * 100,
        y: 100 - (smoothed[i] / maxCount) * 100,
      });
    }
    // Always include last point
    if (sampledPoints.length > 0) {
      const lastIdx = smoothed.length - 1;
      sampledPoints.push({
        x: ((lastIdx + 0.5) / visibleData.length) * 100,
        y: 100 - (smoothed[lastIdx] / maxCount) * 100,
      });
    }

    if (sampledPoints.length < 2) return "";

    // Catmull-Rom to Bezier conversion with low tension for smooth curves
    const catmullRomToBezier = (p0, p1, p2, p3, tension = 0.3) => {
      const cp1x = p1.x + ((p2.x - p0.x) / 6) * tension;
      const cp1y = p1.y + ((p2.y - p0.y) / 6) * tension;
      const cp2x = p2.x - ((p3.x - p1.x) / 6) * tension;
      const cp2y = p2.y - ((p3.y - p1.y) / 6) * tension;
      return { cp1: { x: cp1x, y: cp1y }, cp2: { x: cp2x, y: cp2y } };
    };

    let path = `M ${sampledPoints[0].x} ${sampledPoints[0].y}`;

    for (let i = 0; i < sampledPoints.length - 1; i++) {
      const p0 = sampledPoints[Math.max(0, i - 1)];
      const p1 = sampledPoints[i];
      const p2 = sampledPoints[i + 1];
      const p3 = sampledPoints[Math.min(sampledPoints.length - 1, i + 2)];

      const { cp1, cp2 } = catmullRomToBezier(p0, p1, p2, p3, 1.5);
      path += ` C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${p2.x} ${p2.y}`;
    }

    return path;
  };

  const handleMouseMove = (e) => {
    setMousePos({ x: e.clientX, y: e.clientY });
  };

  return (
    <div className={`session-histogram ${expanded ? "expanded" : ""}`}>
      <div className="histogram-chart-area">
        <div className="histogram-y-axis">
          <span>{maxCount}</span>
          <span>0</span>
        </div>
        <div
          className="histogram-bars"
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoverInfo(null)}
        >
          {visibleData.map((count, i) => {
            // When reversed, i=0 corresponds to the end of the range
            const originalIdx = reversed ? endIdx - i : startIdx + i;
            const height = maxCount > 0 ? (count / maxCount) * 100 : 0;
            const isCurrent = originalIdx === currentBucket;
            const bucketStart = config.min + originalIdx * config.step;
            const bucketEnd = Math.min(bucketStart + config.step, config.max);
            const percentage =
              totalSessions > 0
                ? ((count / totalSessions) * 100).toFixed(1)
                : "0";
            const isHovered = hoverInfo && hoverInfo.idx === i;

            // Format the range display - use custom formatter if provided, otherwise just show bucket value
            const rangeDisplay = formatValue
              ? formatValue(bucketStart)
              : `${bucketStart}${config.unit}`;

            return (
              <div
                key={i}
                className={`histogram-bar ${isCurrent ? "current" : ""} ${
                  count === 0 && !isCurrent ? "empty" : ""
                } ${isHovered ? "hovered" : ""}`}
                style={{
                  height: `${Math.max(
                    height,
                    count > 0 || isCurrent ? 4 : 0
                  )}%`,
                }}
                onMouseEnter={() =>
                  (count > 0 || isCurrent) &&
                  setHoverInfo({
                    idx: i,
                    range: rangeDisplay,
                    count,
                    percentage,
                    isCurrent,
                  })
                }
              />
            );
          })}
          {/* Smooth trend curve overlay */}
          {showCurve &&
            visibleData.some((v) => v > 0) &&
            (() => {
              const curvePath = generateCurvePath();
              if (!curvePath) return null;
              const curveId = `curve-${configKey}-${expanded ? "exp" : "sm"}`;
              return (
                <svg
                  className="histogram-curve"
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                  style={{ overflow: "visible" }}
                >
                  <defs>
                    <linearGradient
                      id={curveId}
                      x1="0%"
                      y1="0%"
                      x2="100%"
                      y2="0%"
                    >
                      <stop offset="0%" stopColor="#7cf" stopOpacity="0.2" />
                      <stop offset="30%" stopColor="#7cf" stopOpacity="0.8" />
                      <stop offset="70%" stopColor="#7cf" stopOpacity="0.8" />
                      <stop offset="100%" stopColor="#7cf" stopOpacity="0.2" />
                    </linearGradient>
                  </defs>
                  <path
                    d={curvePath}
                    fill="none"
                    stroke={`url(#${curveId})`}
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeDasharray="4 3"
                    vectorEffect="non-scaling-stroke"
                  />
                </svg>
              );
            })()}
          {hoverInfo && (
            <div
              className="histogram-tooltip"
              style={{
                left: mousePos.x + 12,
                top: mousePos.y - 50,
                position: "fixed",
              }}
            >
              <div className="histogram-tooltip-range">
                {hoverInfo.range}
                {hoverInfo.isCurrent ? " (you)" : ""}
              </div>
              <div className="histogram-tooltip-count">
                {hoverInfo.count} session{hoverInfo.count !== 1 ? "s" : ""} (
                {hoverInfo.percentage}%)
              </div>
            </div>
          )}
          {/* Stats overlay for expanded view */}
          {expanded && stats && (
            <div className="histogram-stats-overlay">
              <span className="histogram-stat-compact">
                {stats.totalSessions.toLocaleString()} sessions
              </span>
              <span className="histogram-stat-divider">·</span>
              <span className="histogram-stat-compact">
                avg {Math.round(stats.mean)}
                {config.unit}
              </span>
              <span className="histogram-stat-divider">·</span>
              <span className="histogram-stat-compact">
                median {Math.round(stats.median)}
                {config.unit}
              </span>
              {stats.userPercentile !== null && (
                <>
                  <span className="histogram-stat-divider">·</span>
                  <span className="histogram-stat-compact highlight">
                    top {100 - stats.userPercentile}%
                  </span>
                </>
              )}
            </div>
          )}
        </div>
      </div>
      <div className={`histogram-x-axis ${expanded ? "expanded" : ""}`}>
        <span>
          {xAxisLabels?.min ??
            (reversed
              ? `${displayMax}${config.unit}`
              : `${displayMin}${config.unit}`)}
        </span>
        {expanded && (
          <span className="histogram-x-axis-label">← distribution range →</span>
        )}
        <span>
          {xAxisLabels?.max ??
            (reversed
              ? `${displayMin}${config.unit}`
              : `${displayMax}${config.unit}`)}
        </span>
      </div>
    </div>
  );
};

// Helper function to update histogram data
const updateHistogram = (histograms, key, value) => {
  const config = HISTOGRAM_CONFIG[key];
  if (!config || value === null || value === undefined || isNaN(value))
    return histograms;

  const newHistograms = { ...histograms };
  const bucketCount = config.getBucketCount();

  // Reset if bucket count doesn't match (data from old format)
  if (
    !newHistograms[key] ||
    !Array.isArray(newHistograms[key]) ||
    newHistograms[key].length !== bucketCount
  ) {
    newHistograms[key] = new Array(bucketCount).fill(0);
  }

  // Find the bucket for this value using Math.round for proper alignment
  const bucketIdx = Math.round((value - config.min) / config.step);
  const clampedIdx = Math.max(0, Math.min(bucketIdx, bucketCount - 1));

  newHistograms[key] = [...newHistograms[key]];
  newHistograms[key][clampedIdx]++;

  return newHistograms;
};

// Mini keyboard for tooltip
const MiniKeyboard = ({ highlightKeys, color }) => {
  const rows = [
    ["`", "1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-", "="],
    ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P", "[", "]", "\\"],
    ["A", "S", "D", "F", "G", "H", "J", "K", "L", ";", "'"],
    ["Z", "X", "C", "V", "B", "N", "M", ",", ".", "/"],
  ];
  const offsets = [0, 8, 12, 20];
  const isSpace = highlightKeys.includes("space");

  return (
    <svg viewBox="0 0 200 95" className="mini-kb">
      <rect x="0" y="0" width="200" height="95" rx="4" fill="#1a1a1b" />
      {rows.map((row, ri) =>
        row.map((key, ki) => {
          const lit = highlightKeys.includes(key);
          return (
            <rect
              key={`${ri}-${ki}`}
              x={4 + offsets[ri] + ki * 15}
              y={4 + ri * 16}
              width={13}
              height={14}
              rx={2}
              fill={lit ? color : "#2c2e31"}
            />
          );
        })
      )}
      <rect
        x={55}
        y={68}
        width={70}
        height={14}
        rx={2}
        fill={isSpace ? color : "#2c2e31"}
      />
    </svg>
  );
};

// Finger performance visualization with elegant hand outlines
const FingerHands = ({ fingerStats }) => {
  const [hovered, setHovered] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const containerRef = useRef(null);

  const fingers = [
    "L-pinky",
    "L-ring",
    "L-middle",
    "L-index",
    "R-index",
    "R-middle",
    "R-ring",
    "R-pinky",
  ];

  // Calculate averages
  const speeds = fingers
    .map((f) => fingerStats[f]?.avgInterval || 0)
    .filter((v) => v > 0);
  const accs = fingers.map((f) => fingerStats[f]?.accuracy || 0);
  const avgSpeed =
    speeds.length > 0
      ? Math.round(speeds.reduce((a, b) => a + b, 0) / speeds.length)
      : 0;
  const avgAcc =
    accs.length > 0
      ? Math.round(accs.reduce((a, b) => a + b, 0) / accs.length)
      : 0;

  const minSpeed = Math.min(...speeds);
  const maxSpeed = Math.max(...speeds);

  const getColor = (finger) => {
    const data = fingerStats[finger];
    if (!data || data.total === 0) return "#3c3e41";
    const speed = data.avgInterval;
    if (maxSpeed === minSpeed) return "#98c379";
    const t = (speed - minSpeed) / (maxSpeed - minSpeed);
    if (t < 0.5) {
      const r = Math.round(152 + 74 * t * 2);
      const g = Math.round(195 - 12 * t * 2);
      const b = Math.round(121 - 101 * t * 2);
      return `rgb(${r},${g},${b})`;
    } else {
      const r = Math.round(226 - 2 * (t - 0.5) * 2);
      const g = Math.round(183 - 75 * (t - 0.5) * 2);
      const b = Math.round(20 + 97 * (t - 0.5) * 2);
      return `rgb(${r},${g},${b})`;
    }
  };

  const handleHover = (finger, e) => {
    setHovered(finger);
    if (containerRef.current && e) {
      const rect = containerRef.current.getBoundingClientRect();
      setTooltipPos({ x: e.clientX - rect.left, y: e.clientY - rect.top - 10 });
    }
  };

  const hoveredData = hovered ? fingerStats[hovered] : null;
  const hoveredColor = hovered ? getColor(hovered) : "#888";

  // The hand SVG polyline (from the uploaded Hand.svg)
  const handPolyline1 =
    "149.85,543.6 149.75,545.25 149.6,546.801 149.55,548.35 149.5,549.801 149.55,551.301 149.6,552.699 149.85,555.449 150.35,558.1 150.7,559.4 151,560.6 151.45,561.85 151.9,563 152.4,564.15 152.9,565.199 154.2,567.35 154.9,568.4 155.6,569.35 156.45,570.35 157.25,571.25 158.15,572.15 159.05,572.949 160.1,573.801 161.1,574.551 163.3,576 165.7,577.35 167,578 168.25,578.551 179.15,579.301 181.1,578.85 183.15,578.301 185.1,577.699 185.95,577.4 186.65,577.051 187.9,576.449 188.35,576.15 188.7,575.801 189.85,575 192.65,571.199 193.65,568.65 194.7,565.85 195.15,564.449 195.55,563.1 195.95,561.85 196.25,560.65 196.6,559.551 196.9,558.5 197.2,557.551 197.4,556.65 197.7,555.85 197.9,555.1 198.1,554.449 198.25,553.85 198.45,553.35 198.6,552.9 198.7,552.551 198.75,552.25 199.65,549.65 200.35,547 200.95,544.301 201.3,541.551 201.8,541.449 201.95,540.85 202.1,540.1 202.3,539.301 202.45,538.4 202.7,537.5 202.95,536.5 203.25,535.449 203.5,534.25 203.9,533.1 204.25,531.801 204.65,530.5 205.05,529.051 205.55,527.6 206,526.051 206.55,524.449 207.05,522.75 208.2,519.449 209.3,516.199 210.4,513.15 211.45,510.15 214.75,498.199 214.7,496.65 215,495.4 215.3,493.85 215.5,493 215.65,492.051 216.05,489.949 216.55,487.699 216.85,486.5 217.1,485.15 217.7,482.35 218.3,479.25 218.7,477.699 219.05,476 219.85,472.449 220.3,470.65 220.7,468.699 221.15,466.75 221.55,464.65 222.05,462.6 222.5,460.4 223.5,455.85 224.05,453.551 224.55,451.1 225.65,446.051 228,435.949 230.25,426.051 231.35,421.199 232.45,416.4 234.6,406.9 236.45,400.4 238.45,393.9 239.55,390.699 240.65,387.449 241.85,384.25 242.45,382.65 242.75,381.85 242.9,381.449 243,381 245.55,375.65 246.2,374.65 246.7,373.85 246.95,373.551 247.15,373.301 247.35,373.1 247.45,372.949 247.95,372.75 248.1,372.75 248.2,372.699 248.4,372.6 248.7,372.6 248.85,372.6 248.95,372.551 249.25,372.551 249.4,372.551 249.5,372.5 250.15,372.6 250.75,372.699 251.45,372.9 252.15,373.15 252.65,373.4 253.1,373.6 253.6,373.9 253.75,374 253.85,374.051 254.05,374.15 254.8,374.65 258.5,382.75 260.6,392.25 262.45,401.65 264.1,411.051 265.5,420.301 266.7,429.551 267.65,438.699 268.4,447.801 268.9,456.801 268.551,457.4 269.551,481.551 270.1,488.65 270.75,495.199 271.45,501.699 272.2,508.199 273.051,514.65 274,521.15 275.051,527.6 276.15,534.051 277.301,540.449 277.4,540.6 277.4,540.75 277.45,540.85 277.45,540.9 277.45,541 277.45,541.301 277.551,541.699 277.6,541.801 277.6,541.85 277.6,541.949 277.6,542.15 277.7,542.699 277.7,543.301 277.95,545.551 278.15,547.551 278.25,548.449 278.35,549.4 278.551,551.4 278.65,552 278.7,552.301 278.7,552.551 278.801,553.699 279,556.1 279.301,558.801 279.45,560.199 279.551,561.65 279.75,563.199 279.85,564 279.9,564.4 279.9,564.75 280.2,568.051 280.551,571.1 280.801,574 281.051,576.75 281.25,579.35 281.45,581.9 281.6,584.25 281.75,586.5 281.801,588.6 282.15,594.25 282.551,599.85 283,605.449 283.551,611 284.051,613.801 284.65,616.551 285.051,617.949 285.5,619.25 286.5,621.85 287.25,623.4 288.051,624.85 288.9,626.25 289.75,627.5 290.75,628.801 291.75,629.949 292.801,631.051 293.85,632.051 295.051,633.1 296.25,634 297.5,634.85 298.801,635.6 300.2,636.35 301.65,636.949 303.15,637.551 304.65,638 306.25,638.449 307.801,638.699 309.35,638.801 310.85,638.699 312.35,638.551 313.801,638.15 315.25,637.65 316.65,636.949 318.9,635.75 320.9,634.4 322.75,632.949 324.4,631.4 325.95,629.75 327.301,628 328.5,626.15 329.5,624.1 330.4,622.051 330.801,621 331.1,619.85 331.65,617.6 331.95,615.15 332.2,612.699 332.2,610.051 332.2,608.75 332.1,607.35 331.75,604.5 332.35,596.801 332.801,589.1 333.2,581.5 333.45,573.949 333.6,570.25 333.551,566.5 333.4,562.75 333.15,558.949 332.95,555 332.75,550.85 332.551,546.551 332.25,542 332.2,539.801 332.1,537.65 332,535.551 331.9,533.5 331.85,531.6 331.75,529.699 331.7,527.9 331.6,526.15 331.6,524.551 331.551,522.949 331.551,521.449 331.45,520 331.45,518.65 331.45,517.35 331.45,516.15 331.45,515.6 331.4,515 331.4,514.65 331.4,514.1 331.35,513.4 331.25,512.449 331.15,511.449 331.051,510.199 330.9,508.85 330.7,507.25 330.6,505.699 330.551,505 330.45,504.301 330.35,503.051 330.35,502.801 330.301,502.5 330.2,501.9 330.2,501.449 330.15,500.949 330.051,500.15 330.051,499.5 330.051,499.25 330,498.949 330,498.801 330.301,494.6 330.4,490.35 330.301,486.1 329.95,481.801 329.85,480.051 329.65,478.1 329.551,476.1 329.35,473.949 329.25,471.75 329.051,469.4 328.9,466.949 328.7,464.35 328.6,461.699 328.4,458.949 328.25,456.1 328.051,453.051 327.95,450 327.75,446.75 327.551,443.449 327.35,440 327.25,436.6 327.051,433.25 326.95,430 326.75,426.75 326.65,423.65 326.6,422.15 326.5,420.6 326.4,417.65 326.4,416.949 326.4,416.6 326.35,416.199 326.25,414.699 326.2,412.5 326.2,411.4 326.2,410.85 326.15,410.25 326.1,405.85 326.2,403.699 326.25,401.5 326.4,397.199 326.801,393 327.25,388.699 327.85,384.4 328.551,380 328.95,378.699 332.6,364.199 336.95,359.75 337.5,359.699 337.85,359.75 338.1,359.9 338.25,360.1 338.65,361.25 339,362.449 339.4,363.801 339.801,365.15 340.301,366.65 340.7,368.199 341.2,369.85 341.65,371.551 341.95,372.5 342.2,373.4 342.7,375.35 343.301,377.4 343.801,379.449 344.4,381.65 345,383.9 345.6,386.25 346.2,388.699 350.801,406.949 351.301,407.199 352.75,412.699 354.1,417.85 355.4,422.801 356.551,427.449 357.7,431.9 358.75,436 359.75,439.9 360.65,443.5 361.551,446.75 362.35,449.75 363.15,452.6 363.85,455.25 364.551,457.801 365.2,460.1 365.801,462.25 366.35,464.199 366.9,466.051 367.4,467.699 367.85,469.199 368.25,470.449 368.65,471.65 369,472.6 369.301,473.4 369.551,473.949 370.1,474.301 370.85,480.551 371.7,486.65 372.75,492.75 373.9,498.699 375.25,504.65 376.7,510.5 378.35,516.35 380.1,522.051 382.1,527.801 384.2,533.4 386.45,539 388.801,544.449 391.35,549.9 394.051,555.25 396.9,560.6 399.85,565.801 400.801,567.051 401.801,568.1 402.9,569.051 404.051,569.9 405.301,570.65 406.65,571.301 408.051,571.85 409.5,572.301 411.45,572.801 413.301,573.1 415.15,573.25 416.85,573.25 418.6,573.15 420.2,572.85 421.801,572.449 423.301,571.85 424.85,571.199 426.25,570.35 427.65,569.4 428.95,568.25 430.25,567 431.45,565.6 432.65,564.051 433.7,562.301 434.7,560.25 435,558.85 435.25,557.199 435.45,555.449 435.6,553.449 435.75,551.35 435.801,549 435.85,546.5 435.801,543.801 435.801,541.15 435.7,538.551 435.6,536.15 435.45,533.801 431.301,505.35 430.85,505.051 430.15,501.15 429.45,497.35 429.15,495.551 429,494.65 428.801,493.699 428.5,491.949 428.45,491.551 428.35,491.1 428.15,490.199 428.051,489.4 428,489 427.9,488.551 427.6,486.9 427.1,483.75 426.9,482.25 426.65,480.75 426.45,479.301 426.35,478.6 426.35,478.449 426.301,478.25 426.2,477.85 425.75,474.25 425.35,470.699 425.2,469 425,467.25 424.7,463.801 424.5,460.5 424.45,458.9 424.35,457.25 424.25,454.1 424.25,452.551 424.2,450.949 421.95,435.301 421.65,433.199 421.35,431.15 421.051,429.199 421.051,429 421,428.75 420.9,428.25 420.7,427.25 420.4,425.4 420.1,423.6 419.801,421.9 419.65,421.1 419.45,420.25 419.35,419.5 419.2,418.699 418.9,417.199 418.301,414.4 418.1,413.1 417.801,411.85 417.7,411.301 417.551,410.699 417.25,409.551 417,408.15 416.65,406.551 416.301,404.699 415.9,402.6 415.5,400.35 415.051,397.85 414.6,395.1 414.051,392.1 413.65,389.449 413.45,388.199 413.2,386.9 412.801,384.5 412.6,383.4 412.5,382.85 412.35,382.25 411.95,380.199 411.551,378.25 411.15,376.449 410.95,375.65 410.85,375.25 410.801,375.051 410.7,374.801 410.6,373.801 410.5,372.85 410.4,372.051 410.301,371.35 410.301,370.85 410.2,370.4 410.2,370.1 410.1,369.85 410,369.4 409.9,368.85 409.801,368.199 409.65,367.449 409.551,366.699 409.45,365.75 409.15,363.699 408.95,361.6 408.75,359.65 407.35,354.9 406.051,350.051 404.95,345.1 403.95,339.949 403.15,334.801 402.5,329.5 402,324.15 401.65,318.6 402.35,317.801 404.551,317.6 406.5,318.199 408.45,319.5 410.301,320.75 413.95,323.449 415.75,324.9 417.45,326.35 419.15,327.9 420.75,329.4 424,332.699 427.051,336.1 428.551,337.9 429.95,339.699 432.7,343.449 435.1,345.301 437.35,347.25 439.5,349.25 441.551,351.301 443.6,353.5 445.45,355.75 447.301,358.051 448.95,360.4 461.15,375.9 461.15,376.6 467.85,384.65 468.5,384.801 474.051,391.9 479.551,399.051 485.051,406.301 490.45,413.6 491.4,415 492.25,416.35 493.1,417.75 493.801,419.15 494.301,419.85 494.7,420.551 495.1,421.301 495.4,422 496.25,423.949 497.1,425.699 498.051,427.449 499,429.051 500.051,430.6 501.15,432.051 502.35,433.449 503.551,434.699 504.9,435.949 506.25,437.051 507.7,438.1 509.15,439.051 510.75,440 512.35,440.75 514.051,441.5 515.75,442.051 517.65,442.551 519.449,442.75 521.25,442.699 523.051,442.35 524.65,441.949 526.1,441.4 527.551,440.75 528.85,439.9 530.15,439 531.301,437.949 532.449,436.801 533.449,435.5 535.15,433.051 536.5,430.4 537.449,428.1 538.1,425.65 538.699,422.85 538.9,421.449 538.949,420 539,417.199 538.9,415.801 538.699,414.35 538.25,411.551 537.449,408.75 537,407.4 536.449,406 535.1,403.199 530,393.4 527.5,388.6 524.9,383.85 519.801,374.551 519.2,373.449 518.9,372.9 518.551,372.301 517.25,370 514.65,365.5 512.15,361.1 509.551,356.75 504.45,348.25 501.95,344.1 499.35,340 496.85,335.949 494.25,331.949 493.5,330.35 491.9,328 490.15,325.65 488.4,323.4 486.45,321.25 484.5,319.199 482.4,317.25 480.25,315.4 477.95,313.6 477.4,312.4 476.75,311.199 476,310.1 475.051,309 473.6,307.4 472.15,305.699 469.35,302.15 466.85,298.5 464.45,294.65 462.35,290.7 460.45,286.551 458.75,282.301 458,280.1 457.25,277.801 456.4,275.15 456.2,274.5 456.1,274.2 456.1,274.15 456.051,274.05 455.95,273.85 455.75,273.25 455.5,272.65 455.45,272.45 455.35,272.2 455.15,271.75 454.75,270.95 454.4,270.25 454.25,269.95 454.051,269.6 453.75,269 453.65,268.75 453.5,268.45 453.15,267.35 452.95,266.25 452.9,266 452.801,265.75 452.65,265.3 452.65,265.2 452.65,265.15 452.6,265.05 452.5,264.8 452.301,264.4 451.6,263.05 450.801,261.85 450,260.8 449.051,259.9 448.9,258.85 448.7,257.6 448.5,256.25 448.2,254.7 447.95,253.05 447.6,251.25 447.25,249.3 446.85,247.2 446.45,244.8 446.301,243.8 446.1,242.85 445.95,241.95 445.75,241.1 445.65,240.35 445.45,239.65 445.35,239 445.2,238.4 445.2,238.2 445.2,238.1 445.2,238.05 445.15,237.95 445.051,237.5 445.051,237.35 445,237.15 444.9,236.8 444.801,236.4 444.801,236.3 444.75,236.25 443.45,228.2 439.35,207.45 438.85,204.6 438.75,203.95 438.6,203.25 438.301,201.85 438.1,200.55 438,199.9 437.85,199.2 437.35,196.55 436.95,194.05 436.45,191.6 436.051,189.25 435.85,188.1 435.6,186.9 435.551,186.4 435.45,185.85 435.25,184.75 434.85,182.65 434.551,180.6 434.551,180.4 434.5,180.15 434.4,179.65 434.2,178.65 433.9,176.8 433.6,175 433.35,173.3 433.051,171.65 432.65,171.25 431,159.45 430.65,159.05 430.65,158.85 430.6,158.6 430.5,158.1 430.301,157.1 429.9,155.1 429.1,151.15 427.5,143.45 426.801,139.7 426,136 425.25,132.4 424.45,128.8 424.25,127.7 423.95,126.55 423.6,125.5 423.15,124.4 422.7,123.4 422.15,122.35 421.6,121.35 420.95,120.3 419.35,117.6 417.85,114.9 416.65,112.2 416.1,110.85 415.6,109.45 414.801,106.75 414.2,104 413.801,101.3 413.6,98.5 413.7,95.8 413.801,94.4 413.95,93 414.45,90.3 414.75,88.9 415.1,87.5 416,84.8 417.1,82 417.75,80.6 418.45,79.2 419.95,76.4 422.65,70 423.4,68.35 424.1,66.75 424.75,65.3 425.301,63.9 425.85,62.7 426.35,61.55 426.801,60.6 427.2,59.65 427.551,58.75 427.65,57.75 427.5,56.75 427.051,55.7 426.45,54.65 425.551,53.5 424.4,52.35 422.95,51.15 421.35,49.95 419.45,48.7 417.35,47.45 414.95,46.1 412.35,44.8 409.5,43.4 406.4,42 403,40.55 400.051,39.35 396.95,38.15 393.75,36.95 390.35,35.7 386.9,34.5 383.25,33.25 379.5,32 375.551,30.7 371.551,29.45 367.35,28.15 363.051,26.85 358.6,25.55 354.051,24.25 349.35,22.95 344.5,21.65 339.5,20.25 335.2,19.15 330.9,18.05 328.801,17.55 328.301,17.45 327.75,17.3 326.65,17 322.35,15.9 318.15,14.9 313.95,13.85 312.95,13.65 312.45,13.55 311.9,13.4 309.801,12.9 305.65,11.9 303.65,11.5 302.65,11.3 302.15,11.2 301.6,11.05 297.551,10.15 293.551,9.3 289.5,8.4 289.051,8.35 288.551,8.25 287.551,8.05 285.551,7.65 281.6,6.85 277.7,6.1 273.801,5.3 270.45,4.7 268.85,4.45 267.25,4.15 264.25,3.65 261.35,3.15 260.05,3 258.7,2.8 258.1,2.75 257.45,2.65 256.2,2.45 253.9,2.15 251.75,1.85 250.75,1.8 249.8,1.7 248.9,1.65 248.05,1.55 247.3,1.55 246.6,1.5 245.95,1.5 245.35,1.5 244.85,1.6 244.4,1.6 243.7,1.7 243.45,1.8 243.25,1.9 243.2,2 243.1,2.05 243,2.15 242.7,3.3 242.25,4.3 241.85,5.2 241.35,6.15 240.85,7.2 240.25,8.25 239,10.65 238.35,11.95 237.6,13.25 236.9,14.7 236.1,16.2 235.3,17.75 234.4,19.35 233.55,21.05 232.6,22.8 231.65,24.6 230.6,26.45 223.15,40.45 221.35,41.55 220.45,42.1 219.5,42.6 215.9,44.75 212.35,46.95 210.65,48.1 208.9,49.2 207.55,49.8 206.9,50.1 206.2,50.35 205.6,50.7 204.95,51 203.7,51.6 203.15,52 202.55,52.35 201.4,53.05 200.3,53.8 199.2,54.55 199,54.8 198.75,55 198.25,55.4 198.05,55.65 197.8,55.85 197.3,56.25 196.45,57.15 195.55,58.05 194.8,59.05 194.05,60.05 193.35,61.1 192.65,62.15 189.35,65.4 180.5,74.15 172.3,83.15 165.35,90.05 145.85,112.25 143.85,114.3 139.45,118.3 137.75,119.85 133.9,123.7 129.95,127.4 126,131.05 121.95,134.5 121.5,134.6 106.6,150 99.1,163.5 94.65,177.95 93.15,181.7 91,187.85 89.85,190.85 88.5,193.75 87.15,196.65 85.65,199.45 84.1,202.25 82.45,204.95 79,210.3 77.15,212.9 75.2,215.4 73.2,217.9 71.05,220.3 68.9,222.7 66.55,225 66.5,225.2 66.25,225.5 66.1,225.75 65.9,226.05 65.65,226.4 65.3,226.75 64.65,227.75 64.25,228.3 63.75,228.85 63.3,229.55 62.75,230.25 62.2,231 61.55,231.75 60.3,233.6 59.7,234.5 59.05,235.3 58.5,236.15 57.95,236.9 56.9,238.35 56.05,239.7 55.25,240.95 54.6,242.1 53.95,243.05";
  const handPolyline2 =
    "53.95,243.05 53.25,244.7 52.45,246.25 51.65,247.8 50.7,249.25 49.8,250.7 48.75,252.05 46.55,254.6 41.6,259.95 39.1,262.6 36.5,265.15 31.35,270.2 26,275.15 20.65,280 15.1,284.7 9.45,289.25 3.7,293.65 3.15,294.6 2.7,295.35 2.4,296 2.3,296.25 2.15,296.4 1.95,297.25 1.75,298.051 1.6,298.85 1.5,299.65 1.5,301.6 1.7,303.449 1.9,304.4 2.15,305.301 2.45,306.199 2.8,307 3.5,308.301 4.25,309.449 5.05,310.551 5.9,311.5 6.85,312.449 7.85,313.199 8.9,313.9 10,314.449 14.1,316.301 18.1,317.85 22.2,319.15 26.2,320.15 30.3,320.949 32.35,321.25 34.35,321.4 38.45,321.65 42.45,321.6 46.55,321.35 50.65,320.801 54.75,320.051 56.8,319.551 58.8,318.949 62.9,317.65 67,316.051 71.1,314.25 75.2,312.1 76.8,311.301 78.45,310.4 80.2,309.5 82,308.449 83.85,307.5 84.75,307.051 85.55,306.551 87.1,305.65 88.5,304.75 89.85,304 90.5,303.65 91.05,303.25 92.1,302.551 92.6,302.25 93,301.9 97.4,296.95 101.1,289.95 105.2,277 106.45,274.8 106.8,274.3 107.05,273.85 107.3,273.45 107.45,273.1 107.6,272.85 107.7,272.65 107.75,272.5 107.75,272.4 110.55,268.1 113.3,264.8 117.4,260.75 118.7,259.4 120.2,257.95 121.9,256.4 123.8,254.65 124.85,253.8 125.95,252.9 128.25,250.95 130.75,249 133.45,246.85 137.05,244.2 140.75,241.5 143.85,239.35 151.95,239.1 154.7,241.55 157.25,244.05 159.8,246.65 162.15,249.3 164.5,252.05 166.65,254.9 168.8,257.85 170.75,260.85 170.8,260.95 170.85,261.05 171,261.25 171.15,261.45 171.3,261.65 171.4,261.8 171.55,262 171.65,262.15 171.85,262.4 172,262.6 172.2,262.85 172.35,263.05 173.2,264.2 173.85,265.1 174.15,265.5 174.35,265.8 174.55,266.1 174.65,266.3 176.3,269 177.7,271.7 178.95,274.5 179.5,275.95 179.95,277.35 180.9,280.301 181.6,283.301 182.15,286.4 182.5,289.5 183.05,295.9 183.4,302.25 183.65,308.65 183.7,314.949 183.65,321.35 183.4,327.65 183.05,333.949 182.5,340.25 181.9,346.6 181.1,352.9 180.15,359.199 179,365.5 177.75,371.801 176.35,378.1 174.8,384.4 173.05,390.65 156.1,501.199 154.35,511.801 152.7,522.4 151.2,533 149.85,543.6";

  // Fingertip positions from constant
  const pos = FINGERTIP_POSITIONS;

  return (
    <div className="finger-hands" ref={containerRef}>
      <div className="finger-hands-header">
        <div className="finger-hands-title">
          <span>Finger Performance</span>
          <span className="finger-hands-note">*conventional placement</span>
        </div>
        <div className="finger-hands-right">
          <div className="finger-hands-avg">
            avg:{" "}
            <Tooltip content="Average speed across all fingers — lower is faster">
              <span className="fh-speed">{fmt.int(avgSpeed)}ms</span>
            </Tooltip>
            {" · "}
            <Tooltip content="Average accuracy across all fingers — higher means fewer errors">
              <span className="fh-acc">{fmt.int(avgAcc)}%</span>
            </Tooltip>
          </div>
          <Tooltip content={TIPS.fingerSpeed}>
            <button className="help-btn" type="button" aria-label="Help">
              ?
            </button>
          </Tooltip>
        </div>
      </div>

      <div className="finger-hands-container">
        {/* Left hand (SVG mirrored) */}
        <svg
          viewBox="0 0 540.501 640.304"
          className="finger-hand-svg"
          style={{ transform: "scaleX(-1)" }}
        >
          <g transform="matrix(0.8746401,0,0,-0.8518511,33.878521,592.87107)">
            <polyline
              points={handPolyline1}
              fill="none"
              stroke="#4a4a4a"
              strokeWidth="3"
              strokeLinecap="square"
              strokeMiterlimit="10"
            />
            <polyline
              points={handPolyline2}
              fill="none"
              stroke="#4a4a4a"
              strokeWidth="3"
              strokeLinecap="square"
              strokeMiterlimit="10"
            />
          </g>
          {/* Fingertip circles */}
          {[
            { finger: "L-pinky", ...pos.pinky },
            { finger: "L-ring", ...pos.ring },
            { finger: "L-middle", ...pos.middle },
            { finger: "L-index", ...pos.index },
          ].map(({ finger, cx, cy }) => (
            <circle
              key={finger}
              cx={cx}
              cy={cy}
              r="20"
              fill={getColor(finger)}
              stroke={hovered === finger ? "#fff" : "#232528"}
              strokeWidth="3"
              style={{ cursor: "pointer" }}
              onMouseEnter={(e) => handleHover(finger, e)}
              onMouseMove={(e) => handleHover(finger, e)}
              onMouseLeave={() => setHovered(null)}
            />
          ))}
          <circle
            cx={pos.thumb.cx}
            cy={pos.thumb.cy}
            r="20"
            fill={getColor("thumb")}
            stroke={hovered === "thumb" ? "#fff" : "#232528"}
            strokeWidth="3"
            style={{ cursor: "pointer" }}
            onMouseEnter={(e) => handleHover("thumb", e)}
            onMouseMove={(e) => handleHover("thumb", e)}
            onMouseLeave={() => setHovered(null)}
          />
        </svg>

        {/* Right hand (SVG normal) */}
        <svg viewBox="0 0 540.501 640.304" className="finger-hand-svg">
          <g transform="matrix(0.8746401,0,0,-0.8518511,33.878521,592.87107)">
            <polyline
              points={handPolyline1}
              fill="none"
              stroke="#4a4a4a"
              strokeWidth="3"
              strokeLinecap="square"
              strokeMiterlimit="10"
            />
            <polyline
              points={handPolyline2}
              fill="none"
              stroke="#4a4a4a"
              strokeWidth="3"
              strokeLinecap="square"
              strokeMiterlimit="10"
            />
          </g>
          {/* Fingertip circles */}
          {[
            { finger: "R-pinky", ...pos.pinky },
            { finger: "R-ring", ...pos.ring },
            { finger: "R-middle", ...pos.middle },
            { finger: "R-index", ...pos.index },
          ].map(({ finger, cx, cy }) => (
            <circle
              key={finger}
              cx={cx}
              cy={cy}
              r="20"
              fill={getColor(finger)}
              stroke={hovered === finger ? "#fff" : "#232528"}
              strokeWidth="3"
              style={{ cursor: "pointer" }}
              onMouseEnter={(e) => handleHover(finger, e)}
              onMouseMove={(e) => handleHover(finger, e)}
              onMouseLeave={() => setHovered(null)}
            />
          ))}
          <circle
            cx={pos.thumb.cx}
            cy={pos.thumb.cy}
            r="20"
            fill={getColor("thumb")}
            stroke={hovered === "thumb" ? "#fff" : "#232528"}
            strokeWidth="3"
            style={{ cursor: "pointer" }}
            onMouseEnter={(e) => handleHover("thumb", e)}
            onMouseMove={(e) => handleHover("thumb", e)}
            onMouseLeave={() => setHovered(null)}
          />
        </svg>
      </div>

      {/* Legend */}
      <div className="finger-hands-legend">
        <span>fast</span>
        <div className="fh-gradient" />
        <span>slow</span>
      </div>

      {/* Tooltip with full stats */}
      {hovered && hoveredData && hoveredData.total > 0 && (
        <div
          className="finger-tooltip"
          style={{
            left: tooltipPos.x,
            top: tooltipPos.y,
            transform: "translate(-50%, -100%)",
          }}
        >
          <div className="ft-header" style={{ borderColor: hoveredColor }}>
            {FINGER_NAMES[hovered]}
          </div>
          <div className="ft-stats">
            <div className="ft-stat">
              <span className="ft-label">Speed</span>
              <span className="ft-value">
                {fmt.int(hoveredData.avgInterval)}ms
              </span>
              <span
                className={`ft-diff ${
                  hoveredData.avgInterval < avgSpeed
                    ? "good"
                    : hoveredData.avgInterval > avgSpeed
                    ? "bad"
                    : ""
                }`}
              >
                {hoveredData.avgInterval < avgSpeed
                  ? `${fmt.int(avgSpeed - hoveredData.avgInterval)}ms faster`
                  : hoveredData.avgInterval > avgSpeed
                  ? `${fmt.int(hoveredData.avgInterval - avgSpeed)}ms slower`
                  : "avg"}
              </span>
            </div>
            <div className="ft-stat">
              <span className="ft-label">Accuracy</span>
              <span className="ft-value">{fmt.int(hoveredData.accuracy)}%</span>
              <span
                className={`ft-diff ${
                  hoveredData.accuracy > avgAcc
                    ? "good"
                    : hoveredData.accuracy < avgAcc
                    ? "bad"
                    : ""
                }`}
              >
                {hoveredData.accuracy > avgAcc
                  ? `+${fmt.int(hoveredData.accuracy - avgAcc)}%`
                  : hoveredData.accuracy < avgAcc
                  ? `${fmt.int(hoveredData.accuracy - avgAcc)}%`
                  : "avg"}
              </span>
            </div>
          </div>
          <div className="ft-keys">
            <MiniKeyboard
              highlightKeys={FINGER_KEYS[hovered]}
              color={hoveredColor}
            />
          </div>
        </div>
      )}
    </div>
  );
};

// Mini hand SVG for chord diagram - reuses the same polylines and fingertip positions
const MiniHandSVG = ({
  finger,
  highlighted,
  onMouseEnter,
  onMouseLeave,
  showBothHands,
}) => {
  // Same polylines from the main FingerHands component
  const handPolyline1 =
    "149.85,543.6 149.75,545.25 149.6,546.801 149.55,548.35 149.5,549.801 149.55,551.301 149.6,552.699 149.85,555.449 150.35,558.1 150.7,559.4 151,560.6 151.45,561.85 151.9,563 152.4,564.15 152.9,565.199 154.2,567.35 154.9,568.4 155.6,569.35 156.45,570.35 157.25,571.25 158.15,572.15 159.05,572.949 160.1,573.801 161.1,574.551 163.3,576 165.7,577.35 167,578 168.25,578.551 179.15,579.301 181.1,578.85 183.15,578.301 185.1,577.699 185.95,577.4 186.65,577.051 187.9,576.449 188.35,576.15 188.7,575.801 189.85,575 192.65,571.199 193.65,568.65 194.7,565.85 195.15,564.449 195.55,563.1 195.95,561.85 196.25,560.65 196.6,559.551 196.9,558.5 197.2,557.551 197.4,556.65 197.7,555.85 197.9,555.1 198.1,554.449 198.25,553.85 198.45,553.35 198.6,552.9 198.7,552.551 198.75,552.25 199.65,549.65 200.35,547 200.95,544.301 201.3,541.551 201.8,541.449 201.95,540.85 202.1,540.1 202.3,539.301 202.45,538.4 202.7,537.5 202.95,536.5 203.25,535.449 203.5,534.25 203.9,533.1 204.25,531.801 204.65,530.5 205.05,529.051 205.55,527.6 206,526.051 206.55,524.449 207.05,522.75 208.2,519.449 209.3,516.199 210.4,513.15 211.45,510.15 214.75,498.199 214.7,496.65 215,495.4 215.3,493.85 215.5,493 215.65,492.051 216.05,489.949 216.55,487.699 216.85,486.5 217.1,485.15 217.7,482.35 218.3,479.25 218.7,477.699 219.05,476 219.85,472.449 220.3,470.65 220.7,468.699 221.15,466.75 221.55,464.65 222.05,462.6 222.5,460.4 223.5,455.85 224.05,453.551 224.55,451.1 225.65,446.051 228,435.949 230.25,426.051 231.35,421.199 232.45,416.4 234.6,406.9 236.45,400.4 238.45,393.9 239.55,390.699 240.65,387.449 241.85,384.25 242.45,382.65 242.75,381.85 242.9,381.449 243,381 245.55,375.65 246.2,374.65 246.7,373.85 246.95,373.551 247.15,373.301 247.35,373.1 247.45,372.949 247.95,372.75 248.1,372.75 248.2,372.699 248.4,372.6 248.7,372.6 248.85,372.6 248.95,372.551 249.25,372.551 249.4,372.551 249.5,372.5 250.15,372.6 250.75,372.699 251.45,372.9 252.15,373.15 252.65,373.4 253.1,373.6 253.6,373.9 253.75,374 253.85,374.051 254.05,374.15 254.8,374.65 258.5,382.75 260.6,392.25 262.45,401.65 264.1,411.051 265.5,420.301 266.7,429.551 267.65,438.699 268.4,447.801 268.9,456.801 268.551,457.4 269.551,481.551 270.1,488.65 270.75,495.199 271.45,501.699 272.2,508.199 273.051,514.65 274,521.15 275.051,527.6 276.15,534.051 277.301,540.449 277.4,540.6 277.4,540.75 277.45,540.85 277.45,540.9 277.45,541 277.45,541.301 277.551,541.699 277.6,541.801 277.6,541.85 277.6,541.949 277.6,542.15 277.7,542.699 277.7,543.301 277.95,545.551 278.15,547.551 278.25,548.449 278.35,549.4 278.551,551.4 278.65,552 278.7,552.301 278.7,552.551 278.801,553.699 279,556.1 279.301,558.801 279.45,560.199 279.551,561.65 279.75,563.199 279.85,564 279.9,564.4 279.9,564.75 280.2,568.051 280.551,571.1 280.801,574 281.051,576.75 281.25,579.35 281.45,581.9 281.6,584.25 281.75,586.5 281.801,588.6 282.15,594.25 282.551,599.85 283,605.449 283.551,611 284.051,613.801 284.65,616.551 285.051,617.949 285.5,619.25 286.5,621.85 287.25,623.4 288.051,624.85 288.9,626.25 289.75,627.5 290.75,628.801 291.75,629.949 292.801,631.051 293.85,632.051 295.051,633.1 296.25,634 297.5,634.85 298.801,635.6 300.2,636.35 301.65,636.949 303.15,637.551 304.65,638 306.25,638.449 307.801,638.699 309.35,638.801 310.85,638.699 312.35,638.551 313.801,638.15 315.25,637.65 316.65,636.949 318.9,635.75 320.9,634.4 322.75,632.949 324.4,631.4 325.95,629.75 327.301,628 328.5,626.15 329.5,624.1 330.4,622.051 330.801,621 331.1,619.85 331.65,617.6 331.95,615.15 332.2,612.699 332.2,610.051 332.2,608.75 332.1,607.35 331.75,604.5 332.35,596.801 332.801,589.1 333.2,581.5 333.45,573.949 333.6,570.25 333.551,566.5 333.4,562.75 333.15,558.949 332.95,555 332.75,550.85 332.551,546.551 332.25,542 332.2,539.801 332.1,537.65 332,535.551 331.9,533.5 331.85,531.6 331.75,529.699 331.7,527.9 331.6,526.15 331.6,524.551 331.551,522.949 331.551,521.449 331.45,520 331.45,518.65 331.45,517.35 331.45,516.15 331.45,515.6 331.4,515 331.4,514.65 331.4,514.1 331.35,513.4 331.25,512.449 331.15,511.449 331.051,510.199 330.9,508.85 330.7,507.25 330.6,505.699 330.551,505 330.45,504.301 330.35,503.051 330.35,502.801 330.301,502.5 330.2,501.9 330.2,501.449 330.15,500.949 330.051,500.15 330.051,499.5 330.051,499.25 330,498.949 330,498.801 330.301,494.6 330.4,490.35 330.301,486.1 329.95,481.801 329.85,480.051 329.65,478.1 329.551,476.1 329.35,473.949 329.25,471.75 329.051,469.4 328.9,466.949 328.7,464.35 328.6,461.699 328.4,458.949 328.25,456.1 328.051,453.051 327.95,450 327.75,446.75 327.551,443.449 327.35,440 327.25,436.6 327.051,433.25 326.95,430 326.75,426.75 326.65,423.65 326.6,422.15 326.5,420.6 326.4,417.65 326.4,416.949 326.4,416.6 326.35,416.199 326.25,414.699 326.2,412.5 326.2,411.4 326.2,410.85 326.15,410.25 326.1,405.85 326.2,403.699 326.25,401.5 326.4,397.199 326.801,393 327.25,388.699 327.85,384.4 328.551,380 328.95,378.699 332.6,364.199 336.95,359.75 337.5,359.699 337.85,359.75 338.1,359.9 338.25,360.1 338.65,361.25 339,362.449 339.4,363.801 339.801,365.15 340.301,366.65 340.7,368.199 341.2,369.85 341.65,371.551 341.95,372.5 342.2,373.4 342.7,375.35 343.301,377.4 343.801,379.449 344.4,381.65 345,383.9 345.6,386.25 346.2,388.699 350.801,406.949 351.301,407.199 352.75,412.699 354.1,417.85 355.4,422.801 356.551,427.449 357.7,431.9 358.75,436 359.75,439.9 360.65,443.5 361.551,446.75 362.35,449.75 363.15,452.6 363.85,455.25 364.551,457.801 365.2,460.1 365.801,462.25 366.35,464.199 366.9,466.051 367.4,467.699 367.85,469.199 368.25,470.449 368.65,471.65 369,472.6 369.301,473.4 369.551,473.949 370.1,474.301 370.85,480.551 371.7,486.65 372.75,492.75 373.9,498.699 375.25,504.65 376.7,510.5 378.35,516.35 380.1,522.051 382.1,527.801 384.2,533.4 386.45,539 388.801,544.449 391.35,549.9 394.051,555.25 396.9,560.6 399.85,565.801 400.801,567.051 401.801,568.1 402.9,569.051 404.051,569.9 405.301,570.65 406.65,571.301 408.051,571.85 409.5,572.301 411.45,572.801 413.301,573.1 415.15,573.25 416.85,573.25 418.6,573.15 420.2,572.85 421.801,572.449 423.301,571.85 424.85,571.199 426.25,570.35 427.65,569.4 428.95,568.25 430.25,567 431.45,565.6 432.65,564.051 433.7,562.301 434.7,560.25 435,558.85 435.25,557.199 435.45,555.449 435.6,553.449 435.75,551.35 435.801,549 435.85,546.5 435.801,543.801 435.801,541.15 435.7,538.551 435.6,536.15 435.45,533.801 431.301,505.35 430.85,505.051 430.15,501.15 429.45,497.35 429.15,495.551 429,494.65 428.801,493.699 428.5,491.949 428.45,491.551 428.35,491.1 428.15,490.199 428.051,489.4 428,489 427.9,488.551 427.6,486.9 427.1,483.75 426.9,482.25 426.65,480.75 426.45,479.301 426.35,478.6 426.35,478.449 426.301,478.25 426.2,477.85 425.75,474.25 425.35,470.699 425.2,469 425,467.25 424.7,463.801 424.5,460.5 424.45,458.9 424.35,457.25 424.25,454.1 424.25,452.551 424.2,450.949 421.95,435.301 421.65,433.199 421.35,431.15 421.051,429.199 421.051,429 421,428.75 420.9,428.25 420.7,427.25 420.4,425.4 420.1,423.6 419.801,421.9 419.65,421.1 419.45,420.25 419.35,419.5 419.2,418.699 418.9,417.199 418.301,414.4 418.1,413.1 417.801,411.85 417.7,411.301 417.551,410.699 417.25,409.551 417,408.15 416.65,406.551 416.301,404.699 415.9,402.6 415.5,400.35 415.051,397.85 414.6,395.1 414.051,392.1 413.65,389.449 413.45,388.199 413.2,386.9 412.801,384.5 412.6,383.4 412.5,382.85 412.35,382.25 411.95,380.199 411.551,378.25 411.15,376.449 410.95,375.65 410.85,375.25 410.801,375.051 410.7,374.801 410.6,373.801 410.5,372.85 410.4,372.051 410.301,371.35 410.301,370.85 410.2,370.4 410.2,370.1 410.1,369.85 410,369.4 409.9,368.85 409.801,368.199 409.65,367.449 409.551,366.699 409.45,365.75 409.15,363.699 408.95,361.6 408.75,359.65 407.35,354.9 406.051,350.051 404.95,345.1 403.95,339.949 403.15,334.801 402.5,329.5 402,324.15 401.65,318.6 402.35,317.801 404.551,317.6 406.5,318.199 408.45,319.5 410.301,320.75 413.95,323.449 415.75,324.9 417.45,326.35 419.15,327.9 420.75,329.4 424,332.699 427.051,336.1 428.551,337.9 429.95,339.699 432.7,343.449 435.1,345.301 437.35,347.25 439.5,349.25 441.551,351.301 443.6,353.5 445.45,355.75 447.301,358.051 448.95,360.4 461.15,375.9 461.15,376.6 467.85,384.65 468.5,384.801 474.051,391.9 479.551,399.051 485.051,406.301 490.45,413.6 491.4,415 492.25,416.35 493.1,417.75 493.801,419.15 494.301,419.85 494.7,420.551 495.1,421.301 495.4,422 496.25,423.949 497.1,425.699 498.051,427.449 499,429.051 500.051,430.6 501.15,432.051 502.35,433.449 503.551,434.699 504.9,435.949 506.25,437.051 507.7,438.1 509.15,439.051 510.75,440 512.35,440.75 514.051,441.5 515.75,442.051 517.65,442.551 519.449,442.75 521.25,442.699 523.051,442.35 524.65,441.949 526.1,441.4 527.551,440.75 528.85,439.9 530.15,439 531.301,437.949 532.449,436.801 533.449,435.5 535.15,433.051 536.5,430.4 537.449,428.1 538.1,425.65 538.699,422.85 538.9,421.449 538.949,420 539,417.199 538.9,415.801 538.699,414.35 538.25,411.551 537.449,408.75 537,407.4 536.449,406 535.1,403.199 530,393.4 527.5,388.6 524.9,383.85 519.801,374.551 519.2,373.449 518.9,372.9 518.551,372.301 517.25,370 514.65,365.5 512.15,361.1 509.551,356.75 504.45,348.25 501.95,344.1 499.35,340 496.85,335.949 494.25,331.949 493.5,330.35 491.9,328 490.15,325.65 488.4,323.4 486.45,321.25 484.5,319.199 482.4,317.25 480.25,315.4 477.95,313.6 477.4,312.4 476.75,311.199 476,310.1 475.051,309 473.6,307.4 472.15,305.699 469.35,302.15 466.85,298.5 464.45,294.65 462.35,290.7 460.45,286.551 458.75,282.301 458,280.1 457.25,277.801 456.4,275.15 456.2,274.5 456.1,274.2 456.1,274.15 456.051,274.05 455.95,273.85 455.75,273.25 455.5,272.65 455.45,272.45 455.35,272.2 455.15,271.75 454.75,270.95 454.4,270.25 454.25,269.95 454.051,269.6 453.75,269 453.65,268.75 453.5,268.45 453.15,267.35 452.95,266.25 452.9,266 452.801,265.75 452.65,265.3 452.65,265.2 452.65,265.15 452.6,265.05 452.5,264.8 452.301,264.4 451.6,263.05 450.801,261.85 450,260.8 449.051,259.9 448.9,258.85 448.7,257.6 448.5,256.25 448.2,254.7 447.95,253.05 447.6,251.25 447.25,249.3 446.85,247.2 446.45,244.8 446.301,243.8 446.1,242.85 445.95,241.95 445.75,241.1 445.65,240.35 445.45,239.65 445.35,239 445.2,238.4 445.2,238.2 445.2,238.1 445.2,238.05 445.15,237.95 445.051,237.5 445.051,237.35 445,237.15 444.9,236.8 444.801,236.4 444.801,236.3 444.75,236.25 443.45,228.2 439.35,207.45 438.85,204.6 438.75,203.95 438.6,203.25 438.301,201.85 438.1,200.55 438,199.9 437.85,199.2 437.35,196.55 436.95,194.05 436.45,191.6 436.051,189.25 435.85,188.1 435.6,186.9 435.551,186.4 435.45,185.85 435.25,184.75 434.85,182.65 434.551,180.6 434.551,180.4 434.5,180.15 434.4,179.65 434.2,178.65 433.9,176.8 433.6,175 433.35,173.3 433.051,171.65 432.65,171.25 431,159.45 430.65,159.05 430.65,158.85 430.6,158.6 430.5,158.1 430.301,157.1 429.9,155.1 429.1,151.15 427.5,143.45 426.801,139.7 426,136 425.25,132.4 424.45,128.8 424.25,127.7 423.95,126.55 423.6,125.5 423.15,124.4 422.7,123.4 422.15,122.35 421.6,121.35 420.95,120.3 419.35,117.6 417.85,114.9 416.65,112.2 416.1,110.85 415.6,109.45 414.801,106.75 414.2,104 413.801,101.3 413.6,98.5 413.7,95.8 413.801,94.4 413.95,93 414.45,90.3 414.75,88.9 415.1,87.5 416,84.8 417.1,82 417.75,80.6 418.45,79.2 419.95,76.4 422.65,70 423.4,68.35 424.1,66.75 424.75,65.3 425.301,63.9 425.85,62.7 426.35,61.55 426.801,60.6 427.2,59.65 427.551,58.75 427.65,57.75 427.5,56.75 427.051,55.7 426.45,54.65 425.551,53.5 424.4,52.35 422.95,51.15 421.35,49.95 419.45,48.7 417.35,47.45 414.95,46.1 412.35,44.8 409.5,43.4 406.4,42 403,40.55 400.051,39.35 396.95,38.15 393.75,36.95 390.35,35.7 386.9,34.5 383.25,33.25 379.5,32 375.551,30.7 371.551,29.45 367.35,28.15 363.051,26.85 358.6,25.55 354.051,24.25 349.35,22.95 344.5,21.65 339.5,20.25 335.2,19.15 330.9,18.05 328.801,17.55 328.301,17.45 327.75,17.3 326.65,17 322.35,15.9 318.15,14.9 313.95,13.85 312.95,13.65 312.45,13.55 311.9,13.4 309.801,12.9 305.65,11.9 303.65,11.5 302.65,11.3 302.15,11.2 301.6,11.05 297.551,10.15 293.551,9.3 289.5,8.4 289.051,8.35 288.551,8.25 287.551,8.05 285.551,7.65 281.6,6.85 277.7,6.1 273.801,5.3 270.45,4.7 268.85,4.45 267.25,4.15 264.25,3.65 261.35,3.15 260.05,3 258.7,2.8 258.1,2.75 257.45,2.65 256.2,2.45 253.9,2.15 251.75,1.85 250.75,1.8 249.8,1.7 248.9,1.65 248.05,1.55 247.3,1.55 246.6,1.5 245.95,1.5 245.35,1.5 244.85,1.6 244.4,1.6 243.7,1.7 243.45,1.8 243.25,1.9 243.2,2 243.1,2.05 243,2.15 242.7,3.3 242.25,4.3 241.85,5.2 241.35,6.15 240.85,7.2 240.25,8.25 239,10.65 238.35,11.95 237.6,13.25 236.9,14.7 236.1,16.2 235.3,17.75 234.4,19.35 233.55,21.05 232.6,22.8 231.65,24.6 230.6,26.45 223.15,40.45 221.35,41.55 220.45,42.1 219.5,42.6 215.9,44.75 212.35,46.95 210.65,48.1 208.9,49.2 207.55,49.8 206.9,50.1 206.2,50.35 205.6,50.7 204.95,51 203.7,51.6 203.15,52 202.55,52.35 201.4,53.05 200.3,53.8 199.2,54.55 199,54.8 198.75,55 198.25,55.4 198.05,55.65 197.8,55.85 197.3,56.25 196.45,57.15 195.55,58.05 194.8,59.05 194.05,60.05 193.35,61.1 192.65,62.15 189.35,65.4 180.5,74.15 172.3,83.15 165.35,90.05 145.85,112.25 143.85,114.3 139.45,118.3 137.75,119.85 133.9,123.7 129.95,127.4 126,131.05 121.95,134.5 121.5,134.6 106.6,150 99.1,163.5 94.65,177.95 93.15,181.7 91,187.85 89.85,190.85 88.5,193.75 87.15,196.65 85.65,199.45 84.1,202.25 82.45,204.95 79,210.3 77.15,212.9 75.2,215.4 73.2,217.9 71.05,220.3 68.9,222.7 66.55,225 66.5,225.2 66.25,225.5 66.1,225.75 65.9,226.05 65.65,226.4 65.3,226.75 64.65,227.75 64.25,228.3 63.75,228.85 63.3,229.55 62.75,230.25 62.2,231 61.55,231.75 60.3,233.6 59.7,234.5 59.05,235.3 58.5,236.15 57.95,236.9 56.9,238.35 56.05,239.7 55.25,240.95 54.6,242.1 53.95,243.05";
  const handPolyline2 =
    "53.95,243.05 53.25,244.7 52.45,246.25 51.65,247.8 50.7,249.25 49.8,250.7 48.75,252.05 46.55,254.6 41.6,259.95 39.1,262.6 36.5,265.15 31.35,270.2 26,275.15 20.65,280 15.1,284.7 9.45,289.25 3.7,293.65 3.15,294.6 2.7,295.35 2.4,296 2.3,296.25 2.15,296.4 1.95,297.25 1.75,298.051 1.6,298.85 1.5,299.65 1.5,301.6 1.7,303.449 1.9,304.4 2.15,305.301 2.45,306.199 2.8,307 3.5,308.301 4.25,309.449 5.05,310.551 5.9,311.5 6.85,312.449 7.85,313.199 8.9,313.9 10,314.449 14.1,316.301 18.1,317.85 22.2,319.15 26.2,320.15 30.3,320.949 32.35,321.25 34.35,321.4 38.45,321.65 42.45,321.6 46.55,321.35 50.65,320.801 54.75,320.051 56.8,319.551 58.8,318.949 62.9,317.65 67,316.051 71.1,314.25 75.2,312.1 76.8,311.301 78.45,310.4 80.2,309.5 82,308.449 83.85,307.5 84.75,307.051 85.55,306.551 87.1,305.65 88.5,304.75 89.85,304 90.5,303.65 91.05,303.25 92.1,302.551 92.6,302.25 93,301.9 97.4,296.95 101.1,289.95 105.2,277 106.45,274.8 106.8,274.3 107.05,273.85 107.3,273.45 107.45,273.1 107.6,272.85 107.7,272.65 107.75,272.5 107.75,272.4 110.55,268.1 113.3,264.8 117.4,260.75 118.7,259.4 120.2,257.95 121.9,256.4 123.8,254.65 124.85,253.8 125.95,252.9 128.25,250.95 130.75,249 133.45,246.85 137.05,244.2 140.75,241.5 143.85,239.35 151.95,239.1 154.7,241.55 157.25,244.05 159.8,246.65 162.15,249.3 164.5,252.05 166.65,254.9 168.8,257.85 170.75,260.85 170.8,260.95 170.85,261.05 171,261.25 171.15,261.45 171.3,261.65 171.4,261.8 171.55,262 171.65,262.15 171.85,262.4 172,262.6 172.2,262.85 172.35,263.05 173.2,264.2 173.85,265.1 174.15,265.5 174.35,265.8 174.55,266.1 174.65,266.3 176.3,269 177.7,271.7 178.95,274.5 179.5,275.95 179.95,277.35 180.9,280.301 181.6,283.301 182.15,286.4 182.5,289.5 183.05,295.9 183.4,302.25 183.65,308.65 183.7,314.949 183.65,321.35 183.4,327.65 183.05,333.949 182.5,340.25 181.9,346.6 181.1,352.9 180.15,359.199 179,365.5 177.75,371.801 176.35,378.1 174.8,384.4 173.05,390.65 156.1,501.199 154.35,511.801 152.7,522.4 151.2,533 149.85,543.6";

  const pos = FINGERTIP_POSITIONS;
  const isLeft = finger.startsWith("L-");
  const isThumb = finger === "thumb";

  // Get the fingertip position for this finger
  const fingerType = finger.includes("pinky")
    ? "pinky"
    : finger.includes("ring")
    ? "ring"
    : finger.includes("middle")
    ? "middle"
    : finger.includes("index")
    ? "index"
    : "thumb";
  const tipPos = pos[fingerType];

  // For thumb, show both hands side by side
  if (showBothHands) {
    return (
      <div
        className={`chord-thumb-container ${
          highlighted ? "chord-hand-highlighted" : ""
        }`}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        {/* Left hand */}
        <svg
          viewBox="0 0 540.501 640.304"
          className="chord-hand-svg chord-thumb-hand"
          style={{ transform: "scaleX(-1)" }}
        >
          <g transform="matrix(0.8746401,0,0,-0.8518511,33.878521,592.87107)">
            <polyline
              points={handPolyline1}
              fill="none"
              stroke={highlighted ? "#999" : "#666"}
              strokeWidth="6"
              strokeLinecap="square"
              strokeMiterlimit="10"
            />
            <polyline
              points={handPolyline2}
              fill="none"
              stroke={highlighted ? "#999" : "#666"}
              strokeWidth="6"
              strokeLinecap="square"
              strokeMiterlimit="10"
            />
          </g>
          <circle
            cx={tipPos.cx}
            cy={tipPos.cy}
            r="34"
            fill={highlighted ? "#e2b714" : "#56b6c2"}
            stroke={highlighted ? "#fff" : "#232528"}
            strokeWidth="4"
          />
        </svg>
        {/* Right hand */}
        <svg
          viewBox="0 0 540.501 640.304"
          className="chord-hand-svg chord-thumb-hand"
        >
          <g transform="matrix(0.8746401,0,0,-0.8518511,33.878521,592.87107)">
            <polyline
              points={handPolyline1}
              fill="none"
              stroke={highlighted ? "#999" : "#666"}
              strokeWidth="6"
              strokeLinecap="square"
              strokeMiterlimit="10"
            />
            <polyline
              points={handPolyline2}
              fill="none"
              stroke={highlighted ? "#999" : "#666"}
              strokeWidth="6"
              strokeLinecap="square"
              strokeMiterlimit="10"
            />
          </g>
          <circle
            cx={tipPos.cx}
            cy={tipPos.cy}
            r="34"
            fill={highlighted ? "#e2b714" : "#56b6c2"}
            stroke={highlighted ? "#fff" : "#232528"}
            strokeWidth="4"
          />
        </svg>
      </div>
    );
  }

  return (
    <svg
      viewBox="0 0 540.501 640.304"
      className={`chord-hand-svg ${
        highlighted ? "chord-hand-highlighted" : ""
      }`}
      style={{ transform: isLeft ? "scaleX(-1)" : "none" }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <g transform="matrix(0.8746401,0,0,-0.8518511,33.878521,592.87107)">
        <polyline
          points={handPolyline1}
          fill="none"
          stroke={highlighted ? "#999" : "#666"}
          strokeWidth="6"
          strokeLinecap="square"
          strokeMiterlimit="10"
        />
        <polyline
          points={handPolyline2}
          fill="none"
          stroke={highlighted ? "#999" : "#666"}
          strokeWidth="6"
          strokeLinecap="square"
          strokeMiterlimit="10"
        />
      </g>
      {/* Larger fingertip dot - vibrant cyan */}
      <circle
        cx={tipPos.cx}
        cy={tipPos.cy}
        r="34"
        fill={highlighted ? "#e2b714" : "#56b6c2"}
        stroke={highlighted ? "#fff" : "#232528"}
        strokeWidth="4"
      />
    </svg>
  );
};

// Chord diagram showing finger-to-finger transition speeds
const FingerChordDiagram = ({ fingerTransitions, fingerStats }) => {
  const [hoveredChord, setHoveredChord] = useState(null);
  const [hoveredNode, setHoveredNode] = useState(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const containerRef = useRef(null);

  // 9 fingers evenly distributed - THUMB at TOP
  // Right hand on right side (clockwise), Left hand on left side
  const fingers = [
    "thumb",
    "R-index",
    "R-middle",
    "R-ring",
    "R-pinky",
    "L-pinky",
    "L-ring",
    "L-middle",
    "L-index",
  ];

  const fullNames = {
    "L-pinky": "Left Pinky",
    "L-ring": "Left Ring",
    "L-middle": "Left Middle",
    "L-index": "Left Index",
    thumb: "Thumbs",
    "R-index": "Right Index",
    "R-middle": "Right Middle",
    "R-ring": "Right Ring",
    "R-pinky": "Right Pinky",
  };

  // Convert transitions object to array and deduplicate (combine A→B and B→A)
  const allTransitions = Object.entries(fingerTransitions || {});
  const seenPairs = new Set();
  const deduplicatedTransitions = [];

  allTransitions.forEach(([key, t]) => {
    if (t.count < 2) return;

    // Create a canonical key (alphabetically sorted pair)
    const pairKey = [t.from, t.to].sort().join("|");
    if (seenPairs.has(pairKey)) return;
    seenPairs.add(pairKey);

    // Find the reverse transition
    const reverseKey = `${t.to}->${t.from}`;
    const reverse = fingerTransitions[reverseKey];

    // Only include reverse if it has enough data to display (count >= 2)
    const reverseValid = reverse && reverse.count >= 2;

    // Calculate combined stats for the chord
    const forwardCount = t.count || 0;
    const reverseCount = reverseValid ? reverse.count : 0;
    const totalCount = forwardCount + reverseCount;

    // Weight average by count
    let combinedAvg;
    if (forwardCount > 0 && reverseCount > 0) {
      combinedAvg =
        (t.avg * forwardCount + reverse.avg * reverseCount) / totalCount;
    } else if (forwardCount > 0) {
      combinedAvg = t.avg;
    } else {
      combinedAvg = reverse.avg;
    }

    deduplicatedTransitions.push({
      from: t.from,
      to: t.to,
      avg: Math.round(combinedAvg),
      count: totalCount,
      forward: t,
      reverse: reverseValid ? reverse : null,
    });
  });

  const transitions = deduplicatedTransitions;

  if (transitions.length === 0) {
    return null;
  }

  // Get min/max for color scaling (use combined avg)
  const avgTimes = transitions.map((t) => t.avg);
  const minTime = Math.min(...avgTimes);
  const maxTime = Math.max(...avgTimes);

  // Circle geometry - 9 nodes evenly spaced (40 degrees apart)
  const cx = 200,
    cy = 200;
  const chordRadius = 130; // Where chords connect
  const nodeRadius = 160; // Where hands are displayed (further out)
  const nodeSize = 55; // Size of mini hand SVG
  const thumbNodeWidth = 95; // Wider for two hands

  // Calculate node positions - evenly distributed, thumb at top
  const nodePositions = {};
  fingers.forEach((finger, i) => {
    // Start from top (-90 degrees) and go clockwise
    // 360 / 9 = 40 degrees apart
    const angle = ((-90 + i * 40) * Math.PI) / 180;
    nodePositions[finger] = {
      // Position for displaying the hand node (outer)
      x: cx + nodeRadius * Math.cos(angle),
      y: cy + nodeRadius * Math.sin(angle),
      // Position for chord connections (inner)
      chordX: cx + chordRadius * Math.cos(angle),
      chordY: cy + chordRadius * Math.sin(angle),
      angle: (angle * 180) / Math.PI,
    };
  });

  // Get color based on speed (green = fast, red = slow)
  // Color scale: use percentile-based coloring for better spread
  // Sort times and find percentile boundaries
  const sortedTimes = [...avgTimes].sort((a, b) => a - b);
  const p20 = sortedTimes[Math.floor(sortedTimes.length * 0.2)] || minTime;
  const p50 =
    sortedTimes[Math.floor(sortedTimes.length * 0.5)] ||
    (minTime + maxTime) / 2;
  const p80 = sortedTimes[Math.floor(sortedTimes.length * 0.8)] || maxTime;

  const getChordColor = (avg) => {
    if (sortedTimes.length <= 1) return "#98c379";

    // Normalize to 0-1 based on percentile position for better spread
    let t;
    if (avg <= p20) {
      t = (0.1 * (avg - minTime)) / (p20 - minTime || 1);
    } else if (avg <= p50) {
      t = 0.1 + (0.35 * (avg - p20)) / (p50 - p20 || 1);
    } else if (avg <= p80) {
      t = 0.45 + (0.35 * (avg - p50)) / (p80 - p50 || 1);
    } else {
      t = 0.8 + (0.2 * (avg - p80)) / (maxTime - p80 || 1);
    }
    t = Math.max(0, Math.min(1, t));

    // Smooth 3-color gradient: green (#98c379) → yellow (#e5c07b) → red (#e06c75)
    if (t < 0.5) {
      // Green to Yellow
      const tt = t * 2;
      const r = Math.round(152 + (229 - 152) * tt);
      const g = Math.round(195 + (192 - 195) * tt);
      const b = Math.round(121 + (123 - 121) * tt);
      return `rgb(${r},${g},${b})`;
    } else {
      // Yellow to Red
      const tt = (t - 0.5) * 2;
      const r = Math.round(229 + (224 - 229) * tt);
      const g = Math.round(192 - (192 - 108) * tt);
      const b = Math.round(123 - (123 - 117) * tt);
      return `rgb(${r},${g},${b})`;
    }
  };

  // Get line width based on count
  const maxCount = Math.max(...transitions.map((t) => t.count));
  const getWidth = (count) => 2 + (count / maxCount) * 5;

  // Sort transitions for rendering order
  const sortedTransitions = [...transitions].sort((a, b) => {
    const aHovered =
      hoveredChord && hoveredChord.from === a.from && hoveredChord.to === a.to;
    const bHovered =
      hoveredChord && hoveredChord.from === b.from && hoveredChord.to === b.to;
    if (aHovered) return 1;
    if (bHovered) return -1;
    const aConnected =
      hoveredNode && (a.from === hoveredNode || a.to === hoveredNode);
    const bConnected =
      hoveredNode && (b.from === hoveredNode || b.to === hoveredNode);
    if (aConnected && !bConnected) return 1;
    if (bConnected && !aConnected) return -1;
    return 0;
  });

  const hoveredFingerData = hoveredNode ? fingerStats?.[hoveredNode] : null;

  // Track mouse position relative to container
  const handleMouseMove = (e) => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setMousePos({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    }
  };

  return (
    <div className="finger-chord-diagram">
      <div className="chord-header">
        <div className="chord-header-left">
          <span className="chord-title">Finger Transitions</span>
          <span className="chord-subtitle">speed between fingers</span>
        </div>
        <Tooltip content={TIPS.fingerTransitions}>
          <button className="help-btn" type="button" aria-label="Help">
            ?
          </button>
        </Tooltip>
      </div>

      <div
        className="chord-container"
        ref={containerRef}
        onMouseMove={handleMouseMove}
      >
        {/* SVG for the chord lines */}
        <svg viewBox="0 0 400 400" className="chord-lines-svg">
          {sortedTransitions.map((t) => {
            const from = nodePositions[t.from];
            const to = nodePositions[t.to];
            if (!from || !to) return null;

            const isHovered =
              hoveredChord &&
              hoveredChord.from === t.from &&
              hoveredChord.to === t.to;
            const isConnected =
              hoveredNode && (t.from === hoveredNode || t.to === hoveredNode);

            // Use the chord connection points (inner position)
            const startX = from.chordX;
            const startY = from.chordY;
            const endX = to.chordX;
            const endY = to.chordY;

            // Curved path toward center
            const midX = (startX + endX) / 2;
            const midY = (startY + endY) / 2;
            const pullX = (cx - midX) * 0.5;
            const pullY = (cy - midY) * 0.5;
            const ctrlX = midX + pullX;
            const ctrlY = midY + pullY;

            return (
              <path
                key={`${t.from}-${t.to}`}
                d={`M ${startX} ${startY} Q ${ctrlX} ${ctrlY} ${endX} ${endY}`}
                fill="none"
                stroke={getChordColor(t.avg)}
                strokeWidth={
                  isHovered ? getWidth(t.count) + 3 : getWidth(t.count)
                }
                strokeOpacity={
                  isHovered ? 1 : isConnected ? 1 : hoveredNode ? 0.12 : 0.75
                }
                style={{ cursor: "pointer" }}
                onMouseEnter={() => setHoveredChord(t)}
                onMouseLeave={() => setHoveredChord(null)}
              />
            );
          })}
        </svg>

        {/* Mini hand nodes positioned absolutely */}
        {fingers.map((finger) => {
          const pos = nodePositions[finger];
          const isThumb = finger === "thumb";
          const isHighlighted =
            hoveredNode === finger ||
            (hoveredChord &&
              (hoveredChord.from === finger || hoveredChord.to === finger));

          const width = isThumb ? thumbNodeWidth : nodeSize;
          const height = nodeSize;

          return (
            <div
              key={finger}
              className={`chord-node ${isThumb ? "chord-node-thumb" : ""}`}
              style={{
                left: pos.x - width / 2,
                top: pos.y - height / 2,
                width: width,
                height: height,
              }}
            >
              <MiniHandSVG
                finger={finger}
                highlighted={isHighlighted}
                showBothHands={isThumb}
                onMouseEnter={() => setHoveredNode(finger)}
                onMouseLeave={() => setHoveredNode(null)}
              />
            </div>
          );
        })}

        {/* Mouse-following tooltip */}
        {(hoveredChord || (hoveredNode && hoveredFingerData)) && (
          <div
            className="chord-mouse-tooltip"
            style={{
              left: mousePos.x + 15,
              top: mousePos.y + 15,
            }}
          >
            {hoveredChord &&
              !hoveredNode &&
              (() => {
                const forward = hoveredChord.forward;
                const reverse = hoveredChord.reverse;
                const forwardColor = forward
                  ? getChordColor(forward.avg)
                  : null;
                const reverseColor = reverse
                  ? getChordColor(reverse.avg)
                  : null;

                return (
                  <>
                    {/* Forward direction */}
                    <div className="chord-tooltip-row">
                      <span className="chord-tooltip-route">
                        {fullNames[hoveredChord.from]} →{" "}
                        {fullNames[hoveredChord.to]}
                      </span>
                      {forward ? (
                        <span className="chord-tooltip-values">
                          <span style={{ color: forwardColor }}>
                            {fmt.int(forward.avg)}ms
                          </span>
                          <span className="chord-tooltip-count">
                            {fmt.count(forward.count)}×
                          </span>
                        </span>
                      ) : (
                        <span className="chord-tooltip-nodata">no data</span>
                      )}
                    </div>

                    {/* Reverse direction */}
                    <div className="chord-tooltip-row">
                      <span className="chord-tooltip-route">
                        {fullNames[hoveredChord.to]} →{" "}
                        {fullNames[hoveredChord.from]}
                      </span>
                      {reverse ? (
                        <span className="chord-tooltip-values">
                          <span style={{ color: reverseColor }}>
                            {fmt.int(reverse.avg)}ms
                          </span>
                          <span className="chord-tooltip-count">
                            {fmt.count(reverse.count)}×
                          </span>
                        </span>
                      ) : (
                        <span className="chord-tooltip-nodata">no data</span>
                      )}
                    </div>

                    {/* Average */}
                    <div className="chord-tooltip-avg">
                      <span>avg</span>
                      <span style={{ color: getChordColor(hoveredChord.avg) }}>
                        {fmt.int(hoveredChord.avg)}ms
                      </span>
                    </div>
                  </>
                );
              })()}
            {hoveredNode && hoveredFingerData && (
              <>
                <div className="chord-tooltip-header">
                  {fullNames[hoveredNode]}
                </div>
                <div className="chord-tooltip-node-stats">
                  <div className="chord-node-stat">
                    <span className="chord-node-label">speed</span>
                    <span className="chord-node-value">
                      {fmt.int(hoveredFingerData.avgInterval)}ms
                    </span>
                  </div>
                  <div className="chord-node-stat">
                    <span className="chord-node-label">accuracy</span>
                    <span className="chord-node-value">
                      {fmt.int(hoveredFingerData.accuracy)}%
                    </span>
                  </div>
                  <div className="chord-node-stat">
                    <span className="chord-node-label">keys</span>
                    <span className="chord-node-value">
                      {fmt.count(hoveredFingerData.total)}
                    </span>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="chord-legend">
        <span>fast</span>
        <div className="chord-gradient" />
        <span>slow</span>
      </div>
    </div>
  );
};

function App() {
  const [currentText, setCurrentText] = useState("");
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [typed, setTyped] = useState("");
  const [isActive, setIsActive] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [viewingPastStats, setViewingPastStats] = useState(false); // True when viewing stats via button (not after completing)
  const [keystrokeData, setKeystrokeData] = useState([]);
  const [stats, setStats] = useState(null);
  const [cumulativeStats, setCumulativeStats] = useState(null);
  const [completedCount, setCompletedCount] = useState(0);
  const [totalParagraphs] = useState(ALL_PARAGRAPHS.length);
  const [statsView, setStatsView] = useState("current"); // 'current' | 'alltime' | 'global'
  const [comparisonBase, setComparisonBase] = useState("none"); // 'none' | 'alltime' | 'global' | 'current'
  const [heatmapMode, setHeatmapMode] = useState("speed"); // 'speed' | 'accuracy'
  const [rowSpeedShiftMode, setRowSpeedShiftMode] = useState(false); // false = base keys, true = shifted keys
  const [clearHoldProgress, setClearHoldProgress] = useState(0);
  const [showHistory, setShowHistory] = useState(false);
  const [showFixedHint, setShowFixedHint] = useState(false);
  const [histograms, setHistograms] = useState(() => {
    const stored = loadFromStorage(STORAGE_KEYS.HISTOGRAMS, {});
    // Validate histogram data matches current bucket counts
    const validated = {};
    let needsReset = false;
    for (const key of Object.keys(HISTOGRAM_CONFIG)) {
      const config = HISTOGRAM_CONFIG[key];
      const expectedLength = config.getBucketCount();
      if (
        stored[key] &&
        Array.isArray(stored[key]) &&
        stored[key].length === expectedLength
      ) {
        validated[key] = stored[key];
      } else if (stored[key]) {
        needsReset = true; // Old format detected
      }
    }
    if (needsReset) {
      // Clear old histogram data
      saveToStorage(STORAGE_KEYS.HISTOGRAMS, validated);
    }
    return validated;
  });
  const [histogramZoom, setHistogramZoom] = useState(() =>
    loadFromStorage(STORAGE_KEYS.HISTOGRAM_ZOOM, true)
  );
  const [selectedHistogram, setSelectedHistogram] = useState("wpm");
  const [selectedGlobalHistogram, setSelectedGlobalHistogram] = useState("wpm");

  // Global stats from Supabase for comparisons
  const {
    globalAverages,
    globalHistograms,
    bigramAverages,
    fingerAverages,
    transitionAverages,
    behavioralAverages,
    keyAverages,
    // New extended stats
    characterBreakdown,
    lifetimeStats,
    records,
    errorConfusion,
    accuracyByType,
    speedByType,
    rowPerformance,
    typingPatterns,
    timePatterns,
    submitStats: submitToSupabase,
    resetUserId,
    compareToGlobal,
    sessionCount: globalSessionCount,
    loading: globalStatsLoading,
  } = useGlobalStats();

  // Race mode
  const {
    state: raceState,
    createRace,
    joinRace,
    setReady: setRaceReady,
    updateName: updateRaceName,
    startRace,
    updateProgress: updateRaceProgress,
    finishRace,
    leaveRace,
    clearRaceStats,
    generateShareUrl,
    isInRace,
    hasRaceStats,
    waitingForOthers,
    finishedCount,
    totalCount,
  } = useRace();

  const [racerName, setRacerName] = useState(() =>
    localStorage.getItem("typometry_racer_name") || null
  );

  const lastKeystrokeTime = useRef(null);
  const startTime = useRef(null);
  const containerRef = useRef(null);
  const clearHoldTimer = useRef(null);
  const clearHoldInterval = useRef(null);
  const completeHintRef = useRef(null);
  const restartHintRef = useRef(null);

  // Check for shared results URL
  const [sharedResultsData, setSharedResultsData] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("r") || null;
  });

  // Load completed indices on mount
  const [completedIndices, setCompletedIndices] = useState(() =>
    loadFromStorage(STORAGE_KEYS.COMPLETED, [])
  );

  const resetTest = useCallback(
    (forceNew = false) => {
      let indices = completedIndices;
      if (forceNew) {
        indices = [];
        setCompletedIndices([]);
        saveToStorage(STORAGE_KEYS.COMPLETED, []);
        saveToStorage(STORAGE_KEYS.HISTORY, []);
        saveToStorage(STORAGE_KEYS.HISTOGRAMS, {});
        setHistograms({});
      }

      const { text, index, reset } = getNextParagraph(indices);

      if (reset && !forceNew) {
        // All paragraphs completed - clear and restart
        setCompletedIndices([]);
        saveToStorage(STORAGE_KEYS.COMPLETED, []);
      }

      setCurrentText(text);
      setCurrentIndex(index);
      setTyped("");
      setIsActive(false);
      setIsComplete(false);
      setKeystrokeData([]);
      setRawKeyEvents([]);
      setStats(null);
      setViewingPastStats(false);
      lastKeystrokeTime.current = null;
      startTime.current = null;
      containerRef.current?.focus();
    },
    [completedIndices]
  );

  // Load cumulative stats on mount
  useEffect(() => {
    const history = loadFromStorage(STORAGE_KEYS.HISTORY, []);
    setCompletedCount(completedIndices.length);
    if (history.length > 0) {
      setCumulativeStats(calculateCumulativeStats(history));
    }
    resetTest();
  }, []);

  // Handle race URL parameter
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const raceId = params.get("race");
    if (raceId && !isInRace) {
      // Use saved name or will be assigned guest# based on join order
      const name = localStorage.getItem("typometry_racer_name") || "guest";
      setRacerName(name);
      // Join as non-host - paragraph will be received from host via broadcast
      joinRace(raceId, name, '', 0, false);
    }
  }, []);

  // Sync race paragraph to currentText when received from host
  useEffect(() => {
    if (raceState.paragraph && raceState.status === 'waiting' && !raceState.isHost) {
      setCurrentText(raceState.paragraph);
      setCurrentIndex(raceState.paragraphIndex);
      setTyped('');
      setKeystrokeData([]);
      setRawKeyEvents([]);
      setIsActive(false);
      setIsComplete(false);
      setStats(null);
      lastKeystrokeTime.current = null;
      startTime.current = null;
    }
  }, [raceState.paragraph, raceState.status, raceState.isHost]);

  // Auto-switch to race stats view when race finishes
  useEffect(() => {
    if (raceState.status === 'finished' && hasRaceStats) {
      setStatsView('race');
    }
  }, [raceState.status, hasRaceStats]);

  useEffect(() => {
    containerRef.current?.focus();
  }, []);

  // Track visibility of hint elements to show/hide fixed floating hint
  useEffect(() => {
    if (!isComplete) {
      setShowFixedHint(false);
      return;
    }

    // Track which hints are visible
    let topHintVisible = false;
    let bottomHintVisible = false;

    const updateFixedHint = () => {
      // Hide fixed hint if either the top or bottom hint is visible
      setShowFixedHint(!topHintVisible && !bottomHintVisible);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.target === completeHintRef.current) {
            topHintVisible = entry.isIntersecting;
          } else if (entry.target === restartHintRef.current) {
            bottomHintVisible = entry.isIntersecting;
          }
        });
        updateFixedHint();
      },
      { threshold: 0.5 }
    );

    // Small delay to let the DOM update
    const timer = setTimeout(() => {
      if (completeHintRef.current) {
        observer.observe(completeHintRef.current);
      }
      if (restartHintRef.current) {
        observer.observe(restartHintRef.current);
      }
    }, 200);

    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [isComplete]);

  const calculateCumulativeStats = (history) => {
    if (history.length === 0) return null;

    const allIntervals = history.flatMap((h) => h.intervals);
    const allWordIntervals = history.flatMap((h) => h.wordIntervals || []);
    const allDistances = history.flatMap((h) => h.distances || []);

    const totalChars = history.reduce((sum, h) => sum + h.charCount, 0);
    const totalTime = history.reduce((sum, h) => sum + h.totalTime, 0);
    const totalErrors = history.reduce((sum, h) => sum + h.errorCount, 0);

    const avgInterval =
      allIntervals.length > 0
        ? allIntervals.reduce((a, b) => a + b, 0) / allIntervals.length
        : 0;

    const avgWordInterval =
      allWordIntervals.length > 0
        ? allWordIntervals.reduce((a, b) => a + b, 0) / allWordIntervals.length
        : 0;

    const avgDistance =
      allDistances.length > 0
        ? allDistances.reduce((a, b) => a + b, 0) / allDistances.length
        : 0;

    const minutes = totalTime / 60000;
    const wpm = minutes > 0 ? Math.round(totalChars / 5 / minutes) : 0;
    const accuracy =
      totalChars > 0 ? ((totalChars - totalErrors) / totalChars) * 100 : 0;

    // Aggregate counts
    const counts = {
      words: history.reduce((sum, h) => sum + (h.counts?.words || 0), 0),
      correctWords: history.reduce(
        (sum, h) => sum + (h.counts?.correctWords || 0),
        0
      ),
      letters: history.reduce((sum, h) => sum + (h.counts?.letters || 0), 0),
      correctLetters: history.reduce(
        (sum, h) => sum + (h.counts?.correctLetters || 0),
        0
      ),
      numbers: history.reduce((sum, h) => sum + (h.counts?.numbers || 0), 0),
      correctNumbers: history.reduce(
        (sum, h) => sum + (h.counts?.correctNumbers || 0),
        0
      ),
      punctuation: history.reduce(
        (sum, h) => sum + (h.counts?.punctuation || 0),
        0
      ),
      correctPunctuation: history.reduce(
        (sum, h) => sum + (h.counts?.correctPunctuation || 0),
        0
      ),
      capitals: history.reduce((sum, h) => sum + (h.counts?.capitals || 0), 0),
      correctCapitals: history.reduce(
        (sum, h) => sum + (h.counts?.correctCapitals || 0),
        0
      ),
      spaces: history.reduce((sum, h) => sum + (h.counts?.spaces || 0), 0),
      correctSpaces: history.reduce(
        (sum, h) => sum + (h.counts?.correctSpaces || 0),
        0
      ),
    };

    // Aggregate keyStats for keyboard heatmap
    const keyStats = {};
    history.forEach((h) => {
      if (h.keyStats) {
        Object.entries(h.keyStats).forEach(([key, data]) => {
          if (!keyStats[key]) {
            keyStats[key] = { times: [], count: 0, correct: 0, errors: 0 };
          }
          // Add all times and count from this session
          if (data.times) {
            keyStats[key].times.push(...data.times);
          }
          keyStats[key].count += data.count || 0;
          keyStats[key].correct += data.correct || 0;
          keyStats[key].errors += data.errors || 0;
        });
      }
    });
    // Calculate averages and accuracy for aggregated keyStats
    Object.keys(keyStats).forEach((key) => {
      const times = keyStats[key].times;
      keyStats[key].avgInterval =
        times.length > 0 ? times.reduce((a, b) => a + b, 0) / times.length : 0;
      keyStats[key].accuracy =
        keyStats[key].count > 0
          ? keyStats[key].correct / keyStats[key].count
          : 1;
    });

    // Aggregate fingerStats
    const fingerStats = {};
    const fingerOrder = [
      "L-pinky",
      "L-ring",
      "L-middle",
      "L-index",
      "R-index",
      "R-middle",
      "R-ring",
      "R-pinky",
      "thumb",
    ];
    fingerOrder.forEach((f) => {
      fingerStats[f] = { times: [], correct: 0, total: 0 };
    });
    history.forEach((h) => {
      if (h.fingerStats) {
        Object.entries(h.fingerStats).forEach(([finger, data]) => {
          if (fingerStats[finger]) {
            if (data.times) fingerStats[finger].times.push(...data.times);
            fingerStats[finger].correct += data.correct || 0;
            fingerStats[finger].total += data.total || 0;
          }
        });
      }
    });
    Object.keys(fingerStats).forEach((f) => {
      const times = fingerStats[f].times;
      fingerStats[f].avgInterval =
        times.length > 0
          ? Math.round(times.reduce((a, b) => a + b, 0) / times.length)
          : 0;
      fingerStats[f].accuracy =
        fingerStats[f].total > 0
          ? Math.round((fingerStats[f].correct / fingerStats[f].total) * 100)
          : 100;
    });

    // Aggregate fingerTransitions
    const fingerTransitions = {};
    history.forEach((h) => {
      if (h.fingerTransitions) {
        Object.entries(h.fingerTransitions).forEach(([key, data]) => {
          if (!fingerTransitions[key]) {
            fingerTransitions[key] = {
              times: [],
              from: data.from,
              to: data.to,
            };
          }
          if (data.times) {
            fingerTransitions[key].times.push(...data.times);
          }
        });
      }
    });
    // Calculate averages for transitions
    Object.keys(fingerTransitions).forEach((key) => {
      const t = fingerTransitions[key];
      t.avg =
        t.times.length > 0
          ? Math.round(t.times.reduce((a, b) => a + b, 0) / t.times.length)
          : 0;
      t.count = t.times.length;
    });

    // Aggregate behavioral stats (weighted averages by char count)
    const behavioralHistory = history.filter((h) => h.behavioral);
    const totalBehavioralChars = behavioralHistory.reduce(
      (sum, h) => sum + h.charCount,
      0
    );

    const weightedAvg = (key) => {
      if (totalBehavioralChars === 0) return 0;
      return (
        behavioralHistory.reduce(
          (sum, h) => sum + (h.behavioral?.[key] || 0) * h.charCount,
          0
        ) / totalBehavioralChars
      );
    };

    const avgMomentum = weightedAvg("momentum");
    const avgFlowRatio = Math.round(weightedAvg("flowRatio"));
    const avgRhythmScore = Math.round(weightedAvg("rhythmScore"));
    const avgFatiguePercent = Math.round(weightedAvg("fatiguePercent"));
    const avgRecoveryPenalty = Math.round(weightedAvg("recoveryPenalty"));
    const avgCapitalPenalty = Math.round(weightedAvg("capitalPenalty"));
    const avgPunctuationPenalty = Math.round(weightedAvg("punctuationPenalty"));
    const avgHandBalance = STAT_ROUND.handBalance(weightedAvg("handBalance"));
    const avgHomeRowAdvantage = STAT_ROUND.homeRowAdvantage(
      weightedAvg("homeRowAdvantage")
    );
    const avgNumberRowPenalty = Math.round(weightedAvg("numberRowPenalty"));
    const avgBackspaceEfficiency =
      Math.round(weightedAvg("backspaceEfficiency") * 10) / 10;

    const totalBursts = behavioralHistory.reduce(
      (sum, h) => sum + (h.behavioral?.burstCount || 0),
      0
    );
    const maxBurstEver = Math.max(
      ...behavioralHistory.map((h) => h.behavioral?.maxBurst || 0),
      0
    );
    const totalHesitations = behavioralHistory.reduce(
      (sum, h) => sum + (h.behavioral?.hesitationCount || 0),
      0
    );

    // Determine overall archetype from most common or weighted
    let momentumLabel = "balanced";
    if (avgMomentum < 0.5) momentumLabel = "perfectionist";
    else if (avgMomentum < 1.5) momentumLabel = "quick corrector";
    else if (avgMomentum < 3) momentumLabel = "steady";
    else if (avgMomentum < 5) momentumLabel = "flow typer";
    else momentumLabel = "bulldozer";

    let fatigueLabel = "steady";
    if (avgFatiguePercent < -10) fatigueLabel = "warming up";
    else if (avgFatiguePercent < -5) fatigueLabel = "accelerating";
    else if (avgFatiguePercent > 15) fatigueLabel = "fatigued";
    else if (avgFatiguePercent > 8) fatigueLabel = "slowing";

    let dominantHand = "balanced";
    if (avgHandBalance > 15) dominantHand = "left faster";
    else if (avgHandBalance < -15) dominantHand = "right faster";

    let speedProfile = "steady";
    const avgConsistency =
      history.reduce((sum, h) => sum + (h.consistency || 0), 0) /
      history.length;
    if (avgConsistency > 80) speedProfile = "metronome";
    else if (avgConsistency > 65) speedProfile = "consistent";
    else if (avgConsistency > 50) speedProfile = "variable";
    else speedProfile = "erratic";

    let backspaceLabel = "efficient";
    if (avgBackspaceEfficiency > 2) backspaceLabel = "over-corrector";
    else if (avgBackspaceEfficiency > 1.5) backspaceLabel = "cautious";
    else if (avgBackspaceEfficiency < 1 && totalErrors > 0)
      backspaceLabel = "incomplete fixes";

    // Generate overall archetype
    let archetype = "The Typist";
    let archetypeDesc = "";

    if (avgRhythmScore > 70 && avgConsistency > 70) {
      archetype = "The Metronome";
      archetypeDesc = "Steady, rhythmic, predictable timing";
    } else if (avgMomentum < 1 && accuracy > 95) {
      archetype = "The Surgeon";
      archetypeDesc = "Precise, careful, catches every error instantly";
    } else if (avgMomentum > 4 && wpm > 60) {
      archetype = "The Steamroller";
      archetypeDesc = "Powers through mistakes, prioritizes speed";
    } else if (maxBurstEver > 15 && avgFlowRatio > 60) {
      archetype = "The Sprinter";
      archetypeDesc = "Explosive bursts of speed, then regroups";
    } else if (avgFatiguePercent < -10) {
      archetype = "The Slow Starter";
      archetypeDesc = "Warms up over time, finishes strong";
    } else if (avgFatiguePercent > 15) {
      archetype = "The Fader";
      archetypeDesc = "Strong start, loses steam as they go";
    } else if (avgFlowRatio > 70 && avgConsistency > 60) {
      archetype = "The Flow State";
      archetypeDesc = "Locked in, consistent rhythm, in the zone";
    } else if (avgRecoveryPenalty > 90) {
      archetype = "The Rattled";
      archetypeDesc = "Errors throw off their groove";
    } else if (avgRecoveryPenalty < 60 && totalErrors > 0) {
      archetype = "The Unfazed";
      archetypeDesc = "Errors don't break their stride";
    } else if (wpm > 80) {
      archetype = "The Speedster";
      archetypeDesc = "Raw speed is the name of the game";
    } else if (accuracy > 98) {
      archetype = "The Perfectionist";
      archetypeDesc = "Accuracy above all else";
    }

    const confidenceScore = Math.round(
      avgFlowRatio * 0.3 +
        avgRhythmScore * 0.2 +
        accuracy * 0.3 +
        (100 - Math.min(avgRecoveryPenalty, 100)) * 0.2
    );

    // Aggregate bigrams across all sessions
    const bigramMap = {};
    history.forEach((h) => {
      if (h.bigrams) {
        h.bigrams.forEach(({ bigram, avg, distance, accuracy, errors }) => {
          const lowerBigram = bigram.toLowerCase();
          if (!bigramMap[lowerBigram]) {
            bigramMap[lowerBigram] = {
              times: [],
              distance,
              correct: 0,
              total: 0,
            };
          }
          bigramMap[lowerBigram].times.push(avg);
          // Accumulate accuracy data
          if (accuracy !== undefined && errors !== undefined) {
            // Reverse calculate: if we have count and errors, we can get correct
            const count = 1; // Each bigram entry represents one occurrence
            bigramMap[lowerBigram].total += count;
            bigramMap[lowerBigram].correct += accuracy * count;
          }
        });
      }
    });

    const aggregatedBigrams = Object.entries(bigramMap).map(
      ([bigram, data]) => ({
        bigram,
        avg: data.times.reduce((a, b) => a + b, 0) / data.times.length,
        count: data.times.length,
        distance: data.distance,
        accuracy: data.total > 0 ? data.correct / data.total : 1,
        errors: data.total - data.correct,
      })
    );

    const slowestBigrams = [...aggregatedBigrams]
      .sort((a, b) => b.avg - a.avg)
      .slice(0, 5);
    const fastestBigrams = [...aggregatedBigrams]
      .sort((a, b) => a.avg - b.avg)
      .slice(0, 5);

    // Accuracy-sorted bigrams for accuracy mode
    const mostAccurateBigrams = [...aggregatedBigrams]
      .filter((b) => b.count >= 2)
      .sort((a, b) => b.accuracy - a.accuracy)
      .slice(0, 5);
    const leastAccurateBigrams = [...aggregatedBigrams]
      .filter((b) => b.count >= 2 && b.errors > 0)
      .sort((a, b) => a.accuracy - b.accuracy)
      .slice(0, 5);

    // Impressive bigrams: fast but far (distance > 3, time < median)
    const medianTime =
      allIntervals.length > 0
        ? [...allIntervals].sort((a, b) => a - b)[
            Math.floor(allIntervals.length / 2)
          ]
        : 100;

    const impressiveBigrams = aggregatedBigrams
      .filter((b) => b.distance && b.distance > 3 && b.avg < medianTime)
      .sort((a, b) => b.distance / b.avg - a.distance / a.avg)
      .slice(0, 5);

    // Average errors per session
    const avgErrors = totalErrors / history.length;

    return {
      sessions: history.length,
      totalChars,
      totalErrors,
      totalTime: STAT_ROUND.time(totalTime / 1000),
      wpm: STAT_ROUND.wpm(wpm),
      accuracy: STAT_ROUND.accuracy(accuracy),
      consistency: STAT_ROUND.consistency(avgConsistency),
      avgErrors: Math.round(avgErrors * 10) / 10,
      avgInterval: STAT_ROUND.avgInterval(avgInterval),
      avgWordInterval: Math.round(avgWordInterval),
      avgDistance: STAT_ROUND.distance(avgDistance),
      slowestBigrams,
      fastestBigrams,
      mostAccurateBigrams,
      leastAccurateBigrams,
      impressiveBigrams,
      counts,
      keyStats,
      fingerStats,
      fingerTransitions,
      history, // Include history for review
      behavioral: {
        momentum: Math.round(avgMomentum * 10) / 10,
        momentumLabel,
        flowRatio: STAT_ROUND.flowRatio(avgFlowRatio),
        rhythmScore: STAT_ROUND.rhythmScore(avgRhythmScore),
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
      },
    };
  };

  const calculateStats = useCallback((data, totalTime, rawEvents = []) => {
    const intervals = data.map((d) => d.interval).filter((i) => i !== null);
    const avgInterval =
      intervals.length > 0
        ? intervals.reduce((a, b) => a + b, 0) / intervals.length
        : 0;

    // Standard deviation
    const variance =
      intervals.length > 0
        ? intervals.reduce(
            (sum, val) => sum + Math.pow(val - avgInterval, 2),
            0
          ) / intervals.length
        : 0;
    const stdDev = Math.sqrt(variance);

    // Consistency score
    const cv = avgInterval > 0 ? stdDev / avgInterval : 0;
    const consistency = STAT_ROUND.consistency(
      Math.max(0, (1 - Math.min(cv, 1)) * 100)
    );

    const correctChars = data.filter((d) => d.correct).length;
    // Exclude backspaces from character count
    const charCount = data.filter((d) => !d.isBackspace).length;
    const accuracy = charCount > 0 ? (correctChars / charCount) * 100 : 0;

    const minutes = totalTime / 60000;
    const wpm = minutes > 0 ? Math.round(charCount / 5 / minutes) : 0;
    const cpm = minutes > 0 ? Math.round(charCount / minutes) : 0;

    // ============ BEHAVIORAL STATS ============

    // --- Momentum: letters typed after error before first backspace ---
    // High momentum = you power through mistakes, low = immediate corrector
    const momentumValues = [];
    let charsSinceError = 0;
    let inErrorState = false;

    for (const event of rawEvents) {
      if (event.isBackspace) {
        if (inErrorState && charsSinceError > 0) {
          momentumValues.push(charsSinceError);
        }
        charsSinceError = 0;
        inErrorState = false;
      } else {
        // Check if this keystroke was an error
        const keystroke = data.find(
          (d) => Math.abs(d.timestamp - event.timestamp) < 5
        );
        if (keystroke && !keystroke.correct) {
          inErrorState = true;
          charsSinceError = 1;
        } else if (inErrorState) {
          charsSinceError++;
        }
      }
    }

    const avgMomentum =
      momentumValues.length > 0
        ? momentumValues.reduce((a, b) => a + b, 0) / momentumValues.length
        : 0;

    // Momentum personality label
    let momentumLabel = "balanced";
    if (avgMomentum < 0.5) momentumLabel = "perfectionist";
    else if (avgMomentum < 1.5) momentumLabel = "quick corrector";
    else if (avgMomentum < 3) momentumLabel = "steady";
    else if (avgMomentum < 5) momentumLabel = "flow typer";
    else momentumLabel = "bulldozer";

    // --- Burst detection: longest streak of fast correct keystrokes ---
    const burstThreshold = avgInterval * 0.8; // faster than 80% of average
    let currentBurst = 0;
    let maxBurst = 0;
    let bursts = [];

    for (let i = 0; i < data.length; i++) {
      if (
        data[i].correct &&
        data[i].interval &&
        data[i].interval < burstThreshold
      ) {
        currentBurst++;
      } else {
        if (currentBurst > 2) bursts.push(currentBurst);
        maxBurst = Math.max(maxBurst, currentBurst);
        currentBurst = 0;
      }
    }
    if (currentBurst > 2) bursts.push(currentBurst);
    maxBurst = Math.max(maxBurst, currentBurst);

    const avgBurstLength =
      bursts.length > 0 ? bursts.reduce((a, b) => a + b, 0) / bursts.length : 0;

    // --- Flow state: % of keystrokes within tight timing band ---
    const flowBandLow = avgInterval * 0.7;
    const flowBandHigh = avgInterval * 1.3;
    const flowKeystrokes = intervals.filter(
      (i) => i >= flowBandLow && i <= flowBandHigh
    );
    const flowRatio =
      intervals.length > 0
        ? STAT_ROUND.flowRatio((flowKeystrokes.length / intervals.length) * 100)
        : 0;

    // --- Fatigue: speed difference between first and second half ---
    const halfPoint = Math.floor(intervals.length / 2);
    const firstHalfAvg =
      halfPoint > 0
        ? intervals.slice(0, halfPoint).reduce((a, b) => a + b, 0) / halfPoint
        : avgInterval;
    const secondHalfAvg =
      halfPoint > 0
        ? intervals.slice(halfPoint).reduce((a, b) => a + b, 0) /
          (intervals.length - halfPoint)
        : avgInterval;
    const fatigueRatio = firstHalfAvg > 0 ? secondHalfAvg / firstHalfAvg : 1;
    const fatiguePercent = Math.round((fatigueRatio - 1) * 100);

    let fatigueLabel = "steady";
    if (fatiguePercent < -10) fatigueLabel = "warming up";
    else if (fatiguePercent < -5) fatigueLabel = "accelerating";
    else if (fatiguePercent > 15) fatigueLabel = "fatigued";
    else if (fatiguePercent > 8) fatigueLabel = "slowing";

    // --- Hesitation points: pauses > 500ms ---
    const hesitationThreshold = 500;
    const hesitations = intervals.filter((i) => i > hesitationThreshold);
    const hesitationCount = hesitations.length;
    const avgHesitation =
      hesitations.length > 0
        ? hesitations.reduce((a, b) => a + b, 0) / hesitations.length
        : 0;

    // --- Recovery time: average interval of 3 keystrokes after an error ---
    const recoveryTimes = [];
    for (let i = 0; i < data.length; i++) {
      if (!data[i].correct && i + 3 < data.length) {
        const nextThree = data
          .slice(i + 1, i + 4)
          .map((d) => d.interval)
          .filter((i) => i !== null);
        if (nextThree.length > 0) {
          recoveryTimes.push(
            nextThree.reduce((a, b) => a + b, 0) / nextThree.length
          );
        }
      }
    }
    const avgRecoveryTime =
      recoveryTimes.length > 0
        ? recoveryTimes.reduce((a, b) => a + b, 0) / recoveryTimes.length
        : avgInterval;
    const recoveryPenalty =
      avgInterval > 0
        ? Math.round((avgRecoveryTime / avgInterval - 1) * 100)
        : 0;

    // --- Capital letter penalty ---
    const capitalIntervals = data
      .filter(
        (d) =>
          d.expected &&
          d.expected === d.expected.toUpperCase() &&
          d.expected !== d.expected.toLowerCase()
      )
      .map((d) => d.interval)
      .filter((i) => i !== null);
    const avgCapitalInterval =
      capitalIntervals.length > 0
        ? capitalIntervals.reduce((a, b) => a + b, 0) / capitalIntervals.length
        : avgInterval;
    const capitalPenalty =
      avgInterval > 0
        ? Math.round((avgCapitalInterval / avgInterval - 1) * 100)
        : 0;

    // --- Punctuation penalty ---
    const punctuation = ".,;:!?'\"-()[]{}/";
    const punctIntervals = data
      .filter((d) => d.expected && punctuation.includes(d.expected))
      .map((d) => d.interval)
      .filter((i) => i !== null);
    const avgPunctInterval =
      punctIntervals.length > 0
        ? punctIntervals.reduce((a, b) => a + b, 0) / punctIntervals.length
        : avgInterval;
    const punctuationPenalty =
      avgInterval > 0
        ? Math.round((avgPunctInterval / avgInterval - 1) * 100)
        : 0;

    // --- Error clustering: do errors come in bursts? ---
    const errorPositions = data
      .map((d, i) => (d.correct ? null : i))
      .filter((i) => i !== null);

    let errorGaps = [];
    for (let i = 1; i < errorPositions.length; i++) {
      errorGaps.push(errorPositions[i] - errorPositions[i - 1]);
    }
    const avgErrorGap =
      errorGaps.length > 0
        ? errorGaps.reduce((a, b) => a + b, 0) / errorGaps.length
        : charCount;
    const errorClustering =
      errorGaps.length > 0
        ? Math.round((charCount / errorPositions.length / avgErrorGap) * 10) /
          10
        : 1;

    let errorPattern = "random";
    if (errorClustering > 1.5) errorPattern = "clustered";
    else if (errorClustering < 0.7) errorPattern = "spread out";

    // --- Backspace efficiency: backspaces per error ---
    const backspaceCount = rawEvents.filter((e) => e.isBackspace).length;
    // Exclude backspaces from error count (they have correct: false but aren't typing errors)
    const errorCount = data.filter((d) => !d.correct && !d.isBackspace).length;
    const backspaceEfficiency =
      errorCount > 0 ? Math.round((backspaceCount / errorCount) * 10) / 10 : 1;

    let backspaceLabel = "efficient";
    if (backspaceEfficiency > 2) backspaceLabel = "over-corrector";
    else if (backspaceEfficiency > 1.5) backspaceLabel = "cautious";
    else if (backspaceEfficiency < 1 && errorCount > 0)
      backspaceLabel = "incomplete fixes";

    // --- Rhythm regularity (autocorrelation-like measure) ---
    let rhythmScore = 0;
    if (intervals.length > 10) {
      const diffs = [];
      for (let i = 1; i < intervals.length; i++) {
        diffs.push(Math.abs(intervals[i] - intervals[i - 1]));
      }
      const avgDiff = diffs.reduce((a, b) => a + b, 0) / diffs.length;
      rhythmScore =
        avgInterval > 0
          ? STAT_ROUND.rhythmScore(
              Math.max(0, (1 - avgDiff / avgInterval) * 100)
            )
          : 0;
    }

    // --- Hand balance (left vs right side of keyboard) ---
    const leftKeys = "qwertasdfgzxcvb`12345";
    const rightKeys = "yuiophjklnm67890-=[];'\\,./";
    let leftTotal = 0,
      leftCount = 0,
      rightTotal = 0,
      rightCount = 0;

    data.forEach((d) => {
      if (d.correct && d.interval && d.expected) {
        const key = d.expected.toLowerCase();
        if (leftKeys.includes(key)) {
          leftTotal += d.interval;
          leftCount++;
        } else if (rightKeys.includes(key)) {
          rightTotal += d.interval;
          rightCount++;
        }
      }
    });

    const leftAvg = leftCount > 0 ? leftTotal / leftCount : avgInterval;
    const rightAvg = rightCount > 0 ? rightTotal / rightCount : avgInterval;
    const handBalance =
      leftAvg > 0 && rightAvg > 0
        ? STAT_ROUND.handBalance((rightAvg / leftAvg) * 100 - 100)
        : 0;

    let dominantHand = "balanced";
    if (handBalance > 15) dominantHand = "left faster";
    else if (handBalance < -15) dominantHand = "right faster";

    // --- Home row affinity ---
    const homeRow = "asdfghjkl;'";
    let homeTotal = 0,
      homeCount = 0;
    data.forEach((d) => {
      if (d.correct && d.interval && d.expected) {
        if (homeRow.includes(d.expected.toLowerCase())) {
          homeTotal += d.interval;
          homeCount++;
        }
      }
    });
    const homeRowAvg = homeCount > 0 ? homeTotal / homeCount : avgInterval;
    const homeRowAdvantage =
      avgInterval > 0
        ? STAT_ROUND.homeRowAdvantage((1 - homeRowAvg / avgInterval) * 100)
        : 0;

    // --- Number row comfort ---
    const numberRow = "1234567890";
    let numTotal = 0,
      numCount = 0;
    data.forEach((d) => {
      if (d.correct && d.interval && d.expected) {
        if (numberRow.includes(d.expected)) {
          numTotal += d.interval;
          numCount++;
        }
      }
    });
    const numberRowAvg = numCount > 0 ? numTotal / numCount : avgInterval;
    const numberRowPenalty =
      avgInterval > 0 ? Math.round((numberRowAvg / avgInterval - 1) * 100) : 0;

    // --- Speed variance analysis ---
    const speedVariance = stdDev / avgInterval;
    let speedProfile = "steady";
    if (speedVariance < 0.3) speedProfile = "metronome";
    else if (speedVariance < 0.5) speedProfile = "consistent";
    else if (speedVariance < 0.7) speedProfile = "variable";
    else speedProfile = "erratic";

    // --- Generate typing archetype ---
    let archetype = "The Typist";
    let archetypeDesc = "";

    // Determine primary archetype based on key characteristics
    if (rhythmScore > 70 && consistency > 70) {
      archetype = "The Metronome";
      archetypeDesc = "Steady, rhythmic, predictable timing";
    } else if (avgMomentum < 1 && accuracy > 95) {
      archetype = "The Surgeon";
      archetypeDesc = "Precise, careful, catches every error instantly";
    } else if (avgMomentum > 4 && wpm > 60) {
      archetype = "The Steamroller";
      archetypeDesc = "Powers through mistakes, prioritizes speed";
    } else if (maxBurst > 15 && flowRatio > 60) {
      archetype = "The Sprinter";
      archetypeDesc = "Explosive bursts of speed, then regroups";
    } else if (fatiguePercent < -10) {
      archetype = "The Slow Starter";
      archetypeDesc = "Warms up over time, finishes strong";
    } else if (fatiguePercent > 15) {
      archetype = "The Fader";
      archetypeDesc = "Strong start, loses steam as they go";
    } else if (hesitationCount > charCount / 50) {
      archetype = "The Thinker";
      archetypeDesc = "Pauses to consider, deliberate approach";
    } else if (flowRatio > 70 && consistency > 60) {
      archetype = "The Flow State";
      archetypeDesc = "Locked in, consistent rhythm, in the zone";
    } else if (recoveryPenalty > 90) {
      archetype = "The Rattled";
      archetypeDesc = "Errors throw off their groove";
    } else if (recoveryPenalty < 60 && errorCount > 0) {
      archetype = "The Unfazed";
      archetypeDesc = "Errors don't break their stride";
    } else if (wpm > 80) {
      archetype = "The Speedster";
      archetypeDesc = "Raw speed is the name of the game";
    } else if (accuracy > 98) {
      archetype = "The Perfectionist";
      archetypeDesc = "Accuracy above all else";
    }

    // --- Confidence score (composite metric) ---
    const confidenceScore = Math.round(
      flowRatio * 0.3 +
        rhythmScore * 0.2 +
        accuracy * 0.3 +
        (100 - Math.min(recoveryPenalty, 100)) * 0.2
    );

    // ============ END BEHAVIORAL STATS ============

    // Word intervals (time from space to space)
    const wordIntervals = [];
    let lastSpaceTime = null;
    data.forEach((d, i) => {
      if (d.expected === " " && d.timestamp !== undefined) {
        if (lastSpaceTime !== null) {
          wordIntervals.push(d.timestamp - lastSpaceTime);
        }
        lastSpaceTime = d.timestamp;
      }
    });

    const avgWordInterval =
      wordIntervals.length > 0
        ? wordIntervals.reduce((a, b) => a + b, 0) / wordIntervals.length
        : 0;

    // Keyboard distances - only track CORRECT consecutive keystrokes
    const distances = [];
    const bigramsWithDistance = [];

    // Track bigram accuracy (correct vs total for each bigram)
    const bigramAccuracyMap = {};

    // Build list of correct keystrokes only for speed/distance
    // Only count bigrams where BOTH keystrokes are consecutive AND correct
    // (no errors or corrections between them)
    for (let i = 1; i < data.length; i++) {
      const prev = data[i - 1];
      const curr = data[i];

      // Both must be correct for a valid bigram timing
      if (!prev.correct || !curr.correct) continue;

      if (curr.interval && curr.expected && prev.expected) {
        // Skip same-character transitions (not meaningful for speed)
        if (curr.expected.toLowerCase() === prev.expected.toLowerCase())
          continue;

        const distance = getKeyDistance(prev.expected, curr.expected);
        if (distance !== null) {
          distances.push(distance);
          bigramsWithDistance.push({
            bigram: prev.expected + curr.expected,
            interval: curr.interval,
            distance,
          });
        }
      }
    }

    // Track all bigrams (including errors) for accuracy mode
    for (let i = 1; i < data.length; i++) {
      const prev = data[i - 1];
      const curr = data[i];

      // Skip same-character bigrams (case-insensitive)
      if (
        curr.expected &&
        prev.expected &&
        prev.expected.toLowerCase() !== curr.expected.toLowerCase()
      ) {
        const bigram = (prev.expected + curr.expected).toLowerCase();
        if (!bigramAccuracyMap[bigram]) {
          bigramAccuracyMap[bigram] = {
            correct: 0,
            total: 0,
            distance: getKeyDistance(prev.expected, curr.expected),
          };
        }
        bigramAccuracyMap[bigram].total++;
        // Bigram is correct if BOTH characters were typed correctly
        if (prev.correct && curr.correct) {
          bigramAccuracyMap[bigram].correct++;
        }
      }
    }

    const avgDistance =
      distances.length > 0
        ? distances.reduce((a, b) => a + b, 0) / distances.length
        : 0;

    // Per-key statistics for heatmap (preserve case for capitals)
    const keyStats = {};
    data.forEach((d) => {
      if (d.expected && d.interval) {
        const key = d.expected; // Preserve original case
        if (!keyStats[key]) {
          keyStats[key] = { times: [], count: 0, correct: 0, errors: 0 };
        }
        keyStats[key].count++;
        if (d.correct) {
          keyStats[key].times.push(d.interval);
          keyStats[key].correct++;
        } else {
          keyStats[key].errors++;
        }
      }
    });

    // Calculate averages and accuracy per key
    Object.keys(keyStats).forEach((key) => {
      const times = keyStats[key].times;
      keyStats[key].avgInterval =
        times.length > 0 ? times.reduce((a, b) => a + b, 0) / times.length : 0;
      keyStats[key].accuracy =
        keyStats[key].count > 0
          ? keyStats[key].correct / keyStats[key].count
          : 1;
    });

    // Finger statistics
    const fingerStats = {};
    const fingerOrder = [
      "L-pinky",
      "L-ring",
      "L-middle",
      "L-index",
      "R-index",
      "R-middle",
      "R-ring",
      "R-pinky",
      "thumb",
    ];
    fingerOrder.forEach((f) => {
      fingerStats[f] = { times: [], correct: 0, total: 0 };
    });

    // Track finger-to-finger transitions
    const fingerTransitions = {};
    let prevFinger = null;
    let prevWasCorrect = false;

    data.forEach((d) => {
      if (d.expected) {
        const finger =
          FINGER_MAP[d.expected.toLowerCase()] || FINGER_MAP[d.expected];
        if (finger && fingerStats[finger]) {
          fingerStats[finger].total++;
          if (d.correct) {
            fingerStats[finger].correct++;
            if (d.interval) fingerStats[finger].times.push(d.interval);

            // Track transition from previous finger ONLY if previous was also correct
            // This ensures we're measuring real consecutive transitions, not corrections
            if (
              prevFinger &&
              prevWasCorrect &&
              d.interval &&
              prevFinger !== finger
            ) {
              const key = `${prevFinger}->${finger}`;
              if (!fingerTransitions[key]) {
                fingerTransitions[key] = {
                  times: [],
                  from: prevFinger,
                  to: finger,
                };
              }
              fingerTransitions[key].times.push(d.interval);
            }
            prevFinger = finger;
            prevWasCorrect = true;
          } else {
            // Reset on error - next correct keystroke won't form a valid transition
            prevWasCorrect = false;
          }
        }
      }
    });

    // Calculate average transition times
    Object.keys(fingerTransitions).forEach((key) => {
      const t = fingerTransitions[key];
      t.avg =
        t.times.length > 0
          ? Math.round(t.times.reduce((a, b) => a + b, 0) / t.times.length)
          : 0;
      t.count = t.times.length;
    });

    Object.keys(fingerStats).forEach((f) => {
      const times = fingerStats[f].times;
      fingerStats[f].avgInterval =
        times.length > 0
          ? Math.round(times.reduce((a, b) => a + b, 0) / times.length)
          : 0;
      fingerStats[f].accuracy =
        fingerStats[f].total > 0
          ? Math.round((fingerStats[f].correct / fingerStats[f].total) * 100)
          : 100;
    });

    // Aggregate bigrams
    const bigramMap = {};
    bigramsWithDistance.forEach(({ bigram, interval, distance }) => {
      if (!bigramMap[bigram]) {
        bigramMap[bigram] = { times: [], distance };
      }
      bigramMap[bigram].times.push(interval);
    });

    const bigramAvgs = Object.entries(bigramMap).map(([bigram, data]) => {
      const lowerBigram = bigram.toLowerCase();
      const accuracyData = bigramAccuracyMap[lowerBigram];
      return {
        bigram,
        avg: data.times.reduce((a, b) => a + b, 0) / data.times.length,
        count: data.times.length,
        distance: data.distance,
        accuracy: accuracyData ? accuracyData.correct / accuracyData.total : 1,
        errors: accuracyData ? accuracyData.total - accuracyData.correct : 0,
      };
    });

    const slowestBigrams = [...bigramAvgs]
      .sort((a, b) => b.avg - a.avg)
      .slice(0, 5);
    const fastestBigrams = [...bigramAvgs]
      .sort((a, b) => a.avg - b.avg)
      .slice(0, 5);

    // Accuracy-sorted bigrams for accuracy mode
    const mostAccurateBigrams = [...bigramAvgs]
      .filter((b) => b.count >= 2)
      .sort((a, b) => b.accuracy - a.accuracy)
      .slice(0, 5);
    const leastAccurateBigrams = [...bigramAvgs]
      .filter((b) => b.count >= 2 && b.errors > 0)
      .sort((a, b) => a.accuracy - b.accuracy)
      .slice(0, 5);

    // Impressive bigrams: fast relative to distance
    const medianInterval =
      intervals.length > 0
        ? [...intervals].sort((a, b) => a - b)[Math.floor(intervals.length / 2)]
        : 100;

    const impressiveBigrams = bigramAvgs
      .filter((b) => b.distance > 3 && b.avg < medianInterval)
      .sort((a, b) => b.distance / b.avg - a.distance / a.avg)
      .slice(0, 5);

    // Speed over time
    const windowSize = 20;
    const speedOverTime = [];
    for (let i = windowSize; i < intervals.length; i++) {
      const window = intervals.slice(i - windowSize, i);
      const avgMs = window.reduce((a, b) => a + b, 0) / window.length;
      speedOverTime.push(avgMs > 0 ? 1000 / avgMs : 0);
    }

    // Percentiles
    const sortedIntervals = [...intervals].sort((a, b) => a - b);
    const p50 = sortedIntervals[Math.floor(sortedIntervals.length * 0.5)] || 0;
    const p90 = sortedIntervals[Math.floor(sortedIntervals.length * 0.9)] || 0;
    const p99 = sortedIntervals[Math.floor(sortedIntervals.length * 0.99)] || 0;
    const fastest = sortedIntervals[0] || 0;

    return {
      wpm: STAT_ROUND.wpm(wpm),
      cpm,
      accuracy: STAT_ROUND.accuracy(accuracy),
      avgInterval: STAT_ROUND.avgInterval(avgInterval),
      stdDev: STAT_ROUND.stdDev(stdDev),
      consistency,
      slowestBigrams,
      fastestBigrams,
      mostAccurateBigrams,
      leastAccurateBigrams,
      impressiveBigrams,
      totalTime: STAT_ROUND.time(totalTime / 1000),
      charCount,
      errorCount,
      intervals,
      speedOverTime,
      percentiles: {
        p50: Math.round(p50),
        p90: Math.round(p90),
        p99: Math.round(p99),
        fastest: Math.round(fastest),
      },
      wordIntervals,
      avgWordInterval: Math.round(avgWordInterval),
      distances,
      avgDistance: STAT_ROUND.distance(avgDistance),
      bigrams: bigramAvgs,
      // Counts
      counts: {
        words: wordIntervals.length + 1,
        correctWords:
          data.filter((d, i) => {
            // A word is correct if all chars up to the next space are correct
            if (d.expected !== " ") return false;
            let wordStart = i - 1;
            while (wordStart >= 0 && data[wordStart].expected !== " ")
              wordStart--;
            wordStart++;
            return data.slice(wordStart, i).every((k) => k.correct);
          }).length +
          (data.length > 0 && data[data.length - 1].correct ? 1 : 0),
        letters: data.filter((d) => d.expected && /[a-zA-Z]/.test(d.expected))
          .length,
        correctLetters: data.filter(
          (d) => d.correct && d.expected && /[a-zA-Z]/.test(d.expected)
        ).length,
        numbers: data.filter((d) => d.expected && /[0-9]/.test(d.expected))
          .length,
        correctNumbers: data.filter(
          (d) => d.correct && d.expected && /[0-9]/.test(d.expected)
        ).length,
        punctuation: data.filter(
          (d) => d.expected && /[.,;:!?'"()\-]/.test(d.expected)
        ).length,
        correctPunctuation: data.filter(
          (d) => d.correct && d.expected && /[.,;:!?'"()\-]/.test(d.expected)
        ).length,
        capitals: data.filter(
          (d) =>
            d.expected &&
            d.expected === d.expected.toUpperCase() &&
            d.expected !== d.expected.toLowerCase()
        ).length,
        correctCapitals: data.filter(
          (d) =>
            d.correct &&
            d.expected &&
            d.expected === d.expected.toUpperCase() &&
            d.expected !== d.expected.toLowerCase()
        ).length,
        spaces: data.filter((d) => d.expected === " ").length,
        correctSpaces: data.filter((d) => d.correct && d.expected === " ")
          .length,
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
      fingerStats,
      fingerTransitions,
    };
  }, []);

  // Track raw key events for momentum calculation
  const [rawKeyEvents, setRawKeyEvents] = useState([]);

  const handleKeyDown = useCallback(
    (e) => {
      // Block typing during race lobby/countdown
      if (isInRace && (raceState.status === 'waiting' || raceState.status === 'countdown' || raceState.status === 'connecting')) {
        // Only allow Escape to potentially leave
        if (e.key !== 'Escape') {
          return;
        }
      }

      // If viewing past stats, Shift+Enter dismisses and scrolls to top to resume typing
      if (viewingPastStats) {
        if (e.key === "Enter" && e.shiftKey) {
          e.preventDefault();
          setViewingPastStats(false);
          setIsComplete(false);
          setStatsView("current");
          // Scroll to top smoothly
          window.scrollTo({ top: 0, behavior: "smooth" });
        }
        return;
      }

      if (isComplete) {
        // Shift+Enter to restart
        if (e.key === "Enter" && e.shiftKey) {
          e.preventDefault();
          resetTest();
        }
        return;
      }

      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (["Shift", "CapsLock", "Tab", "Escape"].includes(e.key)) return;

      e.preventDefault();

      const now = performance.now();

      if (!isActive) {
        setIsActive(true);
        startTime.current = now;
      }

      // Track ALL key events including backspaces for momentum analysis
      const rawEvent = {
        key: e.key,
        timestamp: now - (startTime.current || now),
        isBackspace: e.key === "Backspace",
      };
      setRawKeyEvents((prev) => [...prev, rawEvent]);

      if (e.key === "Backspace") {
        // Add backspace to keystrokeData so it gets submitted to Supabase
        const backspaceKeystroke = {
          key: "Backspace",
          expected: null,
          correct: false,
          interval:
            lastKeystrokeTime.current !== null
              ? now - lastKeystrokeTime.current
              : null,
          timestamp: now - startTime.current,
          position: typed.length,
          isBackspace: true,
        };
        setKeystrokeData((prev) => [...prev, backspaceKeystroke]);
        lastKeystrokeTime.current = now;
        setTyped((prev) => prev.slice(0, -1));
        return;
      }

      if (e.key.length !== 1) return;

      const expectedChar = currentText[typed.length];
      const isCorrect = e.key === expectedChar;
      const interval =
        lastKeystrokeTime.current !== null
          ? now - lastKeystrokeTime.current
          : null;

      lastKeystrokeTime.current = now;

      const keystroke = {
        key: e.key,
        expected: expectedChar,
        correct: isCorrect,
        interval,
        timestamp: now - startTime.current,
        position: typed.length,
      };

      setKeystrokeData((prev) => [...prev, keystroke]);
      setTyped((prev) => prev + e.key);

      // Update race progress if in a race
      if (isInRace && raceState.status === "racing") {
        const newTypedLength = typed.length + 1;
        const progress = (newTypedLength / currentText.length) * 100;
        const elapsedMinutes = (now - startTime.current) / 60000;
        const correctChars = keystrokeData.filter((k) => k.correct && !k.isBackspace).length + (isCorrect ? 1 : 0);
        const totalChars = keystrokeData.filter((k) => !k.isBackspace).length + 1;
        const currentWpm = elapsedMinutes > 0 ? (correctChars / 5) / elapsedMinutes : 0;
        const currentAccuracy = totalChars > 0 ? (correctChars / totalChars) * 100 : 100;
        updateRaceProgress(progress, currentWpm, currentAccuracy);
      }

      // Check completion
      if (typed.length + 1 === currentText.length) {
        const totalTime = now - startTime.current;
        const allRawEvents = [...rawKeyEvents, rawEvent];
        const finalStats = calculateStats(
          [...keystrokeData, keystroke],
          totalTime,
          allRawEvents
        );
        setIsComplete(true);
        setStats(finalStats);

        // Finish race if in a race
        if (isInRace && raceState.status === "racing" && raceState.raceStartTime) {
          const raceTime = Date.now() - raceState.raceStartTime;
          finishRace(finalStats.wpm, finalStats.accuracy, raceTime);
        }

        // Scroll to show complete hint after a brief delay
        setTimeout(() => {
          const completeHint = document.querySelector(
            ".complete-hint-container"
          );
          if (completeHint) {
            completeHint.scrollIntoView({
              behavior: "smooth",
              block: "center",
            });
          }
        }, 100);

        // Save to history
        const newCompleted = [...completedIndices, currentIndex];
        setCompletedIndices(newCompleted);
        setCompletedCount(newCompleted.length);
        saveToStorage(STORAGE_KEYS.COMPLETED, newCompleted);

        // Save stats to history
        const history = loadFromStorage(STORAGE_KEYS.HISTORY, []);
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
          fingerStats: finalStats.fingerStats,
          fingerTransitions: finalStats.fingerTransitions,
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
          },
        };
        const newHistory = [...history, historyEntry];
        saveToStorage(STORAGE_KEYS.HISTORY, newHistory);

        // Update histograms with new session data
        let newHistograms = loadFromStorage(STORAGE_KEYS.HISTOGRAMS, {});
        newHistograms = updateHistogram(newHistograms, "wpm", finalStats.wpm);
        newHistograms = updateHistogram(
          newHistograms,
          "accuracy",
          finalStats.accuracy
        );
        newHistograms = updateHistogram(
          newHistograms,
          "consistency",
          finalStats.consistency
        );
        newHistograms = updateHistogram(
          newHistograms,
          "avgInterval",
          finalStats.avgInterval
        );
        // Behavioral histograms - flowRatio and rhythmScore are already 0-100
        if (finalStats.behavioral) {
          newHistograms = updateHistogram(
            newHistograms,
            "flowRatio",
            finalStats.behavioral.flowRatio
          );
          newHistograms = updateHistogram(
            newHistograms,
            "rhythmScore",
            finalStats.behavioral.rhythmScore
          );
          newHistograms = updateHistogram(
            newHistograms,
            "handBalance",
            Math.round(finalStats.behavioral.handBalance)
          );
          newHistograms = updateHistogram(
            newHistograms,
            "homeRowAdvantage",
            Math.round(finalStats.behavioral.homeRowAdvantage)
          );
        }
        saveToStorage(STORAGE_KEYS.HISTOGRAMS, newHistograms);
        setHistograms(newHistograms);

        // Submit to Supabase - only keystrokes needed!
        // The database trigger derives everything else
        submitToSupabase({
          sentenceId: currentIndex,
          keystrokes: [...keystrokeData, keystroke],
        });

        // Update cumulative stats
        setCumulativeStats(calculateCumulativeStats(newHistory));
      }
    },
    [
      isActive,
      isComplete,
      viewingPastStats,
      typed,
      currentText,
      currentIndex,
      keystrokeData,
      rawKeyEvents,
      calculateStats,
      resetTest,
      completedIndices,
      isInRace,
      raceState.status,
    ]
  );

  const renderText = () => {
    return currentText.split("").map((char, i) => {
      let className = "char";

      if (i < typed.length) {
        className += typed[i] === char ? " correct" : " incorrect";
      } else if (i === typed.length) {
        className += " current";
      } else {
        className += " pending";
      }

      if (char === " ") {
        className += " space";
      }

      return (
        <span key={i} className={className}>
          {char}
        </span>
      );
    });
  };

  const formatBigram = (bigram) => {
    const char1 = bigram[0] === " " ? "␣" : bigram[0];
    const char2 = bigram[1] === " " ? "␣" : bigram[1];
    return `${char1} → ${char2}`;
  };

  // Get comparison baseline based on user selection
  const getComparisonBase = () => {
    // "none" means no comparison
    if (comparisonBase === "none") {
      return null;
    }
    // Don't compare to self - if viewing "This Paragraph" and comparison is "current", return null
    if (statsView === "current" && comparisonBase === "current") {
      return null;
    }
    // Don't compare to self - if viewing "All Time" and comparison is "alltime", return null
    if (statsView === "alltime" && comparisonBase === "alltime") {
      return null;
    }
    // Don't compare to self - if viewing "Global" and comparison is "global", return null
    if (statsView === "global" && comparisonBase === "global") {
      return null;
    }
    if (
      comparisonBase === "global" &&
      globalAverages &&
      globalAverages.total_sessions > 0
    ) {
      return {
        wpm: STAT_ROUND.wpm(globalAverages.avg_wpm),
        accuracy: STAT_ROUND.accuracy(globalAverages.avg_accuracy),
        consistency: STAT_ROUND.consistency(globalAverages.avg_consistency),
        avgInterval: STAT_ROUND.avgInterval(globalAverages.avg_interval),
        sessions: globalAverages.total_sessions,
        label: "global",
      };
    }
    if (
      comparisonBase === "alltime" &&
      cumulativeStats &&
      cumulativeStats.sessions > 0
    ) {
      return {
        wpm: cumulativeStats.wpm,
        accuracy: cumulativeStats.accuracy,
        consistency: cumulativeStats.consistency,
        avgInterval: cumulativeStats.avgInterval,
        avgErrors: cumulativeStats.avgErrors,
        sessions: cumulativeStats.sessions,
        label: "your avg",
      };
    }
    if (comparisonBase === "current" && stats) {
      return {
        wpm: stats.wpm,
        accuracy: stats.accuracy,
        consistency: stats.consistency,
        avgInterval: stats.avgInterval,
        avgErrors: stats.errorCount,
        sessions: 1,
        label: "this paragraph",
      };
    }
    return null;
  };

  const compBase = getComparisonBase();

  const clearHistory = () => {
    resetTest(true);
    setCumulativeStats(null);
    setCompletedCount(0);
    setViewingPastStats(false);
    setStatsView("current");
    // Generate new anonymous user ID
    resetUserId();
    // Scroll to top and focus after state updates
    window.scrollTo({ top: 0, behavior: "instant" });
    // Ensure focus after React re-renders
    setTimeout(() => {
      containerRef.current?.focus();
    }, 50);
  };

  const startClearHold = () => {
    setClearHoldProgress(0);
    clearHoldInterval.current = setInterval(() => {
      setClearHoldProgress((prev) => {
        if (prev >= 100) {
          clearInterval(clearHoldInterval.current);
          clearHistory();
          return 0;
        }
        return prev + 5; // 20 steps over ~1 second
      });
    }, 50);
  };

  const cancelClearHold = () => {
    if (clearHoldInterval.current) {
      clearInterval(clearHoldInterval.current);
    }
    setClearHoldProgress(0);
  };

  // If viewing shared results, show that instead
  if (sharedResultsData) {
    return (
      <div className="app-wrapper shared-results-wrapper">
        <SharedResultsView 
          encoded={sharedResultsData}
          onGoToApp={() => {
            setSharedResultsData(null);
            window.history.pushState({}, "", window.location.pathname);
          }}
        />
      </div>
    );
  }

  return (
    <div className="app-wrapper" onClick={() => containerRef.current?.focus()}>
      <div
        className="container"
        ref={containerRef}
        tabIndex={0}
        onKeyDown={handleKeyDown}
      >
        {/* Stats icon button - positioned absolutely */}
        {!isActive &&
          !isComplete &&
          ((cumulativeStats && cumulativeStats.sessions > 0) ||
            (globalAverages && globalAverages.total_sessions > 0)) && (
            <button
              className="stats-icon-btn"
              onClick={() => {
                setViewingPastStats(true);
                setIsComplete(true);
                // Show alltime if user has local stats, otherwise show global
                if (cumulativeStats && cumulativeStats.sessions > 0) {
                  setStatsView("alltime");
                  setComparisonBase("none"); // No comparison by default
                } else {
                  setStatsView("global");
                  setComparisonBase("alltime"); // vs My Average
                }
              }}
              title="View stats"
            >
              <GraphIcon />
            </button>
          )}

        <header>
          <h1>
            <a
              href="/typometry/"
              style={{ color: "inherit", textDecoration: "none" }}
            >
              typometry
            </a>
          </h1>
          <p className="tagline">absurdly detailed stats about how you type</p>
          <p className="attribution">
            inspired by{" "}
            <a
              href="https://monkeytype.com"
              target="_blank"
              rel="noopener noreferrer"
            >
              monkeytype
            </a>
          </p>
          {/* <p className="progress">
          {completedCount} / {totalParagraphs} paragraphs completed
        </p> */}
        </header>

        <main className="typing-area">
          <div className={`text-display ${viewingPastStats ? "locked" : ""} ${isInRace && raceState.status === 'waiting' ? "race-blur" : ""}`}>
            <div className="text-content">{renderText()}</div>
            {viewingPastStats && (
              <div className="text-lock-overlay">
                <div className="lock-icon">
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </div>
                <span className="lock-hint">shift+enter to resume</span>
              </div>
            )}
            {isInRace && raceState.status === 'waiting' && (
              <div className="text-lock-overlay">
                <span className="lock-hint">waiting for race to start...</span>
              </div>
            )}
          </div>

          <div className="typing-hint-container">
            <p
              className="hint"
              style={{
                visibility:
                  !isActive && !isComplete && !viewingPastStats
                    ? "visible"
                    : "hidden",
              }}
            >
              start typing...
            </p>
            {isActive && !isComplete && (
              <div className="live-stats">
                <span>
                  {typed.length} / {currentText.length}
                </span>
              </div>
            )}
          </div>
          {isComplete && (
            <div
              className={`complete-hint-container ${
                showFixedHint ? "faded" : ""
              }`}
              ref={completeHintRef}
            >
              <p className="complete-hint">
                {viewingPastStats ? (
                  <>
                    <kbd>shift</kbd>+<kbd>enter</kbd> to resume
                  </>
                ) : (
                  <>
                    <span className="checkmark">✓</span> complete ·{" "}
                    <kbd>shift</kbd>+<kbd>enter</kbd> for next
                  </>
                )}
              </p>
            </div>
          )}
        </main>

        {/* Fixed floating hint when scrolled past the main hint */}
        {isComplete && (
          <div className={`fixed-hint ${showFixedHint ? "visible" : ""}`}>
            {viewingPastStats ? (
              <>
                <kbd>shift</kbd>+<kbd>enter</kbd> to resume
              </>
            ) : (
              <>
                <kbd>shift</kbd>+<kbd>enter</kbd> for next
              </>
            )}
          </div>
        )}

        {(isComplete && stats) ||
        (isComplete && statsView === "alltime" && cumulativeStats) ||
        (isComplete && statsView === "global" && globalAverages) ? (
          <section className="stats">
            {/* Stats View Toggle - shows in different configurations based on available data */}
            {(() => {
              const hasCurrentStats = !!stats;
              const hasAllTimeStats =
                cumulativeStats && cumulativeStats.sessions > 0;
              const hasGlobalStats =
                globalAverages && globalAverages.total_sessions > 0;
              const showTabs =
                (hasCurrentStats && hasAllTimeStats) ||
                (hasAllTimeStats && hasGlobalStats) ||
                (hasCurrentStats && hasGlobalStats);

              // Global-only view (no local stats)
              if (
                !hasCurrentStats &&
                !hasAllTimeStats &&
                hasGlobalStats &&
                statsView === "global"
              ) {
                return (
                  <div className="stats-header global-only">
                    <h3 className="global-title">
                      Global Statistics (
                      {fmt.count(globalAverages.total_sessions)} sessions)
                    </h3>
                  </div>
                );
              }

              // All-time only view (clicked stats button without current paragraph)
              if (
                !hasCurrentStats &&
                hasAllTimeStats &&
                statsView === "alltime"
              ) {
                return (
                  <div className="stats-header alltime-only">
                    <div className="stats-toggle">
                      <button className="toggle-btn active">
                        All Time ({cumulativeStats.sessions})
                      </button>
                      {hasGlobalStats && (
                        <button
                          className="toggle-btn"
                          onClick={() => {
                            setStatsView("global");
                            setComparisonBase("alltime"); // Reset to "vs My Average"
                          }}
                        >
                          Global ({fmt.count(globalAverages.total_sessions)})
                        </button>
                      )}
                    </div>
                    <div className="stats-header-right">
                      {hasGlobalStats && (
                        <ComparisonDropdown
                          value={comparisonBase}
                          onChange={setComparisonBase}
                          options={[
                            { value: "none", label: "No Comparison" },
                            { value: "global", label: "vs Global Avg" },
                          ]}
                        />
                      )}
                      <button
                        className="history-btn"
                        onClick={() => setShowHistory(true)}
                        title="View session history"
                      >
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <circle cx="12" cy="12" r="10" />
                          <polyline points="12 6 12 12 16 14" />
                        </svg>
                        History
                      </button>
                    </div>
                  </div>
                );
              }

              // Global view without current stats but with alltime
              if (
                !hasCurrentStats &&
                hasAllTimeStats &&
                hasGlobalStats &&
                statsView === "global"
              ) {
                return (
                  <div className="stats-header">
                    <div className="stats-toggle">
                      <button
                        className="toggle-btn"
                        onClick={() => setStatsView("alltime")}
                      >
                        All Time ({cumulativeStats.sessions})
                      </button>
                      <button className="toggle-btn active">
                        Global ({fmt.count(globalAverages.total_sessions)})
                      </button>
                    </div>
                    <div className="stats-header-right">
                      <ComparisonDropdown
                        value={comparisonBase}
                        onChange={setComparisonBase}
                        options={[
                          { value: "none", label: "No Comparison" },
                          { value: "alltime", label: "vs My Average" },
                        ]}
                      />
                      <button
                        className="history-btn"
                        onClick={() => setShowHistory(true)}
                        title="View session history"
                      >
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <circle cx="12" cy="12" r="10" />
                          <polyline points="12 6 12 12 16 14" />
                        </svg>
                        History
                      </button>
                    </div>
                  </div>
                );
              }

              // Full view with all tabs
              if (showTabs && hasCurrentStats) {
                return (
                  <div className="stats-header">
                    <div className="stats-toggle">
                      <button
                        className={`toggle-btn ${
                          statsView === "current" ? "active" : ""
                        }`}
                        onClick={() => {
                          setStatsView("current");
                          // Reset comparison if "vs This Paragraph" was selected (would compare to self)
                          if (comparisonBase === "current") {
                            setComparisonBase("none");
                          }
                        }}
                      >
                        This Paragraph
                      </button>
                      {hasAllTimeStats && (
                        <button
                          className={`toggle-btn ${
                            statsView === "alltime" ? "active" : ""
                          }`}
                          onClick={() => {
                            setStatsView("alltime");
                            // Reset comparison if "vs My Average" was selected (would compare to self)
                            if (comparisonBase === "alltime") {
                              setComparisonBase("none");
                            }
                          }}
                        >
                          All Time ({cumulativeStats.sessions})
                        </button>
                      )}
                      {hasGlobalStats && (
                        <button
                          className={`toggle-btn ${
                            statsView === "global" ? "active" : ""
                          }`}
                          onClick={() => {
                            setStatsView("global");
                            // Reset comparison if "vs Global" was selected (would compare to self)
                            if (comparisonBase === "global") {
                              setComparisonBase("none");
                            }
                          }}
                        >
                          Global ({fmt.count(globalAverages.total_sessions)})
                        </button>
                      )}
                      {hasRaceStats && (
                        <button
                          className={`toggle-btn ${
                            statsView === "race" ? "active" : ""
                          }`}
                          onClick={() => setStatsView("race")}
                        >
                          race
                        </button>
                      )}
                    </div>
                    <div className="stats-header-right">
                      {(hasGlobalStats || hasAllTimeStats) && (
                        <ComparisonDropdown
                          value={comparisonBase}
                          onChange={setComparisonBase}
                          options={
                            statsView === "global"
                              ? [
                                  { value: "none", label: "No Comparison" },
                                  ...(hasAllTimeStats
                                    ? [
                                        {
                                          value: "alltime",
                                          label: "vs My Average",
                                        },
                                      ]
                                    : []),
                                  {
                                    value: "current",
                                    label: "vs This Paragraph",
                                  },
                                ]
                              : statsView === "alltime"
                              ? [
                                  { value: "none", label: "No Comparison" },
                                  ...(hasGlobalStats
                                    ? [
                                        {
                                          value: "global",
                                          label: "vs Global Avg",
                                        },
                                      ]
                                    : []),
                                  {
                                    value: "current",
                                    label: "vs This Paragraph",
                                  },
                                ]
                              : [
                                  { value: "none", label: "No Comparison" },
                                  ...(hasGlobalStats
                                    ? [
                                        {
                                          value: "global",
                                          label: "vs Global Avg",
                                        },
                                      ]
                                    : []),
                                  ...(hasAllTimeStats
                                    ? [
                                        {
                                          value: "alltime",
                                          label: "vs My Average",
                                        },
                                      ]
                                    : []),
                                ]
                          }
                        />
                      )}
                      <button
                        className="history-btn"
                        onClick={() => setShowHistory(true)}
                        title="View session history"
                      >
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <circle cx="12" cy="12" r="10" />
                          <polyline points="12 6 12 12 16 14" />
                        </svg>
                        History
                      </button>
                    </div>
                  </div>
                );
              }

              return null;
            })()}

            {statsView === "current" && stats ? (
              <>
                {/* Current paragraph stats */}
                <div className="stat-grid primary">
                  <Tooltip content={TIPS.wpm}>
                    <div className="stat">
                      <span className="stat-value">
                        {stats.wpm}
                        {compBase && (
                          <span
                            className={`stat-delta ${
                              stats.wpm >= compBase.wpm
                                ? "positive"
                                : "negative"
                            }`}
                            title={`vs ${compBase.label}`}
                          >
                            {stats.wpm >= compBase.wpm ? "↑" : "↓"}
                            {Math.abs(stats.wpm - compBase.wpm)}
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
                        {compBase && (
                          <span
                            className={`stat-delta ${
                              stats.accuracy >= compBase.accuracy
                                ? "positive"
                                : "negative"
                            }`}
                            title={`vs ${compBase.label}`}
                          >
                            {stats.accuracy >= compBase.accuracy ? "↑" : "↓"}
                            {fmt.dec(
                              Math.abs(stats.accuracy - compBase.accuracy)
                            )}
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
                        {compBase && (
                          <span
                            className={`stat-delta ${
                              stats.consistency >= compBase.consistency
                                ? "positive"
                                : "negative"
                            }`}
                            title={`vs ${compBase.label}`}
                          >
                            {stats.consistency >= compBase.consistency
                              ? "↑"
                              : "↓"}
                            {fmt.dec(
                              Math.abs(stats.consistency - compBase.consistency)
                            )}
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
                        {compBase && (
                          <span
                            className={`stat-delta ${
                              stats.avgInterval <= compBase.avgInterval
                                ? "positive"
                                : "negative"
                            }`}
                            title={`vs ${compBase.label}`}
                          >
                            {stats.avgInterval <= compBase.avgInterval
                              ? "↓"
                              : "↑"}
                            {Math.abs(stats.avgInterval - compBase.avgInterval)}
                          </span>
                        )}
                      </span>
                      <span className="stat-label">avg keystroke</span>
                    </div>
                  </Tooltip>
                  <Tooltip content={TIPS.avgWordTime}>
                    <div className="stat small">
                      <span className="stat-value">
                        {stats.avgWordInterval}ms
                      </span>
                      <span className="stat-label">avg word time</span>
                    </div>
                  </Tooltip>
                  <Tooltip content={TIPS.avgTravel}>
                    <div className="stat small">
                      <span className="stat-value">{stats.avgDistance}</span>
                      <span className="stat-label">
                        avg travel{" "}
                        <span className="label-hint">(keys apart)</span>
                      </span>
                    </div>
                  </Tooltip>
                  <Tooltip content={TIPS.errors}>
                    <div className="stat small">
                      <span className="stat-value">
                        {stats.errorCount}
                        {compBase && compBase.avgErrors !== undefined && (
                          <span
                            className={`stat-delta ${
                              stats.errorCount <= compBase.avgErrors
                                ? "positive"
                                : "negative"
                            }`}
                          >
                            {stats.errorCount <= compBase.avgErrors ? "↓" : "↑"}
                            {fmt.dec(
                              Math.abs(stats.errorCount - compBase.avgErrors)
                            )}
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
                        <span className="count-value">
                          {stats.counts.correctWords || 0}
                        </span>
                        <span className="count-label">words</span>
                        <span className="count-accuracy">
                          {stats.counts.words > 0
                            ? fmt.int(
                                (stats.counts.correctWords /
                                  stats.counts.words) *
                                  100
                              )
                            : 0}
                          % ✓
                        </span>
                      </div>
                      <div className="count-item">
                        <span className="count-value">
                          {stats.counts.correctLetters || 0}
                        </span>
                        <span className="count-label">letters</span>
                        <span className="count-accuracy">
                          {stats.counts.letters > 0
                            ? fmt.int(
                                (stats.counts.correctLetters /
                                  stats.counts.letters) *
                                  100
                              )
                            : 0}
                          % ✓
                        </span>
                      </div>
                      <div className="count-item">
                        <span className="count-value">
                          {stats.counts.correctNumbers || 0}
                        </span>
                        <span className="count-label">numbers</span>
                        <span className="count-accuracy">
                          {stats.counts.numbers > 0
                            ? fmt.int(
                                (stats.counts.correctNumbers /
                                  stats.counts.numbers) *
                                  100
                              )
                            : 0}
                          % ✓
                        </span>
                      </div>
                      <div className="count-item">
                        <span className="count-value">
                          {stats.counts.correctPunctuation || 0}
                        </span>
                        <span className="count-label">punctuation</span>
                        <span className="count-accuracy">
                          {stats.counts.punctuation > 0
                            ? fmt.int(
                                (stats.counts.correctPunctuation /
                                  stats.counts.punctuation) *
                                  100
                              )
                            : 0}
                          % ✓
                        </span>
                      </div>
                      <div className="count-item">
                        <span className="count-value">
                          {stats.counts.correctCapitals || 0}
                        </span>
                        <span className="count-label">capitals</span>
                        <span className="count-accuracy">
                          {stats.counts.capitals > 0
                            ? fmt.int(
                                (stats.counts.correctCapitals /
                                  stats.counts.capitals) *
                                  100
                              )
                            : 0}
                          % ✓
                        </span>
                      </div>
                      <div className="count-item">
                        <span className="count-value">
                          {stats.counts.correctSpaces || 0}
                        </span>
                        <span className="count-label">spaces</span>
                        <span className="count-accuracy">
                          {stats.counts.spaces > 0
                            ? fmt.int(
                                (stats.counts.correctSpaces /
                                  stats.counts.spaces) *
                                  100
                              )
                            : 0}
                          % ✓
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Keyboard Visualizations */}
                <div className="keyboard-section">
                  <div className="keyboard-header">
                    <h3>Keyboard Analysis</h3>
                    <div className="keyboard-header-right">
                      <div className="heatmap-toggle">
                        <button
                          className={`mini-toggle ${
                            heatmapMode === "speed" ? "active" : ""
                          }`}
                          onClick={() => setHeatmapMode("speed")}
                        >
                          Speed
                        </button>
                        <button
                          className={`mini-toggle ${
                            heatmapMode === "accuracy" ? "active" : ""
                          }`}
                          onClick={() => setHeatmapMode("accuracy")}
                        >
                          Accuracy
                        </button>
                      </div>
                      <Tooltip content={TIPS.keyboardHeatmap}>
                        <button
                          className="help-btn"
                          type="button"
                          aria-label="Help"
                        >
                          ?
                        </button>
                      </Tooltip>
                    </div>
                  </div>
                  <KeyboardHeatmap
                    keyStats={stats.keyStats}
                    mode={heatmapMode}
                  />

                  <div className="keyboard-flows">
                    <KeyboardFlowMap
                      topBigrams={
                        heatmapMode === "accuracy"
                          ? stats.mostAccurateBigrams
                          : stats.fastestBigrams
                      }
                      flowType="fast"
                      mode={heatmapMode}
                    />
                    <KeyboardFlowMap
                      topBigrams={
                        heatmapMode === "accuracy"
                          ? stats.leastAccurateBigrams
                          : stats.slowestBigrams
                      }
                      flowType="slow"
                      mode={heatmapMode}
                    />
                  </div>
                </div>

                {/* Finger Performance */}
                {stats.fingerStats && (
                  <FingerHands fingerStats={stats.fingerStats} />
                )}

                {/* Finger Transitions Chord Diagram */}
                {stats.fingerTransitions &&
                  Object.keys(stats.fingerTransitions).length > 0 && (
                    <FingerChordDiagram
                      fingerTransitions={stats.fingerTransitions}
                      fingerStats={stats.fingerStats}
                    />
                  )}

                <div className="graphs-section">
                  <div className="graph-card">
                    <Tooltip content={TIPS.speedOverTime}>
                      <p className="graph-label">speed over time</p>
                    </Tooltip>
                    <Sparkline
                      data={stats.speedOverTime}
                      width={280}
                      height={50}
                    />
                  </div>
                  <div className="graph-card">
                    <Tooltip content={TIPS.intervalDistribution}>
                      <p className="graph-label">interval distribution</p>
                    </Tooltip>
                    <Histogram data={stats.intervals} width={280} height={50} />
                  </div>
                </div>

                <div className="percentiles">
                  <span className="percentile">
                    <span className="percentile-label">fastest</span>
                    <span className="percentile-value">
                      {stats.percentiles.fastest}ms
                    </span>
                  </span>
                  <span className="percentile">
                    <span className="percentile-label">median</span>
                    <span className="percentile-value">
                      {stats.percentiles.p50}ms
                    </span>
                  </span>
                  <span className="percentile">
                    <span className="percentile-label">slow (90%)</span>
                    <span className="percentile-value">
                      {stats.percentiles.p90}ms
                    </span>
                  </span>
                  <span className="percentile">
                    <span className="percentile-label">slowest (99%)</span>
                    <span className="percentile-value">
                      {stats.percentiles.p99}ms
                    </span>
                  </span>
                </div>

                <div className="bigrams-container">
                  <div className="bigrams">
                    <Tooltip content={TIPS.sessionFastestTransitions}>
                      <p className="bigram-label">fastest transitions</p>
                    </Tooltip>
                    <div className="bigram-list">
                      {stats.fastestBigrams.map(
                        ({ bigram, avg, distance }, i) => (
                          <span key={i} className="bigram fast">
                            <code>{formatBigram(bigram)}</code>
                            <span className="bigram-meta">
                              <span className="bigram-time">
                                {fmt.int(avg)}ms
                              </span>
                              {distance && (
                                <span
                                  className="bigram-distance"
                                  title="Physical distance on keyboard"
                                >
                                  {fmt.dec(distance)} keys apart
                                </span>
                              )}
                            </span>
                          </span>
                        )
                      )}
                    </div>
                  </div>
                  <div className="bigrams">
                    <Tooltip content={TIPS.sessionSlowestTransitions}>
                      <p className="bigram-label">slowest transitions</p>
                    </Tooltip>
                    <div className="bigram-list">
                      {stats.slowestBigrams.map(
                        ({ bigram, avg, distance }, i) => (
                          <span key={i} className="bigram slow">
                            <code>{formatBigram(bigram)}</code>
                            <span className="bigram-meta">
                              <span className="bigram-time">
                                {fmt.int(avg)}ms
                              </span>
                              {distance && (
                                <span
                                  className="bigram-distance"
                                  title="Physical distance on keyboard"
                                >
                                  {fmt.dec(distance)} keys apart
                                </span>
                              )}
                            </span>
                          </span>
                        )
                      )}
                    </div>
                  </div>
                </div>

                {stats.impressiveBigrams.length > 0 && (
                  <div className="bigrams impressive-section">
                    <p className="bigram-label">
                      🏆 impressive reaches (fast + far)
                    </p>
                    <div className="bigram-list horizontal">
                      {stats.impressiveBigrams.map(
                        ({ bigram, avg, distance }, i) => (
                          <span key={i} className="bigram impressive">
                            <code>{formatBigram(bigram)}</code>
                            <span className="bigram-meta">
                              <span className="bigram-time">
                                {fmt.int(avg)}ms
                              </span>
                              <span
                                className="bigram-distance"
                                title="Physical distance on keyboard"
                              >
                                {fmt.dec(distance)} keys apart
                              </span>
                            </span>
                          </span>
                        )
                      )}
                    </div>
                  </div>
                )}

                {/* Behavioral Insights */}
                {stats.behavioral && (
                  <div className="behavioral-section">
                    {/* Archetype Header */}
                    <div className="archetype-card">
                      <span className="archetype-name">
                        {stats.behavioral.archetype}
                      </span>
                      <span className="archetype-desc">
                        {stats.behavioral.archetypeDesc}
                      </span>
                      <Tooltip content={TIPS.profileStrength}>
                        <div className="profile-strength">
                          <span className="strength-label">profile match</span>
                          <div className="strength-bar">
                            <div
                              className="strength-fill"
                              style={{
                                width: `${stats.behavioral.confidenceScore}%`,
                              }}
                            />
                          </div>
                          <span className="strength-value">
                            {stats.behavioral.confidenceScore}%
                          </span>
                        </div>
                      </Tooltip>
                    </div>

                    <h3 className="behavioral-header">Typing Profile</h3>

                    <div className="behavioral-grid">
                      <Tooltip
                        content={TIPS.correctionStyle(
                          stats.behavioral.momentumLabel
                        )}
                      >
                        <div className="behavioral-card">
                          <div className="behavioral-main">
                            <span className="behavioral-value">
                              {stats.behavioral.momentumLabel}
                            </span>
                            <span className="behavioral-label">
                              correction style
                            </span>
                          </div>
                          <p className="behavioral-detail">
                            {stats.behavioral.momentum > 0
                              ? `~${stats.behavioral.momentum} chars past errors before fixing`
                              : "Instant corrections"}
                          </p>
                        </div>
                      </Tooltip>

                      <Tooltip content={TIPS.flowState}>
                        <div className="behavioral-card">
                          <div className="behavioral-main">
                            <span className="behavioral-value">
                              {stats.behavioral.flowRatio}%
                            </span>
                            <span className="behavioral-label">flow state</span>
                          </div>
                          <p className="behavioral-detail">
                            keystrokes in rhythm zone
                          </p>
                        </div>
                      </Tooltip>

                      <Tooltip content={TIPS.maxBurst}>
                        <div className="behavioral-card">
                          <div className="behavioral-main">
                            <span className="behavioral-value">
                              {stats.behavioral.maxBurst}
                            </span>
                            <span className="behavioral-label">max burst</span>
                          </div>
                          <p className="behavioral-detail">
                            {stats.behavioral.burstCount} bursts total
                          </p>
                        </div>
                      </Tooltip>

                      <Tooltip
                        content={TIPS.speedProfile(
                          stats.behavioral.speedProfile
                        )}
                      >
                        <div className="behavioral-card">
                          <div className="behavioral-main">
                            <span className="behavioral-value">
                              {stats.behavioral.speedProfile}
                            </span>
                            <span className="behavioral-label">
                              speed profile
                            </span>
                          </div>
                          <p className="behavioral-detail">
                            {stats.behavioral.rhythmScore}% rhythm score
                          </p>
                        </div>
                      </Tooltip>
                    </div>

                    <div className="behavioral-grid">
                      <Tooltip content={TIPS.handBalance}>
                        <div className="behavioral-card">
                          <div className="behavioral-main">
                            <span className="behavioral-value">
                              {stats.behavioral.dominantHand}
                            </span>
                            <span className="behavioral-label">
                              hand balance
                            </span>
                          </div>
                          <p className="behavioral-detail">
                            {Math.abs(stats.behavioral.handBalance)}%{" "}
                            {stats.behavioral.handBalance > 0
                              ? "left"
                              : "right"}{" "}
                            advantage
                          </p>
                        </div>
                      </Tooltip>

                      <Tooltip content={TIPS.homeRow}>
                        <div className="behavioral-card">
                          <div className="behavioral-main">
                            <span className="behavioral-value">
                              {stats.behavioral.homeRowAdvantage > 0 ? "+" : ""}
                              {stats.behavioral.homeRowAdvantage}%
                            </span>
                            <span className="behavioral-label">home row</span>
                          </div>
                          <p className="behavioral-detail">
                            {stats.behavioral.homeRowAdvantage > 0
                              ? "faster"
                              : "slower"}{" "}
                            than average
                          </p>
                        </div>
                      </Tooltip>

                      <Tooltip content={TIPS.numberRow}>
                        <div
                          className={`behavioral-card${
                            stats.counts.numbers < 3 ? " stat-na" : ""
                          }`}
                        >
                          <div className="behavioral-main">
                            <span className="behavioral-value">
                              {stats.counts.numbers < 3
                                ? "n/a"
                                : `${
                                    stats.behavioral.numberRowPenalty > 0
                                      ? "+"
                                      : ""
                                  }${stats.behavioral.numberRowPenalty}%`}
                            </span>
                            <span className="behavioral-label">number row</span>
                          </div>
                          <p className="behavioral-detail">
                            {stats.counts.numbers < 3
                              ? "no numbers typed"
                              : `${
                                  stats.behavioral.numberRowPenalty > 0
                                    ? "slower"
                                    : "faster"
                                } than average`}
                          </p>
                        </div>
                      </Tooltip>

                      <Tooltip
                        content={TIPS.endurance(stats.behavioral.fatigueLabel)}
                      >
                        <div className="behavioral-card">
                          <div className="behavioral-main">
                            <span className="behavioral-value">
                              {stats.behavioral.fatigueLabel}
                            </span>
                            <span className="behavioral-label">endurance</span>
                          </div>
                          <p className="behavioral-detail">
                            {stats.behavioral.fatiguePercent > 0 ? "+" : ""}
                            {stats.behavioral.fatiguePercent}% speed change
                          </p>
                        </div>
                      </Tooltip>
                    </div>

                    <div className="behavioral-details">
                      <Tooltip content={TIPS.capitalPenalty}>
                        <div
                          className={`detail-row${
                            stats.counts.capitals < 3 ? " stat-na" : ""
                          }`}
                        >
                          <span className="detail-label">
                            capital letter penalty
                          </span>
                          <span className="detail-value">
                            <span
                              className={
                                stats.counts.capitals >= 3 &&
                                stats.behavioral.capitalPenalty > 150
                                  ? "text-warn"
                                  : ""
                              }
                            >
                              {stats.counts.capitals < 3
                                ? "n/a"
                                : `${
                                    stats.behavioral.capitalPenalty > 0
                                      ? "+"
                                      : ""
                                  }${stats.behavioral.capitalPenalty}%`}
                            </span>
                            <span className="detail-note">
                              {stats.counts.capitals < 3
                                ? "no capitals typed"
                                : "slower on capitals"}
                            </span>
                          </span>
                        </div>
                      </Tooltip>

                      <Tooltip content={TIPS.punctuationPenalty}>
                        <div
                          className={`detail-row${
                            stats.counts.punctuation < 3 ? " stat-na" : ""
                          }`}
                        >
                          <span className="detail-label">
                            punctuation penalty
                          </span>
                          <span className="detail-value">
                            <span
                              className={
                                stats.counts.punctuation >= 3 &&
                                stats.behavioral.punctuationPenalty > 100
                                  ? "text-warn"
                                  : ""
                              }
                            >
                              {stats.counts.punctuation < 3
                                ? "n/a"
                                : `${
                                    stats.behavioral.punctuationPenalty > 0
                                      ? "+"
                                      : ""
                                  }${stats.behavioral.punctuationPenalty}%`}
                            </span>
                            <span className="detail-note">
                              {stats.counts.punctuation < 3
                                ? "no punctuation typed"
                                : "slower on symbols"}
                            </span>
                          </span>
                        </div>
                      </Tooltip>

                      <Tooltip content={TIPS.errorRecovery}>
                        <div
                          className={`detail-row${
                            stats.errorCount === 0 ? " stat-na" : ""
                          }`}
                        >
                          <span className="detail-label">error recovery</span>
                          <span className="detail-value">
                            <span
                              className={
                                stats.errorCount > 0 &&
                                stats.behavioral.recoveryPenalty > 90
                                  ? "text-warn"
                                  : ""
                              }
                            >
                              {stats.errorCount === 0
                                ? "n/a"
                                : `${
                                    stats.behavioral.recoveryPenalty > 0
                                      ? "+"
                                      : ""
                                  }${stats.behavioral.recoveryPenalty}%`}
                            </span>
                            <span className="detail-note">
                              {stats.errorCount === 0
                                ? "no errors made"
                                : "slower after mistakes"}
                            </span>
                          </span>
                        </div>
                      </Tooltip>

                      <Tooltip content={TIPS.hesitations}>
                        <div className="detail-row">
                          <span className="detail-label">hesitations</span>
                          <span className="detail-value">
                            {stats.behavioral.hesitationCount}
                            {stats.behavioral.hesitationCount > 0 && (
                              <span className="detail-note">
                                pauses &gt;500ms (avg{" "}
                                {stats.behavioral.avgHesitation}ms)
                              </span>
                            )}
                          </span>
                        </div>
                      </Tooltip>

                      <Tooltip content={TIPS.errorDistribution}>
                        <div className="detail-row">
                          <span className="detail-label">
                            error distribution
                          </span>
                          <span className="detail-value">
                            {stats.behavioral.errorPattern}
                          </span>
                        </div>
                      </Tooltip>

                      <Tooltip
                        content={TIPS.backspaceBehavior(
                          stats.behavioral.backspaceLabel
                        )}
                      >
                        <div className="detail-row">
                          <span className="detail-label">
                            backspace behavior
                          </span>
                          <span className="detail-value">
                            {stats.behavioral.backspaceLabel}
                            <span className="detail-note">
                              {stats.behavioral.backspaceEfficiency}× per error
                            </span>
                          </span>
                        </div>
                      </Tooltip>
                    </div>
                  </div>
                )}
              </>
            ) : statsView === "alltime" && cumulativeStats ? (
              /* All-time stats view */
              <>
                <div className="stat-grid primary">
                  <Tooltip content={TIPS.wpm}>
                    <div className="stat">
                      <span className="stat-value">
                        {cumulativeStats.wpm}
                        {comparisonBase === "global" && globalAverages && (
                          <span
                            className={`stat-delta ${
                              cumulativeStats.wpm >= globalAverages.avg_wpm
                                ? "positive"
                                : "negative"
                            }`}
                          >
                            {cumulativeStats.wpm >= globalAverages.avg_wpm
                              ? "↑"
                              : "↓"}
                            {fmt.int(
                              Math.abs(
                                cumulativeStats.wpm - globalAverages.avg_wpm
                              )
                            )}
                          </span>
                        )}
                        {comparisonBase === "current" && stats && (
                          <span
                            className={`stat-delta ${
                              cumulativeStats.wpm >= stats.wpm
                                ? "positive"
                                : "negative"
                            }`}
                          >
                            {cumulativeStats.wpm >= stats.wpm ? "↑" : "↓"}
                            {fmt.int(Math.abs(cumulativeStats.wpm - stats.wpm))}
                          </span>
                        )}
                      </span>
                      <span className="stat-label">avg wpm</span>
                    </div>
                  </Tooltip>
                  <Tooltip content={TIPS.accuracy}>
                    <div className="stat">
                      <span className="stat-value">
                        {fmt.dec(cumulativeStats.accuracy)}%
                        {comparisonBase === "global" && globalAverages && (
                          <span
                            className={`stat-delta ${
                              cumulativeStats.accuracy >=
                              globalAverages.avg_accuracy
                                ? "positive"
                                : "negative"
                            }`}
                          >
                            {cumulativeStats.accuracy >=
                            globalAverages.avg_accuracy
                              ? "↑"
                              : "↓"}
                            {fmt.dec(
                              Math.abs(
                                cumulativeStats.accuracy -
                                  globalAverages.avg_accuracy
                              )
                            )}
                          </span>
                        )}
                        {comparisonBase === "current" && stats && (
                          <span
                            className={`stat-delta ${
                              cumulativeStats.accuracy >= stats.accuracy
                                ? "positive"
                                : "negative"
                            }`}
                          >
                            {cumulativeStats.accuracy >= stats.accuracy
                              ? "↑"
                              : "↓"}
                            {fmt.dec(
                              Math.abs(
                                cumulativeStats.accuracy - stats.accuracy
                              )
                            )}
                          </span>
                        )}
                      </span>
                      <span className="stat-label">accuracy</span>
                    </div>
                  </Tooltip>
                  <Tooltip content={TIPS.consistency}>
                    <div className="stat">
                      <span className="stat-value">
                        {cumulativeStats.consistency}%
                        {comparisonBase === "global" && globalAverages && (
                          <span
                            className={`stat-delta ${
                              cumulativeStats.consistency >=
                              globalAverages.avg_consistency
                                ? "positive"
                                : "negative"
                            }`}
                          >
                            {cumulativeStats.consistency >=
                            globalAverages.avg_consistency
                              ? "↑"
                              : "↓"}
                            {fmt.dec(
                              Math.abs(
                                cumulativeStats.consistency -
                                  globalAverages.avg_consistency
                              )
                            )}
                          </span>
                        )}
                        {comparisonBase === "current" && stats && (
                          <span
                            className={`stat-delta ${
                              cumulativeStats.consistency >= stats.consistency
                                ? "positive"
                                : "negative"
                            }`}
                          >
                            {cumulativeStats.consistency >= stats.consistency
                              ? "↑"
                              : "↓"}
                            {fmt.dec(
                              Math.abs(
                                cumulativeStats.consistency - stats.consistency
                              )
                            )}
                          </span>
                        )}
                      </span>
                      <span className="stat-label">consistency</span>
                    </div>
                  </Tooltip>
                  <Tooltip content={TIPS.totalTime}>
                    <div className="stat">
                      <span className="stat-value">
                        {fmt.int(cumulativeStats.totalTime / 60)}m
                      </span>
                      <span className="stat-label">total time</span>
                    </div>
                  </Tooltip>
                </div>

                <div className="stat-grid secondary">
                  <Tooltip content={TIPS.avgKeystroke}>
                    <div className="stat small">
                      <span className="stat-value">
                        {cumulativeStats.avgInterval}ms
                        {comparisonBase === "global" && globalAverages && (
                          <span
                            className={`stat-delta ${
                              cumulativeStats.avgInterval <=
                              globalAverages.avg_interval
                                ? "positive"
                                : "negative"
                            }`}
                          >
                            {cumulativeStats.avgInterval <=
                            globalAverages.avg_interval
                              ? "↓"
                              : "↑"}
                            {fmt.int(
                              Math.abs(
                                cumulativeStats.avgInterval -
                                  globalAverages.avg_interval
                              )
                            )}
                          </span>
                        )}
                        {comparisonBase === "current" && stats && (
                          <span
                            className={`stat-delta ${
                              cumulativeStats.avgInterval <= stats.avgInterval
                                ? "positive"
                                : "negative"
                            }`}
                          >
                            {cumulativeStats.avgInterval <= stats.avgInterval
                              ? "↓"
                              : "↑"}
                            {fmt.int(
                              Math.abs(
                                cumulativeStats.avgInterval - stats.avgInterval
                              )
                            )}
                          </span>
                        )}
                      </span>
                      <span className="stat-label">avg keystroke</span>
                    </div>
                  </Tooltip>
                  <Tooltip content={TIPS.avgWordTime}>
                    <div className="stat small">
                      <span className="stat-value">
                        {cumulativeStats.avgWordInterval}ms
                      </span>
                      <span className="stat-label">avg word time</span>
                    </div>
                  </Tooltip>
                  <Tooltip content={TIPS.totalChars}>
                    <div className="stat small">
                      <span className="stat-value">
                        {cumulativeStats.totalChars.toLocaleString()}
                      </span>
                      <span className="stat-label">total chars</span>
                    </div>
                  </Tooltip>
                  <Tooltip content={TIPS.sessions}>
                    <div className="stat small">
                      <span className="stat-value">
                        {cumulativeStats.sessions}
                      </span>
                      <span className="stat-label">sessions</span>
                    </div>
                  </Tooltip>
                </div>

                {/* Session Distribution Histograms */}
                {histograms && Object.keys(histograms).length > 0 && (
                  <div className="histograms-section">
                    <div className="histograms-header-row">
                      <div className="histograms-header-left">
                        <h3 className="histograms-header">
                          Session Distributions
                        </h3>
                        <label className="zoom-toggle">
                          <input
                            type="checkbox"
                            checked={histogramZoom}
                            onChange={(e) => {
                              setHistogramZoom(e.target.checked);
                              saveToStorage(
                                STORAGE_KEYS.HISTOGRAM_ZOOM,
                                e.target.checked
                              );
                            }}
                          />
                          <span>smart zoom</span>
                        </label>
                      </div>
                      <div className="histograms-header-right">
                        <div className="histogram-legend">
                          <span className="legend-item">
                            <span className="legend-swatch normal"></span>your
                            sessions
                          </span>
                          <span className="legend-item">
                            <span className="legend-swatch current"></span>this
                            paragraph
                          </span>
                        </div>
                        <Tooltip content={TIPS.sessionDistributions}>
                          <button
                            className="help-btn"
                            type="button"
                            aria-label="Help"
                          >
                            ?
                          </button>
                        </Tooltip>
                      </div>
                    </div>
                    <div className="histograms-grid">
                      <div
                        className={`histogram-item ${
                          selectedHistogram === "wpm" ? "selected" : ""
                        }`}
                        onClick={() =>
                          setSelectedHistogram(
                            selectedHistogram === "wpm" ? null : "wpm"
                          )
                        }
                      >
                        <Tooltip content={TIPS.wpm}>
                          <span className="histogram-title">WPM</span>
                        </Tooltip>
                        <SessionHistogram
                          data={histograms.wpm}
                          configKey="wpm"
                          currentValue={stats?.wpm}
                          average={cumulativeStats?.wpm}
                          smartZoom={histogramZoom}
                        />
                      </div>
                      <div
                        className={`histogram-item ${
                          selectedHistogram === "accuracy" ? "selected" : ""
                        }`}
                        onClick={() =>
                          setSelectedHistogram(
                            selectedHistogram === "accuracy" ? null : "accuracy"
                          )
                        }
                      >
                        <Tooltip content={TIPS.accuracy}>
                          <span className="histogram-title">Accuracy</span>
                        </Tooltip>
                        <SessionHistogram
                          data={histograms.accuracy}
                          configKey="accuracy"
                          currentValue={stats?.accuracy}
                          average={cumulativeStats?.accuracy}
                          smartZoom={histogramZoom}
                        />
                      </div>
                      <div
                        className={`histogram-item ${
                          selectedHistogram === "consistency" ? "selected" : ""
                        }`}
                        onClick={() =>
                          setSelectedHistogram(
                            selectedHistogram === "consistency"
                              ? null
                              : "consistency"
                          )
                        }
                      >
                        <Tooltip content={TIPS.consistency}>
                          <span className="histogram-title">Consistency</span>
                        </Tooltip>
                        <SessionHistogram
                          data={histograms.consistency}
                          configKey="consistency"
                          currentValue={stats?.consistency}
                          average={cumulativeStats?.consistency}
                          smartZoom={histogramZoom}
                        />
                      </div>
                      <div
                        className={`histogram-item ${
                          selectedHistogram === "avgInterval" ? "selected" : ""
                        }`}
                        onClick={() =>
                          setSelectedHistogram(
                            selectedHistogram === "avgInterval"
                              ? null
                              : "avgInterval"
                          )
                        }
                      >
                        <Tooltip content={TIPS.avgKeystroke}>
                          <span className="histogram-title">
                            Keystroke Time
                          </span>
                        </Tooltip>
                        <SessionHistogram
                          data={histograms.avgInterval}
                          configKey="avgInterval"
                          currentValue={stats?.avgInterval}
                          average={cumulativeStats?.avgInterval}
                          smartZoom={histogramZoom}
                        />
                      </div>
                      {histograms.flowRatio && (
                        <div
                          className={`histogram-item ${
                            selectedHistogram === "flowRatio" ? "selected" : ""
                          }`}
                          onClick={() =>
                            setSelectedHistogram(
                              selectedHistogram === "flowRatio"
                                ? null
                                : "flowRatio"
                            )
                          }
                        >
                          <Tooltip content={TIPS.flowState}>
                            <span className="histogram-title">Flow State</span>
                          </Tooltip>
                          <SessionHistogram
                            data={histograms.flowRatio}
                            configKey="flowRatio"
                            currentValue={stats?.behavioral?.flowRatio}
                            average={cumulativeStats?.behavioral?.flowRatio}
                            smartZoom={histogramZoom}
                          />
                        </div>
                      )}
                      {histograms.rhythmScore && (
                        <div
                          className={`histogram-item ${
                            selectedHistogram === "rhythmScore"
                              ? "selected"
                              : ""
                          }`}
                          onClick={() =>
                            setSelectedHistogram(
                              selectedHistogram === "rhythmScore"
                                ? null
                                : "rhythmScore"
                            )
                          }
                        >
                          <Tooltip content={TIPS.rhythmScore}>
                            <span className="histogram-title">Rhythm</span>
                          </Tooltip>
                          <SessionHistogram
                            data={histograms.rhythmScore}
                            configKey="rhythmScore"
                            currentValue={stats?.behavioral?.rhythmScore}
                            average={cumulativeStats?.behavioral?.rhythmScore}
                            smartZoom={histogramZoom}
                          />
                        </div>
                      )}
                      {histograms.handBalance && (
                        <div
                          className={`histogram-item ${
                            selectedHistogram === "handBalance"
                              ? "selected"
                              : ""
                          }`}
                          onClick={() =>
                            setSelectedHistogram(
                              selectedHistogram === "handBalance"
                                ? null
                                : "handBalance"
                            )
                          }
                        >
                          <Tooltip content={TIPS.handBalance}>
                            <span className="histogram-title">
                              Hand Balance
                            </span>
                          </Tooltip>
                          <SessionHistogram
                            data={histograms.handBalance}
                            configKey="handBalance"
                            currentValue={
                              stats?.behavioral
                                ? Math.round(stats.behavioral.handBalance)
                                : undefined
                            }
                            average={cumulativeStats?.behavioral?.handBalance}
                            smartZoom={histogramZoom}
                            reversed={true}
                            xAxisLabels={{
                              min: "← left faster",
                              max: "right faster →",
                            }}
                            formatValue={(val) =>
                              `${Math.abs(val)}% ${
                                val > 0
                                  ? "left"
                                  : val < 0
                                  ? "right"
                                  : "balanced"
                              }`
                            }
                          />
                        </div>
                      )}
                      {histograms.homeRowAdvantage && (
                        <div
                          className={`histogram-item ${
                            selectedHistogram === "homeRowAdvantage"
                              ? "selected"
                              : ""
                          }`}
                          onClick={() =>
                            setSelectedHistogram(
                              selectedHistogram === "homeRowAdvantage"
                                ? null
                                : "homeRowAdvantage"
                            )
                          }
                        >
                          <Tooltip content={TIPS.homeRow}>
                            <span className="histogram-title">Home Row</span>
                          </Tooltip>
                          <SessionHistogram
                            data={histograms.homeRowAdvantage}
                            configKey="homeRowAdvantage"
                            currentValue={
                              stats?.behavioral
                                ? Math.round(stats.behavioral.homeRowAdvantage)
                                : undefined
                            }
                            average={
                              cumulativeStats?.behavioral?.homeRowAdvantage
                            }
                            smartZoom={histogramZoom}
                            xAxisLabels={{
                              min: "← away faster",
                              max: "home faster →",
                            }}
                          />
                        </div>
                      )}
                    </div>

                    {/* Expanded histogram view */}
                    {selectedHistogram && histograms[selectedHistogram] && (
                      <div className="histogram-expanded-container">
                        <div className="histogram-expanded-header">
                          <Tooltip
                            content={
                              selectedHistogram === "wpm"
                                ? TIPS.wpm
                                : selectedHistogram === "accuracy"
                                ? TIPS.accuracy
                                : selectedHistogram === "consistency"
                                ? TIPS.consistency
                                : selectedHistogram === "avgInterval"
                                ? TIPS.avgKeystroke
                                : selectedHistogram === "flowRatio"
                                ? TIPS.flowState
                                : selectedHistogram === "rhythmScore"
                                ? TIPS.rhythmScore
                                : selectedHistogram === "handBalance"
                                ? TIPS.handBalance
                                : selectedHistogram === "homeRowAdvantage"
                                ? TIPS.homeRow
                                : null
                            }
                          >
                            <span className="histogram-expanded-title">
                              {selectedHistogram === "wpm" &&
                                "Words Per Minute"}
                              {selectedHistogram === "accuracy" && "Accuracy"}
                              {selectedHistogram === "consistency" &&
                                "Consistency"}
                              {selectedHistogram === "avgInterval" &&
                                "Keystroke Time"}
                              {selectedHistogram === "flowRatio" &&
                                "Flow State"}
                              {selectedHistogram === "rhythmScore" &&
                                "Rhythm Score"}
                              {selectedHistogram === "handBalance" &&
                                "Hand Balance"}
                              {selectedHistogram === "homeRowAdvantage" &&
                                "Home Row Advantage"}
                            </span>
                          </Tooltip>
                          <button
                            className="histogram-close-btn"
                            onClick={() => setSelectedHistogram(null)}
                          >
                            ×
                          </button>
                        </div>
                        <SessionHistogram
                          data={histograms[selectedHistogram]}
                          configKey={selectedHistogram}
                          currentValue={
                            selectedHistogram === "wpm"
                              ? stats?.wpm
                              : selectedHistogram === "accuracy"
                              ? stats?.accuracy
                              : selectedHistogram === "consistency"
                              ? stats?.consistency
                              : selectedHistogram === "avgInterval"
                              ? stats?.avgInterval
                              : selectedHistogram === "flowRatio"
                              ? stats?.behavioral?.flowRatio
                              : selectedHistogram === "rhythmScore"
                              ? stats?.behavioral?.rhythmScore
                              : selectedHistogram === "handBalance"
                              ? stats?.behavioral
                                ? Math.round(stats.behavioral.handBalance)
                                : undefined
                              : selectedHistogram === "homeRowAdvantage"
                              ? stats?.behavioral
                                ? Math.round(stats.behavioral.homeRowAdvantage)
                                : undefined
                              : undefined
                          }
                          average={
                            selectedHistogram === "wpm"
                              ? cumulativeStats?.wpm
                              : selectedHistogram === "accuracy"
                              ? cumulativeStats?.accuracy
                              : selectedHistogram === "consistency"
                              ? cumulativeStats?.consistency
                              : selectedHistogram === "avgInterval"
                              ? cumulativeStats?.avgInterval
                              : selectedHistogram === "flowRatio"
                              ? cumulativeStats?.behavioral?.flowRatio
                              : selectedHistogram === "rhythmScore"
                              ? cumulativeStats?.behavioral?.rhythmScore
                              : selectedHistogram === "handBalance"
                              ? cumulativeStats?.behavioral?.handBalance
                              : selectedHistogram === "homeRowAdvantage"
                              ? cumulativeStats?.behavioral?.homeRowAdvantage
                              : undefined
                          }
                          smartZoom={histogramZoom}
                          expanded={true}
                          reversed={selectedHistogram === "handBalance"}
                          xAxisLabels={
                            selectedHistogram === "handBalance"
                              ? { min: "← left faster", max: "right faster →" }
                              : selectedHistogram === "homeRowAdvantage"
                              ? { min: "← away faster", max: "home faster →" }
                              : null
                          }
                          formatValue={
                            selectedHistogram === "handBalance"
                              ? (val) =>
                                  `${Math.abs(val)}% ${
                                    val > 0
                                      ? "left"
                                      : val < 0
                                      ? "right"
                                      : "balanced"
                                  }`
                              : null
                          }
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* Counts breakdown */}
                {cumulativeStats.counts && (
                  <div className="counts-section">
                    <h3 className="counts-header">Character Breakdown</h3>
                    <div className="counts-grid">
                      <div className="count-item">
                        <span className="count-value">
                          {fmt.count(cumulativeStats.counts.correctWords)}
                        </span>
                        <span className="count-label">words</span>
                        <span className="count-accuracy">
                          {cumulativeStats.counts.words > 0
                            ? fmt.int(
                                (cumulativeStats.counts.correctWords /
                                  cumulativeStats.counts.words) *
                                  100
                              )
                            : 0}
                          % correct
                        </span>
                      </div>
                      <div className="count-item">
                        <span className="count-value">
                          {fmt.count(cumulativeStats.counts.correctLetters)}
                        </span>
                        <span className="count-label">letters</span>
                        <span className="count-accuracy">
                          {cumulativeStats.counts.letters > 0
                            ? fmt.int(
                                (cumulativeStats.counts.correctLetters /
                                  cumulativeStats.counts.letters) *
                                  100
                              )
                            : 0}
                          % correct
                        </span>
                      </div>
                      <div className="count-item">
                        <span className="count-value">
                          {fmt.count(cumulativeStats.counts.correctNumbers)}
                        </span>
                        <span className="count-label">numbers</span>
                        <span className="count-accuracy">
                          {cumulativeStats.counts.numbers > 0
                            ? fmt.int(
                                (cumulativeStats.counts.correctNumbers /
                                  cumulativeStats.counts.numbers) *
                                  100
                              )
                            : 0}
                          % correct
                        </span>
                      </div>
                      <div className="count-item">
                        <span className="count-value">
                          {fmt.count(cumulativeStats.counts.correctPunctuation)}
                        </span>
                        <span className="count-label">punctuation</span>
                        <span className="count-accuracy">
                          {cumulativeStats.counts.punctuation > 0
                            ? fmt.int(
                                (cumulativeStats.counts.correctPunctuation /
                                  cumulativeStats.counts.punctuation) *
                                  100
                              )
                            : 0}
                          % correct
                        </span>
                      </div>
                      <div className="count-item">
                        <span className="count-value">
                          {fmt.count(cumulativeStats.counts.correctCapitals)}
                        </span>
                        <span className="count-label">capitals</span>
                        <span className="count-accuracy">
                          {cumulativeStats.counts.capitals > 0
                            ? fmt.int(
                                (cumulativeStats.counts.correctCapitals /
                                  cumulativeStats.counts.capitals) *
                                  100
                              )
                            : 0}
                          % correct
                        </span>
                      </div>
                      <div className="count-item">
                        <span className="count-value">
                          {fmt.count(cumulativeStats.counts.correctSpaces)}
                        </span>
                        <span className="count-label">spaces</span>
                        <span className="count-accuracy">
                          {cumulativeStats.counts.spaces > 0
                            ? fmt.int(
                                (cumulativeStats.counts.correctSpaces /
                                  cumulativeStats.counts.spaces) *
                                  100
                              )
                            : 0}
                          % correct
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Keyboard Analysis for All Time - matches This Paragraph order */}
                {cumulativeStats.keyStats &&
                  Object.keys(cumulativeStats.keyStats).length > 0 && (
                    <div className="keyboard-section">
                      <div className="keyboard-header">
                        <h3>Keyboard Analysis (All Time)</h3>
                        <div className="keyboard-header-right">
                          <div className="heatmap-toggle">
                            <button
                              className={`mini-toggle ${
                                heatmapMode === "speed" ? "active" : ""
                              }`}
                              onClick={() => setHeatmapMode("speed")}
                            >
                              Speed
                            </button>
                            <button
                              className={`mini-toggle ${
                                heatmapMode === "accuracy" ? "active" : ""
                              }`}
                              onClick={() => setHeatmapMode("accuracy")}
                            >
                              Accuracy
                            </button>
                          </div>
                          <Tooltip content={TIPS.keyboardHeatmap}>
                            <button
                              className="help-btn"
                              type="button"
                              aria-label="Help"
                            >
                              ?
                            </button>
                          </Tooltip>
                        </div>
                      </div>
                      <KeyboardHeatmap
                        keyStats={cumulativeStats.keyStats}
                        mode={heatmapMode}
                      />

                      <div className="keyboard-flows">
                        <KeyboardFlowMap
                          topBigrams={
                            heatmapMode === "accuracy"
                              ? cumulativeStats.mostAccurateBigrams
                              : cumulativeStats.fastestBigrams
                          }
                          flowType="fast"
                          mode={heatmapMode}
                        />
                        <KeyboardFlowMap
                          topBigrams={
                            heatmapMode === "accuracy"
                              ? cumulativeStats.leastAccurateBigrams
                              : cumulativeStats.slowestBigrams
                          }
                          flowType="slow"
                          mode={heatmapMode}
                        />
                      </div>
                    </div>
                  )}

                {/* Finger Performance for All Time */}
                {cumulativeStats.fingerStats && (
                  <FingerHands fingerStats={cumulativeStats.fingerStats} />
                )}

                {/* Finger Transitions for All Time */}
                {cumulativeStats.fingerTransitions &&
                  Object.keys(cumulativeStats.fingerTransitions).length > 0 && (
                    <FingerChordDiagram
                      fingerTransitions={cumulativeStats.fingerTransitions}
                      fingerStats={cumulativeStats.fingerStats}
                    />
                  )}

                <div className="bigrams-container">
                  <div className="bigrams">
                    <div className="section-header-row compact">
                      <p className="bigram-label">all-time fastest</p>
                      <Tooltip content={TIPS.allTimeFastest}>
                        <button
                          className="help-btn"
                          type="button"
                          aria-label="Help"
                        >
                          ?
                        </button>
                      </Tooltip>
                    </div>
                    <div className="bigram-list">
                      {cumulativeStats.fastestBigrams.map(
                        ({ bigram, avg }, i) => (
                          <span key={i} className="bigram fast">
                            <code>{formatBigram(bigram)}</code>
                            <span className="bigram-meta">
                              <span className="bigram-time">
                                {fmt.int(avg)}ms
                              </span>
                            </span>
                          </span>
                        )
                      )}
                    </div>
                  </div>
                  <div className="bigrams">
                    <div className="section-header-row compact">
                      <p className="bigram-label">all-time slowest</p>
                      <Tooltip content={TIPS.allTimeSlowest}>
                        <button
                          className="help-btn"
                          type="button"
                          aria-label="Help"
                        >
                          ?
                        </button>
                      </Tooltip>
                    </div>
                    <div className="bigram-list">
                      {cumulativeStats.slowestBigrams.map(
                        ({ bigram, avg }, i) => (
                          <span key={i} className="bigram slow">
                            <code>{formatBigram(bigram)}</code>
                            <span className="bigram-meta">
                              <span className="bigram-time">
                                {fmt.int(avg)}ms
                              </span>
                            </span>
                          </span>
                        )
                      )}
                    </div>
                  </div>
                </div>

                {cumulativeStats.impressiveBigrams &&
                  cumulativeStats.impressiveBigrams.length > 0 && (
                    <div className="bigrams impressive-section">
                      <p className="bigram-label">
                        🏆 all-time impressive reaches
                      </p>
                      <div className="bigram-list horizontal">
                        {cumulativeStats.impressiveBigrams.map(
                          ({ bigram, avg, distance }, i) => (
                            <span key={i} className="bigram impressive">
                              <code>{formatBigram(bigram)}</code>
                              <span className="bigram-meta">
                                <span className="bigram-time">
                                  {fmt.int(avg)}ms
                                </span>
                                <span
                                  className="bigram-distance"
                                  title="Keys apart on keyboard"
                                >
                                  {fmt.dec(distance)} apart
                                </span>
                              </span>
                            </span>
                          )
                        )}
                      </div>
                    </div>
                  )}

                {/* Behavioral Insights for All Time */}
                {cumulativeStats.behavioral && (
                  <div className="behavioral-section">
                    {/* Archetype Header */}
                    <div className="archetype-card">
                      <span className="archetype-name">
                        {cumulativeStats.behavioral.archetype}
                      </span>
                      <span className="archetype-desc">
                        {cumulativeStats.behavioral.archetypeDesc}
                      </span>
                      <Tooltip content={TIPS.profileStrength}>
                        <div className="profile-strength">
                          <span className="strength-label">profile match</span>
                          <div className="strength-bar">
                            <div
                              className="strength-fill"
                              style={{
                                width: `${cumulativeStats.behavioral.confidenceScore}%`,
                              }}
                            />
                          </div>
                          <span className="strength-value">
                            {cumulativeStats.behavioral.confidenceScore}%
                          </span>
                        </div>
                      </Tooltip>
                    </div>

                    {/* Archetype Breakdown */}
                    {cumulativeStats.history &&
                      cumulativeStats.history.length > 1 &&
                      (() => {
                        // Count archetypes from history
                        const archetypeCounts = {};
                        let totalWithArchetype = 0;
                        cumulativeStats.history.forEach((session) => {
                          const arch = session.behavioral?.archetype;
                          if (arch) {
                            archetypeCounts[arch] =
                              (archetypeCounts[arch] || 0) + 1;
                            totalWithArchetype++;
                          }
                        });

                        if (totalWithArchetype < 2) return null;

                        // Sort by count descending
                        const sorted = Object.entries(archetypeCounts).sort(
                          (a, b) => b[1] - a[1]
                        );

                        // Calculate avg confidence per archetype
                        const archetypeConfidence = {};
                        cumulativeStats.history.forEach((session) => {
                          const arch = session.behavioral?.archetype;
                          const conf = session.behavioral?.confidenceScore;
                          if (arch && conf !== undefined) {
                            if (!archetypeConfidence[arch]) {
                              archetypeConfidence[arch] = { sum: 0, count: 0 };
                            }
                            archetypeConfidence[arch].sum += conf;
                            archetypeConfidence[arch].count++;
                          }
                        });

                        return (
                          <div className="archetype-breakdown">
                            <span className="breakdown-title">
                              session breakdown
                            </span>
                            <div className="breakdown-list">
                              {sorted.map(([archetype, count]) => {
                                const pct = Math.round(
                                  (count / totalWithArchetype) * 100
                                );
                                const avgConf = archetypeConfidence[archetype]
                                  ? Math.round(
                                      archetypeConfidence[archetype].sum /
                                        archetypeConfidence[archetype].count
                                    )
                                  : null;
                                return (
                                  <div
                                    key={archetype}
                                    className="breakdown-item"
                                  >
                                    <div className="breakdown-bar-container">
                                      <div
                                        className="breakdown-bar"
                                        style={{ width: `${pct}%` }}
                                      />
                                    </div>
                                    <span className="breakdown-name">
                                      {archetype}
                                    </span>
                                    <span className="breakdown-stats">
                                      {pct}% ({count})
                                      {avgConf !== null && (
                                        <span className="breakdown-conf">
                                          {" "}
                                          · {avgConf}% avg
                                        </span>
                                      )}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })()}

                    <h3 className="behavioral-header">
                      Typing Profile (All Time)
                    </h3>

                    <div className="behavioral-grid">
                      <Tooltip
                        content={TIPS.correctionStyle(
                          cumulativeStats.behavioral.momentumLabel
                        )}
                      >
                        <div className="behavioral-card">
                          <div className="behavioral-main">
                            <span className="behavioral-value">
                              {cumulativeStats.behavioral.momentumLabel}
                            </span>
                            <span className="behavioral-label">
                              correction style
                            </span>
                          </div>
                          <p className="behavioral-detail">
                            {cumulativeStats.behavioral.momentum > 0
                              ? `~${cumulativeStats.behavioral.momentum} chars past errors`
                              : "Instant corrections"}
                          </p>
                        </div>
                      </Tooltip>

                      <Tooltip content={TIPS.flowState}>
                        <div className="behavioral-card">
                          <div className="behavioral-main">
                            <span className="behavioral-value">
                              {cumulativeStats.behavioral.flowRatio}%
                            </span>
                            <span className="behavioral-label">flow state</span>
                          </div>
                          <p className="behavioral-detail">
                            keystrokes in rhythm zone
                          </p>
                        </div>
                      </Tooltip>

                      <Tooltip content={TIPS.maxBurst}>
                        <div className="behavioral-card">
                          <div className="behavioral-main">
                            <span className="behavioral-value">
                              {cumulativeStats.behavioral.maxBurst}
                            </span>
                            <span className="behavioral-label">best burst</span>
                          </div>
                          <p className="behavioral-detail">
                            {cumulativeStats.behavioral.totalBursts} total
                            bursts
                          </p>
                        </div>
                      </Tooltip>

                      <Tooltip
                        content={TIPS.speedProfile(
                          cumulativeStats.behavioral.speedProfile
                        )}
                      >
                        <div className="behavioral-card">
                          <div className="behavioral-main">
                            <span className="behavioral-value">
                              {cumulativeStats.behavioral.speedProfile}
                            </span>
                            <span className="behavioral-label">
                              speed profile
                            </span>
                          </div>
                          <p className="behavioral-detail">
                            {cumulativeStats.behavioral.rhythmScore}% rhythm
                            score
                          </p>
                        </div>
                      </Tooltip>
                    </div>

                    <div className="behavioral-grid">
                      <Tooltip content={TIPS.handBalance}>
                        <div className="behavioral-card">
                          <div className="behavioral-main">
                            <span className="behavioral-value">
                              {cumulativeStats.behavioral.dominantHand}
                            </span>
                            <span className="behavioral-label">
                              hand balance
                            </span>
                          </div>
                          <p className="behavioral-detail">
                            {Math.abs(cumulativeStats.behavioral.handBalance)}%{" "}
                            {cumulativeStats.behavioral.handBalance > 0
                              ? "left"
                              : "right"}{" "}
                            advantage
                          </p>
                        </div>
                      </Tooltip>

                      <Tooltip content={TIPS.homeRow}>
                        <div className="behavioral-card">
                          <div className="behavioral-main">
                            <span className="behavioral-value">
                              {cumulativeStats.behavioral.homeRowAdvantage > 0
                                ? "+"
                                : ""}
                              {cumulativeStats.behavioral.homeRowAdvantage}%
                            </span>
                            <span className="behavioral-label">home row</span>
                          </div>
                          <p className="behavioral-detail">
                            {cumulativeStats.behavioral.homeRowAdvantage > 0
                              ? "faster"
                              : "slower"}{" "}
                            than average
                          </p>
                        </div>
                      </Tooltip>

                      <Tooltip content={TIPS.numberRow}>
                        <div
                          className={`behavioral-card${
                            (cumulativeStats.counts?.numbers || 0) < 3
                              ? " stat-na"
                              : ""
                          }`}
                        >
                          <div className="behavioral-main">
                            <span className="behavioral-value">
                              {(cumulativeStats.counts?.numbers || 0) < 3
                                ? "n/a"
                                : `${
                                    cumulativeStats.behavioral
                                      .numberRowPenalty > 0
                                      ? "+"
                                      : ""
                                  }${
                                    cumulativeStats.behavioral.numberRowPenalty
                                  }%`}
                            </span>
                            <span className="behavioral-label">number row</span>
                          </div>
                          <p className="behavioral-detail">
                            {(cumulativeStats.counts?.numbers || 0) < 3
                              ? "no numbers typed"
                              : `${
                                  cumulativeStats.behavioral.numberRowPenalty >
                                  0
                                    ? "slower"
                                    : "faster"
                                } than average`}
                          </p>
                        </div>
                      </Tooltip>

                      <Tooltip
                        content={TIPS.endurance(
                          cumulativeStats.behavioral.fatigueLabel
                        )}
                      >
                        <div className="behavioral-card">
                          <div className="behavioral-main">
                            <span className="behavioral-value">
                              {cumulativeStats.behavioral.fatigueLabel}
                            </span>
                            <span className="behavioral-label">endurance</span>
                          </div>
                          <p className="behavioral-detail">
                            {cumulativeStats.behavioral.fatiguePercent > 0
                              ? "+"
                              : ""}
                            {cumulativeStats.behavioral.fatiguePercent}% avg
                            change
                          </p>
                        </div>
                      </Tooltip>
                    </div>

                    <div className="behavioral-details">
                      <Tooltip content={TIPS.capitalPenalty}>
                        <div
                          className={`detail-row${
                            (cumulativeStats.counts?.capitals || 0) < 3
                              ? " stat-na"
                              : ""
                          }`}
                        >
                          <span className="detail-label">
                            capital letter penalty
                          </span>
                          <span className="detail-value">
                            <span
                              className={
                                (cumulativeStats.counts?.capitals || 0) >= 3 &&
                                cumulativeStats.behavioral.capitalPenalty > 150
                                  ? "text-warn"
                                  : ""
                              }
                            >
                              {(cumulativeStats.counts?.capitals || 0) < 3
                                ? "n/a"
                                : `${
                                    cumulativeStats.behavioral.capitalPenalty >
                                    0
                                      ? "+"
                                      : ""
                                  }${
                                    cumulativeStats.behavioral.capitalPenalty
                                  }%`}
                            </span>
                            <span className="detail-note">
                              {(cumulativeStats.counts?.capitals || 0) < 3
                                ? "no capitals typed"
                                : "slower on capitals"}
                            </span>
                          </span>
                        </div>
                      </Tooltip>

                      <Tooltip content={TIPS.punctuationPenalty}>
                        <div
                          className={`detail-row${
                            (cumulativeStats.counts?.punctuation || 0) < 3
                              ? " stat-na"
                              : ""
                          }`}
                        >
                          <span className="detail-label">
                            punctuation penalty
                          </span>
                          <span className="detail-value">
                            <span
                              className={
                                (cumulativeStats.counts?.punctuation || 0) >=
                                  3 &&
                                cumulativeStats.behavioral.punctuationPenalty >
                                  100
                                  ? "text-warn"
                                  : ""
                              }
                            >
                              {(cumulativeStats.counts?.punctuation || 0) < 3
                                ? "n/a"
                                : `${
                                    cumulativeStats.behavioral
                                      .punctuationPenalty > 0
                                      ? "+"
                                      : ""
                                  }${
                                    cumulativeStats.behavioral
                                      .punctuationPenalty
                                  }%`}
                            </span>
                            <span className="detail-note">
                              {(cumulativeStats.counts?.punctuation || 0) < 3
                                ? "no punctuation typed"
                                : "slower on symbols"}
                            </span>
                          </span>
                        </div>
                      </Tooltip>

                      <Tooltip content={TIPS.errorRecovery}>
                        <div
                          className={`detail-row${
                            (cumulativeStats.totalErrors || 0) === 0
                              ? " stat-na"
                              : ""
                          }`}
                        >
                          <span className="detail-label">error recovery</span>
                          <span className="detail-value">
                            <span
                              className={
                                (cumulativeStats.totalErrors || 0) > 0 &&
                                cumulativeStats.behavioral.recoveryPenalty > 90
                                  ? "text-warn"
                                  : ""
                              }
                            >
                              {(cumulativeStats.totalErrors || 0) === 0
                                ? "n/a"
                                : `${
                                    cumulativeStats.behavioral.recoveryPenalty >
                                    0
                                      ? "+"
                                      : ""
                                  }${
                                    cumulativeStats.behavioral.recoveryPenalty
                                  }%`}
                            </span>
                            <span className="detail-note">
                              {(cumulativeStats.totalErrors || 0) === 0
                                ? "no errors made"
                                : "slower after mistakes"}
                            </span>
                          </span>
                        </div>
                      </Tooltip>

                      <Tooltip content={TIPS.hesitations}>
                        <div className="detail-row">
                          <span className="detail-label">
                            total hesitations
                          </span>
                          <span className="detail-value">
                            {cumulativeStats.behavioral.totalHesitations}
                            <span className="detail-note">
                              pauses &gt;500ms
                            </span>
                          </span>
                        </div>
                      </Tooltip>

                      <Tooltip
                        content={TIPS.backspaceBehavior(
                          cumulativeStats.behavioral.backspaceLabel
                        )}
                      >
                        <div className="detail-row">
                          <span className="detail-label">
                            backspace behavior
                          </span>
                          <span className="detail-value">
                            {cumulativeStats.behavioral.backspaceLabel}
                            <span className="detail-note">
                              {cumulativeStats.behavioral.backspaceEfficiency}×
                              per error avg
                            </span>
                          </span>
                        </div>
                      </Tooltip>
                    </div>
                  </div>
                )}
              </>
            ) : statsView === "global" && globalAverages ? (
              /* Global stats view */
              <>
                <div className="global-stats-header">
                  <h3>Global Statistics</h3>
                  <p className="global-stats-subtitle">
                    Based on {fmt.count(globalAverages.total_sessions)} sessions
                    from {fmt.count(globalAverages.total_users)} users
                  </p>
                </div>

                {/* Primary stats with comparison */}
                <div className="stat-grid primary">
                  <Tooltip content={TIPS.wpm}>
                    <div className="stat">
                      <span className="stat-value">
                        {fmt.int(globalAverages.avg_wpm)}
                        {comparisonBase === "alltime" &&
                          cumulativeStats &&
                          cumulativeStats.sessions > 0 && (
                            <span
                              className={`stat-delta ${
                                cumulativeStats.wpm >= globalAverages.avg_wpm
                                  ? "positive"
                                  : "negative"
                              }`}
                            >
                              {cumulativeStats.wpm >= globalAverages.avg_wpm
                                ? "↑"
                                : "↓"}
                              {fmt.int(
                                Math.abs(
                                  cumulativeStats.wpm - globalAverages.avg_wpm
                                )
                              )}
                              <span className="delta-label">you</span>
                            </span>
                          )}
                        {comparisonBase === "current" && stats && (
                          <span
                            className={`stat-delta ${
                              stats.wpm >= globalAverages.avg_wpm
                                ? "positive"
                                : "negative"
                            }`}
                          >
                            {stats.wpm >= globalAverages.avg_wpm ? "↑" : "↓"}
                            {fmt.int(
                              Math.abs(stats.wpm - globalAverages.avg_wpm)
                            )}
                            <span className="delta-label">this</span>
                          </span>
                        )}
                      </span>
                      <span className="stat-label">avg wpm</span>
                    </div>
                  </Tooltip>
                  <Tooltip content={TIPS.accuracy}>
                    <div className="stat">
                      <span className="stat-value">
                        {fmt.dec(globalAverages.avg_accuracy)}%
                        {comparisonBase === "alltime" &&
                          cumulativeStats &&
                          cumulativeStats.sessions > 0 && (
                            <span
                              className={`stat-delta ${
                                cumulativeStats.accuracy >=
                                globalAverages.avg_accuracy
                                  ? "positive"
                                  : "negative"
                              }`}
                            >
                              {cumulativeStats.accuracy >=
                              globalAverages.avg_accuracy
                                ? "↑"
                                : "↓"}
                              {fmt.dec(
                                Math.abs(
                                  cumulativeStats.accuracy -
                                    globalAverages.avg_accuracy
                                )
                              )}
                              <span className="delta-label">you</span>
                            </span>
                          )}
                        {comparisonBase === "current" && stats && (
                          <span
                            className={`stat-delta ${
                              stats.accuracy >= globalAverages.avg_accuracy
                                ? "positive"
                                : "negative"
                            }`}
                          >
                            {stats.accuracy >= globalAverages.avg_accuracy
                              ? "↑"
                              : "↓"}
                            {fmt.dec(
                              Math.abs(
                                stats.accuracy - globalAverages.avg_accuracy
                              )
                            )}
                            <span className="delta-label">this</span>
                          </span>
                        )}
                      </span>
                      <span className="stat-label">avg accuracy</span>
                    </div>
                  </Tooltip>
                  <Tooltip content={TIPS.consistency}>
                    <div className="stat">
                      <span className="stat-value">
                        {fmt.dec(globalAverages.avg_consistency)}%
                        {comparisonBase === "alltime" &&
                          cumulativeStats &&
                          cumulativeStats.sessions > 0 && (
                            <span
                              className={`stat-delta ${
                                cumulativeStats.consistency >=
                                globalAverages.avg_consistency
                                  ? "positive"
                                  : "negative"
                              }`}
                            >
                              {cumulativeStats.consistency >=
                              globalAverages.avg_consistency
                                ? "↑"
                                : "↓"}
                              {fmt.dec(
                                Math.abs(
                                  cumulativeStats.consistency -
                                    globalAverages.avg_consistency
                                )
                              )}
                              <span className="delta-label">you</span>
                            </span>
                          )}
                        {comparisonBase === "current" && stats && (
                          <span
                            className={`stat-delta ${
                              stats.consistency >=
                              globalAverages.avg_consistency
                                ? "positive"
                                : "negative"
                            }`}
                          >
                            {stats.consistency >= globalAverages.avg_consistency
                              ? "↑"
                              : "↓"}
                            {fmt.dec(
                              Math.abs(
                                stats.consistency -
                                  globalAverages.avg_consistency
                              )
                            )}
                            <span className="delta-label">this</span>
                          </span>
                        )}
                      </span>
                      <span className="stat-label">avg consistency</span>
                    </div>
                  </Tooltip>
                  <Tooltip content={TIPS.avgKeystroke}>
                    <div className="stat">
                      <span className="stat-value">
                        {fmt.int(globalAverages.avg_interval)}ms
                        {comparisonBase === "alltime" &&
                          cumulativeStats &&
                          cumulativeStats.sessions > 0 && (
                            <span
                              className={`stat-delta ${
                                cumulativeStats.avgInterval <=
                                globalAverages.avg_interval
                                  ? "positive"
                                  : "negative"
                              }`}
                            >
                              {cumulativeStats.avgInterval <=
                              globalAverages.avg_interval
                                ? "↓"
                                : "↑"}
                              {fmt.int(
                                Math.abs(
                                  cumulativeStats.avgInterval -
                                    globalAverages.avg_interval
                                )
                              )}
                              <span className="delta-label">you</span>
                            </span>
                          )}
                        {comparisonBase === "current" && stats && (
                          <span
                            className={`stat-delta ${
                              stats.avgInterval <= globalAverages.avg_interval
                                ? "positive"
                                : "negative"
                            }`}
                          >
                            {stats.avgInterval <= globalAverages.avg_interval
                              ? "↓"
                              : "↑"}
                            {fmt.int(
                              Math.abs(
                                stats.avgInterval - globalAverages.avg_interval
                              )
                            )}
                            <span className="delta-label">this</span>
                          </span>
                        )}
                      </span>
                      <span className="stat-label">avg interval</span>
                    </div>
                  </Tooltip>
                </div>

                {/* Percentile distribution */}
                <div className="stat-grid secondary">
                  <Tooltip content="25th percentile WPM">
                    <div className="stat small">
                      <span className="stat-value">
                        {fmt.int(globalAverages.p25_wpm)}
                      </span>
                      <span className="stat-label">25th %ile WPM</span>
                    </div>
                  </Tooltip>
                  <Tooltip content="Median WPM">
                    <div className="stat small">
                      <span className="stat-value">
                        {fmt.int(globalAverages.p50_wpm)}
                      </span>
                      <span className="stat-label">median WPM</span>
                    </div>
                  </Tooltip>
                  <Tooltip content="75th percentile WPM">
                    <div className="stat small">
                      <span className="stat-value">
                        {fmt.int(globalAverages.p75_wpm)}
                      </span>
                      <span className="stat-label">75th %ile WPM</span>
                    </div>
                  </Tooltip>
                  <Tooltip content="90th percentile WPM - top 10% of users">
                    <div className="stat small">
                      <span className="stat-value">
                        {fmt.int(globalAverages.p90_wpm)}
                      </span>
                      <span className="stat-label">90th %ile WPM</span>
                    </div>
                  </Tooltip>
                </div>

                {/* Global Session Distribution Histograms */}
                {globalHistograms &&
                  Object.keys(globalHistograms).length > 0 && (
                    <div className="histograms-section">
                      <div className="histograms-header-row">
                        <div className="histograms-header-left">
                          <h3 className="histograms-header">
                            Global Session Distributions
                          </h3>
                          <label className="zoom-toggle">
                            <input
                              type="checkbox"
                              checked={histogramZoom}
                              onChange={(e) => {
                                setHistogramZoom(e.target.checked);
                                saveToStorage(
                                  STORAGE_KEYS.HISTOGRAM_ZOOM,
                                  e.target.checked
                                );
                              }}
                            />
                            <span>smart zoom</span>
                          </label>
                        </div>
                        <div className="histograms-header-right">
                          <div className="histogram-legend">
                            <span className="legend-item">
                              <span className="legend-swatch normal"></span>all
                              users
                            </span>
                            {comparisonBase !== "none" && (
                              <span className="legend-item">
                                <span className="legend-swatch current"></span>
                                {comparisonBase === "current"
                                  ? "this paragraph"
                                  : comparisonBase === "alltime"
                                  ? "your average"
                                  : ""}
                              </span>
                            )}
                          </div>
                          <Tooltip content={TIPS.sessionDistributions}>
                            <button
                              className="help-btn"
                              type="button"
                              aria-label="Help"
                            >
                              ?
                            </button>
                          </Tooltip>
                        </div>
                      </div>
                      <div className="histograms-grid">
                        {globalHistograms.wpm && (
                          <div
                            className={`histogram-item ${
                              selectedGlobalHistogram === "wpm"
                                ? "selected"
                                : ""
                            }`}
                            onClick={() =>
                              setSelectedGlobalHistogram(
                                selectedGlobalHistogram === "wpm" ? null : "wpm"
                              )
                            }
                          >
                            <Tooltip content={TIPS.wpm}>
                              <span className="histogram-title">WPM</span>
                            </Tooltip>
                            <SessionHistogram
                              data={globalHistogramToArray(
                                globalHistograms.wpm,
                                "wpm"
                              )}
                              configKey="wpm"
                              currentValue={
                                comparisonBase === "current"
                                  ? stats?.wpm
                                  : comparisonBase === "alltime"
                                  ? cumulativeStats?.wpm
                                  : undefined
                              }
                              smartZoom={histogramZoom}
                            />
                          </div>
                        )}
                        {globalHistograms.accuracy && (
                          <div
                            className={`histogram-item ${
                              selectedGlobalHistogram === "accuracy"
                                ? "selected"
                                : ""
                            }`}
                            onClick={() =>
                              setSelectedGlobalHistogram(
                                selectedGlobalHistogram === "accuracy"
                                  ? null
                                  : "accuracy"
                              )
                            }
                          >
                            <Tooltip content={TIPS.accuracy}>
                              <span className="histogram-title">Accuracy</span>
                            </Tooltip>
                            <SessionHistogram
                              data={globalHistogramToArray(
                                globalHistograms.accuracy,
                                "accuracy"
                              )}
                              configKey="accuracy"
                              currentValue={
                                comparisonBase === "current"
                                  ? stats?.accuracy
                                  : comparisonBase === "alltime"
                                  ? cumulativeStats?.accuracy
                                  : undefined
                              }
                              smartZoom={histogramZoom}
                            />
                          </div>
                        )}
                        {globalHistograms.consistency && (
                          <div
                            className={`histogram-item ${
                              selectedGlobalHistogram === "consistency"
                                ? "selected"
                                : ""
                            }`}
                            onClick={() =>
                              setSelectedGlobalHistogram(
                                selectedGlobalHistogram === "consistency"
                                  ? null
                                  : "consistency"
                              )
                            }
                          >
                            <Tooltip content={TIPS.consistency}>
                              <span className="histogram-title">
                                Consistency
                              </span>
                            </Tooltip>
                            <SessionHistogram
                              data={globalHistogramToArray(
                                globalHistograms.consistency,
                                "consistency"
                              )}
                              configKey="consistency"
                              currentValue={
                                comparisonBase === "current"
                                  ? stats?.consistency
                                  : comparisonBase === "alltime"
                                  ? cumulativeStats?.consistency
                                  : undefined
                              }
                              smartZoom={histogramZoom}
                            />
                          </div>
                        )}
                        {globalHistograms.avgInterval && (
                          <div
                            className={`histogram-item ${
                              selectedGlobalHistogram === "avgInterval"
                                ? "selected"
                                : ""
                            }`}
                            onClick={() =>
                              setSelectedGlobalHistogram(
                                selectedGlobalHistogram === "avgInterval"
                                  ? null
                                  : "avgInterval"
                              )
                            }
                          >
                            <Tooltip content={TIPS.avgKeystroke}>
                              <span className="histogram-title">
                                Keystroke Time
                              </span>
                            </Tooltip>
                            <SessionHistogram
                              data={globalHistogramToArray(
                                globalHistograms.avgInterval,
                                "avgInterval"
                              )}
                              configKey="avgInterval"
                              currentValue={
                                comparisonBase === "current"
                                  ? stats?.avgInterval
                                  : comparisonBase === "alltime"
                                  ? cumulativeStats?.avgInterval
                                  : undefined
                              }
                              smartZoom={histogramZoom}
                            />
                          </div>
                        )}
                        {globalHistograms.flowRatio && (
                          <div
                            className={`histogram-item ${
                              selectedGlobalHistogram === "flowRatio"
                                ? "selected"
                                : ""
                            }`}
                            onClick={() =>
                              setSelectedGlobalHistogram(
                                selectedGlobalHistogram === "flowRatio"
                                  ? null
                                  : "flowRatio"
                              )
                            }
                          >
                            <Tooltip content={TIPS.flowState}>
                              <span className="histogram-title">
                                Flow State
                              </span>
                            </Tooltip>
                            <SessionHistogram
                              data={globalHistogramToArray(
                                globalHistograms.flowRatio,
                                "flowRatio"
                              )}
                              configKey="flowRatio"
                              currentValue={
                                comparisonBase === "current"
                                  ? stats?.behavioral?.flowRatio
                                  : comparisonBase === "alltime"
                                  ? cumulativeStats?.behavioral?.flowRatio
                                  : undefined
                              }
                              smartZoom={histogramZoom}
                            />
                          </div>
                        )}
                        {globalHistograms.rhythmScore && (
                          <div
                            className={`histogram-item ${
                              selectedGlobalHistogram === "rhythmScore"
                                ? "selected"
                                : ""
                            }`}
                            onClick={() =>
                              setSelectedGlobalHistogram(
                                selectedGlobalHistogram === "rhythmScore"
                                  ? null
                                  : "rhythmScore"
                              )
                            }
                          >
                            <Tooltip content={TIPS.rhythmScore}>
                              <span className="histogram-title">Rhythm</span>
                            </Tooltip>
                            <SessionHistogram
                              data={globalHistogramToArray(
                                globalHistograms.rhythmScore,
                                "rhythmScore"
                              )}
                              configKey="rhythmScore"
                              currentValue={
                                comparisonBase === "current"
                                  ? stats?.behavioral?.rhythmScore
                                  : comparisonBase === "alltime"
                                  ? cumulativeStats?.behavioral?.rhythmScore
                                  : undefined
                              }
                              smartZoom={histogramZoom}
                            />
                          </div>
                        )}
                        {globalHistograms.handBalance && (
                          <div
                            className={`histogram-item ${
                              selectedGlobalHistogram === "handBalance"
                                ? "selected"
                                : ""
                            }`}
                            onClick={() =>
                              setSelectedGlobalHistogram(
                                selectedGlobalHistogram === "handBalance"
                                  ? null
                                  : "handBalance"
                              )
                            }
                          >
                            <Tooltip content={TIPS.handBalance}>
                              <span className="histogram-title">
                                Hand Balance
                              </span>
                            </Tooltip>
                            <SessionHistogram
                              data={globalHistogramToArray(
                                globalHistograms.handBalance,
                                "handBalance"
                              )}
                              configKey="handBalance"
                              currentValue={
                                comparisonBase === "current" &&
                                stats?.behavioral
                                  ? Math.round(stats.behavioral.handBalance)
                                  : comparisonBase === "alltime" &&
                                    cumulativeStats?.behavioral
                                  ? Math.round(
                                      cumulativeStats.behavioral.handBalance
                                    )
                                  : undefined
                              }
                              smartZoom={histogramZoom}
                              reversed={true}
                              xAxisLabels={{
                                min: "← left faster",
                                max: "right faster →",
                              }}
                              formatValue={(val) =>
                                `${Math.abs(val)}% ${
                                  val > 0
                                    ? "left"
                                    : val < 0
                                    ? "right"
                                    : "balanced"
                                }`
                              }
                            />
                          </div>
                        )}
                        {globalHistograms.homeRowAdvantage && (
                          <div
                            className={`histogram-item ${
                              selectedGlobalHistogram === "homeRowAdvantage"
                                ? "selected"
                                : ""
                            }`}
                            onClick={() =>
                              setSelectedGlobalHistogram(
                                selectedGlobalHistogram === "homeRowAdvantage"
                                  ? null
                                  : "homeRowAdvantage"
                              )
                            }
                          >
                            <Tooltip content={TIPS.homeRow}>
                              <span className="histogram-title">Home Row</span>
                            </Tooltip>
                            <SessionHistogram
                              data={globalHistogramToArray(
                                globalHistograms.homeRowAdvantage,
                                "homeRowAdvantage"
                              )}
                              configKey="homeRowAdvantage"
                              currentValue={
                                comparisonBase === "current" &&
                                stats?.behavioral
                                  ? Math.round(
                                      stats.behavioral.homeRowAdvantage
                                    )
                                  : comparisonBase === "alltime" &&
                                    cumulativeStats?.behavioral
                                  ? Math.round(
                                      cumulativeStats.behavioral
                                        .homeRowAdvantage
                                    )
                                  : undefined
                              }
                              smartZoom={histogramZoom}
                              xAxisLabels={{
                                min: "← away faster",
                                max: "home faster →",
                              }}
                            />
                          </div>
                        )}
                      </div>

                      {/* Expanded Global histogram view */}
                      {selectedGlobalHistogram &&
                        globalHistograms[selectedGlobalHistogram] && (
                          <div className="histogram-expanded-container">
                            <div className="histogram-expanded-header">
                              <Tooltip
                                content={
                                  selectedGlobalHistogram === "wpm"
                                    ? TIPS.wpm
                                    : selectedGlobalHistogram === "accuracy"
                                    ? TIPS.accuracy
                                    : selectedGlobalHistogram === "consistency"
                                    ? TIPS.consistency
                                    : selectedGlobalHistogram === "avgInterval"
                                    ? TIPS.avgKeystroke
                                    : selectedGlobalHistogram === "flowRatio"
                                    ? TIPS.flowState
                                    : selectedGlobalHistogram === "rhythmScore"
                                    ? TIPS.rhythmScore
                                    : selectedGlobalHistogram === "handBalance"
                                    ? TIPS.handBalance
                                    : selectedGlobalHistogram ===
                                      "homeRowAdvantage"
                                    ? TIPS.homeRow
                                    : null
                                }
                              >
                                <span className="histogram-expanded-title">
                                  {selectedGlobalHistogram === "wpm" &&
                                    "Words Per Minute"}
                                  {selectedGlobalHistogram === "accuracy" &&
                                    "Accuracy"}
                                  {selectedGlobalHistogram === "consistency" &&
                                    "Consistency"}
                                  {selectedGlobalHistogram === "avgInterval" &&
                                    "Keystroke Time"}
                                  {selectedGlobalHistogram === "flowRatio" &&
                                    "Flow State"}
                                  {selectedGlobalHistogram === "rhythmScore" &&
                                    "Rhythm Score"}
                                  {selectedGlobalHistogram === "handBalance" &&
                                    "Hand Balance"}
                                  {selectedGlobalHistogram ===
                                    "homeRowAdvantage" && "Home Row Advantage"}
                                </span>
                              </Tooltip>
                              <button
                                className="histogram-close-btn"
                                onClick={() => setSelectedGlobalHistogram(null)}
                              >
                                ×
                              </button>
                            </div>
                            <SessionHistogram
                              data={globalHistogramToArray(
                                globalHistograms[selectedGlobalHistogram],
                                selectedGlobalHistogram
                              )}
                              configKey={selectedGlobalHistogram}
                              currentValue={
                                selectedGlobalHistogram === "wpm"
                                  ? comparisonBase === "current"
                                    ? stats?.wpm
                                    : comparisonBase === "alltime"
                                    ? cumulativeStats?.wpm
                                    : undefined
                                  : selectedGlobalHistogram === "accuracy"
                                  ? comparisonBase === "current"
                                    ? stats?.accuracy
                                    : comparisonBase === "alltime"
                                    ? cumulativeStats?.accuracy
                                    : undefined
                                  : selectedGlobalHistogram === "consistency"
                                  ? comparisonBase === "current"
                                    ? stats?.consistency
                                    : comparisonBase === "alltime"
                                    ? cumulativeStats?.consistency
                                    : undefined
                                  : selectedGlobalHistogram === "avgInterval"
                                  ? comparisonBase === "current"
                                    ? stats?.avgInterval
                                    : comparisonBase === "alltime"
                                    ? cumulativeStats?.avgInterval
                                    : undefined
                                  : selectedGlobalHistogram === "flowRatio"
                                  ? comparisonBase === "current"
                                    ? stats?.behavioral?.flowRatio
                                    : comparisonBase === "alltime"
                                    ? cumulativeStats?.behavioral?.flowRatio
                                    : undefined
                                  : selectedGlobalHistogram === "rhythmScore"
                                  ? comparisonBase === "current"
                                    ? stats?.behavioral?.rhythmScore
                                    : comparisonBase === "alltime"
                                    ? cumulativeStats?.behavioral?.rhythmScore
                                    : undefined
                                  : selectedGlobalHistogram === "handBalance"
                                  ? comparisonBase === "current" &&
                                    stats?.behavioral
                                    ? Math.round(stats.behavioral.handBalance)
                                    : comparisonBase === "alltime" &&
                                      cumulativeStats?.behavioral
                                    ? Math.round(
                                        cumulativeStats.behavioral.handBalance
                                      )
                                    : undefined
                                  : selectedGlobalHistogram ===
                                    "homeRowAdvantage"
                                  ? comparisonBase === "current" &&
                                    stats?.behavioral
                                    ? Math.round(
                                        stats.behavioral.homeRowAdvantage
                                      )
                                    : comparisonBase === "alltime" &&
                                      cumulativeStats?.behavioral
                                    ? Math.round(
                                        cumulativeStats.behavioral
                                          .homeRowAdvantage
                                      )
                                    : undefined
                                  : undefined
                              }
                              smartZoom={histogramZoom}
                              expanded={true}
                              reversed={
                                selectedGlobalHistogram === "handBalance"
                              }
                              xAxisLabels={
                                selectedGlobalHistogram === "handBalance"
                                  ? {
                                      min: "← left faster",
                                      max: "right faster →",
                                    }
                                  : selectedGlobalHistogram ===
                                    "homeRowAdvantage"
                                  ? {
                                      min: "← away faster",
                                      max: "home faster →",
                                    }
                                  : null
                              }
                              formatValue={
                                selectedGlobalHistogram === "handBalance"
                                  ? (val) =>
                                      `${Math.abs(val)}% ${
                                        val > 0
                                          ? "left"
                                          : val < 0
                                          ? "right"
                                          : "balanced"
                                      }`
                                  : null
                              }
                            />
                          </div>
                        )}
                    </div>
                  )}

                {/* Global Keyboard Heatmap */}
                {keyAverages && Object.keys(keyAverages).length > 0 && (
                  <div className="keyboard-section">
                    <div className="keyboard-header">
                      <h3>Keyboard Analysis (Global Average)</h3>
                      <div className="keyboard-header-right">
                        <div className="heatmap-toggle">
                          <button
                            className={`mini-toggle ${
                              heatmapMode === "speed" ? "active" : ""
                            }`}
                            onClick={() => setHeatmapMode("speed")}
                          >
                            Speed
                          </button>
                          <button
                            className={`mini-toggle ${
                              heatmapMode === "accuracy" ? "active" : ""
                            }`}
                            onClick={() => setHeatmapMode("accuracy")}
                          >
                            Accuracy
                          </button>
                        </div>
                        <Tooltip content={TIPS.globalKeyboardAnalysis}>
                          <button
                            className="help-btn"
                            type="button"
                            aria-label="Help"
                          >
                            ?
                          </button>
                        </Tooltip>
                      </div>
                    </div>
                    <KeyboardHeatmap
                      keyStats={keyAverages}
                      mode={heatmapMode}
                      comparisonStats={
                        comparisonBase === "alltime" &&
                        cumulativeStats?.keyStats
                          ? cumulativeStats.keyStats
                          : null
                      }
                    />
                  </div>
                )}

                {/* Global Finger Stats - matches keyboard section position in This Paragraph */}
                {fingerAverages && Object.keys(fingerAverages).length > 0 && (
                  <div className="finger-section">
                    <h3>Finger Performance (Global Average)</h3>
                    <FingerHands
                      fingerStats={Object.fromEntries(
                        Object.entries(fingerAverages).map(([finger, data]) => [
                          finger,
                          {
                            avgInterval: data.avg_interval,
                            accuracy: Math.round(data.avg_accuracy * 100),
                            total: data.total_presses,
                          },
                        ])
                      )}
                    />
                  </div>
                )}

                {/* Global Finger Transition Chord Diagram - before bigrams to match This Paragraph */}
                {transitionAverages &&
                  Object.keys(transitionAverages).length > 0 && (
                    <div className="chord-section">
                      <FingerChordDiagram
                        fingerTransitions={Object.fromEntries(
                          Object.entries(transitionAverages).map(
                            ([key, data]) => [
                              key,
                              {
                                count: data.total_occurrences,
                                totalTime:
                                  data.avg_time * data.total_occurrences,
                                avg: data.avg_time,
                                from: data.from_finger,
                                to: data.to_finger,
                              },
                            ]
                          )
                        )}
                        fingerStats={
                          fingerAverages
                            ? Object.fromEntries(
                                Object.entries(fingerAverages).map(
                                  ([finger, data]) => [
                                    finger,
                                    {
                                      avgInterval: data.avg_interval,
                                      accuracy: Math.round(
                                        data.avg_accuracy * 100
                                      ),
                                      total: data.total_presses,
                                    },
                                  ]
                                )
                              )
                            : {}
                        }
                      />
                    </div>
                  )}

                {/* Global Bigram Stats */}
                {bigramAverages && Object.keys(bigramAverages).length > 0 && (
                  <div className="bigrams-container">
                    <div className="bigrams">
                      <div className="section-header-row compact">
                        <p className="bigram-label">
                          globally fastest transitions
                        </p>
                        <Tooltip content={TIPS.fastestTransitions}>
                          <button
                            className="help-btn"
                            type="button"
                            aria-label="Help"
                          >
                            ?
                          </button>
                        </Tooltip>
                      </div>
                      <div className="bigram-list">
                        {Object.entries(bigramAverages)
                          .filter(([_, data]) => data.total_occurrences >= 10)
                          .sort((a, b) => a[1].avg_time - b[1].avg_time)
                          .slice(0, 5)
                          .map(([bigram, data], i) => (
                            <span key={i} className="bigram fast">
                              <code>{formatBigram(bigram)}</code>
                              <span className="bigram-meta">
                                <span className="bigram-time">
                                  {fmt.int(data.avg_time)}ms
                                </span>
                                <span className="bigram-count">
                                  {fmt.count(data.total_occurrences)} samples
                                </span>
                              </span>
                            </span>
                          ))}
                      </div>
                    </div>
                    <div className="bigrams">
                      <div className="section-header-row compact">
                        <p className="bigram-label">
                          globally slowest transitions
                        </p>
                        <Tooltip content={TIPS.slowestTransitions}>
                          <button
                            className="help-btn"
                            type="button"
                            aria-label="Help"
                          >
                            ?
                          </button>
                        </Tooltip>
                      </div>
                      <div className="bigram-list">
                        {Object.entries(bigramAverages)
                          .filter(([_, data]) => data.total_occurrences >= 10)
                          .sort((a, b) => b[1].avg_time - a[1].avg_time)
                          .slice(0, 5)
                          .map(([bigram, data], i) => (
                            <span key={i} className="bigram slow">
                              <code>{formatBigram(bigram)}</code>
                              <span className="bigram-meta">
                                <span className="bigram-time">
                                  {fmt.int(data.avg_time)}ms
                                </span>
                                <span className="bigram-count">
                                  {fmt.count(data.total_occurrences)} samples
                                </span>
                              </span>
                            </span>
                          ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Global Behavioral Stats */}
                {behavioralAverages &&
                  Object.keys(behavioralAverages).length > 0 && (
                    <div className="behavioral-section global-behavioral">
                      <h3>Typing Patterns (Global Average)</h3>
                      <div className="behavioral-grid">
                        {/* Avg Hesitation Time - replaced backspaceEfficiency which wasn't recording */}
                        {behavioralAverages.avgHesitation && (
                          <Tooltip content={TIPS.globalAvgPause}>
                            <div className="behavioral-stat">
                              <div className="behavioral-stat-header">
                                <span className="behavioral-stat-label">
                                  avg pause duration
                                </span>
                                <span className="behavioral-stat-value">
                                  {fmt.int(
                                    behavioralAverages.avgHesitation.avg
                                  )}
                                  ms
                                </span>
                              </div>
                              <div className="behavioral-stat-detail">
                                average hesitation length
                              </div>
                              <GlobalDistributionBar
                                value={behavioralAverages.avgHesitation.avg}
                                min={behavioralAverages.avgHesitation.min}
                                max={behavioralAverages.avgHesitation.max}
                                stdDev={
                                  behavioralAverages.avgHesitation.std_dev
                                }
                                lowerIsBetter={true}
                              />
                            </div>
                          </Tooltip>
                        )}

                        {/* Burst Stats */}
                        {behavioralAverages.avgBurstLength && (
                          <Tooltip content={TIPS.globalBurstLength}>
                            <div className="behavioral-stat">
                              <div className="behavioral-stat-header">
                                <span className="behavioral-stat-label">
                                  avg burst length
                                </span>
                                <span className="behavioral-stat-value">
                                  {fmt.dec(
                                    behavioralAverages.avgBurstLength.avg
                                  )}{" "}
                                  chars
                                </span>
                              </div>
                              <div className="behavioral-stat-detail">
                                consecutive fast keystrokes
                              </div>
                              <GlobalDistributionBar
                                value={behavioralAverages.avgBurstLength.avg}
                                min={behavioralAverages.avgBurstLength.min}
                                max={behavioralAverages.avgBurstLength.max}
                                stdDev={
                                  behavioralAverages.avgBurstLength.std_dev
                                }
                              />
                            </div>
                          </Tooltip>
                        )}

                        {/* Burst Count */}
                        {behavioralAverages.burstCount && (
                          <Tooltip content={TIPS.globalBurstCount}>
                            <div className="behavioral-stat">
                              <div className="behavioral-stat-header">
                                <span className="behavioral-stat-label">
                                  total bursts
                                </span>
                                <span className="behavioral-stat-value">
                                  {fmt.int(behavioralAverages.burstCount.avg)}
                                </span>
                              </div>
                              <div className="behavioral-stat-detail">
                                avg fast typing sequences per session
                              </div>
                              <GlobalDistributionBar
                                value={behavioralAverages.burstCount.avg}
                                min={behavioralAverages.burstCount.min}
                                max={behavioralAverages.burstCount.max}
                                stdDev={behavioralAverages.burstCount.std_dev}
                              />
                            </div>
                          </Tooltip>
                        )}

                        {/* Rhythm Score */}
                        {behavioralAverages.rhythmScore && (
                          <Tooltip content={TIPS.globalRhythm}>
                            <div className="behavioral-stat">
                              <div className="behavioral-stat-header">
                                <span className="behavioral-stat-label">
                                  rhythm score
                                </span>
                                <span className="behavioral-stat-value">
                                  {fmt.int(behavioralAverages.rhythmScore.avg)}%
                                </span>
                              </div>
                              <div className="behavioral-stat-detail">
                                typing consistency
                              </div>
                              <GlobalDistributionBar
                                value={behavioralAverages.rhythmScore.avg}
                                min={behavioralAverages.rhythmScore.min}
                                max={behavioralAverages.rhythmScore.max}
                                stdDev={behavioralAverages.rhythmScore.std_dev}
                                isPercent={true}
                              />
                            </div>
                          </Tooltip>
                        )}

                        {/* Hand Balance */}
                        {behavioralAverages.handBalance && (
                          <Tooltip content={TIPS.globalHandBalance}>
                            <div className="behavioral-stat">
                              <div className="behavioral-stat-header">
                                <span className="behavioral-stat-label">
                                  hand balance
                                </span>
                                <span className="behavioral-stat-value">
                                  {Math.abs(
                                    behavioralAverages.handBalance.avg
                                  ) <= 10
                                    ? "balanced"
                                    : behavioralAverages.handBalance.avg > 10
                                    ? "right dominant"
                                    : "left dominant"}
                                </span>
                              </div>
                              <div className="behavioral-stat-detail">
                                {behavioralAverages.handBalance.avg > 0
                                  ? "+"
                                  : ""}
                                {fmt.int(behavioralAverages.handBalance.avg)}%{" "}
                                {behavioralAverages.handBalance.avg > 0
                                  ? "right"
                                  : "left"}{" "}
                                advantage
                              </div>
                              <GlobalDistributionBar
                                value={behavioralAverages.handBalance.avg}
                                min={behavioralAverages.handBalance.min}
                                max={behavioralAverages.handBalance.max}
                                stdDev={behavioralAverages.handBalance.std_dev}
                                centered={true}
                              />
                            </div>
                          </Tooltip>
                        )}

                        {/* Home Row */}
                        {behavioralAverages.homeRowRatio && (
                          <Tooltip content={TIPS.globalHomeRow}>
                            <div className="behavioral-stat">
                              <div className="behavioral-stat-header">
                                <span className="behavioral-stat-label">
                                  home row usage
                                </span>
                                <span className="behavioral-stat-value">
                                  {fmt.int(
                                    behavioralAverages.homeRowRatio.avg * 100
                                  )}
                                  %
                                </span>
                              </div>
                              <div className="behavioral-stat-detail">
                                keystrokes on home row
                              </div>
                              <GlobalDistributionBar
                                value={behavioralAverages.homeRowRatio.avg}
                                min={behavioralAverages.homeRowRatio.min}
                                max={behavioralAverages.homeRowRatio.max}
                                stdDev={behavioralAverages.homeRowRatio.std_dev}
                                isPercent={true}
                              />
                            </div>
                          </Tooltip>
                        )}

                        {/* Total Hesitations */}
                        {behavioralAverages.hesitationCount && (
                          <Tooltip content={TIPS.globalHesitations}>
                            <div className="behavioral-stat">
                              <div className="behavioral-stat-header">
                                <span className="behavioral-stat-label">
                                  hesitations
                                </span>
                                <span className="behavioral-stat-value">
                                  {fmt.int(
                                    behavioralAverages.hesitationCount.avg
                                  )}
                                </span>
                              </div>
                              <div className="behavioral-stat-detail">
                                avg pauses &gt;500ms per session
                              </div>
                              <GlobalDistributionBar
                                value={behavioralAverages.hesitationCount.avg}
                                min={behavioralAverages.hesitationCount.min}
                                max={behavioralAverages.hesitationCount.max}
                                stdDev={
                                  behavioralAverages.hesitationCount.std_dev
                                }
                                lowerIsBetter={true}
                              />
                            </div>
                          </Tooltip>
                        )}

                        {/* Error Rate */}
                        {behavioralAverages.errorRate && (
                          <Tooltip content={TIPS.globalErrorRate}>
                            <div className="behavioral-stat">
                              <div className="behavioral-stat-header">
                                <span className="behavioral-stat-label">
                                  error rate
                                </span>
                                <span className="behavioral-stat-value">
                                  {behavioralAverages.errorRate.avg.toFixed(1)}
                                </span>
                              </div>
                              <div className="behavioral-stat-detail">
                                avg errors per session
                              </div>
                              <GlobalDistributionBar
                                value={behavioralAverages.errorRate.avg}
                                min={behavioralAverages.errorRate.min}
                                max={behavioralAverages.errorRate.max}
                                stdDev={behavioralAverages.errorRate.std_dev}
                                lowerIsBetter={true}
                              />
                            </div>
                          </Tooltip>
                        )}

                        {/* Backspace Efficiency */}
                        {behavioralAverages.backspaceEfficiency &&
                          behavioralAverages.backspaceEfficiency.avg > 0 && (
                            <Tooltip content={TIPS.globalCorrectionRatio}>
                              <div className="behavioral-stat">
                                <div className="behavioral-stat-header">
                                  <span className="behavioral-stat-label">
                                    correction ratio
                                  </span>
                                  <span className="behavioral-stat-value">
                                    {fmt.dec(
                                      behavioralAverages.backspaceEfficiency.avg
                                    )}
                                  </span>
                                </div>
                                <div className="behavioral-stat-detail">
                                  backspaces per error
                                </div>
                                <GlobalDistributionBar
                                  value={
                                    behavioralAverages.backspaceEfficiency.avg
                                  }
                                  min={
                                    behavioralAverages.backspaceEfficiency.min
                                  }
                                  max={
                                    behavioralAverages.backspaceEfficiency.max
                                  }
                                  stdDev={
                                    behavioralAverages.backspaceEfficiency
                                      .std_dev
                                  }
                                />
                              </div>
                            </Tooltip>
                          )}
                      </div>
                    </div>
                  )}

                {/* Global Cumulative Stats & Records */}
                {((lifetimeStats && lifetimeStats.totalKeystrokes > 0) ||
                  (records && records.fastestWpm > 0)) && (
                  <div className="lifetime-section">
                    <h3>Community Totals</h3>
                    <div className="stat-grid secondary">
                      {lifetimeStats && lifetimeStats.totalKeystrokes > 0 && (
                        <>
                          <Tooltip content="Total keystrokes recorded across all users">
                            <div className="stat small">
                              <span className="stat-value">
                                {fmt.count(lifetimeStats.totalKeystrokes)}
                              </span>
                              <span className="stat-label">
                                total keystrokes
                              </span>
                            </div>
                          </Tooltip>
                          <Tooltip content="Total time spent typing by all users">
                            <div className="stat small">
                              <span className="stat-value">
                                {fmt.dec(lifetimeStats.totalTypingHours, 1)}h
                              </span>
                              <span className="stat-label">
                                total typing time
                              </span>
                            </div>
                          </Tooltip>
                          <Tooltip content="Overall accuracy across all users">
                            <div className="stat small">
                              <span className="stat-value">
                                {fmt.dec(lifetimeStats.lifetimeAccuracy)}%
                              </span>
                              <span className="stat-label">
                                global accuracy
                              </span>
                            </div>
                          </Tooltip>
                          <Tooltip content="Total errors made by all users">
                            <div className="stat small">
                              <span className="stat-value">
                                {fmt.count(lifetimeStats.totalErrors)}
                              </span>
                              <span className="stat-label">total errors</span>
                            </div>
                          </Tooltip>
                        </>
                      )}
                      {records && records.fastestWpm > 0 && (
                        <>
                          <Tooltip content="Fastest WPM ever recorded by any user">
                            <div className="stat small highlight">
                              <span className="stat-value">
                                {fmt.int(records.fastestWpm)}
                              </span>
                              <span className="stat-label">🏆 best WPM</span>
                            </div>
                          </Tooltip>
                          <Tooltip content="Longest streak of correct keystrokes by any user">
                            <div className="stat small highlight">
                              <span className="stat-value">
                                {fmt.count(records.longestStreak)}
                              </span>
                              <span className="stat-label">
                                🔥 longest streak
                              </span>
                            </div>
                          </Tooltip>
                          <Tooltip content="Longest burst of fast keystrokes (<100ms) by any user">
                            <div className="stat small">
                              <span className="stat-value">
                                {fmt.int(records.longestBurst)}
                              </span>
                              <span className="stat-label">longest burst</span>
                            </div>
                          </Tooltip>
                          {typingPatterns?.doubleLetter?.sampleSessions >=
                            5 && (
                            <Tooltip content="Average time for double letters (like 'ee' or 'll')">
                              <div className="stat small">
                                <span className="stat-value">
                                  {fmt.int(
                                    typingPatterns.doubleLetter.avgValue
                                  )}
                                  ms
                                </span>
                                <span className="stat-label">
                                  double letters
                                </span>
                              </div>
                            </Tooltip>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                )}

                {/* Accuracy/Speed by Character Type */}
                {(accuracyByType && Object.keys(accuracyByType).length > 0) ||
                (keyAverages && Object.keys(keyAverages).length > 0)
                  ? (() => {
                      // Character definitions for each type
                      const charTypeInfo = {
                        letters: {
                          label: "letters",
                          chars: "a-z",
                          keys: "abcdefghijklmnopqrstuvwxyz",
                        },
                        numbers: {
                          label: "numbers",
                          chars: "0-9",
                          keys: "0123456789",
                        },
                        punctuation: {
                          label: "punctuation",
                          chars: ".,;:!?'\"-()/\\",
                          keys: ".,;:!?'\"-()/\\",
                        },
                        symbols: {
                          label: "symbols",
                          chars: "@#$%^&*_+=[]{}|<>`~",
                          keys: "@#$%^&*_+=[]{}|<>`~",
                        },
                        capitals: {
                          label: "capitals",
                          chars: "A-Z",
                          keys: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
                        },
                        spaces: {
                          label: "spaces",
                          chars: "space bar",
                          keys: " ",
                        },
                      };

                      // Use speedByType from hook if available, otherwise derive from keyAverages
                      let typeSpeeds = {};
                      
                      if (speedByType && Object.keys(speedByType).length > 0) {
                        // Use pre-computed speeds from database
                        typeSpeeds = { ...speedByType };
                      } else if (keyAverages && Object.keys(keyAverages).length > 0) {
                        // Fallback: derive speeds from keyAverages
                        Object.entries(charTypeInfo).forEach(
                          ([typeName, info]) => {
                            let totalTime = 0;
                            let totalCnt = 0;

                            for (const char of info.keys) {
                              const stats = keyAverages[char];
                              if (
                                stats &&
                                stats.avgInterval > 0 &&
                                stats.count > 0
                              ) {
                                totalTime += stats.avgInterval * stats.count;
                                totalCnt += stats.count;
                              }
                            }

                            if (totalCnt >= 10) {
                              typeSpeeds[typeName] = {
                                avgInterval: totalTime / totalCnt,
                                sampleSessions: totalCnt,
                              };
                            }
                          }
                        );
                      }

                      // accuracyByType now includes symbols from the database
                      const allAccuracyTypes = { ...accuracyByType };

                      const validAccuracyTypes = [
                        "letters",
                        "numbers",
                        "punctuation",
                        "symbols",
                        "capitals",
                        "spaces",
                      ].filter((t) => {
                        const sessions = allAccuracyTypes[t]?.sampleSessions || 0;
                        // Lower threshold for rare types like numbers/symbols
                        const threshold = (t === "symbols" || t === "numbers") ? 1 : 3;
                        return sessions >= threshold;
                      });

                      const validSpeedTypes = [
                        "letters",
                        "numbers",
                        "punctuation",
                        "symbols",
                        "capitals",
                        "spaces",
                      ].filter((t) => {
                        const data = typeSpeeds[t];
                        if (!data) return false;
                        // Show if we have any data with reasonable sample size
                        const sessions = data.sampleSessions || data.count || 0;
                        const threshold = (t === "symbols" || t === "numbers") ? 1 : 3;
                        return sessions >= threshold;
                      });

                      if (
                        validAccuracyTypes.length === 0 &&
                        validSpeedTypes.length === 0
                      )
                        return null;

                      // Get speed min/max for color scaling
                      const allSpeeds = validSpeedTypes.map(
                        (t) => typeSpeeds[t].avgInterval
                      );
                      const minSpeed =
                        allSpeeds.length > 0 ? Math.min(...allSpeeds) : 100;
                      const maxSpeed =
                        allSpeeds.length > 0 ? Math.max(...allSpeeds) : 200;

                      // Interpolate colors
                      const getAccuracyColor = (pct) => {
                        const t = Math.max(0, Math.min(1, (pct - 70) / 30));
                        const r = Math.round(224 - (224 - 145) * t);
                        const g = Math.round(108 + (216 - 108) * t);
                        const b = Math.round(117 - (117 - 145) * t);
                        return `rgb(${r}, ${g}, ${b})`;
                      };

                      const getSpeedColor = (ms) => {
                        if (maxSpeed === minSpeed) return "rgb(145, 216, 145)";
                        const t = (ms - minSpeed) / (maxSpeed - minSpeed);
                        const r = Math.round(145 + (224 - 145) * t);
                        const g = Math.round(216 - (216 - 108) * t);
                        const b = Math.round(145 - (145 - 117) * t);
                        return `rgb(${r}, ${g}, ${b})`;
                      };

                      const getSpeedBarWidth = (ms) => (minSpeed / ms) * 100;

                      return (
                        <CharTypeBreakdown
                          charTypeInfo={charTypeInfo}
                          allAccuracyTypes={allAccuracyTypes}
                          validAccuracyTypes={validAccuracyTypes}
                          typeSpeeds={typeSpeeds}
                          validSpeedTypes={validSpeedTypes}
                          getAccuracyColor={getAccuracyColor}
                          getSpeedColor={getSpeedColor}
                          getSpeedBarWidth={getSpeedBarWidth}
                          fmt={fmt}
                        />
                      );
                    })()
                  : null}

                {/* Row Performance */}
                {/* Keyboard Row Speed - derived from keyAverages */}
                {keyAverages &&
                  Object.keys(keyAverages).length > 0 &&
                  (() => {
                    // Define row configurations for base and shifted keys
                    const rowDefs = {
                      numberRow: {
                        label: "Number Row",
                        baseKeys: "`1234567890-=",
                        shiftedKeys: "~!@#$%^&*()_+",
                        baseDisplay: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
                        shiftedDisplay: ["!", "@", "#", "$", "%", "^", "&", "*", "(", ")"],
                        offset: 0,
                      },
                      topRow: {
                        label: "Top Row",
                        baseKeys: "qwertyuiop[]\\",
                        shiftedKeys: "QWERTYUIOP{}|",
                        baseDisplay: ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
                        shiftedDisplay: ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
                        offset: 0.5,
                      },
                      homeRow: {
                        label: "Home Row",
                        baseKeys: "asdfghjkl;'",
                        shiftedKeys: "ASDFGHJKL:\"",
                        baseDisplay: ["a", "s", "d", "f", "g", "h", "j", "k", "l"],
                        shiftedDisplay: ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
                        offset: 0.75,
                      },
                      bottomRow: {
                        label: "Bottom Row",
                        baseKeys: "zxcvbnm,./",
                        shiftedKeys: "ZXCVBNM<>?",
                        baseDisplay: ["z", "x", "c", "v", "b", "n", "m"],
                        shiftedDisplay: ["Z", "X", "C", "V", "B", "N", "M"],
                        offset: 1.25,
                      },
                    };

                    // Calculate average speed for each row from keyAverages
                    const calculateRowSpeeds = (useShifted) => {
                      const speeds = {};
                      Object.entries(rowDefs).forEach(([rowName, def]) => {
                        let totalTime = 0;
                        let totalCount = 0;
                        const keys = useShifted ? def.shiftedKeys : def.baseKeys;

                        for (const char of keys) {
                          const stats = keyAverages[char];
                          if (stats && stats.avgInterval > 0 && stats.count > 0) {
                            totalTime += stats.avgInterval * stats.count;
                            totalCount += stats.count;
                          }
                        }

                        if (totalCount >= 5) {
                          speeds[rowName] = {
                            avgIntervalMs: totalTime / totalCount,
                            count: totalCount,
                          };
                        }
                      });
                      return speeds;
                    };

                    const baseSpeeds = calculateRowSpeeds(false);
                    const shiftedSpeeds = calculateRowSpeeds(true);
                    
                    const rowSpeeds = rowSpeedShiftMode ? shiftedSpeeds : baseSpeeds;
                    const hasShiftedData = Object.keys(shiftedSpeeds).length > 0;

                    const validRows = [
                      "numberRow",
                      "topRow",
                      "homeRow",
                      "bottomRow",
                    ].filter((r) => rowSpeeds[r]);

                    if (validRows.length === 0 && !hasShiftedData) return null;

                    // Get min/max for color scaling
                    const allTimes = validRows.map(
                      (r) => rowSpeeds[r].avgIntervalMs
                    );
                    const minTime = allTimes.length > 0 ? Math.min(...allTimes) : 100;
                    const maxTime = allTimes.length > 0 ? Math.max(...allTimes) : 200;

                    const getRowColor = (time) => {
                      if (maxTime === minTime) return "var(--accent)";
                      const t = (time - minTime) / (maxTime - minTime);
                      // Green (fast) to yellow (slow)
                      const r = Math.round(145 + (226 - 145) * t);
                      const g = Math.round(216 - (216 - 183) * t);
                      const b = Math.round(145 - (145 - 20) * t);
                      return `rgb(${r}, ${g}, ${b})`;
                    };

                    return (
                      <div className="row-performance-section">
                        <div className="section-header-row">
                          <h3>Keyboard Row Speed</h3>
                          <div className="header-controls">
                            {hasShiftedData && (
                              <div className="mini-toggle-group">
                                <button
                                  className={`mini-toggle ${!rowSpeedShiftMode ? "active" : ""}`}
                                  onClick={() => setRowSpeedShiftMode(false)}
                                >
                                  Base
                                </button>
                                <button
                                  className={`mini-toggle ${rowSpeedShiftMode ? "active" : ""}`}
                                  onClick={() => setRowSpeedShiftMode(true)}
                                >
                                  ⇧ Shift
                                </button>
                              </div>
                            )}
                            <Tooltip content={TIPS.rowSpeed}>
                              <button
                                className="help-btn"
                                type="button"
                                aria-label="Help"
                              >
                                ?
                              </button>
                            </Tooltip>
                          </div>
                        </div>
                        <div className="keyboard-rows-visual">
                          {validRows.length > 0 ? validRows.map((rowName) => {
                            const data = rowSpeeds[rowName];
                            const def = rowDefs[rowName];
                            const displayKeys = rowSpeedShiftMode ? def.shiftedDisplay : def.baseDisplay;

                            return (
                              <div key={rowName} className="keyboard-row-item">
                                <span className="keyboard-row-label">
                                  {def.label}
                                </span>
                                <div
                                  className="keyboard-row-keys"
                                  style={{
                                    paddingLeft: `${def.offset * 1.2}rem`,
                                  }}
                                >
                                  {displayKeys.map((key) => (
                                    <span
                                      key={key}
                                      className="keyboard-row-key"
                                      style={{
                                        borderColor: getRowColor(
                                          data.avgIntervalMs
                                        ),
                                      }}
                                    >
                                      {key}
                                    </span>
                                  ))}
                                </div>
                                <span
                                  className="keyboard-row-time"
                                  style={{
                                    color: getRowColor(data.avgIntervalMs),
                                  }}
                                >
                                  {fmt.int(data.avgIntervalMs)}ms
                                </span>
                              </div>
                            );
                          }) : (
                            <div className="no-data-message" style={{ padding: '1rem', opacity: 0.6, textAlign: 'center' }}>
                              No {rowSpeedShiftMode ? 'shifted' : 'base'} key data yet
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}

                {/* Error Confusion (Most Common Typos) */}
                {errorConfusion && errorConfusion.length > 0 && (
                  <div className="error-confusion-section">
                    <div className="section-header-row">
                      <h3>Most Common Typos</h3>
                      <Tooltip content={TIPS.commonTypos}>
                        <button
                          className="help-btn"
                          type="button"
                          aria-label="Help"
                        >
                          ?
                        </button>
                      </Tooltip>
                    </div>
                    <div className="typo-list">
                      {errorConfusion.slice(0, 10).map((typo, i) => {
                        const displayChar = (char) =>
                          char === " " ? "␣" : char;
                        return (
                          <div key={i} className="typo-item">
                            <span className="typo-pair">
                              <code className="typo-expected">
                                {displayChar(typo.expected)}
                              </code>
                              <span className="typo-arrow">→</span>
                              <code className="typo-typed">
                                {displayChar(typo.typed)}
                              </code>
                            </span>
                            <span className="typo-count">
                              {fmt.count(typo.count)}×
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Useless Stats (fun but low-value patterns) */}
                {(typingPatterns && Object.keys(typingPatterns).length > 0) ||
                (timePatterns && (timePatterns.daily || timePatterns.hourly))
                  ? (() => {
                      // Check if we have any displayable patterns
                      const hasDoubleCount =
                        typingPatterns?.doubleLetterCount?.sampleSessions >= 5;
                      const hasAlternating =
                        typingPatterns?.alternatingRatio?.sampleSessions >= 5;

                      // Get best day from time patterns
                      const days = Object.entries(timePatterns?.daily || {})
                        .filter(([_, d]) => d.sampleSessions >= 3)
                        .map(([d, data]) => ({ day: parseInt(d), ...data }));
                      const bestDay =
                        days.length > 0
                          ? days.sort((a, b) => b.avgWpm - a.avgWpm)[0]
                          : null;
                      const dayNames = [
                        "Sunday",
                        "Monday",
                        "Tuesday",
                        "Wednesday",
                        "Thursday",
                        "Friday",
                        "Saturday",
                      ];

                      // Get best/worst hours
                      const hours = Object.entries(timePatterns?.hourly || {})
                        .filter(([_, d]) => d.sampleSessions >= 3)
                        .map(([h, d]) => ({ hour: parseInt(h), ...d }));
                      const sortedByWpm =
                        hours.length >= 2
                          ? [...hours].sort((a, b) => b.avgWpm - a.avgWpm)
                          : [];
                      const bestHour = sortedByWpm[0];
                      const worstHour =
                        sortedByWpm.length > 1
                          ? sortedByWpm[sortedByWpm.length - 1]
                          : null;
                      const formatHour = (h) => {
                        if (h === 0) return "12am";
                        if (h < 12) return `${h}am`;
                        if (h === 12) return "12pm";
                        return `${h - 12}pm`;
                      };

                      // Check if we have anything to show
                      const hasTimeData =
                        bestHour &&
                        worstHour &&
                        bestHour.hour !== worstHour.hour;
                      const hasFastestKey =
                        records && records.fastestKeystrokeMs > 0;
                      if (
                        !hasAlternating &&
                        !bestDay &&
                        !hasTimeData &&
                        !hasDoubleCount &&
                        !hasFastestKey
                      )
                        return null;

                      return (
                        <div className="typing-patterns-section">
                          <div className="section-header-row">
                            <h3>Useless Stats</h3>
                            <Tooltip content={TIPS.uselessStats}>
                              <button
                                className="help-btn"
                                type="button"
                                aria-label="Help"
                              >
                                ?
                              </button>
                            </Tooltip>
                          </div>
                          <div className="patterns-grid">
                            {hasFastestKey && (
                              <Tooltip content="Fastest single keystroke by any user">
                                <div className="pattern-item">
                                  <span className="pattern-label">
                                    Fastest Key
                                  </span>
                                  <span className="pattern-value">
                                    {fmt.int(records.fastestKeystrokeMs)}ms
                                  </span>
                                </div>
                              </Tooltip>
                            )}
                            {hasAlternating && (
                              <Tooltip content="Percentage of keystrokes that alternate between hands">
                                <div className="pattern-item">
                                  <span className="pattern-label">
                                    Hand Alternation
                                  </span>
                                  <span className="pattern-value">
                                    {fmt.int(
                                      typingPatterns.alternatingRatio.avgValue
                                    )}
                                    %
                                  </span>
                                </div>
                              </Tooltip>
                            )}
                            {hasDoubleCount && (
                              <Tooltip content="Average double letters per session">
                                <div className="pattern-item">
                                  <span className="pattern-label">
                                    Doubles/Session
                                  </span>
                                  <span className="pattern-value">
                                    {fmt.dec(
                                      typingPatterns.doubleLetterCount.avgValue,
                                      1
                                    )}
                                  </span>
                                </div>
                              </Tooltip>
                            )}
                            {bestDay && (
                              <Tooltip
                                content={`Users type fastest on ${
                                  dayNames[bestDay.day]
                                }s (${fmt.int(bestDay.avgWpm)} WPM avg)`}
                              >
                                <div className="pattern-item">
                                  <span className="pattern-label">
                                    Best Day
                                  </span>
                                  <span className="pattern-value">
                                    {dayNames[bestDay.day]}
                                  </span>
                                </div>
                              </Tooltip>
                            )}
                            {hasTimeData && (
                              <Tooltip
                                content={`Peak typing speed at ${formatHour(
                                  bestHour.hour
                                )}`}
                              >
                                <div className="pattern-item">
                                  <span className="pattern-label">
                                    Peak Hour
                                  </span>
                                  <span className="pattern-value">
                                    {formatHour(bestHour.hour)}{" "}
                                    <span className="pattern-detail">
                                      ({fmt.int(bestHour.avgWpm)} WPM)
                                    </span>
                                  </span>
                                </div>
                              </Tooltip>
                            )}
                            {hasTimeData && (
                              <Tooltip
                                content={`Slowest typing at ${formatHour(
                                  worstHour.hour
                                )}`}
                              >
                                <div className="pattern-item">
                                  <span className="pattern-label">
                                    Slow Hour
                                  </span>
                                  <span className="pattern-value">
                                    {formatHour(worstHour.hour)}{" "}
                                    <span className="pattern-detail">
                                      ({fmt.int(worstHour.avgWpm)} WPM)
                                    </span>
                                  </span>
                                </div>
                              </Tooltip>
                            )}
                            {/* Random future date - truly useless stat */}
                            {(() => {
                              // Seeded random based on user's total keystrokes for consistency
                              const seed = lifetimeStats?.totalKeystrokes || 12345;
                              const daysToAdd = 30 + (seed % 335); // 30-365 days in the future
                              const futureDate = new Date();
                              futureDate.setDate(futureDate.getDate() + daysToAdd);
                              const daysUntil = Math.ceil((futureDate - new Date()) / (1000 * 60 * 60 * 24));
                              const dateStr = futureDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                              return (
                                <Tooltip content={`Days until ${dateStr}. Why this date? No reason. It's completely arbitrary.`}>
                                  <div className="pattern-item">
                                    <span className="pattern-label">
                                      Days Until ???
                                    </span>
                                    <span className="pattern-value">
                                      {daysUntil}
                                    </span>
                                  </div>
                                </Tooltip>
                              );
                            })()}
                          </div>
                        </div>
                      );
                    })()
                  : null}
              </>
            ) : statsView === "race" && hasRaceStats ? (
              /* Race stats view */
              <RaceStatsPanel
                raceStats={raceState.raceStats}
                onClear={clearRaceStats}
                fmt={fmt}
                shareUrl={generateShareUrl()}
              />
            ) : null}

            <p className="restart-hint" ref={restartHintRef}>
              shift+enter to continue
            </p>
          </section>
        ) : null}

        {/* Race Mode UI */}
        {isInRace && raceState.status === "waiting" && (
          <RaceLobby
            raceId={raceState.raceId}
            racers={raceState.racers}
            myId={raceState.myId}
            isHost={raceState.isHost}
            onReady={setRaceReady}
            onStart={startRace}
            onLeave={() => {
              leaveRace();
              window.history.pushState({}, "", window.location.pathname);
            }}
            onNameChange={(newName) => {
              updateRaceName(newName);
              setRacerName(newName);
            }}
            shareUrl={`${window.location.origin}${window.location.pathname}?race=${raceState.raceId}`}
          />
        )}

        {isInRace && raceState.status === "countdown" && (
          <RaceCountdown endTime={raceState.countdownEnd} />
        )}

        {isInRace && raceState.status === "racing" && (
          <RaceProgressPanel
            racers={raceState.racers}
            myId={raceState.myId}
          />
        )}

        {waitingForOthers && (
          <div className="waiting-for-others">
            waiting for others ({finishedCount}/{totalCount})
          </div>
        )}

        {raceState.status === "finished" && (
          <RaceResults
            results={raceState.results}
            myId={raceState.myId}
            shareUrl={generateShareUrl()}
            onPlayAgain={() => {
              const { raceId, paragraph, paragraphIndex } = createRace(currentText, currentIndex);
              joinRace(raceId, racerName, paragraph, paragraphIndex, true);
              window.history.pushState({}, "", `?race=${raceId}`);
              resetTest();
            }}
            onLeave={() => {
              leaveRace();
              window.history.pushState({}, "", window.location.pathname);
            }}
            onViewStats={() => {
              setStatsView("race");
              leaveRace();
              window.history.pushState({}, "", window.location.pathname);
            }}
          />
        )}

        <footer>
          <button
            className="reset-btn"
            onClick={() => resetTest()}
            title="shift+enter"
          >
            next
          </button>
          {!isInRace && !isComplete && (
            <button
              className="reset-btn pvp-btn"
              onClick={() => {
                // Get a fresh paragraph for the race
                const { text: newText, index: newIndex } = getNextParagraph(completedIndices);
                setCurrentText(newText);
                setCurrentIndex(newIndex);
                setTyped('');
                setKeystrokeData([]);
                setRawKeyEvents([]);
                setIsActive(false);
                
                const name = localStorage.getItem("typometry_racer_name") || "guest1";
                setRacerName(name);
                const { raceId, paragraph, paragraphIndex } = createRace(newText, newIndex);
                joinRace(raceId, name, paragraph, paragraphIndex, true);
                window.history.pushState({}, "", `?race=${raceId}`);
              }}
              title="Race a friend! Creates a shareable link to type this passage together in real-time."
            >
              race a friend
            </button>
          )}
          <button
            className="reset-btn danger hold-btn"
            onMouseDown={startClearHold}
            onMouseUp={cancelClearHold}
            onMouseLeave={cancelClearHold}
            onTouchStart={startClearHold}
            onTouchEnd={cancelClearHold}
          >
            <span className="hold-btn-text">
              <span
                style={{
                  visibility: clearHoldProgress > 0 ? "hidden" : "visible",
                }}
              >
                hold to clear history
              </span>
              <span
                className="hold-btn-clearing"
                style={{
                  visibility: clearHoldProgress > 0 ? "visible" : "hidden",
                }}
              >
                clearing...
              </span>
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
            <div
              className="modal history-modal"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="modal-header">
                <h2>Session History</h2>
                <button
                  className="modal-close"
                  onClick={() => setShowHistory(false)}
                >
                  ×
                </button>
              </div>
              <div className="modal-body">
                <div className="history-list">
                  {[...cumulativeStats.history].reverse().map((session, i) => {
                    const date = new Date(session.timestamp);
                    const minutes = session.totalTime / 60000;
                    const wpm =
                      minutes > 0
                        ? Math.round(session.charCount / 5 / minutes)
                        : 0;
                    const accuracy =
                      session.charCount > 0
                        ? Math.round(
                            ((session.charCount - session.errorCount) /
                              session.charCount) *
                              100
                          )
                        : 0;

                    return (
                      <div key={session.timestamp} className="history-item">
                        <div className="history-item-header">
                          <span className="history-date">
                            {date.toLocaleDateString()}{" "}
                            {date.toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                          <span className="history-session">
                            #{cumulativeStats.history.length - i}
                          </span>
                        </div>
                        <div className="history-item-stats">
                          <span className="history-stat">
                            <span className="history-stat-value">{wpm}</span>
                            <span className="history-stat-label">wpm</span>
                          </span>
                          <span className="history-stat">
                            <span className="history-stat-value">
                              {accuracy}%
                            </span>
                            <span className="history-stat-label">accuracy</span>
                          </span>
                          <span className="history-stat">
                            <span className="history-stat-value">
                              {session.consistency || "—"}%
                            </span>
                            <span className="history-stat-label">
                              consistency
                            </span>
                          </span>
                          <span className="history-stat">
                            <span className="history-stat-value">
                              {session.errorCount}
                            </span>
                            <span className="history-stat-label">errors</span>
                          </span>
                          <span className="history-stat">
                            <span className="history-stat-value">
                              {fmt.int(session.totalTime / 1000)}s
                            </span>
                            <span className="history-stat-label">time</span>
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
