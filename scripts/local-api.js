require('dotenv').config();
const cloudinary = require('cloudinary').v2;
const express = require('express');
const cors = require('cors');
const path = require('path');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
const app = express();
app.use(cors());
app.use(express.static('_site'));

app.get('/:folder', (req, res) => {
  res.sendFile(path.join(__dirname, '..', '_site', 'album', 'index.html'));
});

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
    console.log('Fetched:', allResources.length, 'resources');

  } while (cursor);

  return allResources;
}

async function getAlbums() {
  console.log('Fetching all resources from Cloudinary...');
  const resources = await getAllResources();
  console.log('Total fetched:', resources.length);

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

async function getAlbum(folder) {
  const result = await cloudinary.search
    .expression(`resource_type:image AND folder:${folder}`)
    .sort_by('created_at', 'asc')
    .max_results(2500)
    .execute();

  return result.resources.map(r => ({
    url: `https://res.cloudinary.com/${CLOUD_NAME}/image/upload/v${r.version}/${r.public_id}.${r.format}`,
    filename: r.display_name || r.public_id.split('/').pop(),
    width: r.width,
    height: r.height
  }));
}

app.get('/.netlify/functions/albums', async (req, res) => {
  try {
    const albums = await getAlbums();
    res.json({ albums, total: albums.length });
  } catch (e) {
    console.error('Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get('/.netlify/functions/album', async (req, res) => {
  try {
    const { folder } = req.query;
    if (!folder) return res.status(400).json({ error: 'Missing folder' });
    const images = await getAlbum(folder);
    res.json({ folder, images, total: images.length });
  } catch (e) {
    console.error('Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`\n🚀 Server running at http://localhost:${PORT}`);
  console.log(`📡 Albums: http://localhost:${PORT}/.netlify/functions/albums`);
  console.log(`📷 Album: http://localhost:${PORT}/.netlify/functions/album?folder=2023-09-16\n`);
});
