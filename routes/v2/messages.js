import express from 'express';
import Message from '../../models/v2/Messages.js';
import Star from '../../models/v2/Star.js';
import verifyToken from '../../middleware/v1/authMiddleware.js';

const router = express.Router({ mergeParams: true });

/**
 * POST /stars/:starId/messages
 * Maak een nieuwe message aan, zet sender op de ingelogde gebruiker
 * body: { message: string, canView?: ObjectId[], canEdit?: ObjectId[] }
 */
router.post('/', verifyToken, async (req, res) => {
  const { starId } = req.params;
  const { message, canView = [], canEdit = [] } = req.body;

  try {
    // Controle eigenaar van de star
    const star = await Star.findOne({ _id: starId, userId: req.user.userId });
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

/**
 * GET /stars/:starId/messages
 * Haal alle messages op bij een star
 */
router.get('/', verifyToken, async (req, res) => {
  const { starId } = req.params;
  try {
    const star = await Star.findOne({ _id: starId, userId: req.user.userId });
    if (!star) {
      return res.status(404).json({ message: 'Star not found or forbidden' });
    }

    const messages = await Message.find({ starId });
    res.json(messages);
  } catch (err) {
    res.status(500).json({ message: 'Failed to retrieve messages', error: err.message });
  }
});

/**
 * GET /stars/:starId/messages/:messageId
 * Haal één message op, controleer owner of view-rechten
 */
router.get('/:messageId', verifyToken, async (req, res) => {
  const { starId, messageId } = req.params;

  try {
    const message = await Message.findById(messageId);
    if (!message || message.starId.toString() !== starId) {
      return res.status(404).json({ message: 'Message not found' });
    }
    // alleen owner of iemand in canView mag lezen
    if (
      message.sender.toString() !== req.user.userId &&
      !message.canView.map(id => id.toString()).includes(req.user.userId)
    ) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    res.json(message);
  } catch (err) {
    res.status(500).json({ message: 'Failed to retrieve message', error: err.message });
  }
});

/**
 * PUT /stars/:starId/messages/:messageId
 * Wijzig content en view/edit-rechten
 */
router.put('/:messageId', verifyToken, async (req, res) => {
  const { starId, messageId } = req.params;
  const { message: newText, canView, canEdit } = req.body;

  try {
    const existing = await Message.findById(messageId);
    if (!existing || existing.starId.toString() !== starId) {
      return res.status(404).json({ message: 'Message not found' });
    }
    // alleen owner of iemand met edit-recht
    const isOwner = existing.sender.toString() === req.user.userId;
    const hasEdit = existing.canEdit.map(id => id.toString()).includes(req.user.userId);
    if (!isOwner && !hasEdit) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    if (newText) existing.message = newText;
    if (Array.isArray(canView)) existing.canView = canView;
    if (Array.isArray(canEdit)) existing.canEdit = canEdit;

    await existing.save();
    res.json({ message: 'Message updated', updatedMessage: existing });
  } catch (err) {
    res.status(500).json({ message: 'Failed to update message', error: err.message });
  }
});

/**
 * DELETE /stars/:starId/messages/:messageId
 * Verwijder een message (alleen owner)
 */
router.delete('/:messageId', verifyToken, async (req, res) => {
  const { starId, messageId } = req.params;

  try {
    const existing = await Message.findById(messageId);
    if (!existing || existing.starId.toString() !== starId) {
      return res.status(404).json({ message: 'Message not found' });
    }
    if (existing.sender.toString() !== req.user.userId) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    await existing.deleteOne();
    res.json({ message: 'Message deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete message', error: err.message });
  }
});

export default router;