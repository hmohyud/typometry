// Standard US QWERTY keyboard layout coordinates
// Each key mapped to [x, y] position in key-width units

const KEYBOARD_COORDS = {
  // Number row (y = 0)
  '`': [0, 0], '~': [0, 0],
  '1': [1, 0], '!': [1, 0],
  '2': [2, 0], '@': [2, 0],
  '3': [3, 0], '#': [3, 0],
  '4': [4, 0], '$': [4, 0],
  '5': [5, 0], '%': [5, 0],
  '6': [6, 0], '^': [6, 0],
  '7': [7, 0], '&': [7, 0],
  '8': [8, 0], '*': [8, 0],
  '9': [9, 0], '(': [9, 0],
  '0': [10, 0], ')': [10, 0],
  '-': [11, 0], '_': [11, 0],
  '=': [12, 0], '+': [12, 0],

  // Top letter row (y = 1, offset 0.5)
  'q': [0.5, 1], 'Q': [0.5, 1],
  'w': [1.5, 1], 'W': [1.5, 1],
  'e': [2.5, 1], 'E': [2.5, 1],
  'r': [3.5, 1], 'R': [3.5, 1],
  't': [4.5, 1], 'T': [4.5, 1],
  'y': [5.5, 1], 'Y': [5.5, 1],
  'u': [6.5, 1], 'U': [6.5, 1],
  'i': [7.5, 1], 'I': [7.5, 1],
  'o': [8.5, 1], 'O': [8.5, 1],
  'p': [9.5, 1], 'P': [9.5, 1],
  '[': [10.5, 1], '{': [10.5, 1],
  ']': [11.5, 1], '}': [11.5, 1],
  '\\': [12.5, 1], '|': [12.5, 1],

  // Home row (y = 2, offset 0.75)
  'a': [0.75, 2], 'A': [0.75, 2],
  's': [1.75, 2], 'S': [1.75, 2],
  'd': [2.75, 2], 'D': [2.75, 2],
  'f': [3.75, 2], 'F': [3.75, 2],
  'g': [4.75, 2], 'G': [4.75, 2],
  'h': [5.75, 2], 'H': [5.75, 2],
  'j': [6.75, 2], 'J': [6.75, 2],
  'k': [7.75, 2], 'K': [7.75, 2],
  'l': [8.75, 2], 'L': [8.75, 2],
  ';': [9.75, 2], ':': [9.75, 2],
  "'": [10.75, 2], '"': [10.75, 2],

  // Bottom letter row (y = 3, offset 1.25)
  'z': [1.25, 3], 'Z': [1.25, 3],
  'x': [2.25, 3], 'X': [2.25, 3],
  'c': [3.25, 3], 'C': [3.25, 3],
  'v': [4.25, 3], 'V': [4.25, 3],
  'b': [5.25, 3], 'B': [5.25, 3],
  'n': [6.25, 3], 'N': [6.25, 3],
  'm': [7.25, 3], 'M': [7.25, 3],
  ',': [8.25, 3], '<': [8.25, 3],
  '.': [9.25, 3], '>': [9.25, 3],
  '/': [10.25, 3], '?': [10.25, 3],

  // Space bar (y = 4, centered)
  ' ': [5.5, 4],
}

// Calculate Euclidean distance between two keys
export const getKeyDistance = (char1, char2) => {
  const pos1 = KEYBOARD_COORDS[char1]
  const pos2 = KEYBOARD_COORDS[char2]
  
  if (!pos1 || !pos2) return null
  
  const dx = pos2[0] - pos1[0]
  const dy = pos2[1] - pos1[1]
  
  return Math.sqrt(dx * dx + dy * dy)
}

// Get position for a character
export const getKeyPosition = (char) => {
  return KEYBOARD_COORDS[char] || null
}

// Categorize distance
export const categorizeDistance = (distance) => {
  if (distance === null) return 'unknown'
  if (distance < 1.5) return 'adjacent'
  if (distance < 3) return 'near'
  if (distance < 5) return 'medium'
  return 'far'
}

export default KEYBOARD_COORDS
