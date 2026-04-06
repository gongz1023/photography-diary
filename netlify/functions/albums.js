/**
 * Cloudinary Albums API
 * 
 * 用于从Cloudinary获取所有相册数据，保护API密钥
 * 使用分页获取所有资源
 */

require('dotenv').config();
const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;

async function getAllResources() {
  let allResources = [];
  let cursor = null;

  do {
    let query = cloudinary.search
      .expression('resource_type:image')
      .sort_by('created_at', 'desc')
      .max_results(500);

    if (cursor) query = query.next_cursor(cursor);

    const result = await query.execute();
    allResources = allResources.concat(result.resources || []);
    cursor = result.next_cursor;

  } while (cursor);

  return allResources;
}

async function getAlbums() {
  const resources = await getAllResources();
  const folderMap = new Map();

  resources.forEach(resource => {
    const folder = resource.asset_folder || resource.folder || '';
    if (!folder) return;

    if (!folderMap.has(folder)) {
      folderMap.set(folder, { folderName: folder, images: [] });
    }

    folderMap.get(folder).images.push({
      url: `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/v${resource.version}/${resource.public_id}.${resource.format}`,
      filename: resource.display_name || resource.public_id.split('/').pop(),
      width: resource.width,
      height: resource.height
    });
  });

  return Array.from(folderMap.values())
    .filter(a => a.folderName)
    .sort((a, b) => b.folderName.localeCompare(a.folderName))
    .map(a => ({
      ...a,
      date: a.folderName,
      title: a.folderName,
      coverImage: a.images[0]?.url || '',
      url: `/${a.folderName}/`
    }));
}

exports.handler = async function(event, context) {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const albums = await getAlbums();
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ albums, total: albums.length })
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
