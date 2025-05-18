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

// ───────── Helper: FFmpeg video compress ─────────
async function compressVideo(inPath, outPath) {
  return new Promise((resolve, reject) => {
    console.log("[FFMPEG] Start compress:", inPath, "->", outPath);
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
    ffmpeg.stdout.on('data', d => process.stdout.write(d));
    ffmpeg.stderr.on('data', d => process.stderr.write(d));
    ffmpeg.on('close', code => {
      if (code === 0) {
        console.log("[FFMPEG] Finished:", outPath);
        resolve();
      } else {
        reject(new Error(`FFmpeg exited with code ${code}`));
      }
    });
  });
}

// ───────── Helper: Upload to Wasabi ─────────
async function uploadToWasabi(localPath, key, contentType) {
  console.log("[WASABI] Uploading:", localPath, "as", key);
  const Body = await fs.readFile(localPath);
  await wasabi.upload({
    Bucket: process.env.WASABI_BUCKET_NAME,
    Key:    key,
    Body,
    ContentType: contentType,
  }).promise();
  console.log("[WASABI] Uploaded:", key);
}

// ───────── POST /upload (Upload een video) ─────────
router.post(
  '/upload',
  verifyToken,
  upload.single('video'),
  async (req, res) => {
    const { starId, albumId } = req.params;
    try {
      console.log("[UPLOAD] User:", req.user.userId, "Star:", starId, "Album:", albumId);

      // Multer file info
      if (!req.file) {
        console.error("[ERROR] No video file uploaded");
        return res.status(400).json({ message: "No video file uploaded" });
      }
      console.log("[UPLOAD] Uploaded file:", req.file);

      // Check rechten
      const star  = await Star.findOne({ _id: starId, userId: req.user.userId });
      const album = await VideoAlbum.findOne({ _id: albumId, starId });
      if (!star || !album) {
        console.error("[ERROR] Geen toegang tot ster/album");
        return res.status(404).json({ message: 'Star/Album not found or forbidden' });
      }

      // Compressie
      const tmpIn  = req.file.path;
      const tmpOut = `${tmpIn}-compressed.mp4`;
      await compressVideo(tmpIn, tmpOut);

      // Upload naar Wasabi
      const key = `stars/${starId}/video-albums/${albumId}/${Date.now()}.mp4`;
      await uploadToWasabi(tmpOut, key, 'video/mp4');

      // DB opslaan (LET OP: kleine letter 'key'!)
      const video = await Video.create({ videoAlbumId: albumId, key });
      console.log("[DB] Video record aangemaakt:", video);

      // Clean up
      await fs.unlink(tmpIn).catch(()=>{});
      await fs.unlink(tmpOut).catch(()=>{});

      res.status(201).json({ message: 'Video uploaded', video });
    } catch (err) {
      console.error('[FATAL UPLOAD ERROR]', err);
      res.status(500).json({ message: 'Upload failed', error: err.message });
    }
  }
);

// ───────── GET / (lijst video’s) ─────────
router.get('/', verifyToken, async (req, res) => {
  const { starId, albumId } = req.params;
  try {
    const star  = await Star.findOne({ _id: starId, userId: req.user.userId });
    const album = await VideoAlbum.findOne({ _id: albumId, starId });
    if (!star || !album) {
      console.error("[GET] Geen toegang tot ster/album");
      return res.status(404).json({ message: 'Star/Album not found or forbidden' });
    }

    const videos = await Video.find({ videoAlbumId: albumId });
    const out = await Promise.all(
      videos.map(async v => ({
        _id : v._id,
        url : await presign(v.key, 3600), // signed url 1u geldig
      }))
    );
    res.json(out);
  } catch (err) {
    console.error('[GET VIDEOS ERROR]', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// ───────── GET & DELETE /detail/:id ─────────
router.get('/detail/:id', verifyToken, async (req, res) => {
  try {
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
  } catch (err) {
    console.error('[GET VIDEO DETAIL ERROR]', err);
    res.status(500).json({ message: 'Detail error', error: err.message });
  }
});

router.delete('/detail/:id', verifyToken, async (req, res) => {
  try {
    const v = await Video.findById(req.params.id);
    if (!v) return res.status(404).json({ message: 'Video not found' });

    const album = await VideoAlbum.findById(v.videoAlbumId);
    const star  = await Star.findOne({ _id: album.starId, userId: req.user.userId });
    if (!star) return res.status(403).json({ message: 'Forbidden' });

    try {
      await wasabi.deleteObject({
        Bucket: process.env.WASABI_BUCKET_NAME,
        Key:    v.key,
      }).promise();
      console.log("[WASABI] Deleted", v.key);
    } catch (e) {
      console.warn('[DELETE WARNING] Wasabi delete:', e.message);
    }
    await v.deleteOne();
    res.json({ message: 'Video deleted' });
  } catch (err) {
    console.error('[DELETE VIDEO ERROR]', err);
    res.status(500).json({ message: 'Delete error', error: err.message });
  }
});

export default router;