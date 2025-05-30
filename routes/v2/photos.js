// routes/v2/photos.js
import express  from 'express';
import multer   from 'multer';
import fs       from 'fs/promises';
import sharp    from 'sharp';

import wasabi     from '../../utils/wasabiClient.js';
import { presign } from '../../utils/presign.js';

import Photo      from '../../models/v2/Photo.js';
import PhotoAlbum from '../../models/v2/PhotoAlbum.js';
import Star       from '../../models/v2/Star.js';
import verifyToken from '../../middleware/v1/authMiddleware.js';

const router = express.Router({ mergeParams: true });
const upload = multer({ dest: 'uploads/temp/' });

/**
 * Helper to load an album and its star, and check view/edit rights
 * at both the star level and the album level.
 * @param {string} albumId
 * @param {string} userId
 * @param {boolean} requireEdit  if true, requires edit rights; otherwise view rights suffice
 * @returns {{ album: PhotoAlbum, star: Star }|null}
 */
async function loadAlbumWithAccess(albumId, userId, requireEdit = false) {
  const album = await PhotoAlbum.findById(albumId);
  if (!album) return null;

  const star = await Star.findById(album.starId);
  if (!star) return null;

  const isOwner     = String(star.userId) === userId;
  const starCanView = Array.isArray(star.canView) && star.canView.map(String).includes(userId);
  const starCanEdit = Array.isArray(star.canEdit) && star.canEdit.map(String).includes(userId);
  const albumCanView = Array.isArray(album.canView) && album.canView.map(String).includes(userId);
  const albumCanEdit = Array.isArray(album.canEdit) && album.canEdit.map(String).includes(userId);

  if (requireEdit) {
    if (!isOwner && !starCanEdit && !albumCanEdit) {
      return null;
    }
  } else {
    if (!isOwner && !starCanView && !starCanEdit && !albumCanView && !albumCanEdit) {
      return null;
    }
  }

  return { album, star };
}

async function compressImage(inPath, outPath) {
  await sharp(inPath)
    .rotate()
    .resize({ width: 1600 })
    .jpeg({ quality: 80 })
    .toFile(outPath);
}

async function duplicateInWasabi(srcKey, dstKey) {
  await wasabi.copyObject({
    Bucket: process.env.WASABI_BUCKET_NAME,
    CopySource: `/${process.env.WASABI_BUCKET_NAME}/${srcKey}`,
    Key: dstKey,
    MetadataDirective: 'COPY',
  }).promise();
}

async function uploadToWasabi(localPath, key) {
  const buffer = await fs.readFile(localPath);
  await wasabi.upload({
    Bucket: process.env.WASABI_BUCKET_NAME,
    Key:    key,
    Body:   buffer,
    ContentType: 'image/jpeg',
  }).promise();
}


/** ─── POST /upload ─── upload into an album (owner or album-editor/star-editor) */
router.post(
  '/upload',
  verifyToken,
  upload.single('photo'),
  async (req, res) => {
    const { starId, albumId } = req.params;
    try {
      const access = await loadAlbumWithAccess(albumId, req.user.userId, true);
      if (!access || String(access.album.starId) !== starId) {
        return res.status(404).json({ message: 'Album not found or access forbidden' });
      }

      const tmpIn  = req.file.path;
      const tmpOut = `${tmpIn}-compressed.jpg`;
      await compressImage(tmpIn, tmpOut);

      const key = `stars/${starId}/albums/${albumId}/${Date.now()}.jpg`;
      await uploadToWasabi(tmpOut, key);

      const photo = await Photo.create({ photoAlbumId: albumId, key });

      await fs.unlink(tmpIn).catch(() => {});
      await fs.unlink(tmpOut).catch(() => {});

      res.status(201).json({ message: 'Photo uploaded', photo });
    } catch (err) {
      console.error('Upload error:', err);
      res.status(500).json({ message: 'Upload failed', error: err.message });
    }
  }
);


