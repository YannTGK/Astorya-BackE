// routes/photoAlbums.js
import express from 'express';
import PhotoAlbum from '../../models/v2/PhotoAlbum.js';
import Star       from '../../models/v2/Star.js';
import verifyToken from '../../middleware/v1/authMiddleware.js';

const router = express.Router({ mergeParams: true });

/**
 * Helper to load a Star if the user is owner, or in its canView/canEdit arrays.
 */
async function loadAccessibleStar(starId, userId) {
  return Star.findOne({
    _id: starId,
    $or: [
      { userId: userId },    // owner
      { canView: userId },   // has view access
      { canEdit: userId },   // has edit access
    ]
  });
}

/* ---------- Nested endpoints under /stars/:starId/photo-albums ---------- */

/**
 * GET all albums for a given star, if the user owns or has been shared the star.
 */
router.get('/', verifyToken, async (req, res) => {
  const { starId } = req.params;
  const userId = req.user.userId;

  if (!starId) {
    return res.status(400).json({ message: 'Missing starId' });
  }

  try {
    const allAlbums = await PhotoAlbum.find({ starId });

    // Filter enkel albums waar user toegang tot heeft
    const accessibleAlbums = allAlbums.filter(album =>
      album.canView.includes(userId) ||
      album.canEdit.includes(userId)
    );

    // Als er al toegankelijke albums zijn, return die gewoon
    if (accessibleAlbums.length > 0) {
      return res.json(accessibleAlbums);
    }

    // Anders check of de ster toegelaten is (owner / canView / canEdit)
    const star = await loadAccessibleStar(starId, userId);
    if (!star) {
      return res.status(404).json({ message: 'Star not found or access forbidden' });
    }

    // Indien toegang via ster, toon álle albums
    res.json(allAlbums);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

/**
 * POST a new album under the star.
 * Only the owner or someone with edit-rights should create;
 * here we check edit-access (or owner).
 */
router.post('/', verifyToken, async (req, res) => {
  const { starId } = req.params;
  if (!starId) {
    return res.status(400).json({ message: 'Missing starId' });
  }

  // allow creation if owner OR in canEdit
  const star = await Star.findOne({
    _id: starId,
    $or: [
      { userId:  req.user.userId },
      { canEdit: req.user.userId },
    ]
  });

  if (!star) {
    return res.status(404).json({ message: 'Star not found or access forbidden' });
  }

  try {
    const { name, sharedWith } = req.body;
    const album = await PhotoAlbum.create({ starId, name, sharedWith });
    res.status(201).json(album);
  } catch (err) {
    res.status(400).json({ message: 'Could not create album', error: err.message });
  }
});

/* ---------- Detail-endpoints under /photo-albums/detail/:id ---------- */

/**
 * GET a single album by its ID, if the user can view or edit the parent star.
 */
router.get('/detail/:id', verifyToken, async (req, res) => {
  try {
    const album = await PhotoAlbum.findById(req.params.id);
    if (!album) {
      return res.status(404).json({ message: 'Album not found' });
    }

    const star = await loadAccessibleStar(album.starId, req.user.userId);
    if (!star) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    res.json(album);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

/**
 * PUT update an album’s metadata (name, canView, canEdit).
 * User must own or have edit rights on the parent star.
 */
router.put('/detail/:id', verifyToken, async (req, res) => {
  try {
    const album = await PhotoAlbum.findById(req.params.id);
    if (!album) {
      return res.status(404).json({ message: 'Album not found' });
    }

    const star = await Star.findOne({
      _id: album.starId,
      $or: [
        { userId:  req.user.userId },
        { canEdit: req.user.userId },
      ]
    });
    if (!star) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const { name, canView, canEdit } = req.body;
    if (name     !== undefined) album.name     = name;
    if (canView  !== undefined) album.canView  = canView;
    if (canEdit  !== undefined) album.canEdit  = canEdit;
    album.updatedAt = new Date();

    await album.save();
    res.json(album);
  } catch (err) {
    res.status(400).json({ message: 'Could not update album', error: err.message });
  }
});

/**
 * DELETE an album.
 * Only the owner or someone with edit rights on the star.
 */
router.delete('/detail/:id', verifyToken, async (req, res) => {
  try {
    const album = await PhotoAlbum.findById(req.params.id);
    if (!album) {
      return res.status(404).json({ message: 'Album not found' });
    }

    const star = await Star.findOne({
      _id: album.starId,
      $or: [
        { userId:  req.user.userId },
        { canEdit: req.user.userId },
      ]
    });
    if (!star) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    await album.deleteOne();
    res.json({ message: 'Album deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

export default router;