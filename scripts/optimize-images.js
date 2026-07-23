// Image Optimization Script
// Converts images to WebP format for better performance

// Install sharp for image processing
// Run: npm install sharp

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const IMAGE_DIRS = [
  './frontend/public/assets',
  './frontend/public/uploads'
];

const SUPPORTED_FORMATS = ['.jpg', '.jpeg', '.png'];

async function convertToWebP(inputPath, outputPath) {
  try {
    await sharp(inputPath)
      .webp({ quality: 85 })
      .toFile(outputPath);
    console.log(`✅ Converted: ${inputPath} -> ${outputPath}`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to convert ${inputPath}:`, error.message);
    return false;
  }
}

async function processDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) {
    console.log(`⚠️  Directory not found: ${dirPath}`);
    return;
  }

  const files = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const file of files) {
    const fullPath = path.join(dirPath, file.name);

    if (file.isDirectory()) {
      await processDirectory(fullPath);
    } else if (file.isFile()) {
      const ext = path.extname(file.name).toLowerCase();
      
      if (SUPPORTED_FORMATS.includes(ext)) {
        const outputPath = fullPath.replace(ext, '.webp');
        
        // Skip if WebP already exists and is newer
        if (fs.existsSync(outputPath)) {
          const inputStat = fs.statSync(fullPath);
          const outputStat = fs.statSync(outputPath);
          if (outputStat.mtime > inputStat.mtime) {
            console.log(`⏭️  Skipping (already optimized): ${file.name}`);
            continue;
          }
        }

        await convertToWebP(fullPath, outputPath);
      }
    }
  }
}

async function main() {
  console.log('🚀 Starting image optimization...\n');

  for (const dir of IMAGE_DIRS) {
    console.log(`\n📁 Processing directory: ${dir}`);
    await processDirectory(dir);
  }

  console.log('\n✨ Image optimization complete!');
  console.log('\n📝 Next steps:');
  console.log('1. Update HTML/CSS to reference .webp files');
  console.log('2. Add fallback for browsers that don\'t support WebP');
  console.log('3. Consider removing original files if no longer needed');
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { convertToWebP, processDirectory };
