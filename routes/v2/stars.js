// routes/stars.js
import express from 'express';
import Star from '../../models/v2/Star.js'; // Zorg ervoor dat je het juiste pad gebruikt
import verifyToken from '../../middleware/v1/authMiddleware.js';

const router = express.Router();

// GET /stars - haal alle sterren van de ingelogde user
router.get('/', verifyToken, async (req, res) => {
  try {
    const stars = await Star.find({ userId: req.user.userId });
    res.json(stars);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /stars - maak een nieuwe ster voor de user
router.post('/', verifyToken, async (req, res) => {
  try {
    const { isPrivate, starFor, color, word, activationDate } = req.body;
    const newStar = await Star.create({
      userId: req.user.userId,
      isPrivate,
      starFor,
      color,
      word,
      activationDate,
    });
    res.status(201).json(newStar);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /stars/:id - detail van één ster
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const star = await Star.findById(req.params.id);
    if (!star) return res.status(404).json({ message: 'Star not found' });
    if (!star.userId.equals(req.user.userId)) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    res.json(star);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /stars/:id
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const star = await Star.findById(req.params.id);
    if (!star) return res.status(404).json({ message: 'Star not found' });
    if (!star.userId.equals(req.user.userId)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    // Update de velden
    const { isPrivate, starFor, color, word, activationDate } = req.body;
    if (isPrivate !== undefined) star.isPrivate = isPrivate;
    if (starFor) star.starFor = starFor;
    if (color) star.color = color;
    if (word) star.word = word;
    if (activationDate) star.activationDate = activationDate;
    star.updatedAt = new Date();

    await star.save();
    res.json(star);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE /stars/:id
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const star = await Star.findById(req.params.id);
    if (!star) return res.status(404).json({ message: 'Star not found' });
    if (!star.userId.equals(req.user.userId)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    await star.remove();
    res.json({ message: 'Star removed' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;