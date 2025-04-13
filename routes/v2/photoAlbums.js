// routes/photoAlbums.js
import express from 'express';
import PhotoAlbum from '../../models/v2/PhotoAlbum.js';
import Star from "../../models/v2/Star.js"
import verifyToken from '../../middleware/v1/authMiddleware.js';

const router = express.Router();

// GET /photo-albums?starId=...
router.get('/', verifyToken, async (req, res) => {
  const { starId } = req.query;
  try {
    // Controleer of de star van de user is
    const star = await Star.findById(starId);
    if (!star) return res.status(404).json({ message: 'Star not found' });
    if (!star.userId.equals(req.user.userId)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const albums = await PhotoAlbum.find({ starId });
    res.json(albums);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /photo-albums
router.post('/', verifyToken, async (req, res) => {
  const { starId, name, sharedWith } = req.body;
  try {
    // check star ownership
    const star = await Star.findById(starId);
    if (!star) return res.status(404).json({ message: 'Star not found' });
    if (!star.userId.equals(req.user.userId)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const newAlbum = await PhotoAlbum.create({
      starId,
      name,
      sharedWith: sharedWith || [],
    });
    res.status(201).json(newAlbum);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /photo-albums/:id
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const album = await PhotoAlbum.findById(req.params.id);
    if (!album) return res.status(404).json({ message: 'Album not found' });

    // check ownership
    const star = await Star.findById(album.starId);
    if (!star.userId.equals(req.user.userId)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    res.json(album);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /photo-albums/:id
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const album = await PhotoAlbum.findById(req.params.id);
    if (!album) return res.status(404).json({ message: 'Album not found' });

    // check ownership
    const star = await Star.findById(album.starId);
    if (!star.userId.equals(req.user.userId)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const { name, sharedWith } = req.body;
    if (name) album.name = name;
    if (sharedWith) album.sharedWith = sharedWith;
    album.updatedAt = new Date();
    await album.save();

    res.json(album);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE /photo-albums/:id
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const album = await PhotoAlbum.findById(req.params.id);
    if (!album) return res.status(404).json({ message: 'Album not found' });

    const star = await Star.findById(album.starId);
    if (!star.userId.equals(req.user.userId)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    await album.remove();
    res.json({ message: 'Album deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;