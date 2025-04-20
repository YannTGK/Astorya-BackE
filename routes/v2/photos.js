import express   from 'express';
import multer    from 'multer';
import fs        from 'fs/promises';
import sharp     from 'sharp';

import wasabi    from '../../utils/wasabiClient.js';
import Photo      from '../../models/v2/Photo.js';
import PhotoAlbum from '../../models/v2/PhotoAlbum.js';
import Star       from '../../models/v2/Star.js';
import verifyToken from '../../middleware/v1/authMiddleware.js';

const router  = express.Router({ mergeParams: true });
const upload  = multer({ dest: 'uploads/temp/' });

/* ───────── Helper‑functies ───────── */

async function compressImage(inPath, outPath) {
  // ➜ past hoogte/breedte en kwaliteit aan, 80 % JPEG
  await sharp(inPath)
    .resize({ width: 1600 })
    .jpeg({ quality: 80 })
    .toFile(outPath);
}

async function uploadToWasabi(localPath, key) {
  const buffer = await fs.readFile(localPath);
  const params = {
    Bucket:  process.env.WASABI_BUCKET_NAME,
    Key:     key,
    Body:    buffer,
    ACL:     'public-read',
    ContentType: 'image/jpeg'
  };
  const { Location } = await wasabi.upload(params).promise();
  return Location;                  // publieke URL als fileUrl
}

/* ───────── Geneste routes  (/stars/:starId/photo-albums/:albumId/photos) ─ */

router.post(
  '/upload',
  verifyToken,
  upload.single('photo'),
  async (req, res) => {
    const { starId, albumId } = req.params;
    try {
      /* ── eigendoms‑controle ───────────────────────── */
      const star  = await Star.findOne({ _id: starId, userId: req.user.userId });
      const album = await PhotoAlbum.findOne({ _id: albumId, starId });
      if (!star || !album) {
        return res.status(404).json({ message: 'Star/Album not found or forbidden' });
      }

      /* ── compressie → upload naar Wasabi ─────────── */
      const tempIn  = req.file.path;
      const tempOut = `${tempIn}-compressed.jpg`;
      await compressImage(tempIn, tempOut);

      const key     = `stars/${starId}/albums/${albumId}/${Date.now()}.jpg`;
      const fileUrl = await uploadToWasabi(tempOut, key);

      /* ── DB‑record ───────────────────────────────── */
      const photo = await Photo.create({
        photoAlbumId: albumId,
        fileUrl
      });

      /* ── opruimen temp‑files ─────────────────────── */
      await fs.unlink(tempIn).catch(() => {});
      await fs.unlink(tempOut).catch(() => {});

      res.status(201).json({ message: 'Photo uploaded', photo });
    } catch (err) {
      console.error('Upload error:', err);
      res.status(500).json({ message: 'Upload failed', error: err.message });
    }
  }
);

// lijst foto’s van album
router.get('/', verifyToken, async (req, res) => {
  const { starId, albumId } = req.params;
  try {
    const star  = await Star.findOne({ _id: starId, userId: req.user.userId });
    const album = await PhotoAlbum.findOne({ _id: albumId, starId });
    if (!star || !album) return res.status(404).json({ message: 'Star/Album not found or forbidden' });

    const photos = await Photo.find({ photoAlbumId: albumId });
    res.json(photos);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

/* ───────── Detail routes  (/photos/detail/:id) ─────────────────────── */

router.get('/detail/:id', verifyToken, async (req, res) => {
  const photo = await Photo.findById(req.params.id);
  if (!photo) return res.status(404).json({ message: 'Photo not found' });

  const album = await PhotoAlbum.findById(photo.photoAlbumId);
  const star  = await Star.findOne({ _id: album.starId, userId: req.user.userId });
  if (!star)  return res.status(403).json({ message: 'Forbidden' });

  res.json(photo);
});

router.delete('/detail/:id', verifyToken, async (req, res) => {
  const photo = await Photo.findById(req.params.id);
  if (!photo) return res.status(404).json({ message: 'Photo not found' });

  const album = await PhotoAlbum.findById(photo.photoAlbumId);
  const star  = await Star.findOne({ _id: album.starId, userId: req.user.userId });
  if (!star)  return res.status(403).json({ message: 'Forbidden' });

  await photo.deleteOne();
  // (optioneel) s3.deleteObject – laad key uit URL of sla key op in DB
  res.json({ message: 'Photo deleted' });
});

export default router;