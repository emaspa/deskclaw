// Text emoticon → emoji mapping
// Order matters: longer patterns first to avoid partial matches
// (?<!\w) prevents matching after word chars (e.g. "Status:" won't trigger ":D")
// (?!\w) or (?!\*) prevents matching into markdown/words (e.g. ":**" won't trigger ":*")
const emoticons: [RegExp, string][] = [
  // Faces
  [/(?<!\w):-?\)(?!\w)/g, '😊'],
  [/(?<!\w):-?\((?!\w)/g, '😞'],
  [/(?<!\w):-?D(?!\w)/g, '😄'],
  [/(?<!\w):-?P(?!\w)/g, '😛'],
  [/(?<!\w):-?O(?!\w)/g, '😮'],
  [/(?<!\w):-?\*(?!\*)/g, '😘'],
  [/(?<!\w):-?\|/g, '😐'],
  [/(?<!\w):-?\/(?!\/)/g, '😕'],
  [/(?<!\w):-?S(?!\w)/g, '😖'],
  [/(?<!\w);-?\)(?!\w)/g, '😉'],
  [/(?<!\w)>:-?\)(?!\w)/g, '😈'],
  [/(?<!\w):-?'?\((?!\w)/g, '😢'],
  [/(?<!\w)D:(?!\w)/g, '😨'],
  [/\bT[_.]T\b/g, '😭'],
  [/\b[oO][_.]O\b/g, '😳'],
  [/(?<!\w)-_-(?!\w)/g, '😑'],
  [/(?<!\w)\^\^(?!\w)/g, '😊'],
  [/(?<!\w)\^_\^(?!\w)/g, '😊'],
  [/\bo\/\b/g, '🙋'],
  [/(?<!\w)<3(?!\d)/g, '❤️'],
  [/(?<!\w)<\/3(?!\d)/g, '💔'],
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
