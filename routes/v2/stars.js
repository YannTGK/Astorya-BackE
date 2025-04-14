import express from 'express';
import Star from '../../models/v2/Star.js';
import verifyToken from '../../middleware/v1/authMiddleware.js';

const router = express.Router();

// GET alle sterren van ingelogde gebruiker
router.get('/', verifyToken, async (req, res) => {
  try {
    const stars = await Star.find({ userId: req.user.userId });
    res.json(stars);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// POST nieuwe ster aanmaken
router.post('/', verifyToken, async (req, res) => {
  try {
    const { isPrivate, starFor, color, word, activationDate, longTermMaintenance } = req.body;
    const newStar = await Star.create({
      userId: req.user.userId,
      isPrivate,
      starFor,
      color,
      word,
      activationDate,
      longTermMaintenance,
    });
    res.status(201).json(newStar);
  } catch (err) {
    res.status(400).json({ message: 'Could not create star', error: err.message });
  }
});

// GET detail van één ster (alleen eigenaar)
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const star = await Star.findOne({ _id: req.params.id, userId: req.user.userId });
    if (!star) {
      return res.status(404).json({ message: 'Star not found' });
    }
    res.json(star);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// PUT ster updaten (alleen eigenaar)
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const updateFields = {
      ...req.body,
      updatedAt: new Date(),
    };

    const updatedStar = await Star.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.userId },
      updateFields,
      { new: true }
    );

    if (!updatedStar) {
      return res.status(404).json({ message: 'Star not found or forbidden' });
    }

    res.json(updatedStar);
  } catch (err) {
    res.status(400).json({ message: 'Could not update star', error: err.message });
  }
});

// DELETE ster verwijderen (alleen eigenaar)
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const deletedStar = await Star.findOneAndDelete({ _id: req.params.id, userId: req.user.userId });
    if (!deletedStar) {
      return res.status(404).json({ message: 'Star not found or forbidden' });
    }
    res.json({ message: 'Star deleted' });
  } catch (err) {
    console.error('Delete error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

export default router;