// routes/v2/photos.js
import express  from 'express';
import multer   from 'multer';
import fs       from 'fs/promises';
import sharp    from 'sharp';

import wasabi   from '../../utils/wasabiClient.js';
import { presign } from '../../utils/presign.js';

import Photo      from '../../models/v2/Photo.js';
import PhotoAlbum from '../../models/v2/PhotoAlbum.js';
import Star       from '../../models/v2/Star.js';
import verifyToken from '../../middleware/v1/authMiddleware.js';

const router = express.Router({ mergeParams: true });
const upload = multer({ dest: 'uploads/temp/' });

/* ───────── helper-functies ───────── */
async function compressImage(inPath, outPath) {
  /*  rotate()  ➜ leest EXIF-orientation en draait de pixels,
      daarna resize + quality 80 % JPEG  */
  await sharp(inPath)
    .rotate()                 // ← FIX: auto-orient
    .resize({ width: 1600 })
    .jpeg({ quality: 80 })
    .toFile(outPath);
}

async function uploadToWasabi(localPath, key) {
  const buffer = await fs.readFile(localPath);
  await wasabi
    .upload({
      Bucket: process.env.WASABI_BUCKET_NAME,
      Key:    key,
      Body:   buffer,
      ContentType: 'image/jpeg',    // geen ACL → object blijft privé
    })
    .promise();
}

/* ───────── POST  /upload ───────── */
router.post(
  '/upload',
  verifyToken,
  upload.single('photo'),
  async (req, res) => {
    const { starId, albumId } = req.params;
    try {
      /* permissie-check */
      const star  = await Star.findOne({ _id: starId, userId: req.user.userId });
      const album = await PhotoAlbum.findOne({ _id: albumId, starId });
      if (!star || !album)
        return res.status(404).json({ message: 'Star/Album not found or forbidden' });

      /* compressie & upload */
      const tmpIn  = req.file.path;
      const tmpOut = `${tmpIn}-compressed.jpg`;
      await compressImage(tmpIn, tmpOut);

      const key = `stars/${starId}/albums/${albumId}/${Date.now()}.jpg`;
      await uploadToWasabi(tmpOut, key);

      /* DB-record */
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

/* ───────── GET /  – lijst foto’s ───────── */
router.get('/', verifyToken, async (req, res) => {
  const { starId, albumId } = req.params;
  try {
    const star  = await Star.findOne({ _id: starId, userId: req.user.userId });
    const album = await PhotoAlbum.findOne({ _id: albumId, starId });
    if (!star || !album)
      return res.status(404).json({ message: 'Star/Album not found or forbidden' });

    const photos = await Photo.find({ photoAlbumId: albumId });

    /* presigned download-urls (1 u geldig) */
    const out = await Promise.all(
      photos.map(async p => ({
        _id: p._id,
        url: await presign(p.key, 3600),
      }))
    );
    res.json(out);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

/* ───────── GET & DELETE /detail/:id ───────── */
router.get('/detail/:id', verifyToken, async (req, res) => {
  const photo = await Photo.findById(req.params.id);
  if (!photo) return res.status(404).json({ message: 'Photo not found' });

  const album = await PhotoAlbum.findById(photo.photoAlbumId);
  const star  = await Star.findOne({ _id: album.starId, userId: req.user.userId });
  if (!star)  return res.status(403).json({ message: 'Forbidden' });

  res.json({
    _id: photo._id,
    url: await presign(photo.key, 36000),
    addedAt: photo.addedAt,
  });
});

router.delete('/detail/:id', verifyToken, async (req, res) => {
  const photo = await Photo.findById(req.params.id);
  if (!photo) return res.status(404).json({ message: 'Photo not found' });

  const album = await PhotoAlbum.findById(photo.photoAlbumId);
  const star  = await Star.findOne({ _id: album.starId, userId: req.user.userId });
  if (!star)  return res.status(403).json({ message: 'Forbidden' });

  /* object uit Wasabi verwijderen */
  try {
    await wasabi.deleteObject({
      Bucket: process.env.WASABI_BUCKET_NAME,
      Key:    photo.key,
    }).promise();
  } catch (e) {
    console.warn('S3 delete warning:', e.message);
  }

  await photo.deleteOne();
  res.json({ message: 'Photo deleted' });
});

export default router;