import express from 'express';
import VRRoom from '../../models/v2/VRRoom.js';
import Star from '../../models/v2/Star.js'; // Nodig om te controleren of de star van de user is.
import verifyToken from '../../middleware/v1/authMiddleware.js';

// Gebruik mergeParams zodat we toegang hebben tot :starId als we genest werken.
const router = express.Router({ mergeParams: true });

/**
 * Geneste endpoints voor VR Rooms gekoppeld aan een specifieke Star.
 * Deze worden gemount onder: /api/v2/stars/:starId/vr-rooms
 */

// GET alle VR Rooms van een specifieke Star
router.get('/', verifyToken, async (req, res) => {
  const { starId } = req.params;
  if (!starId) return res.status(400).json({ message: 'Missing starId in route' });
  
  // Controleer of de star behoort tot de ingelogde gebruiker
  const star = await Star.findOne({ _id: starId, userId: req.user.userId });
  if (!star) {
    return res.status(404).json({ message: 'Star not found or forbidden' });
  }

  try {
    const rooms = await VRRoom.find({ starId });
    res.json(rooms);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// POST maak een nieuwe VR Room voor de specifieke Star
router.post('/', verifyToken, async (req, res) => {
  const { starId } = req.params;
  if (!starId) return res.status(400).json({ message: 'Missing starId in route' });
  
  // Controleer of de star behoort tot de ingelogde gebruiker
  const star = await Star.findOne({ _id: starId, userId: req.user.userId });
  if (!star) {
    return res.status(404).json({ message: 'Star not found or forbidden' });
  }

  try {
    const { isPrivate, roomType, name, sharedWith } = req.body;
    const newRoom = await VRRoom.create({
      starId,
      isPrivate,
      roomType,
      name,
      sharedWith,
    });
    res.status(201).json(newRoom);
  } catch (err) {
    res.status(400).json({ message: 'Could not create VR room', error: err.message });
  }
});

/**
 * Niet-geneste endpoints voor individuele VR Room acties.
 * Deze worden gemount onder: /api/v2/vrRooms/detail/:id
 * Hiermee kun je details ophalen, updaten of verwijderen op basis van het VR Room ID.
 */

// GET details van een specifieke VR Room
router.get('/detail/:id', verifyToken, async (req, res) => {
  try {
    const room = await VRRoom.findById(req.params.id);
    if (!room) return res.status(404).json({ message: 'VR Room not found' });
    
    // Controleer of de vrRoom bij een star hoort van de ingelogde gebruiker
    const star = await Star.findOne({ _id: room.starId, userId: req.user.userId });
    if (!star) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    
    res.json(room);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// PUT update een specifieke VR Room
router.put('/detail/:id', verifyToken, async (req, res) => {
  try {
    const room = await VRRoom.findById(req.params.id);
    if (!room) return res.status(404).json({ message: 'VR Room not found' });

    const star = await Star.findOne({ _id: room.starId, userId: req.user.userId });
    if (!star) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    
    const { isPrivate, roomType, name, sharedWith } = req.body;
    if (isPrivate !== undefined) room.isPrivate = isPrivate;
    if (roomType) room.roomType = roomType;
    if (name !== undefined) room.name = name;
    if (sharedWith) room.sharedWith = sharedWith;
    room.updatedAt = new Date();
    
    await room.save();
    res.json(room);
  } catch (err) {
    res.status(400).json({ message: 'Could not update VR room', error: err.message });
  }
});

// DELETE verwijder een specifieke VR Room
router.delete('/detail/:id', verifyToken, async (req, res) => {
    try {
      const room = await VRRoom.findById(req.params.id);
      if (!room) return res.status(404).json({ message: 'VR Room not found' });
      
      const star = await Star.findOne({ _id: room.starId, userId: req.user.userId });
      if (!star) {
        return res.status(403).json({ message: 'Forbidden' });
      }
      
      await room.deleteOne();  // ✅ correcte methode
      res.json({ message: 'VR Room deleted' });
    } catch (err) {
      res.status(500).json({ message: 'Server error', error: err.message });
    }
});


export default router;