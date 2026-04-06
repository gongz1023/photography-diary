/**
 * 图片压缩脚本 - 支持逐文件夹处理
 * 
 * 使用方法：
 *   node scripts/compress-photos.js                    # 压缩所有照片
 *   node scripts/compress-photos.js 2023-09-16        # 只压缩指定文件夹
 *   node scripts/compress-photos.js --check            # 检查哪些文件需要压缩
 * 
 * 特点：
 * - 优先保持最佳画质（质量92%起步）
 * - 逐文件夹处理，避免超时
 * - 已压缩的文件会被跳过
 */

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const PHOTOS_DIR = path.join(__dirname, '..', 'photos');
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const INITIAL_QUALITY = 92;
const MIN_QUALITY = 60;

function formatSize(bytes) {
  return (bytes / 1024 / 1024).toFixed(2) + 'MB';
}

function getFileSize(filePath) {
  try {
    return fs.statSync(filePath).size;
  } catch {
    return 0;
  }
}

async function compressImage(filePath, fileName) {
  const stats = fs.statSync(filePath);
  const originalSize = stats.size;
  
  if (originalSize <= MAX_FILE_SIZE) {
    return { 
      success: true, 
      compressed: false, 
      originalSize, 
      newSize: originalSize,
      message: '文件小于10MB，无需压缩'
    };
  }

  console.log(`  📦 ${fileName} (${formatSize(originalSize)})...`);

  let quality = INITIAL_QUALITY;
  let width = null;
  const tempPath = filePath + '.tmp';

  while (quality >= MIN_QUALITY) {
    try {
      let pipeline = sharp(filePath).jpeg({ quality });
      
      if (width) {
        pipeline = pipeline.resize(width);
      }
      
      await pipeline.toFile(tempPath);
      
      const newStats = fs.statSync(tempPath);
      const newSize = newStats.size;
      
      if (newSize <= MAX_FILE_SIZE) {
        const saved = originalSize - newSize;
        const percent = ((saved / originalSize) * 100).toFixed(1);
        fs.unlinkSync(filePath);
        fs.renameSync(tempPath, filePath);
        console.log(`  ✅ 压缩成功: ${formatSize(originalSize)} → ${formatSize(newSize)} (节省${percent}%)`);
        return { success: true, compressed: true, originalSize, newSize };
      }

      fs.unlinkSync(tempPath);

      if (quality > MIN_QUALITY) {
        quality -= 10;
        console.log(`  📦 仍然过大(${formatSize(newSize)})，降低质量到${quality}%...`);
      } else if (!width) {
        const metadata = await sharp(filePath).metadata();
        width = Math.floor((metadata.width || 3000) * 0.8);
        quality = 80;
        console.log(`  📦 缩小尺寸到${width}px...`);
      } else {
        width = Math.floor(width * 0.8);
        console.log(`  📦 继续缩小到${width}px...`);
      }
    } catch (error) {
      console.log(`  ❌ 压缩失败: ${error.message}`);
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
      if (quality > MIN_QUALITY) {
        quality -= 10;
      } else {
        break;
      }
    }
  }

  console.log(`  ⚠️  无法压缩到10MB以内，当前${formatSize(getFileSize(filePath))}`);
  return { success: false, compressed: false, originalSize, newSize: getFileSize(filePath) };
}

async function compressFolder(folderName) {
  const folderPath = path.join(PHOTOS_DIR, folderName);
  
  if (!fs.existsSync(folderPath)) {
    console.log(`❌ 文件夹不存在: ${folderName}`);
    return { total: 0, compressed: 0, skipped: 0, failed: 0 };
  }

  const files = fs.readdirSync(folderPath).filter(file => {
    const ext = path.extname(file).toLowerCase();
    return ['.jpg', '.jpeg', '.png', '.webp'].includes(ext);
  });

  if (files.length === 0) {
    console.log(`📁 ${folderName}/ - 无图片文件`);
    return { total: 0, compressed: 0, skipped: 0, failed: 0 };
  }

  console.log(`\n📁 处理文件夹: ${folderName}/ (${files.length} 个文件)`);
  console.log('─'.repeat(50));

  let compressed = 0;
  let skipped = 0;
  let failed = 0;
  let totalSaved = 0;

  for (const file of files) {
    const filePath = path.join(folderPath, file);
    const fileSize = getFileSize(filePath);
    
    if (fileSize <= MAX_FILE_SIZE) {
      console.log(`  ⏭️  ${file} - 无需压缩 (${formatSize(fileSize)})`);
      skipped++;
      continue;
    }

    const result = await compressImage(filePath, file);
    
    if (result.success) {
      compressed++;
      totalSaved += result.originalSize - result.newSize;
    } else {
      failed++;
    }
  }

  console.log('─'.repeat(50));
  console.log(`📊 ${folderName}/ 处理完成:`);
  console.log(`   ✅ 压缩: ${compressed} 个文件`);
  console.log(`   ⏭️  跳过: ${skipped} 个文件`);
  if (failed > 0) console.log(`   ❌ 失败: ${failed} 个文件`);
  if (totalSaved > 0) console.log(`   💾 节省: ${formatSize(totalSaved)}`);

  return { total: files.length, compressed, skipped, failed, saved: totalSaved };
}

