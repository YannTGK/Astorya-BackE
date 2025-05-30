// routes/v2/videos.js
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

/**
 * Helper: load an album + its star, check view/edit rights on either.
 * @param {string} albumId
 * @param {string} userId
 * @param {boolean} requireEdit  if true, requires edit rights; else view suffices
 * @returns {{ album: VideoAlbum, star: Star }|null}
 */
async function loadAlbumWithAccess(albumId, userId, requireEdit = false) {
  const album = await VideoAlbum.findById(albumId);
  if (!album) return null;

  const star = await Star.findById(album.starId);
  if (!star) return null;

  const isOwner     = String(star.userId) === userId;
  const starCanView  = Array.isArray(star.canView) && star.canView.map(String).includes(userId);
  const starCanEdit  = Array.isArray(star.canEdit) && star.canEdit.map(String).includes(userId);
  const albumCanView = Array.isArray(album.canView) && album.canView.map(String).includes(userId);
  const albumCanEdit = Array.isArray(album.canEdit) && album.canEdit.map(String).includes(userId);

  if (requireEdit) {
    if (!isOwner && !starCanEdit && !albumCanEdit) return null;
  } else {
    if (!isOwner && !starCanView && !starCanEdit && !albumCanView && !albumCanEdit) return null;
  }

  return { album, star };
}

// ───────── Helper: upload helper ─────────
async function uploadToWasabi(localPath, key, contentType) {
  const Body = await fs.readFile(localPath);
  await wasabi.upload({
    Bucket: process.env.WASABI_BUCKET_NAME,
    Key:    key,
    Body,
    ContentType: contentType,
  }).promise();
}

// ───────── POST /upload ─────────
router.post(
  '/upload',
  verifyToken,
  upload.single('video'),
  async (req, res) => {
    const { starId, albumId } = req.params;
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No video file uploaded" });
      }

      // need edit rights on album or star
      const access = await loadAlbumWithAccess(albumId, req.user.userId, true);
      if (!access || String(access.album.starId) !== starId) {
        return res.status(404).json({ message: 'Album not found or forbidden' });
      }

      const key = `stars/${starId}/video-albums/${albumId}/${Date.now()}.mp4`;
      await uploadToWasabi(req.file.path, key, 'video/mp4');

      const video = await Video.create({ videoAlbumId: albumId, key });
      await fs.unlink(req.file.path).catch(() => {});

      return res.status(201).json({ message: 'Video uploaded', video });
    } catch (err) {
      console.error('[VIDEO UPLOAD ERROR]', err);
      return res.status(500).json({ message: 'Upload failed', error: err.message });
    }
  }
);

// ───────── GET / ───────── list videos (view or edit)
router.get('/', verifyToken, async (req, res) => {
  const { starId, albumId } = req.params;
  try {
    const access = await loadAlbumWithAccess(albumId, req.user.userId, false);
    if (!access || String(access.album.starId) !== starId) {
      return res.status(404).json({ message: 'Album not found or forbidden' });
    }

    const videos = await Video.find({ videoAlbumId: albumId });
    const out = await Promise.all(
      videos.map(v => presign(v.key, 3600).then(url => ({ _id: v._id, url })))
    );
    res.json(out);
  } catch (err) {
    console.error('[LIST VIDEOS ERROR]', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// ───────── GET /detail/:id ───────── get one video (view or edit)
router.get('/detail/:id', verifyToken, async (req, res) => {
  try {
    const v = await Video.findById(req.params.id);
    if (!v) return res.status(404).json({ message: 'Video not found' });

    const access = await loadAlbumWithAccess(v.videoAlbumId, req.user.userId, false);
    if (!access) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    res.json({
      _id:       v._id,
      url:       await presign(v.key, 3600),
      createdAt: v.createdAt,
      updatedAt: v.updatedAt,
    });
  } catch (err) {
    console.error('[VIDEO DETAIL ERROR]', err);
    res.status(500).json({ message: 'Detail error', error: err.message });
  }
});

// ───────── DELETE /detail/:id ───────── delete one video (edit)
router.delete('/detail/:id', verifyToken, async (req, res) => {
  try {
    const v = await Video.findById(req.params.id);
    if (!v) return res.status(404).json({ message: 'Video not found' });

    const access = await loadAlbumWithAccess(v.videoAlbumId, req.user.userId, true);
    if (!access) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    await wasabi.deleteObject({
      Bucket: process.env.WASABI_BUCKET_NAME,
      Key:    v.key,
    }).promise().catch(() => {});
    await v.deleteOne();

    res.json({ message: 'Video deleted' });
  } catch (err) {
    console.error('[DELETE VIDEO ERROR]', err);
    res.status(500).json({ message: 'Delete error', error: err.message });
  }
});

// ───────── POST /copy ───────── copy videos (edit)
router.post('/copy', verifyToken, async (req, res) => {
  const { videoIds, targetAlbumId } = req.body;
  const { starId } = req.params;
  try {
    if (!Array.isArray(videoIds) || !targetAlbumId) {
      return res.status(400).json({ message: "Missing videoIds or targetAlbumId" });
    }
    // target requires edit
    const targetAccess = await loadAlbumWithAccess(targetAlbumId, req.user.userId, true);
    if (!targetAccess || String(targetAccess.album.starId) !== starId) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const existing = await Video.find({ videoAlbumId: targetAlbumId });
    const existingKeys = new Set(existing.map(v => v.key));

    const created = [], skipped = [];
    for (let id of videoIds) {
      const orig = await Video.findById(id);
      if (!orig) continue;
      if (existingKeys.has(orig.key)) { skipped.push(id); continue; }
      const copy = await Video.create({ videoAlbumId: targetAlbumId, key: orig.key });
      created.push(copy._id);
    }

    res.json({ message: `Copied ${created.length}, skipped ${skipped.length}`, copiedIds: created });
  } catch (err) {
    console.error('[COPY VIDEOS ERROR]', err);
    res.status(500).json({ message: 'Copy failed', error: err.message });
  }
});

// ───────── POST /move ───────── move videos (edit)
router.post('/move', verifyToken, async (req, res) => {
  const { videoIds } = req.body;
  const { starId, albumId: targetAlbumId } = req.params;
  try {
    if (!Array.isArray(videoIds) || !targetAlbumId) {
      return res.status(400).json({ message: "Missing videoIds or targetAlbumId" });
    }
    const targetAccess = await loadAlbumWithAccess(targetAlbumId, req.user.userId, true);
    if (!targetAccess || String(targetAccess.album.starId) !== starId) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const moved = [];
    for (let id of videoIds) {
      const vid = await Video.findById(id);
      if (!vid) continue;
      const oldAccess = await loadAlbumWithAccess(vid.videoAlbumId, req.user.userId, true);
      if (!oldAccess) continue;
      vid.videoAlbumId = targetAlbumId;
      await vid.save();
      moved.push(vid._id);
    }

    res.json({ message: `Moved ${moved.length}`, movedIds: moved });
  } catch (err) {
    console.error('[MOVE VIDEOS ERROR]', err);
    res.status(500).json({ message: 'Move failed', error: err.message });
  }
});

export default router;