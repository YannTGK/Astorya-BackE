import express from 'express';
import multer from 'multer';
import fs from 'fs/promises';

import wasabi from '../../utils/wasabiClient.js';
import Audio from '../../models/v2/Audio.js';
import Star from '../../models/v2/Star.js';
import verifyToken from '../../middleware/v1/authMiddleware.js';

const router = express.Router({ mergeParams: true });
const upload = multer({ dest: 'uploads/temp/' });

async function uploadToWasabi(localPath, key, contentType) {
  const buffer = await fs.readFile(localPath);
  const params = {
    Bucket: process.env.WASABI_BUCKET_NAME,
    Key: key,
    Body: buffer,
    ACL: 'public-read',
    ContentType: contentType,
  };
  const { Location } = await wasabi.upload(params).promise();
  return Location;
}

// POST /stars/:starId/audios
router.post('/upload', verifyToken, upload.single('audio'), async (req, res) => {
    const { starId } = req.params;
    try {
      // Ensure the star belongs to the user
      const star = await Star.findOne({ _id: starId, userId: req.user.userId });
      if (!star) {
        return res.status(404).json({ message: 'Star not found or forbidden' });
      }
  
      // Get title and sharedWith from request body
      const { title, sharedWith } = req.body;
  
      // Upload audio file to Wasabi
      const tempPath = req.file.path;
      const key = `stars/${starId}/audios/${Date.now()}-${req.file.originalname}`;
      const fileUrl = await uploadToWasabi(tempPath, key, 'audio/mpeg');
  
      // Create the audio document
      const newAudio = await Audio.create({
        starId,
        title: title || 'Untitled',
        description: req.body.description || '',
        fileUrl,
        sharedWith: sharedWith ? sharedWith.split(',') : []
      });
  
      // Clean up the temp file
      await fs.unlink(tempPath);
      res.status(201).json(newAudio);
    } catch (err) {
      res.status(500).json({ message: 'Upload failed', error: err.message });
    }
  });

// GET /stars/:starId/audios
router.get('/', verifyToken, async (req, res) => {
  const { starId } = req.params;
  try {
    const star = await Star.findOne({ _id: starId, userId: req.user.userId });
    if (!star) {
      return res.status(404).json({ message: 'Star not found or forbidden' });
    }

    const audios = await Audio.find({ starId });
    res.json(audios);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// GET /audios/:audioId
router.get('/:audioId', verifyToken, async (req, res) => {
  const { audioId } = req.params;
  try {
    const audio = await Audio.findById(audioId);
    if (!audio) {
      return res.status(404).json({ message: 'Audio not found' });
    }

    const star = await Star.findOne({ _id: audio.starId, userId: req.user.userId });
    if (!star) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    res.json(audio);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// DELETE /audios/:audioId
router.delete('/:audioId', verifyToken, async (req, res) => {
  const { audioId } = req.params;
  try {
    const audio = await Audio.findById(audioId);
    if (!audio) {
      return res.status(404).json({ message: 'Audio not found' });
    }

    const star = await Star.findOne({ _id: audio.starId, userId: req.user.userId });
    if (!star) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    await audio.deleteOne();
    res.json({ message: 'Audio deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

export default router;