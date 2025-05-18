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

/** 
 * Transcode met ffmpeg: schaling, h264 + AAC 
 */
async function compressVideo(inPath, outPath) {
  await new Promise((resolve, reject) => {
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
    ffmpeg.on('close', code => code === 0 ? resolve() : reject(new Error(`FFmpeg exit ${code}`)));
  });
}

/** 
 * Upload buffer naar Wasabi, privé 
 */
async function uploadToWasabi(localPath, key, contentType) {
  const Body = await fs.readFile(localPath);
  await wasabi.upload({
    Bucket: process.env.WASABI_BUCKET_NAME,
    Key:    key,
    Body,
    ContentType: contentType,
  }).promise();
}

// ───────── POST  /upload ─────────
router.post(
  '/upload',
  verifyToken,
  upload.single('video'),
  async (req, res) => {
    const { starId, albumId } = req.params;
    try {
      // permissie-check
      const star  = await Star.findOne({ _id: starId, userId: req.user.userId });
      const album = await VideoAlbum.findOne({ _id: albumId, starId });
      if (!star || !album) return res.status(404).json({ message: 'Star/Album not found or forbidden' });

      // compress & upload
      const tmpIn  = req.file.path;
      const tmpOut = `${tmpIn}-compressed.mp4`;
      await compressVideo(tmpIn, tmpOut);

      const key = `stars/${starId}/video-albums/${albumId}/${Date.now()}.mp4`;
      await uploadToWasabi(tmpOut, key, 'video/mp4');

      // DB record
      const video = await Video.create({ videoAlbumId: albumId, key });

      // cleanup
      await fs.unlink(tmpIn).catch(()=>{});
      await fs.unlink(tmpOut).catch(()=>{});

      res.status(201).json({ message: 'Video uploaded', video });
    } catch (err) {
      console.error('Upload error:', err);
      res.status(500).json({ message: 'Upload failed', error: err.message });
    }
  }
);

// ───────── GET / ─────────  lijst video’s
router.get('/', verifyToken, async (req, res) => {
  const { starId, albumId } = req.params;
  try {
    const star  = await Star.findOne({ _id: starId, userId: req.user.userId });
    const album = await VideoAlbum.findOne({ _id: albumId, starId });
    if (!star || !album) return res.status(404).json({ message: 'Star/Album not found or forbidden' });

    const videos = await Video.find({ videoAlbumId: albumId });
    // Generate presigned URLs for playback (1h expiry)
    const out = await Promise.all(
      videos.map(async v => ({
        _id : v._id,
        url : await presign(v.key, 3600),   // <-- presign function for Wasabi
      }))
    );
    res.json(out);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// ───────── GET & DELETE /detail/:id ─────────
router.get('/detail/:id', verifyToken, async (req, res) => {
  const v = await Video.findById(req.params.id);
  if (!v) return res.status(404).json({ message: 'Video not found' });

  const album = await VideoAlbum.findById(v.videoAlbumId);
  const star  = await Star.findOne({ _id: album.starId, userId: req.user.userId });
  if (!star) return res.status(403).json({ message: 'Forbidden' });

  res.json({
    _id: v._id,
    url: await presign(v.key, 3600),
    createdAt: v.createdAt,
    updatedAt: v.updatedAt,
  });
});

router.delete('/detail/:id', verifyToken, async (req, res) => {
  const v = await Video.findById(req.params.id);
  if (!v) return res.status(404).json({ message: 'Video not found' });

  const album = await VideoAlbum.findById(v.videoAlbumId);
  const star  = await Star.findOne({ _id: album.starId, userId: req.user.userId });
  if (!star) return res.status(403).json({ message: 'Forbidden' });

  // delete object
  try {
    await wasabi.deleteObject({
      Bucket: process.env.WASABI_BUCKET_NAME,
      Key:    v.key,
    }).promise();
  } catch (e) {
    console.warn('Wasabi delete warning:', e.message);
  }

  await v.deleteOne();
  res.json({ message: 'Video deleted' });
});

export default router;