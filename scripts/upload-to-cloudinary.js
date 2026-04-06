/**
 * Cloudinary Upload Script with Compression
 * 
 * Usage: node scripts/upload-to-cloudinary.js
 * 
 * This script:
 * 1. Compresses images larger than 10MB
 * 2. Uploads all photos from photos/ folder to Cloudinary
 * 
 * Make sure to set USE_CLOUDINARY=true in .env before running.
 */

require('dotenv').config();
const cloudinary = require('cloudinary').v2;
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

// Configuration
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB in bytes
const QUALITY = 92; // Compression quality (higher = better quality)

// Check if Cloudinary is configured
if (!process.env.CLOUDINARY_CLOUD_NAME || 
    !process.env.CLOUDINARY_API_KEY || 
    !process.env.CLOUDINARY_API_SECRET) {
  console.error('❌ Cloudinary environment variables not set!');
  console.error('Please check your .env file');
  process.exit(1);
}

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const PHOTOS_DIR = path.join(__dirname, '..', 'photos');
const TEMP_DIR = path.join(__dirname, '..', '.temp-uploads');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

async function compressImageIfNeeded(filePath, fileName) {
  const stats = fs.statSync(filePath);
  
  // If file is smaller than 10MB, no compression needed
  if (stats.size <= MAX_FILE_SIZE) {
    return { path: filePath, compressed: false };
  }
  
  console.log(`  📦 Compressing ${fileName} (${(stats.size / 1024 / 1024).toFixed(1)}MB)...`);
  
  ensureDir(TEMP_DIR);
  const tempPath = path.join(TEMP_DIR, `compressed_${Date.now()}_${fileName}`);
  
  // Start with higher quality, decrease if still too large
  let quality = QUALITY;
  let width = null;
  
  while (quality >= 60) {
    try {
      let pipeline = sharp(filePath).jpeg({ quality: quality });
      if (width) {
        pipeline = pipeline.resize(width);
      }
      await pipeline.toFile(tempPath);
      
      const newStats = fs.statSync(tempPath);
      
      if (newStats.size <= MAX_FILE_SIZE) {
        console.log(`  ✅ Compressed to ${(newStats.size / 1024 / 1024).toFixed(1)}MB (quality: ${quality})`);
        return { path: tempPath, compressed: true };
      }
      
      // If still too large, delete and try with lower quality or smaller width
      fs.unlinkSync(tempPath);
      
      if (quality > 60) {
        quality -= 10;
        console.log(`  📦 Still too large, trying quality ${quality}%...`);
      } else if (!width) {
        // Get image metadata to resize
        const metadata = await sharp(filePath).metadata();
        width = Math.floor((metadata.width || 3000) * 0.8);
        quality = 80;
        console.log(`  📦 Trying smaller size ${width}px...`);
      } else {
        width = Math.floor(width * 0.8);
        console.log(`  📦 Trying even smaller ${width}px...`);
      }
    } catch (error) {
      console.log(`  ❌ Compression failed: ${error.message}`);
      return { path: filePath, compressed: false };
    }
  }
  
  console.log(`  ⚠️  Could not compress enough, will try anyway`);
  return { path: tempPath, compressed: true };
}

async function uploadFile(filePath, fileName, folderName) {
  const result = await cloudinary.uploader.upload(filePath, {
    folder: folderName,
    use_filename: true,
    unique_filename: true,
    overwrite: false,
    resource_type: 'image'
  });
  
  return result.secure_url;
}

async function uploadFolder(folderName) {
  const folderPath = path.join(PHOTOS_DIR, folderName);
  
  if (!fs.existsSync(folderPath)) {
    console.log(`⚠️  Folder not found: ${folderName}`);
    return { uploaded: 0, skipped: 0, compressed: 0 };
  }

  const files = fs.readdirSync(folderPath).filter(file => {
    const ext = path.extname(file).toLowerCase();
    return ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext);
  });

  console.log(`📁 Processing ${files.length} files from ${folderName}/...`);

  let uploaded = 0;
  let skipped = 0;
  let compressed = 0;

  for (const file of files) {
    const filePath = path.join(folderPath, file);
    
    try {
      // Compress if needed
      const { path: uploadPath, compressed: wasCompressed } = await compressImageIfNeeded(filePath, file);
      
      if (wasCompressed) compressed++;
      
      // Upload
      const url = await uploadFile(uploadPath, file, folderName);
      console.log(`  ✅ ${file} -> uploaded`);
      uploaded++;
      
      // Clean up temp file if we compressed
      if (wasCompressed && uploadPath.startsWith(TEMP_DIR)) {
        fs.unlinkSync(uploadPath);
      }
      
    } catch (error) {
      if (error.message && error.message.includes('already exists')) {
        console.log(`  ⏭️  ${file} (already exists)`);
        skipped++;
      } else {
        console.log(`  ❌ ${file} - ${error.message}`);
      }
    }
    
    // Add small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  return { uploaded, skipped, compressed };
}

function cleanTempDir() {
  if (fs.existsSync(TEMP_DIR)) {
    fs.rmSync(TEMP_DIR, { recursive: true, force: true });
    console.log('🧹 Cleaned up temp directory');
  }
}

async function main() {
  console.log('🚀 Starting Cloudinary upload with compression...\n');
  console.log(`Cloud Name: ${process.env.CLOUDINARY_CLOUD_NAME}`);
  console.log(`Max file size: 10MB`);
  console.log(`Compression quality: ${QUALITY}%\n`);

  if (!fs.existsSync(PHOTOS_DIR)) {
    console.error('❌ photos/ folder not found!');
    process.exit(1);
  }

  const folders = fs.readdirSync(PHOTOS_DIR).filter(item => {
    const itemPath = path.join(PHOTOS_DIR, item);
    return fs.statSync(itemPath).isDirectory();
  }).sort();

  console.log(`Found ${folders.length} album folders\n`);

  let totalUploaded = 0;
  let totalSkipped = 0;
  let totalCompressed = 0;

  // Cleanup temp dir at start
  cleanTempDir();

  for (const folder of folders) {
    const { uploaded, skipped, compressed } = await uploadFolder(folder);
    totalUploaded += uploaded;
    totalSkipped += skipped;
    totalCompressed += compressed;
    
    // Add delay between folders to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Cleanup temp dir at end
  cleanTempDir();

  console.log('\n========================================');
  console.log('📊 Upload Summary:');
  console.log(`   Uploaded:  ${totalUploaded} files`);
  console.log(`   Skipped:   ${totalSkipped} files`);
  console.log(`   Compressed: ${totalCompressed} files`);
  console.log('========================================\n');
  
  if (totalUploaded > 0) {
    console.log('✅ Upload complete!');
    console.log('Now set USE_CLOUDINARY=true in .env and run: npm run build\n');
  }
}

main().catch(console.error);
