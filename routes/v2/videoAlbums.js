// routes/v2/video-albums.js
import express from 'express';
import VideoAlbum from '../../models/v2/VideoAlbum.js';
import Star       from '../../models/v2/Star.js';
import verifyToken from '../../middleware/v1/authMiddleware.js';

const router = express.Router({ mergeParams: true });

/**
 * Helper to load an album and its star, and check rights.
 * @param {string} albumId
 * @param {string} userId
 * @param {boolean} requireEdit  if true, requires edit rights; otherwise view rights suffice
 * @returns {{ album: VideoAlbum, star: Star }|null}
 */
async function loadAlbumWithAccess(albumId, userId, requireEdit = false) {
  const album = await VideoAlbum.findById(albumId);
  if (!album) return null;

  const star = await Star.findById(album.starId);
  if (!star) return null;

  const isOwner     = String(star.userId) === userId;
  const starCanView  = Array.isArray(star.canView) && star.canView.map(String).includes(userId);
  const starCanEdit  = Array.isArray(star.canEdit) && star.canEdit.map(String).includes(userId);
  const albumCanView = Array.isArray(album.canView) && album.canView.map(String).includes(userId);
  const albumCanEdit = Array.isArray(album.canEdit) && album.canEdit.map(String).includes(userId);

  if (requireEdit) {
    if (!isOwner && !starCanEdit && !albumCanEdit) return null;
  } else {
    if (!isOwner && !starCanView && !starCanEdit && !albumCanView && !albumCanEdit) return null;
  }

  return { album, star };
}

/**
 * Helper to load a star and check star-level view rights.
 * Used for listing and creating albums.
 */
async function loadStarWithViewAccess(starId, userId) {
  return Star.findOne({
    _id: starId,
    $or: [
      { userId: userId },
      { canView: userId },
      { canEdit: userId },
    ]
  });
}

/**
 * Helper to load a star and check star-level edit rights.
 * Used for creating new albums.
 */
async function loadStarWithEditAccess(starId, userId) {
  return Star.findOne({
    _id: starId,
    $or: [
      { userId: userId },
      { canEdit: userId },
    ]
  });
}


// GET /stars/:starId/video-albums
// list all video albums if user has view/edit on star
router.get('/', verifyToken, async (req, res) => {
  const { starId } = req.params;
  const userId = req.user.userId;

  if (!starId) {
    return res.status(400).json({ message: 'Missing starId' });
  }

  try {
    const allAlbums = await VideoAlbum.find({ starId });

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
    const star = await Star.findOne({
      _id: starId,
      $or: [
        { userId: userId },
        { canView: userId },
        { canEdit: userId },
      ]
    });

    if (!star) {
      return res.status(404).json({ message: 'Star not found or access forbidden' });
    }

    // Indien toegang via ster, toon álle albums
    res.json(allAlbums);
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
});

// POST /stars/:starId/video-albums
// create a new video album if user has edit rights on star
router.post('/', verifyToken, async (req, res) => {
  const { starId } = req.params;
  const { name, sharedWith } = req.body;
  try {
    if (!starId) return res.status(400).json({ message: 'Missing starId' });

    const star = await loadStarWithEditAccess(starId, req.user.userId);
    if (!star) return res.status(404).json({ message: 'Star not found or forbidden' });

    const videoAlbum = await VideoAlbum.create({ starId, name, sharedWith });
    res.status(201).json(videoAlbum);
  } catch (err) {
    res.status(400).json({ message: 'Could not create video album', error: err.message });
  }
});

// GET /stars/:starId/video-albums/detail/:albumId
// fetch one album if user has view rights on star or album
router.get('/detail/:albumId', verifyToken, async (req, res) => {
  try {
    const { starId, albumId } = req.params;
    const access = await loadAlbumWithAccess(albumId, req.user.userId, false);
    if (!access || String(access.album.starId) !== starId) {
      return res.status(404).json({ message: 'Video album not found or forbidden' });
    }
    res.json(access.album);
  } catch (err) {
    console.error('[GET VIDEO-ALBUM DETAIL ERROR]', err);
    res.status(500).json({ message: 'Could not fetch album detail', error: err.message });
  }
});

// PUT /stars/:starId/video-albums/detail/:albumId
// update album fields if user has edit rights on star or album
router.put('/detail/:albumId', verifyToken, async (req, res) => {
  try {
    const { starId, albumId } = req.params;
    const access = await loadAlbumWithAccess(albumId, req.user.userId, true);
    if (!access || String(access.album.starId) !== starId) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const { name, canView, canEdit } = req.body;
    if (name     !== undefined) access.album.name     = name;
    if (canView  !== undefined) access.album.canView  = canView;
    if (canEdit  !== undefined) access.album.canEdit  = canEdit;
    access.album.updatedAt = new Date();

    await access.album.save();
    res.json({ message: 'Video album updated', album: access.album });
  } catch (err) {
    console.error('[PUT VIDEO-ALBUM DETAIL ERROR]', err);
    res.status(500).json({ message: 'Could not update album', error: err.message });
  }
});

// DELETE /stars/:starId/video-albums/:albumId
// delete an album if user has edit rights on star or album
router.delete('/:albumId', verifyToken, async (req, res) => {
  try {
    const { starId, albumId } = req.params;
    const access = await loadAlbumWithAccess(albumId, req.user.userId, true);
    if (!access || String(access.album.starId) !== starId) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    // optionally clean up associated videos:
    const Video = (await import('../../models/v2/Video.js')).default;
    await Video.deleteMany({ videoAlbumId: albumId });

    await access.album.deleteOne();
    res.json({ message: 'Video album and its videos deleted' });
  } catch (err) {
    console.error('[DELETE VIDEO-ALBUM ERROR]', err);
    res.status(500).json({ message: 'Could not delete album', error: err.message });
  }
});

export default router;