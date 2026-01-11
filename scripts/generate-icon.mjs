import sharp from 'sharp';
import pngToIco from 'png-to-ico';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const resourcesDir = path.join(__dirname, '..', 'resources');

// Ensure resources directory exists
if (!fs.existsSync(resourcesDir)) {
  fs.mkdirSync(resourcesDir, { recursive: true });
}

// Create a gradient background with a piano key design
async function createIcon() {
  const size = 256;

  // Create SVG with piano-inspired design
  const svg = `
    <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#6366f1"/>
          <stop offset="100%" style="stop-color:#8b5cf6"/>
        </linearGradient>
        <linearGradient id="glow" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" style="stop-color:#a5b4fc;stop-opacity:0.8"/>
          <stop offset="100%" style="stop-color:#6366f1;stop-opacity:0"/>
        </linearGradient>
      </defs>

      <!-- Background circle -->
      <circle cx="${size/2}" cy="${size/2}" r="${size/2 - 10}" fill="url(#bg)"/>

      <!-- Glow effect -->
      <circle cx="${size/2}" cy="${size/2}" r="${size/2 - 30}" fill="url(#glow)" opacity="0.3"/>

      <!-- Piano keys representation -->
      <g transform="translate(${size/2 - 60}, ${size/2 - 40})">
        <!-- White keys -->
        <rect x="0" y="0" width="25" height="80" rx="3" fill="#ffffff" stroke="#e5e7eb" stroke-width="1"/>
        <rect x="30" y="0" width="25" height="80" rx="3" fill="#ffffff" stroke="#e5e7eb" stroke-width="1"/>
        <rect x="60" y="0" width="25" height="80" rx="3" fill="#ffffff" stroke="#e5e7eb" stroke-width="1"/>
        <rect x="90" y="0" width="25" height="80" rx="3" fill="#ffffff" stroke="#e5e7eb" stroke-width="1"/>

        <!-- Black keys -->
        <rect x="18" y="0" width="18" height="50" rx="2" fill="#1f2937"/>
        <rect x="78" y="0" width="18" height="50" rx="2" fill="#1f2937"/>

        <!-- Active key glow (middle white key) -->
        <rect x="60" y="0" width="25" height="80" rx="3" fill="#a5b4fc" opacity="0.6"/>
      </g>

      <!-- Sound waves -->
      <g transform="translate(${size/2}, ${size - 50})" opacity="0.8">
        <path d="M-30,0 Q-20,-15 -10,0 Q0,15 10,0 Q20,-15 30,0" fill="none" stroke="#ffffff" stroke-width="3" stroke-linecap="round"/>
      </g>
    </svg>
  `;

  // Generate PNG at multiple sizes
  const sizes = [256, 128, 64, 48, 32, 16];
  const pngPaths = [];

  for (const s of sizes) {
    const pngPath = path.join(resourcesDir, `icon-${s}.png`);
    await sharp(Buffer.from(svg))
      .resize(s, s)
      .png()
      .toFile(pngPath);
    pngPaths.push(pngPath);
    console.log(`Created ${s}x${s} PNG`);
  }

  // Convert to ICO
  const icoPath = path.join(resourcesDir, 'icon.ico');
  const icoBuffer = await pngToIco(pngPaths);
  fs.writeFileSync(icoPath, icoBuffer);
  console.log('Created icon.ico');

  // Clean up individual PNG files (keep only the 256px one for reference)
  for (const s of sizes) {
    if (s !== 256) {
      fs.unlinkSync(path.join(resourcesDir, `icon-${s}.png`));
    }
  }

  console.log('Icon generation complete!');
}

createIcon().catch(console.error);
