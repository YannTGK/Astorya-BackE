import express from 'express';
import VideoAlbum from '../../models/v2/VideoAlbum.js';
import Star from '../../models/v2/Star.js';
import verifyToken from '../../middleware/v1/authMiddleware.js';

const router = express.Router({ mergeParams: true });

// GET /stars/:starId/video-albums
router.get('/', verifyToken, async (req, res) => {
  const { starId } = req.params;
  try {
    const star = await Star.findOne({ _id: starId, userId: req.user.userId });
    if (!star) return res.status(404).json({ message: 'Star not found or forbidden' });

    const videoAlbums = await VideoAlbum.find({ starId });
    res.json(videoAlbums);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// POST /stars/:starId/video-albums
router.post('/', verifyToken, async (req, res) => {
    const { starId } = req.params;
    const { name, sharedWith } = req.body; // Include sharedWith here
  
    try {
      const star = await Star.findOne({ _id: starId, userId: req.user.userId });
      if (!star) return res.status(404).json({ message: 'Star not found or forbidden' });
  
      // Pass sharedWith to the creation function
      const newAlbum = await VideoAlbum.create({ starId, name, sharedWith });
      res.status(201).json(newAlbum);
    } catch (err) {
      res.status(400).json({ message: 'Could not create video album', error: err.message });
    }
  });

// PUT /video-albums/:albumId
router.put('/:albumId', verifyToken, async (req, res) => {
    const { albumId } = req.params;
    const { name, sharedWith } = req.body; // Fields you want to update
  
    try {
      const album = await VideoAlbum.findById(albumId);
      if (!album) return res.status(404).json({ message: 'Video album not found' });
  
      const star = await Star.findOne({ _id: album.starId, userId: req.user.userId });
      if (!star) return res.status(403).json({ message: 'Forbidden' });
  
      // Update the fields if provided
      if (name) album.name = name;
      if (sharedWith) album.sharedWith = sharedWith;
  
      album.updatedAt = new Date();
      await album.save();
  
      res.json(album);
    } catch (err) {
      res.status(400).json({ message: 'Could not update video album', error: err.message });
    }
});

// GET /video-albums/:albumId
router.get('/:albumId', verifyToken, async (req, res) => {
  const album = await VideoAlbum.findById(req.params.albumId);
  if (!album) return res.status(404).json({ message: 'Video album not found' });

  const star = await Star.findOne({ _id: album.starId, userId: req.user.userId });
  if (!star) return res.status(403).json({ message: 'Forbidden' });

  res.json(album);
});

// DELETE /video-albums/:albumId
router.delete('/:albumId', verifyToken, async (req, res) => {
  const album = await VideoAlbum.findById(req.params.albumId);
  if (!album) return res.status(404).json({ message: 'Video album not found' });

  const star = await Star.findOne({ _id: album.starId, userId: req.user.userId });
  if (!star) return res.status(403).json({ message: 'Forbidden' });

  await album.deleteOne();
  res.json({ message: 'Video album deleted' });
});

export default router;