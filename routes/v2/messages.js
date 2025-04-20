import express from 'express';
import Message from '../../models/v2/Messages.js';
import Star from '../../models/v2/Star.js';
import verifyToken from '../../middleware/v1/authMiddleware.js';

const router = express.Router({ mergeParams: true });

// POST /stars/:starId/messages
router.post('/', verifyToken, async (req, res) => {
    const { starId } = req.params;
    const { message, sharedWith } = req.body;
  
    try {
      const star = await Star.findOne({ _id: starId, userId: req.user.userId });
      if (!star) {
        return res.status(404).json({ message: 'Star not found or forbidden' });
      }
  
      const newMessage = await Message.create({
        starId,
        message,
        sender: req.user.email, // Set sender to the authenticated user's email or username
        sharedWith: Array.isArray(sharedWith) ? sharedWith : [],
      });
  
      res.status(201).json(newMessage);
    } catch (err) {
      res.status(500).json({ message: 'Failed to create message', error: err.message });
    }
  });

// GET /stars/:starId/messages
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

// GET /messages/:messageId
router.get('/:messageId', verifyToken, async (req, res) => {
  const { messageId } = req.params;

  try {
    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ message: 'Message not found' });
    }

    const star = await Star.findOne({ _id: message.starId, userId: req.user.userId });
    if (!star) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    res.json(message);
  } catch (err) {
    res.status(500).json({ message: 'Failed to retrieve message', error: err.message });
  }
});

// PUT /messages/:messageId
router.put('/:messageId', verifyToken, async (req, res) => {
    const { messageId } = req.params;
    const { message, sharedWith } = req.body;
  
    try {
      const existingMessage = await Message.findById(messageId);
      if (!existingMessage) {
        return res.status(404).json({ message: 'Message not found' });
      }
  
      const star = await Star.findOne({ _id: existingMessage.starId, userId: req.user.userId });
      if (!star) {
        return res.status(403).json({ message: 'Forbidden' });
      }
  
      if (message) existingMessage.message = message;
  
      if (sharedWith) {
        if (Array.isArray(sharedWith)) {
          existingMessage.sharedWith = sharedWith;
        } else if (typeof sharedWith === 'string') {
          existingMessage.sharedWith = sharedWith
            .split(',')
            .map(s => s.trim())
            .filter(Boolean);
        }
      }
  
      await existingMessage.save();
      res.json({ message: 'Message updated', updatedMessage: existingMessage });
    } catch (err) {
      res.status(500).json({ message: 'Failed to update message', error: err.message });
    }
  });
  
// DELETE /messages/:messageId
router.delete('/:messageId', verifyToken, async (req, res) => {
  const { messageId } = req.params;

  try {
    const message = await Message.findById(messageId);
    if (!message) {
      return res.status(404).json({ message: 'Message not found' });
    }

    const star = await Star.findOne({ _id: message.starId, userId: req.user.userId });
    if (!star) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    await message.deleteOne();
    res.json({ message: 'Message deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete message', error: err.message });
  }
});

export default router;