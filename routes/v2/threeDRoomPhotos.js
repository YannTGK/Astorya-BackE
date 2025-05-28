// routes/v2/threeDRoomPhotos.js
import express         from 'express';
import multer          from 'multer';
import fs              from 'fs/promises';
import sharp           from 'sharp';
import wasabi          from '../../utils/wasabiClient.js';
import { presign }     from '../../utils/presign.js';
import Star            from '../../models/v2/Star.js';
import ThreeDRoom      from '../../models/v2/ThreeDRoom.js';
import ThreeDRoomPhoto from '../../models/v2/Photo.js';
import verifyToken     from '../../middleware/v1/authMiddleware.js';

const router = express.Router({ mergeParams: true });
const upload = multer({ dest: 'uploads/temp/' });

async function compressImage(inPath, outPath) {
  await sharp(inPath).rotate().resize({ width: 1600 }).jpeg({ quality: 80 }).toFile(outPath);
}

async function uploadToWasabi(localPath, key) {
  const buffer = await fs.readFile(localPath);
  await wasabi.upload({
    Bucket: process.env.WASABI_BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentType: 'image/jpeg',
  }).promise();
}

/**
 * GET all photos for a 3D-room.
 * - If the star is public (isPrivate===false): return without auth.
 * - Otherwise require authentication and ownership.
 */
router.get(
  '/',
  // 1) probeer publieke view
  async (req, res, next) => {
    const { starId, roomId } = req.params;
    try {
      const star = await Star.findById(starId);
      if (!star) return res.status(404).json({ message: 'Star not found' });
      // publieke ster?
      if (!star.isPrivate) {
        const photos = await ThreeDRoomPhoto.find({ photoAlbumId: roomId });
        const out = await Promise.all(photos.map(async p => ({
          _id: p._id,
          url: await presign(p.key, 3600),
        })));
        return res.json(out);
      }
      // anders: val terug
      next();
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Server error', error: err.message });
    }
  },
  // 2) private view: authenticate + eigenaar-check
  verifyToken,
  async (req, res) => {
    const { starId, roomId } = req.params;
    try {
      const star = await Star.findOne({ _id: starId, userId: req.user.userId });
      const room = await ThreeDRoom.findOne({ _id: roomId, starId });
      if (!star || !room) return res.status(404).json({ message: 'Not found or forbidden' });

      const photos = await ThreeDRoomPhoto.find({ photoAlbumId: roomId });
      const out = await Promise.all(photos.map(async p => ({
        _id: p._id,
        url: await presign(p.key, 3600),
      })));
      res.json(out);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Server error', error: err.message });
    }
  }
);

/**
 * POST upload a new photo
 * Requires authentication and ownership
 */
router.post(
  '/upload',
  verifyToken,
  upload.single('photo'),
  async (req, res) => {
    const { starId, roomId } = req.params;
    try {
      const star = await Star.findOne({ _id: starId, userId: req.user.userId });
      const room = await ThreeDRoom.findOne({ _id: roomId, starId });
      if (!star || !room) return res.status(404).json({ message: 'Star or Room not found' });

      // compress + upload
      const tmpIn = req.file.path;
      const tmpOut = `${tmpIn}-c.jpg`;
      await compressImage(tmpIn, tmpOut);
      const key = `stars/${starId}/three-d-rooms/${roomId}/${Date.now()}.jpg`;
      await uploadToWasabi(tmpOut, key);

      // save record
      const photo = await ThreeDRoomPhoto.create({ photoAlbumId: roomId, key });
      await fs.unlink(tmpIn).catch(() => {});
      await fs.unlink(tmpOut).catch(() => {});

      res.status(201).json({ photo });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Upload failed', error: err.message });
    }
  }
);

/**
 * DELETE a photo
 * Requires authentication and ownership
 */
router.delete(
  '/:id',
  verifyToken,
  async (req, res) => {
    try {
      const p = await ThreeDRoomPhoto.findById(req.params.id);
      if (!p) return res.status(404).json({ message: 'Photo not found' });

      const room = await ThreeDRoom.findById(p.photoAlbumId);
      const star = await Star.findOne({ _id: room.starId, userId: req.user.userId });
      if (!star) return res.status(403).json({ message: 'Forbidden' });

      // optioneel: delete from Wasabi
      await p.deleteOne();
      res.json({ message: 'Deleted' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Delete failed', error: err.message });
    }
  }
);

export default router;