// routes/v2/threeDRoomVideos.js
import express from 'express';
import multer  from 'multer';
import fs      from 'fs/promises';
import wasabi  from '../../utils/wasabiClient.js';
import { presign } from '../../utils/presign.js';
import Star       from '../../models/v2/Star.js';
import ThreeDRoom from '../../models/v2/ThreeDRoom.js';
import Video      from '../../models/v2/Video.js';
import verifyToken from '../../middleware/v1/authMiddleware.js';

const router = express.Router({ mergeParams: true });
const upload = multer({ dest: 'uploads/temp/' });

async function uploadToWasabi(localPath, key, contentType) {
  const Body = await fs.readFile(localPath);
  await wasabi.upload({ Bucket: process.env.WASABI_BUCKET_NAME, Key: key, Body, ContentType: contentType }).promise();
}

// ───────── GET all videos (public for non-private stars, otherwise auth + owner) ─────────
router.get(
  '/',
  // 1) publieke view
  async (req, res, next) => {
    const { starId, roomId } = req.params;
    try {
      const star = await Star.findById(starId);
      if (!star) return res.status(404).json({ message: 'Star not found' });
      if (!star.isPrivate) {
        // publieke ster → lijst direct
        const vids = await Video.find({ videoAlbumId: roomId });
        const out = await Promise.all(
          vids.map(async v => ({ _id: v._id, url: await presign(v.key, 3600) }))
        );
        return res.json(out);
      }
      // anders fallback naar private handler
      next();
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Server error', error: err.message });
    }
  },
  // 2) private view (JWT + eigenaar)
  verifyToken,
  async (req, res) => {
    const { starId, roomId } = req.params;
    try {
      const star = await Star.findOne({ _id: starId, userId: req.user.userId });
      const room = await ThreeDRoom.findOne({ _id: roomId, starId });
      if (!star || !room) return res.status(404).json({ message: 'Not found or forbidden' });

      const vids = await Video.find({ videoAlbumId: roomId });
      const out = await Promise.all(
        vids.map(async v => ({ _id: v._id, url: await presign(v.key, 3600) }))
      );
      res.json(out);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Server error', error: err.message });
    }
  }
);

// ───────── POST /upload (video upload, private only) ─────────
router.post(
  '/upload',
  verifyToken,
  upload.single('video'),
  async (req, res) => {
    const { starId, roomId } = req.params;
    try {
      const star = await Star.findOne({ _id: starId, userId: req.user.userId });
      const room = await ThreeDRoom.findOne({ _id: roomId, starId });
      if (!star || !room) return res.status(404).json({ message: 'Star or Room not found' });

      if (!req.file) {
        return res.status(400).json({ message: 'No video file uploaded' });
      }
      const tmpPath = req.file.path;
      const key = `stars/${starId}/three-d-rooms/${roomId}/${Date.now()}.mp4`;
      await uploadToWasabi(tmpPath, key, 'video/mp4');
      const video = await Video.create({ videoAlbumId: roomId, key });
      await fs.unlink(tmpPath).catch(() => {});
      res.status(201).json({ video });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Upload failed', error: err.message });
    }
  }
);

// ───────── DELETE /detail/:id (video delete, private only) ─────────
router.delete(
  '/detail/:id',
  verifyToken,
  async (req, res) => {
    try {
      const v = await Video.findById(req.params.id);
      if (!v) return res.status(404).json({ message: 'Video not found' });

      const room = await ThreeDRoom.findById(v.videoAlbumId);
      const star = await Star.findOne({ _id: room.starId, userId: req.user.userId });
      if (!star) return res.status(403).json({ message: 'Forbidden' });

      await v.deleteOne();
      res.json({ message: 'Deleted' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Delete failed', error: err.message });
    }
  }
);

export default router;