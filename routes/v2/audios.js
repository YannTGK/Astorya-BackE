// routes/v2/audios.js
import express  from 'express';
import multer   from 'multer';
import fs       from 'fs/promises';

import wasabi      from '../../utils/wasabiClient.js';
import { presign } from '../../utils/presign.js';

import Audio       from '../../models/v2/Audio.js';
import Star        from '../../models/v2/Star.js';
import verifyToken from '../../middleware/v1/authMiddleware.js';

const router = express.Router({ mergeParams: true });
const upload = multer({ dest: 'uploads/temp/' });

/** normalize canView/canEdit inputs to string[] */
function normalizeIds(field) {
  if (Array.isArray(field)) return field.filter(Boolean).map(String);
  if (typeof field === 'string' && field.trim()) {
    return field.split(',').map(s => s.trim()).filter(Boolean);
  }
  return [];
}

/** upload helper */
async function uploadToWasabi(localPath, key, contentType) {
  const buffer = await fs.readFile(localPath);
  await wasabi.upload({
    Bucket: process.env.WASABI_BUCKET_NAME,
    Key:    key,
    Body:   buffer,
    ContentType: contentType,
  }).promise();
  return key;
}

/**
 * Helper to load an Audio + its Star, and check rights.
 * @param {string} audioId 
 * @param {string} userId 
 * @param {boolean} requireEdit if true, needs edit rights; else view suffices
 * @returns {{ audio: Audio, star: Star }|null}
 */
async function loadAudioWithAccess(audioId, userId, requireEdit = false) {
  const audio = await Audio.findById(audioId);
  if (!audio) return null;

  const star = await Star.findById(audio.starId);
  if (!star) return null;

  const isOwner     = String(star.userId) === userId;
  const starCanView  = Array.isArray(star.canView) && star.canView.map(String).includes(userId);
  const starCanEdit  = Array.isArray(star.canEdit) && star.canEdit.map(String).includes(userId);
  const audioCanView = Array.isArray(audio.canView) && audio.canView.map(String).includes(userId);
  const audioCanEdit = Array.isArray(audio.canEdit) && audio.canEdit.map(String).includes(userId);

  if (requireEdit) {
    if (!isOwner && !starCanEdit && !audioCanEdit) return null;
  } else {
    if (!isOwner && !starCanView && !starCanEdit && !audioCanView && !audioCanEdit) {
      return null;
    }
  }

  return { audio, star };
}

/**
 * Helper: check star-level view rights.
 */
async function loadStarWithView(starId, userId) {
  return Star.findOne({
    _id: starId,
    $or: [
      { userId: userId },
      { canView: userId },
      { canEdit: userId },
    ],
  });
}

/**
 * Helper: check star-level edit rights.
 */
async function loadStarWithEdit(starId, userId) {
  return Star.findOne({
    _id: starId,
    $or: [
      { userId: userId },
      { canEdit: userId },
    ],
  });
}


// POST /stars/:starId/audios/upload
// require star-level edit rights
router.post(
  '/upload',
  verifyToken,
  upload.single('audio'),
  async (req, res) => {
    const { starId } = req.params;
    const {
      title = 'Untitled',
      description = '',
      canView = [],
      canEdit = []
    } = req.body;

    try {
      const star = await loadStarWithEdit(starId, req.user.userId);
      if (!star) {
        return res.status(404).json({ message: 'Star not found or forbidden' });
      }
      if (!req.file) {
        return res.status(400).json({ message: 'No audio file uploaded' });
      }

      const tmp = req.file.path;
      const originalName = req.file.originalname;
      const key = `stars/${starId}/audios/${Date.now()}-${originalName}`;
      const ct  = req.file.mimetype || 'audio/mpeg';

      await uploadToWasabi(tmp, key, ct);
      await fs.unlink(tmp).catch(() => {});

      const audio = await Audio.create({
        starId,
        title,
        description,
        key,
        canView: normalizeIds(canView),
        canEdit: normalizeIds(canEdit),
      });

      res.status(201).json({ message: 'Audio uploaded', audio });
    } catch (err) {
      console.error('[AUDIO UPLOAD ERROR]', err);
      res.status(500).json({ message: 'Upload failed', error: err.message });
    }
  }
);


