/**
 * Generates public/icon-192.png and public/icon-512.png — green circle with "DR".
 * Uses sharp to rasterize SVG (portable on Windows vs native node-canvas).
 * Run: npm run generate:pwa-icons
 */
import sharp from 'sharp'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const publicDir = join(__dirname, '..', 'public')
const GREEN = '#1d9e75'

async function writeIcon(size) {
  const fs = Math.round(size * 0.3)
  const svg = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="${GREEN}"/>
  <text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" fill="#ffffff"
    font-family="system-ui, -apple-system, 'Segoe UI', Arial, sans-serif" font-weight="900" font-size="${fs}">DR</text>
</svg>`

  await sharp(Buffer.from(svg)).png().toFile(join(publicDir, `icon-${size}.png`))
  console.log(`Wrote public/icon-${size}.png`)
}

await writeIcon(192)
await writeIcon(512)
