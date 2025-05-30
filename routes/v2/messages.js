// routes/v2/messages.js
import express from 'express';
import Message from '../../models/v2/Messages.js';
import Star    from '../../models/v2/Star.js';
import verifyToken from '../../middleware/v1/authMiddleware.js';

const router = express.Router({ mergeParams: true });

/**
 * Helper: load a Star and check view/edit rights.
 * @param {string} starId
 * @param {string} userId
 * @param {boolean} requireEdit  if true, requires edit rights; else view suffices
 * @returns {Star|null}
 */
async function loadStarWithAccess(starId, userId, requireEdit = false) {
  const star = await Star.findById(starId);
  if (!star) return null;
  const isOwner    = String(star.userId) === userId;
  const canViewStar = Array.isArray(star.canView) && star.canView.map(String).includes(userId);
  const canEditStar = Array.isArray(star.canEdit) && star.canEdit.map(String).includes(userId);
  if (requireEdit) {
    if (!isOwner && !canEditStar) return null;
  } else {
    if (!isOwner && !canViewStar && !canEditStar) return null;
  }
  return star;
}

/* POST /stars/:starId/messages
 * Create a new message if user has edit rights on the star.
 */
router.post('/', verifyToken, async (req, res) => {
  const { starId } = req.params;
  const { message, canView = [], canEdit = [] } = req.body;

  try {
    const star = await loadStarWithAccess(starId, req.user.userId, true);
    if (!star) {
      return res.status(404).json({ message: 'Star not found or forbidden' });
    }

    const newMessage = await Message.create({
      starId,
      message,
      sender: req.user.userId,
      canView,
      canEdit,
    });
    res.status(201).json(newMessage);
  } catch (err) {
    res.status(500).json({ message: 'Failed to create message', error: err.message });
  }
});

/* GET /stars/:starId/messages
 * List all messages if user has view rights on the star.
 */
router.get('/', verifyToken, async (req, res) => {
  const { starId } = req.params;

  try {
    const star = await loadStarWithAccess(starId, req.user.userId, false);
    if (!star) {
      return res.status(404).json({ message: 'Star not found or forbidden' });
    }

    const messages = await Message.find({ starId });
    res.json(messages);
  } catch (err) {
    res.status(500).json({ message: 'Failed to retrieve messages', error: err.message });
  }
});

/* GET /stars/:starId/messages/:messageId
 * Fetch one message if user has view rights on the star or on that message.
 */
router.get('/:messageId', verifyToken, async (req, res) => {
  const { starId, messageId } = req.params;

  try {
    const msg = await Message.findById(messageId);
    if (!msg || msg.starId.toString() !== starId) {
      return res.status(404).json({ message: 'Message not found' });
    }
    // star-level view?
    const star = await loadStarWithAccess(starId, req.user.userId, false);
    // message-level view?
    const isSender   = msg.sender.toString() === req.user.userId;
    const canViewMsg = Array.isArray(msg.canView) && msg.canView.map(String).includes(req.user.userId);
    if (!star && !isSender && !canViewMsg) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    res.json(msg);
  } catch (err) {
    res.status(500).json({ message: 'Failed to retrieve message', error: err.message });
  }
});

/* PUT /stars/:starId/messages/:messageId
 * Update a message if user has edit rights on the star or on that message.
 */
router.put('/:messageId', verifyToken, async (req, res) => {
  const { starId, messageId } = req.params;
  const { message: newText, canView, canEdit } = req.body;

  try {
    const msg = await Message.findById(messageId);
    if (!msg || msg.starId.toString() !== starId) {
      return res.status(404).json({ message: 'Message not found' });
    }
    // star-level edit?
    const star = await loadStarWithAccess(starId, req.user.userId, true);
    // message-level edit?
    const isSender  = msg.sender.toString() === req.user.userId;
    const canEditMsg = Array.isArray(msg.canEdit) && msg.canEdit.map(String).includes(req.user.userId);
    if (!star && !isSender && !canEditMsg) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    if (newText   !== undefined) msg.message = newText;
    if (Array.isArray(canView))  msg.canView  = canView;
    if (Array.isArray(canEdit))  msg.canEdit  = canEdit;
    msg.updatedAt = new Date();

    await msg.save();
    res.json({ message: 'Message updated', updatedMessage: msg });
  } catch (err) {
    res.status(500).json({ message: 'Failed to update message', error: err.message });
  }
});

/* DELETE /stars/:starId/messages/:messageId
 * Delete a message only by its sender or by someone with edit rights on the star.
 */
router.delete('/:messageId', verifyToken, async (req, res) => {
  const { starId, messageId } = req.params;

  try {
    const msg = await Message.findById(messageId);
    if (!msg || msg.starId.toString() !== starId) {
      return res.status(404).json({ message: 'Message not found' });
    }
    const star = await loadStarWithAccess(starId, req.user.userId, true);
    const isSender = msg.sender.toString() === req.user.userId;
    if (!star && !isSender) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    await msg.deleteOne();
    res.json({ message: 'Message deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete message', error: err.message });
  }
});

export default router;