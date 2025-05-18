import express from 'express';
import PhotoAlbum from '../../models/v2/PhotoAlbum.js';
import Star       from '../../models/v2/Star.js';
import verifyToken from '../../middleware/v1/authMiddleware.js';

const router = express.Router({ mergeParams: true });

/* ---------- Geneste endpoints onder /stars/:starId/photo-albums ---------- */

// GET alle albums van een ster
router.get('/', verifyToken, async (req, res) => {
  const { starId } = req.params;
  if (!starId) return res.status(400).json({ message: 'Missing starId' });

  const star = await Star.findOne({ _id: starId, userId: req.user.userId });
  if (!star) return res.status(404).json({ message: 'Star not found or forbidden' });

  try {
    const albums = await PhotoAlbum.find({ starId });
    res.json(albums);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// POST nieuw album
router.post('/', verifyToken, async (req, res) => {
  const { starId } = req.params;
  if (!starId) return res.status(400).json({ message: 'Missing starId' });

  const star = await Star.findOne({ _id: starId, userId: req.user.userId });
  if (!star) return res.status(404).json({ message: 'Star not found or forbidden' });

  try {
    const { name, sharedWith } = req.body;
    const album = await PhotoAlbum.create({ starId, name, sharedWith });
    res.status(201).json(album);
  } catch (err) {
    res.status(400).json({ message: 'Could not create album', error: err.message });
  }
});

/* ---------- Detail‑endpoints onder /photo-albums/detail/:id ---------- */

// GET album‑detail
router.get('/detail/:id', verifyToken, async (req, res) => {
  try {
    const album = await PhotoAlbum.findById(req.params.id);
    if (!album) return res.status(404).json({ message: 'Album not found' });

    const star = await Star.findOne({ _id: album.starId, userId: req.user.userId });
    if (!star) return res.status(403).json({ message: 'Forbidden' });

    res.json(album);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// PUT album updaten
router.put('/detail/:id', verifyToken, async (req, res) => {
  try {
    const album = await PhotoAlbum.findById(req.params.id);
    if (!album) return res.status(404).json({ message: 'Album not found' });

    const star = await Star.findOne({ _id: album.starId, userId: req.user.userId });
    if (!star) return res.status(403).json({ message: 'Forbidden' });

    const { name, canView, canEdit } = req.body;     //  ←  hier!
    if (name     !== undefined) album.name     = name;
    if (canView)                 album.canView = canView;
    if (canEdit)                 album.canEdit = canEdit;
    album.updatedAt = new Date();

    await album.save();
    res.json(album);
  } catch (err) {
    res.status(400).json({ message: 'Could not update album', error: err.message });
  }
});

// DELETE album
router.delete('/detail/:id', verifyToken, async (req, res) => {
  try {
    const album = await PhotoAlbum.findById(req.params.id);
    if (!album) return res.status(404).json({ message: 'Album not found' });

    const star = await Star.findOne({ _id: album.starId, userId: req.user.userId });
    if (!star) return res.status(403).json({ message: 'Forbidden' });

    await album.deleteOne();               // moderne methode
    res.json({ message: 'Album deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

export default router;