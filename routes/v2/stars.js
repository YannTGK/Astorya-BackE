import express from 'express';
import Star from '../../models/v2/Star.js';
import User from '../../models/v2/User.js';
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

// routes/stars.js
router.post('/', verifyToken, async (req, res) => {
  try {
    const { isPrivate, starFor, color, word, publicName, activationDate, longTermMaintenance, canView, canEdit } = req.body;

    const newStar = await Star.create({
      userId: req.user.userId,
      isPrivate,
      starFor,
      color,
      word,
      publicName,
      activationDate,
      longTermMaintenance,
      canView,  // Gebruikers die mogen kijken
      canEdit,  // Gebruikers die mogen bewerken
    });

    res.status(201).json(newStar);
  } catch (err) {
    res.status(400).json({ message: 'Could not create star', error: err.message });
  }
});

// routes/stars.js
router.get('/dedicate', verifyToken, async (req, res) => {
  try {
    const userId = req.user.userId; // ingelogde gebruiker
    const stars = await Star.find({
      starFor: "dedicate",
      $or: [
        { userId: userId },         // sterren die van jou zijn
        { canView: userId },         // sterren die jij mag bekijken
        { canEdit: userId },         // sterren die jij mag bewerken
      ]
    });

    res.json(stars);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

/**
 * GET /stars/:id
 * Geeft de ster + beperkte user-info terug.
 * Alleen de eigenaar of iemand in canView/canEdit mag dit zien
 * (pas de authorisatie-check eventueel nog aan).
 */
router.get("/:id", verifyToken, async (req, res) => {
  try {
    const starId = req.params.id;

    // 2️⃣  ster ophalen
    const star = await Star.findById(starId);
    if (!star) {
      return res.status(404).json({ message: "Star not found" });
    }

    // 3️⃣  basale access-check – pas aan zoals jij wilt
    const me = req.user.userId;
    const isOwner   = String(star.userId) === me;
    const canView   = star.canView?.includes(me);
    const canEdit   = star.canEdit?.includes(me);

    if (!isOwner && !canView && !canEdit) {
      return res.status(403).json({ message: "Forbidden" });
    }

    // 4️⃣  user ophalen (enkel velden die je nodig hebt)
    const user = await User.findById(star.userId)
      .select("firstName lastName email plan");

    // 5️⃣  gecombineerde response
    res.json({
      star,
      owner: user,                 // zo kun je op het scherm voor- en achternaam tonen
      rights: { isOwner, canView, canEdit },
    });
  } catch (err) {
    console.error("GET /stars/:id error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});


// PUT ster updaten (alleen eigenaar)
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const { isPrivate, starFor, color, word, publicName, activationDate, longTermMaintenance, canView, canEdit } = req.body;

    const updateFields = {
      updatedAt: new Date(), // altijd bijwerken
    };

    // Voeg enkel toe wat effectief aanwezig is in req.body
    if (typeof isPrivate !== "undefined") updateFields.isPrivate = isPrivate;
    if (typeof starFor !== "undefined") updateFields.starFor = starFor;
    if (typeof color !== "undefined") updateFields.color = color;
    if (typeof word !== "undefined") updateFields.word = word;
    if (typeof publicName !== "undefined") updateFields.publicName = publicName;
    if (typeof activationDate !== "undefined") updateFields.activationDate = activationDate;
    if (typeof longTermMaintenance !== "undefined") updateFields.longTermMaintenance = longTermMaintenance;
    if (typeof canView !== "undefined") updateFields.canView = canView;
    if (typeof canEdit !== "undefined") updateFields.canEdit = canEdit;

    const updatedStar = await Star.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.userId }, // alleen eigenaar kan updaten
      updateFields,
      { new: true } // retourneer de nieuwe versie
    );

    if (!updatedStar) {
      return res.status(404).json({ message: 'Star not found or forbidden' });
    }

    res.json(updatedStar);
  } catch (err) {
    console.error('Update error:', err);
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