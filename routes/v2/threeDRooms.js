// routes/v2/threeDRooms.js
import express      from 'express';
import ThreeDRoom from '../../models/v2/ThreeDRoom.js';
import Star         from '../../models/v2/Star.js';
import verifyToken  from '../../middleware/v1/authMiddleware.js';

const router = express.Router({ mergeParams: true });

/* ────────────────────── Genest (/api/v2/stars/:starId/three-d-rooms) ────────────────────── */

/**
 * GET /stars/:starId/three-d-rooms
 *  - if star.isPrivate == false ⇒ public: return all rooms, no auth required
 *  - else ⇒ require verifyToken and owner-only
 */
router.get(
  '/',
  // first: unauthenticated handler for public stars
  async (req, res, next) => {
    const { starId } = req.params;
    if (!starId) return res.status(400).json({ message: 'Missing starId' });

    const star = await Star.findById(starId);
    if (!star) return res.status(404).json({ message: 'Star not found' });

    if (!star.isPrivate) {
      // public star → return rooms for everyone
      const rooms = await ThreeDRoom.find({ starId });
      return res.json(rooms);
    }

    // otherwise, it’s private → go to next (owner‐only) handler
    next();
  },
  // owner‐only handler
  verifyToken,
  async (req, res) => {
    const { starId } = req.params;
    // now we know star.isPrivate === true
    const star = await Star.findOne({ _id: starId, userId: req.user.userId });
    if (!star) {
      return res.status(404).json({ message: 'Star not found or forbidden' });
    }
    const rooms = await ThreeDRoom.find({ starId });
    return res.json(rooms);
  }
);

/** POST – nieuwe 3D-room aanmaken */
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

    const newRoom = await ThreeDRoom.create({
      starId,
      roomType,
      name,
      canView,
      canEdit,
    });

    res.status(201).json(newRoom);
  } catch (err) {
    res.status(400).json({ message: 'Could not create 3D room', error: err.message });
  }
});

/* ────────────────────── Niet-genest (/api/v2/three-d-rooms/detail/:id) ────────────────────── */

/** GET – details van één 3D-room */
router.get('/detail/:id', verifyToken, async (req, res) => {
  try {
    const room = await ThreeDRoom.findById(req.params.id);
    if (!room) return res.status(404).json({ message: '3D Room not found' });

    const star = await Star.findOne({ _id: room.starId, userId: req.user.userId });
    if (!star) return res.status(403).json({ message: 'Forbidden' });

    res.json(room);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

/** PUT – 3D-room bijwerken */
router.put('/detail/:id', verifyToken, async (req, res) => {
  try {
    const room = await ThreeDRoom.findById(req.params.id);
    if (!room) return res.status(404).json({ message: '3D Room not found' });

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
    res.status(400).json({ message: 'Could not update 3D room', error: err.message });
  }
});

/** DELETE – 3D-room verwijderen */
router.delete('/detail/:id', verifyToken, async (req, res) => {
  try {
    const room = await ThreeDRoom.findById(req.params.id);
    if (!room) return res.status(404).json({ message: '3D Room not found' });

    const star = await Star.findOne({ _id: room.starId, userId: req.user.userId });
    if (!star) return res.status(403).json({ message: 'Forbidden' });

    await room.deleteOne();
    res.json({ message: '3D Room deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

export default router;