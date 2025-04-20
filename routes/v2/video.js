import express from 'express';
import multer from 'multer';
import fs from 'fs/promises';
import { spawn } from 'child_process';

import wasabi from '../../utils/wasabiClient.js';
import Video from '../../models/v2/Video.js';
import VideoAlbum from '../../models/v2/VideoAlbum.js';
import Star from '../../models/v2/Star.js';
import verifyToken from '../../middleware/v1/authMiddleware.js';

const router = express.Router({ mergeParams: true });
const upload = multer({ dest: 'uploads/temp/' });

/* ───────── Helper functions ───────── */

async function compressVideo(inPath, outPath) {
  await new Promise((res, rej) => {
    const ffmpeg = spawn('ffmpeg', [
      '-i', inPath,
      '-vf', 'scale=1280:-2',
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '28',
      '-c:a', 'aac',
      '-b:a', '128k',
      outPath
    ]);

    ffmpeg.on('close', code => (code === 0 ? res() : rej(new Error(`FFmpeg failed with code ${code}`))));
  });
}

async function uploadToWasabi(localPath, key, contentType) {
  const buffer = await fs.readFile(localPath);
  const params = {
    Bucket: process.env.WASABI_BUCKET_NAME,
    Key: key,
    Body: buffer,
    ACL: 'public-read',
    ContentType: contentType
  };
  const { Location } = await wasabi.upload(params).promise();
  return Location;
}

/* ───────── Routes (/stars/:starId/video-albums/:albumId/videos) ─ */

router.post('/upload', verifyToken, upload.single('video'), async (req, res) => {
  const { starId, albumId } = req.params;
  try {
    /* Ownership check */
    const star = await Star.findOne({ _id: starId, userId: req.user.userId });
    const album = await VideoAlbum.findOne({ _id: albumId, starId });
    if (!star || !album) {
      return res.status(404).json({ message: 'Star/Album not found or forbidden' });
    }

    /* Compression and upload */
    const tempIn = req.file.path;
    const tempOut = `${tempIn}-compressed.mp4`;

    await compressVideo(tempIn, tempOut);

    const key = `stars/${starId}/video-albums/${albumId}/${Date.now()}.mp4`;
    const fileUrl = await uploadToWasabi(tempOut, key, 'video/mp4');

    /* Create DB record */
    const video = await Video.create({
      videoAlbumId: albumId,
      fileUrl
    });

    /* Cleanup temp files */
    await fs.unlink(tempIn).catch(() => {});
    await fs.unlink(tempOut).catch(() => {});

    res.status(201).json({ message: 'Video uploaded', video });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ message: 'Upload failed', error: err.message });
  }
});

// List videos in an album
router.get('/', verifyToken, async (req, res) => {
  const { starId, albumId } = req.params;
  try {
    const star = await Star.findOne({ _id: starId, userId: req.user.userId });
    const album = await VideoAlbum.findOne({ _id: albumId, starId });
    if (!star || !album) return res.status(404).json({ message: 'Star/Album not found or forbidden' });

    const videos = await Video.find({ videoAlbumId: albumId });
    res.json(videos);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

/* ───────── Detail Routes (/videos/detail/:id) ─ */

router.get('/detail/:id', verifyToken, async (req, res) => {
  const video = await Video.findById(req.params.id);
  if (!video) return res.status(404).json({ message: 'Video not found' });

  const album = await VideoAlbum.findById(video.videoAlbumId);
  const star = await Star.findOne({ _id: album.starId, userId: req.user.userId });
  if (!star) return res.status(403).json({ message: 'Forbidden' });

  res.json(video);
});

router.delete('/detail/:id', verifyToken, async (req, res) => {
  const video = await Video.findById(req.params.id);
  if (!video) return res.status(404).json({ message: 'Video not found' });

  const album = await VideoAlbum.findById(video.videoAlbumId);
  const star = await Star.findOne({ _id: album.starId, userId: req.user.userId });
  if (!star) return res.status(403).json({ message: 'Forbidden' });

  await video.deleteOne();
  res.json({ message: 'Video deleted' });
});

export default router;