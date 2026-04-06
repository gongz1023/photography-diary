/**
 * Cloudinary API Proxy
 * 
 * 用于从Cloudinary获取相册数据，保护API密钥
 * 
 * 在Netlify Functions或Vercel API Routes中使用
 */

require('dotenv').config();
const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const result = await cloudinary.search
      .expression('resource_type:image')
      .with_field('context')
      .with_field('tags')
      .sort_by('created_at', 'desc')
      .max_results(500)
      .execute();

    const resources = result.resources || [];
    const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;

    const folderMap = new Map();

    resources.forEach(resource => {
      const folder = resource.asset_folder || resource.folder || '';
      const originalFilename = resource.display_name || resource.public_id.split('/').pop();
      const format = resource.format;
      const publicId = resource.public_id;

      if (!folder) return;

      if (!folderMap.has(folder)) {
        folderMap.set(folder, {
          folderName: folder,
          date: folder,
          title: folder,
          images: [],
          fileSlug: folder
        });
      }

      folderMap.get(folder).images.push({
        url: `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/v${resource.version}/${publicId}.${format}`,
        filename: originalFilename,
        publicId: publicId,
        format: format,
        width: resource.width,
        height: resource.height,
        createdAt: resource.created_at,
        bytes: resource.bytes
      });
    });

    const albums = Array.from(folderMap.values())
      .filter(album => album.folderName)
      .sort((a, b) => b.folderName.localeCompare(a.folderName));

    albums.forEach(album => {
      album.coverImage = album.images.length > 0 ? album.images[0].url : '';
      album.url = `/${album.folderName}/`;
      album.images.sort((a, b) => a.filename.localeCompare(b.filename));
    });

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=300'); // Cache for 5 minutes
    res.json({ albums, total: albums.length });

  } catch (error) {
    console.error('Cloudinary API error:', error);
    res.status(500).json({ error: error.message });
  }
};