// GET /stars/:starId/audios
// list audios if star-level view rights
router.get('/', verifyToken, async (req, res) => {
  const { starId } = req.params;
  try {
    const star = await loadStarWithView(starId, req.user.userId);
    if (!star) {
      return res.status(404).json({ message: 'Star not found or forbidden' });
    }

    const audios = await Audio.find({ starId });
    const out = await Promise.all(
      audios.map(async a => ({
        _id:         a._id,
        title:       a.title,
        description: a.description,
        url:         await presign(a.key, 3600),
        canView:     a.canView,
        canEdit:     a.canEdit,
        addedAt:     a.addedAt,
      }))
    );
    res.json(out);
  } catch (err) {
    console.error('[AUDIO LIST ERROR]', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});


// GET /stars/:starId/audios/detail/:id
// fetch one audio if view rights on star or audio
router.get('/detail/:id', verifyToken, async (req, res) => {
  try {
    const access = await loadAudioWithAccess(req.params.id, req.user.userId, false);
    if (!access || String(access.audio.starId) !== req.params.starId) {
      return res.status(404).json({ message: 'Audio not found or forbidden' });
    }
    const { audio } = access;
    res.json({
      _id:         audio._id,
      title:       audio.title,
      description: audio.description,
      url:         await presign(audio.key, 3600 * 10),
      canView:     audio.canView,
      canEdit:     audio.canEdit,
      addedAt:     audio.addedAt,
    });
  } catch (err) {
    console.error('[AUDIO DETAIL ERROR]', err);
    res.status(500).json({ message: 'Detail error', error: err.message });
  }
});


// PUT /stars/:starId/audios/detail/:id
// update if star-level or audio-level edit rights
router.put(
  '/detail/:id',
  verifyToken,
  upload.single('audio'),
  async (req, res) => {
    const { title, description, canView = [], canEdit = [] } = req.body;

    try {
      const access = await loadAudioWithAccess(req.params.id, req.user.userId, true);
      if (!access || String(access.audio.starId) !== req.params.starId) {
        return res.status(403).json({ message: 'Forbidden' });
      }
      const { audio } = access;

      // replace file if provided
      if (req.file) {
        const tmp = req.file.path;
        const newKey = `stars/${audio.starId}/audios/${Date.now()}-${req.file.originalname}`;
        const ct     = req.file.mimetype || 'audio/mpeg';
        await uploadToWasabi(tmp, newKey, ct);

        const count = await Audio.countDocuments({ key: audio.key });
        if (count === 1) {
          await wasabi.deleteObject({
            Bucket: process.env.WASABI_BUCKET_NAME,
            Key:    audio.key,
          }).promise().catch(() => {});
        }

        audio.key = newKey;
        await fs.unlink(tmp).catch(() => {});
      }

      if (typeof title === 'string')       audio.title       = title;
      if (typeof description === 'string') audio.description = description;
      audio.canView = normalizeIds(canView);
      audio.canEdit = normalizeIds(canEdit);

      await audio.save();

      res.json({
        _id:         audio._id,
        title:       audio.title,
        description: audio.description,
        url:         await presign(audio.key, 3600),
        canView:     audio.canView,
        canEdit:     audio.canEdit,
        addedAt:     audio.addedAt,
      });
    } catch (err) {
      console.error('[AUDIO UPDATE ERROR]', err);
      res.status(500).json({ message: 'Update failed', error: err.message });
    }
  }
);


// DELETE /stars/:starId/audios/detail/:id
// delete if star-level or audio-level edit rights
router.delete('/detail/:id', verifyToken, async (req, res) => {
  try {
    const access = await loadAudioWithAccess(req.params.id, req.user.userId, true);
    if (!access || String(access.audio.starId) !== req.params.starId) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    const { audio } = access;

    const count = await Audio.countDocuments({ key: audio.key });
    if (count === 1) {
      await wasabi.deleteObject({
        Bucket: process.env.WASABI_BUCKET_NAME,
        Key:    audio.key,
      }).promise().catch(() => {});
    }

    await audio.deleteOne();
    res.json({ message: 'Audio deleted' });
  } catch (err) {
    console.error('[AUDIO DELETE ERROR]', err);
    res.status(500).json({ message: 'Delete failed', error: err.message });
  }
});

export default router;