/** ─── GET / ─── list photos (owner, star-viewer/editor, or album-viewer/editor) */
router.get('/', verifyToken, async (req, res) => {
  const { starId, albumId } = req.params;
  try {
    const access = await loadAlbumWithAccess(albumId, req.user.userId, false);
    if (!access || String(access.album.starId) !== starId) {
      return res.status(404).json({ message: 'Album not found or access forbidden' });
    }

    const photos = await Photo.find({ photoAlbumId: albumId });
    const out = await Promise.all(
      photos.map(async p => ({
        _id: p._id,
        url: await presign(p.key, 3600),
      }))
    );
    res.json(out);
  } catch (err) {
    console.error('List photos error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});


/** ─── GET /detail/:id ─── get one photo (same access rules) */
router.get('/detail/:id', verifyToken, async (req, res) => {
  try {
    const photo = await Photo.findById(req.params.id);
    if (!photo) {
      return res.status(404).json({ message: 'Photo not found' });
    }

    const access = await loadAlbumWithAccess(photo.photoAlbumId, req.user.userId, false);
    if (!access) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    res.json({
      _id:     photo._id,
      url:     await presign(photo.key, 36000),
      addedAt: photo.addedAt,
    });
  } catch (err) {
    console.error('Get photo detail error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});


/** ─── DELETE /detail/:id ─── remove one photo (owner, star-editor, or album-editor) */
router.delete('/detail/:id', verifyToken, async (req, res) => {
  try {
    const photo = await Photo.findById(req.params.id);
    if (!photo) {
      return res.status(404).json({ message: 'Photo not found' });
    }

    const access = await loadAlbumWithAccess(photo.photoAlbumId, req.user.userId, true);
    if (!access) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const duplicates = await Photo.countDocuments({ key: photo.key });
    if (duplicates === 1) {
      try {
        await wasabi.deleteObject({
          Bucket: process.env.WASABI_BUCKET_NAME,
          Key: photo.key,
        }).promise();
      } catch (e) {
        console.warn('S3 delete warning:', e.message);
      }
    }

    await photo.deleteOne();
    res.json({ message: 'Photo deleted' });
  } catch (err) {
    console.error('Delete photo error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});


/** ─── POST /copy ─── copy selected photos (owner, star-editor, or album-editor) */
router.post('/copy', verifyToken, async (req, res) => {
  const { starId, albumId } = req.params;
  const { photoIds = [] }   = req.body;
  try {
    const access = await loadAlbumWithAccess(albumId, req.user.userId, true);
    if (!access) {
      return res.status(404).json({ message: 'Album not found or access forbidden' });
    }

    const photos = await Photo.find({ _id: { $in: photoIds } });
    await Promise.all(photos.map(async p => {
      const newKey = `stars/${starId}/albums/${albumId}/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
      await duplicateInWasabi(p.key, newKey);
      await Photo.create({ photoAlbumId: albumId, key: newKey });
    }));

    res.json({ message: 'Copied', added: photos.length });
  } catch (err) {
    console.error('Copy photos error:', err);
    res.status(500).json({ message: 'Copy failed', error: err.message });
  }
});


/** ─── POST /move ─── move selected photos (owner, star-editor, or album-editor) */
router.post('/move', verifyToken, async (req, res) => {
  const { starId, albumId } = req.params;
  const { photoIds }        = req.body;
  if (!Array.isArray(photoIds) || photoIds.length === 0) {
    return res.status(400).json({ message: 'photoIds (array) required' });
  }

  try {
    const access = await loadAlbumWithAccess(albumId, req.user.userId, true);
    if (!access) {
      return res.status(404).json({ message: 'Album not found or access forbidden' });
    }

    let moved = 0;
    for (const pid of photoIds) {
      const src = await Photo.findById(pid);
      if (!src) continue;
      const srcAlbum = await PhotoAlbum.findById(src.photoAlbumId);
      if (!srcAlbum || String(srcAlbum.starId) !== String(starId)) continue;

      await Photo.create({
        photoAlbumId: albumId,
        key:          src.key,
        addedAt:      new Date(),
      });
      await src.deleteOne();
      moved++;
    }

    res.json({ success: true, movedCount: moved });
  } catch (err) {
    console.error('Move photos error:', err);
    res.status(500).json({ message: 'Move failed', error: err.message });
  }
});

export default router;