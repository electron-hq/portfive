const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const svgPath = path.join(__dirname, 'public', 'icon.svg');
const svgBuffer = fs.readFileSync(svgPath);

async function generateIcons() {
  try {
    // 192x192
    await sharp(svgBuffer)
      .resize(192, 192)
      .png()
      .toFile(path.join(__dirname, 'public', 'icon-192.png'));

    // 512x512
    await sharp(svgBuffer)
      .resize(512, 512)
      .png()
      .toFile(path.join(__dirname, 'public', 'icon-512.png'));

    // Maskable 512x512 (with padding for safe zone)
    await sharp(svgBuffer)
      .resize(410, 410)
      .extend({
        top: 51,
        bottom: 51,
        left: 51,
        right: 51,
        background: { r: 9, g: 9, b: 11, alpha: 1 } // Match the dark background color #09090B
      })
      .png()
      .toFile(path.join(__dirname, 'public', 'icon-maskable-512.png'));

    console.log('Icons generated successfully!');
  } catch (error) {
    console.error('Error generating icons:', error);
  }
}

generateIcons();
