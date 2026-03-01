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
  // Protect URLs from emoticon replacement
  const urls: string[] = [];
  let result = text.replace(/https?:\/\/[^\s)>\]]+/g, (url) => {
    urls.push(url);
    return `\x00URL${urls.length - 1}\x00`;
  });
  for (const [pattern, emoji] of emoticons) {
    result = result.replace(pattern, emoji);
  }
  // Restore URLs
  result = result.replace(/\x00URL(\d+)\x00/g, (_, i) => urls[Number(i)]);
  return result;
}
