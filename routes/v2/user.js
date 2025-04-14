import express from 'express';
import User from '../../models/v2/User.js';
import verifyToken from '../../middleware/v1/authMiddleware.js';

const router = express.Router();

// GET alle gebruikers (admin-only later)
router.get('/', verifyToken, async (req, res) => {
  try {
    const users = await User.find().select('-password');
    return res.json(users);
  } catch (error) {
    return res.status(500).json({ message: "Server error" });
  }
});

// GET één gebruiker op ID
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    return res.json(user);
  } catch (error) {
    return res.status(500).json({ message: "Server error" });
  }
});

// PUT update één gebruiker (bijv. plan, isAlive, etc.)
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const updatedUser = await User.findByIdAndUpdate(req.params.id, req.body, { new: true }).select('-password');
    if (!updatedUser) {
      return res.status(404).json({ message: "User not found" });
    }
    return res.json(updatedUser);
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
});

// DELETE één gebruiker (admin-only later)
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const deletedUser = await User.findByIdAndDelete(req.params.id);
    if (!deletedUser) {
      return res.status(404).json({ message: "User not found" });
    }
    return res.json({ message: "User deleted" });
  } catch (error) {
    return res.status(500).json({ message: "Server error" });
  }
});

export default router;