async function checkFolders() {
  const folders = fs.readdirSync(PHOTOS_DIR)
    .filter(item => {
      const itemPath = path.join(PHOTOS_DIR, item);
      return fs.statSync(itemPath).isDirectory();
    })
    .sort();

  console.log('\n📊 检查所有文件夹...\n');

  let totalFiles = 0;
  let filesToCompress = 0;
  let totalSize = 0;
  let sizeToCompress = 0;

  for (const folder of folders) {
    const folderPath = path.join(PHOTOS_DIR, folder);
    const files = fs.readdirSync(folderPath).filter(file => {
      const ext = path.extname(file).toLowerCase();
      return ['.jpg', '.jpeg', '.png', '.webp'].includes(ext);
    });

    let folderToCompress = 0;
    let folderSize = 0;
    let folderToCompressSize = 0;

    for (const file of files) {
      const filePath = path.join(folderPath, file);
      const size = getFileSize(filePath);
      totalFiles++;
      totalSize += size;
      folderSize += size;
      
      if (size > MAX_FILE_SIZE) {
        filesToCompress++;
        sizeToCompress += size;
        folderToCompress++;
        folderToCompressSize += size;
      }
    }

    const status = folderToCompress > 0 ? `🔴 ${folderToCompress}个文件需压缩` : '🟢 无需处理';
    console.log(`${status} | ${folder} - ${files.length}个文件`);
  }

  console.log('\n' + '─'.repeat(50));
  console.log('📊 总计:');
  console.log(`   📁 文件夹: ${folders.length} 个`);
  console.log(`   📷 图片: ${totalFiles} 个`);
  console.log(`   🔴 需压缩: ${filesToCompress} 个 (${formatSize(sizeToCompress)})`);
  console.log(`   💾 总大小: ${formatSize(totalSize)}`);
  console.log('─'.repeat(50));

  if (filesToCompress > 0) {
    console.log(`\n💡 运行 "node scripts/compress-photos.js" 开始压缩\n`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const targetFolder = args[0];
  const isCheckMode = args.includes('--check');

  if (isCheckMode) {
    await checkFolders();
    return;
  }

  const folders = fs.readdirSync(PHOTOS_DIR)
    .filter(item => {
      const itemPath = path.join(PHOTOS_DIR, item);
      return fs.statSync(itemPath).isDirectory();
    })
    .sort();

  console.log('🖼️  图片压缩脚本');
  console.log('═'.repeat(50));
  console.log(`📂 照片目录: ${PHOTOS_DIR}`);
  console.log(`📏 最大文件大小: 10MB`);
  console.log('═'.repeat(50));

  let totalCompressed = 0;
  let totalSkipped = 0;
  let totalFailed = 0;
  let totalSaved = 0;

  if (targetFolder) {
    // 处理指定文件夹
    const result = await compressFolder(targetFolder);
    totalCompressed += result.compressed;
    totalSkipped += result.skipped;
    totalFailed += result.failed;
    totalSaved += result.saved || 0;
  } else {
    // 处理所有文件夹，逐个进行
    for (const folder of folders) {
      const result = await compressFolder(folder);
      totalCompressed += result.compressed;
      totalSkipped += result.skipped;
      totalFailed += result.failed;
      totalSaved += result.saved || 0;

      // 文件夹之间添加延迟
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  console.log('\n' + '═'.repeat(50));
  console.log('📊 总体统计:');
  console.log(`   ✅ 压缩: ${totalCompressed} 个文件`);
  console.log(`   ⏭️  跳过: ${totalSkipped} 个文件`);
  if (totalFailed > 0) console.log(`   ❌ 失败: ${totalFailed} 个文件`);
  if (totalSaved > 0) console.log(`   💾 总共节省: ${formatSize(totalSaved)}`);
  console.log('═'.repeat(50));

  if (totalCompressed > 0) {
    console.log('\n✅ 压缩完成！照片现在可以上传到Cloudinary了。');
    console.log('   运行: npm run upload\n');
  }
}

main().catch(console.error);
