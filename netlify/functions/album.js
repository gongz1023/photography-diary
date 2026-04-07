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

exports.handler = async function(event, context) {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const params = event.queryStringParameters || {};
  const folder = params.folder;
  
  if (!folder) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing folder parameter' }) };
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

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300'
      },
      body: JSON.stringify({ folder, images, total: images.length })
    };

  } catch (error) {
    console.error('Cloudinary API error:', error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
