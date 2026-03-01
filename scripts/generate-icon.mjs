import sharp from 'sharp';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '..', 'src-tauri', 'icons');

// DeskClaw icon: 3 diagonal claw slashes with purple-to-cyan gradient on dark background
const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1a1a2e"/>
      <stop offset="100%" stop-color="#16213e"/>
    </linearGradient>
    <linearGradient id="claw" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#6c5ce7"/>
      <stop offset="50%" stop-color="#a855f7"/>
      <stop offset="100%" stop-color="#00d2d3"/>
    </linearGradient>
    <linearGradient id="glow" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#6c5ce7" stop-opacity="0.3"/>
      <stop offset="100%" stop-color="#00d2d3" stop-opacity="0.1"/>
    </linearGradient>
    <filter id="blur">
      <feGaussianBlur stdDeviation="18"/>
    </filter>
    <filter id="shadow">
      <feDropShadow dx="0" dy="4" stdDeviation="8" flood-color="#6c5ce7" flood-opacity="0.5"/>
    </filter>
  </defs>

  <!-- Background -->
  <rect width="1024" height="1024" rx="220" ry="220" fill="url(#bg)"/>

  <!-- Subtle inner border -->
  <rect x="8" y="8" width="1008" height="1008" rx="216" ry="216"
        fill="none" stroke="rgba(108,92,231,0.15)" stroke-width="2"/>

  <!-- Glow behind claw marks -->
  <g filter="url(#blur)" opacity="0.6">
    <line x1="300" y1="220" x2="580" y2="780" stroke="#6c5ce7" stroke-width="80" stroke-linecap="round"/>
    <line x1="440" y1="200" x2="680" y2="760" stroke="#a855f7" stroke-width="70" stroke-linecap="round"/>
    <line x1="580" y1="230" x2="770" y2="730" stroke="#00d2d3" stroke-width="60" stroke-linecap="round"/>
  </g>

  <!-- Claw slash marks -->
  <g filter="url(#shadow)">
    <!-- Left slash -->
    <path d="M 310 240 C 280 340, 360 560, 540 780
             L 580 760
             C 400 540, 340 340, 370 240 Z"
          fill="url(#claw)" opacity="0.95"/>

    <!-- Middle slash -->
    <path d="M 450 210 C 430 320, 490 540, 650 760
             L 690 740
             C 540 520, 490 320, 510 210 Z"
          fill="url(#claw)" opacity="0.95"/>

    <!-- Right slash -->
    <path d="M 590 250 C 580 340, 620 520, 750 720
             L 790 695
             C 670 500, 640 340, 650 250 Z"
          fill="url(#claw)" opacity="0.95"/>
  </g>

  <!-- Highlight tips at the top of each slash -->
  <circle cx="340" cy="248" r="18" fill="#fff" opacity="0.25"/>
  <circle cx="480" cy="218" r="20" fill="#fff" opacity="0.3"/>
  <circle cx="620" cy="258" r="16" fill="#fff" opacity="0.2"/>
</svg>`;

const outPath = join(outDir, 'icon.png');
await sharp(Buffer.from(svg))
  .resize(1024, 1024)
  .png()
  .toFile(outPath);

console.log(`Icon generated: ${outPath}`);
