// routes/v2/videos.js
import express   from 'express';
import multer    from 'multer';
import fs        from 'fs/promises';
import { spawn } from 'child_process';

import wasabi    from '../../utils/wasabiClient.js';
import { presign } from '../../utils/presign.js';

import Video      from '../../models/v2/Video.js';
import VideoAlbum from '../../models/v2/VideoAlbum.js';
import Star       from '../../models/v2/Star.js';
import verifyToken from '../../middleware/v1/authMiddleware.js';

const router = express.Router({ mergeParams: true });
const upload = multer({ dest: 'uploads/temp/' });

/** Try to compress via ffmpeg; on error, just copy original to outPath */
async function compressVideo(inPath, outPath) {
  console.log('[FFMPEG] spawning compression');
  return new Promise((resolve) => {
    const ffmpeg = spawn('ffmpeg', [
      '-y', '-i', inPath,
      '-vf', 'scale=1280:-2',
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '28',
      '-c:a', 'aac',
      '-b:a', '128k',
      outPath
    ]);

    ffmpeg.on('error', (err) => {
      console.warn('[FFMPEG] spawn error, skipping compression:', err.message);
      resolve(false);
    });

    ffmpeg.on('close', async (code) => {
      if (code === 0) {
        console.log('[FFMPEG] compression succeeded');
        resolve(true);
      } else {
        console.warn(`[FFMPEG] exit code ${code}, skipping compression`);
        resolve(false);
      }
    });
  });
}

async function uploadToWasabi(localPath, key, contentType) {
  console.log('[WASABI] reading file for upload:', localPath);
  const Body = await fs.readFile(localPath);
  await wasabi.upload({
    Bucket: process.env.WASABI_BUCKET_NAME,
    Key,
    Body,
    ContentType: contentType,
  }).promise();
  console.log('[WASABI] upload complete:', key);
}

// ───────── POST /upload ─────────
router.post(
  '/upload',
  verifyToken,
  upload.single('video'),
  async (req, res) => {
    const { starId, albumId } = req.params;
    console.log('➡️ [POST] upload video', { user: req.user.userId, starId, albumId });
    if (!req.file) {
      console.error('[UPLOAD] no file in request');
      return res.status(400).json({ message: 'No video file uploaded' });
    }

    try {
      // permissions
      const star  = await Star.findOne({ _id: starId, userId: req.user.userId });
      const album = await VideoAlbum.findOne({ _id: albumId, starId });
      if (!star || !album) {
        console.error('[UPLOAD] forbidden or not found');
        return res.status(404).json({ message: 'Star/Album not found or forbidden' });
      }

      const tmpIn  = req.file.path;
      const tmpOut = `${tmpIn}-compressed.mp4`;

      // try compress, fallback to original
      const didCompress = await compressVideo(tmpIn, tmpOut);
      const fileToUpload = didCompress ? tmpOut : tmpIn;
      if (!didCompress) console.log('[UPLOAD] using original file, no compression');

      const key = `stars/${starId}/video-albums/${albumId}/${Date.now()}.mp4`;
      await uploadToWasabi(fileToUpload, key, 'video/mp4');

      // save DB
      const video = await Video.create({ videoAlbumId: albumId, key });
      console.log('[DB] created video record', video._id);

      // cleanup
      await Promise.all([
        fs.unlink(tmpIn).catch(() => {}),
        didCompress ? fs.unlink(tmpOut).catch(() => {}) : Promise.resolve(),
      ]);

      return res.status(201).json({ message: 'Video uploaded', video });
    } catch (err) {
      console.error('[FATAL UPLOAD ERROR]', err);
      // ensure temp files removed
      req.file && fs.unlink(req.file.path).catch(() => {});
      return res.status(500).json({ message: 'Upload failed', error: err.message });
    }
  }
);

// ───────── GET / ─────────
router.get('/', verifyToken, async (req, res) => {
  const { starId, albumId } = req.params;
  console.log('➡️ [GET] list videos', { user: req.user.userId, starId, albumId });
  try {
    const star  = await Star.findOne({ _id: starId, userId: req.user.userId });
    const album = await VideoAlbum.findOne({ _id: albumId, starId });
    if (!star || !album) {
      console.error('[GET] forbidden or not found');
      return res.status(404).json({ message: 'Star/Album not found or forbidden' });
    }
    const videos = await Video.find({ videoAlbumId: albumId });
    const out = await Promise.all(
      videos.map(async (v) => ({
        _id: v._id,
        url: await presign(v.key, 3600),
      }))
    );
    return res.json(out);
  } catch (err) {
    console.error('[GET VIDEOS ERROR]', err);
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// ───────── GET & DELETE /detail/:id ─────────
router.get('/detail/:id', verifyToken, async (req, res) => {
  console.log('➡️ [GET] video detail', req.params.id);
  try {
    const v = await Video.findById(req.params.id);
    if (!v) return res.status(404).json({ message: 'Video not found' });

    const album = await VideoAlbum.findById(v.videoAlbumId);
    const star  = await Star.findOne({ _id: album.starId, userId: req.user.userId });
    if (!star) return res.status(403).json({ message: 'Forbidden' });

    const url = await presign(v.key, 3600);
    return res.json({ _id: v._id, url, createdAt: v.createdAt, updatedAt: v.updatedAt });
  } catch (err) {
    console.error('[GET DETAIL ERROR]', err);
    return res.status(500).json({ message: 'Detail error', error: err.message });
  }
});

router.delete('/detail/:id', verifyToken, async (req, res) => {
  console.log('➡️ [DELETE] video detail', req.params.id);
  try {
    const v = await Video.findById(req.params.id);
    if (!v) return res.status(404).json({ message: 'Video not found' });

    const album = await VideoAlbum.findById(v.videoAlbumId);
    const star  = await Star.findOne({ _id: album.starId, userId: req.user.userId });
    if (!star) return res.status(403).json({ message: 'Forbidden' });

    await wasabi.deleteObject({ Bucket: process.env.WASABI_BUCKET_NAME, Key: v.key }).promise();
    console.log('[WASABI] deleted object', v.key);
    await v.deleteOne();
    return res.json({ message: 'Video deleted' });
  } catch (err) {
    console.error('[DELETE ERROR]', err);
    return res.status(500).json({ message: 'Delete error', error: err.message });
  }
});

export default router;