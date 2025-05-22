// routes/v2/audios.js
import express  from 'express';
import multer   from 'multer';
import fs       from 'fs/promises';

import wasabi   from '../../utils/wasabiClient.js';
import { presign } from '../../utils/presign.js';

import Audio     from '../../models/v2/Audio.js';
import Star      from '../../models/v2/Star.js';
import verifyToken from '../../middleware/v1/authMiddleware.js';

const router = express.Router({ mergeParams: true });
const upload = multer({ dest: 'uploads/temp/' });

/* ───────── helper ───────── */
async function uploadToWasabi(localPath, key, contentType) {
  const buffer = await fs.readFile(localPath);
  await wasabi
    .upload({
      Bucket: process.env.WASABI_BUCKET_NAME,
      Key:    key,
      Body:   buffer,
      ACL:    'public-read',    // of laat weg voor privé
      ContentType: contentType,
    })
    .promise();
}

/* ───────── POST  /upload ───────── */
router.post(
  '/upload',
  verifyToken,
  upload.single('audio'),
  async (req, res) => {
    const { starId } = req.params;
    const { title = 'Untitled', description = '', sharedWith = '' } = req.body;

    try {
      // permissie‐check
      const star = await Star.findOne({ _id: starId, userId: req.user.userId });
      if (!star) {
        return res.status(404).json({ message: 'Star not found of geen toegang' });
      }

      // upload raw bestand
      const tmp = req.file.path;
      const key = `stars/${starId}/audios/${Date.now()}-${req.file.originalname}`;
      const contentType = req.file.mimetype || 'audio/mpeg';
      await uploadToWasabi(tmp, key, contentType);

      // DB‐record
      const audio = await Audio.create({
        starId,
        title,
        description,
        key,
        canView: sharedWith.split(',').filter(Boolean),
        canEdit: []
      });

      // cleanup
      await fs.unlink(tmp).catch(() => {});

      res.status(201).json({ message: 'Audio uploaded', audio });
    } catch (err) {
      console.error('Upload error:', err);
      res.status(500).json({ message: 'Upload mislukt', error: err.message });
    }
  }
);

/* ───────── GET /       – lijst audios ───────── */
router.get('/', verifyToken, async (req, res) => {
  const { starId } = req.params;
  try {
    const star = await Star.findOne({ _id: starId, userId: req.user.userId });
    if (!star) {
      return res.status(404).json({ message: 'Star niet gevonden of geen toegang' });
    }

    const audios = await Audio.find({ starId });

    // presign 1u geldig
    const out = await Promise.all(
      audios.map(async a => ({
        _id:       a._id,
        title:     a.title,
        description: a.description,
        url:       await presign(a.key, 3600),
        addedAt:   a.addedAt,
      }))
    );

    res.json(out);
  } catch (err) {
    console.error('List error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

/* ───────── GET /detail/:id ───────── */
router.get('/detail/:id', verifyToken, async (req, res) => {
  try {
    const audio = await Audio.findById(req.params.id);
    if (!audio) {
      return res.status(404).json({ message: 'Audio niet gevonden' });
    }

    const star = await Star.findOne({ _id: audio.starId, userId: req.user.userId });
    if (!star) {
      return res.status(403).json({ message: 'Geen toegang' });
    }

    res.json({
      _id:         audio._id,
      title:       audio.title,
      description: audio.description,
      url:         await presign(audio.key, 3600 * 10), // langer geldig
      addedAt:     audio.addedAt,
    });
  } catch (err) {
    console.error('Detail error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

/* ───────── DELETE /detail/:id ───────── */
router.delete('/detail/:id', verifyToken, async (req, res) => {
  try {
    const audio = await Audio.findById(req.params.id);
    if (!audio) {
      return res.status(404).json({ message: 'Audio niet gevonden' });
    }

    const star = await Star.findOne({ _id: audio.starId, userId: req.user.userId });
    if (!star) {
      return res.status(403).json({ message: 'Geen toegang' });
    }

    // alleen echte verwijdering in Wasabi als nergens anders gebruikt
    const count = await Audio.countDocuments({ key: audio.key });
    if (count === 1) {
      try {
        await wasabi
          .deleteObject({ Bucket: process.env.WASABI_BUCKET_NAME, Key: audio.key })
          .promise();
      } catch (e) {
        console.warn('Wasabi delete warning:', e.message);
      }
    }

    await audio.deleteOne();
    res.json({ message: 'Audio verwijderd' });
  } catch (err) {
    console.error('Delete error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

export default router;