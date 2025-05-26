// routes/v2/vrRooms.js
import express      from 'express';
import VRRoom       from '../../models/v2/VRRoom.js';
import Star         from '../../models/v2/Star.js';
import verifyToken  from '../../middleware/v1/authMiddleware.js';

const router = express.Router({ mergeParams: true });

/* ───────────────────────── Genest onder /api/v2/stars/:starId/vr-rooms ────────────────────────── */

/**
 * GET – alle VR-Rooms voor een specifieke ster (alleen eigenaar)
 */
router.get('/', verifyToken, async (req, res) => {
  const { starId } = req.params;
  if (!starId) return res.status(400).json({ message: 'Missing starId in route' });

  const star = await Star.findOne({ _id: starId, userId: req.user.userId });
  if (!star) return res.status(404).json({ message: 'Star not found or forbidden' });

  try {
    const rooms = await VRRoom.find({ starId });
    res.json(rooms);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

/**
 * POST – nieuwe VR-Room aanmaken
 */
router.post('/', verifyToken, async (req, res) => {
  const { starId } = req.params;
  if (!starId) return res.status(400).json({ message: 'Missing starId in route' });

  const star = await Star.findOne({ _id: starId, userId: req.user.userId });
  if (!star) return res.status(404).json({ message: 'Star not found or forbidden' });

  try {
    const {
      roomType = 'basic',
      name     = null,
      canView  = [],
      canEdit  = [],
    } = req.body;

    const newRoom = await VRRoom.create({
      starId,
      roomType,
      name,
      canView,
      canEdit,
    });

    res.status(201).json(newRoom);
  } catch (err) {
    res.status(400).json({ message: 'Could not create VR room', error: err.message });
  }
});

/* ───────────────────────── Niet-genest onder /api/v2/vrRooms/detail/:id ────────────────────────── */

/**
 * GET – details van één VR-Room
 */
router.get('/detail/:id', verifyToken, async (req, res) => {
  try {
    const room = await VRRoom.findById(req.params.id);
    if (!room) return res.status(404).json({ message: 'VR Room not found' });

    const star = await Star.findOne({ _id: room.starId, userId: req.user.userId });
    if (!star) return res.status(403).json({ message: 'Forbidden' });

    res.json(room);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

/**
 * PUT – VR-Room bijwerken
 */
router.put('/detail/:id', verifyToken, async (req, res) => {
  try {
    const room = await VRRoom.findById(req.params.id);
    if (!room) return res.status(404).json({ message: 'VR Room not found' });

    const star = await Star.findOne({ _id: room.starId, userId: req.user.userId });
    if (!star) return res.status(403).json({ message: 'Forbidden' });

    const { roomType, name, canView, canEdit } = req.body;

    if (roomType)               room.roomType = roomType;
    if (name !== undefined)     room.name     = name;
    if (Array.isArray(canView)) room.canView  = canView;
    if (Array.isArray(canEdit)) room.canEdit  = canEdit;

    room.updatedAt = new Date();
    await room.save();

    res.json(room);
  } catch (err) {
    res.status(400).json({ message: 'Could not update VR room', error: err.message });
  }
});

/**
 * DELETE – VR-Room verwijderen
 */
router.delete('/detail/:id', verifyToken, async (req, res) => {
  try {
    const room = await VRRoom.findById(req.params.id);
    if (!room) return res.status(404).json({ message: 'VR Room not found' });

    const star = await Star.findOne({ _id: room.starId, userId: req.user.userId });
    if (!star) return res.status(403).json({ message: 'Forbidden' });

    await room.deleteOne();
    res.json({ message: 'VR Room deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

export default router;