import express   from 'express';
import multer    from 'multer';
import fs        from 'fs/promises';

import wasabi    from '../../utils/wasabiClient.js';
import { presign } from '../../utils/presign.js';

import Video      from '../../models/v2/Video.js';
import VideoAlbum from '../../models/v2/VideoAlbum.js';
import Star       from '../../models/v2/Star.js';
import verifyToken from '../../middleware/v1/authMiddleware.js';

const router = express.Router({ mergeParams: true });
const upload = multer({ dest: 'uploads/temp/' });

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

      // ✅ Check of file bestaat
      if (!req.file) {
        console.error("[ERROR] No video file uploaded");
        return res.status(400).json({ message: "No video file uploaded" });
      }
      console.log("[UPLOAD] Uploaded file:", req.file);

      // ✅ Check of gebruiker toegang heeft tot ster en album
      const star = await Star.findOne({ _id: starId, userId: req.user.userId });
      const album = await VideoAlbum.findOne({ _id: albumId, starId });

      if (!star || !album) {
        console.error("[ERROR] Geen toegang tot ster/album");
        return res.status(404).json({ message: 'Star/Album not found or forbidden' });
      }

      const filePath = req.file.path;
      const key = `stars/${starId}/video-albums/${albumId}/${Date.now()}.mp4`;

      // ✅ Upload originele bestand naar Wasabi
      await uploadToWasabi(filePath, key, 'video/mp4');

      // ✅ Opslaan in database
      const video = await Video.create({ videoAlbumId: albumId, key });
      console.log("[DB] Video record aangemaakt:", video._id);

      // ✅ Cleanup tijdelijke bestanden
      await fs.unlink(filePath).catch(() => {});

      return res.status(201).json({ message: 'Video uploaded', video });
    } catch (err) {
      console.error('[FATAL UPLOAD ERROR]', err);
      return res.status(500).json({
        message: 'Upload failed',
        error: err.message,
      });
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

// POST /videos/copy
router.post('/copy', verifyToken, async (req, res) => {
  const { videoIds, targetAlbumId } = req.body;
  const userId = req.user.userId;

  if (!Array.isArray(videoIds) || !targetAlbumId) {
    return res.status(400).json({ message: "Missing videoIds or targetAlbumId" });
  }

  const targetAlbum = await VideoAlbum.findById(targetAlbumId);
  if (!targetAlbum) {
    return res.status(404).json({ message: "Target album not found" });
  }

  const star = await Star.findOne({ _id: targetAlbum.starId, userId });
  if (!star) {
    return res.status(403).json({ message: "Forbidden" });
  }

  // ✅ Bestaande keys in doelalbum ophalen
  const existingVideos = await Video.find({ videoAlbumId: targetAlbumId });
  const existingKeys = new Set(existingVideos.map((v) => v.key));

  const created = [];
  let skipped = 0;

  for (const id of videoIds) {
    const original = await Video.findById(id);
    if (!original) continue;

    if (existingKeys.has(original.key)) {
      skipped++;
      continue; // ❌ Skip duplicaten
    }

    const copy = new Video({
      videoAlbumId: targetAlbumId,
      key: original.key,
    });

    await copy.save();
    created.push(copy._id);
  }

  res.json({
    message: `Videos copied: ${created.length}${skipped > 0 ? ` (${skipped} skipped)` : ""}`,
    copiedIds: created,
    skipped,
  });
});

// POST /videos/move
router.post('/move', verifyToken, async (req, res) => {
  const { videoIds } = req.body;
  const targetAlbumId = req.params.albumId;
  const userId = req.user.userId;

  if (!Array.isArray(videoIds) || !targetAlbumId) {
    return res.status(400).json({ message: "Missing videoIds or targetAlbumId" });
  }

  const targetAlbum = await VideoAlbum.findById(targetAlbumId);
  if (!targetAlbum) {
    return res.status(404).json({ message: "Target album not found" });
  }

  const star = await Star.findOne({ _id: targetAlbum.starId, userId });
  if (!star) {
    return res.status(403).json({ message: "Forbidden" });
  }

  const moved = [];

  for (const id of videoIds) {
    const video = await Video.findById(id);
    if (!video) continue;

    const oldAlbum = await VideoAlbum.findById(video.videoAlbumId);
    if (!oldAlbum || !oldAlbum.starId.equals(targetAlbum.starId)) continue;

    video.videoAlbumId = targetAlbumId;
    await video.save();
    moved.push(video._id);
  }

  res.json({ message: "Videos moved", movedIds: moved });
});

export default router;