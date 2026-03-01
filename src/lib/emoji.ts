// Text emoticon → emoji mapping
// Order matters: longer patterns first to avoid partial matches
const emoticons: [RegExp, string][] = [
  // Faces
  [/:-?\)/g, '😊'],
  [/:-?\(/g, '😞'],
  [/:-?D/g, '😄'],
  [/:-?P/g, '😛'],
  [/:-?O/g, '😮'],
  [/:-?\*/g, '😘'],
  [/:-?\|/g, '😐'],
  [/:-?\//g, '😕'],
  [/:-?S/g, '😖'],
  [/;-?\)/g, '😉'],
  [/>:-?\)/g, '😈'],
  [/:-?'?\(/g, '😢'],
  [/D:/g, '😨'],
  [/\bT[_.]T\b/g, '😭'],
  [/\b[oO][_.]O\b/g, '😳'],
  [/-_-/g, '😑'],
  [/\^\^/g, '😊'],
  [/\^_\^/g, '😊'],
  [/\bo\/\b/g, '🙋'],
  [/<3/g, '❤️'],
  [/<\/3/g, '💔'],
  // Thumbs
  [/\(y\)/gi, '👍'],
  [/\(n\)/gi, '👎'],
];

export function parseEmoticons(text: string): string {
  let result = text;
  for (const [pattern, emoji] of emoticons) {
    result = result.replace(pattern, emoji);
  }
  return result;
}
