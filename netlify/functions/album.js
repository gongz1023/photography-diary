/**
 * Album Detail API
 * 
 * 用于获取单个相册的详细信息
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

  const { folder } = req.query;
  if (!folder) {
    return res.status(400).json({ error: 'Missing folder parameter' });
  }

  try {
    const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;

    const result = await cloudinary.search
      .expression(`resource_type:image AND folder:${folder}`)
      .sort_by('created_at', 'asc')
      .max_results(500)
      .execute();

    const resources = result.resources || [];

    const images = resources.map(resource => {
      const originalFilename = resource.display_name || resource.public_id.split('/').pop();
      return {
        url: `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/v${resource.version}/${resource.public_id}.${resource.format}`,
        filename: originalFilename,
        publicId: resource.public_id,
        format: resource.format,
        width: resource.width,
        height: resource.height,
        createdAt: resource.created_at,
        bytes: resource.bytes
      };
    });

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.json({ folder, images, total: images.length });

  } catch (error) {
    console.error('Cloudinary API error:', error);
    res.status(500).json({ error: error.message });
  }
};
