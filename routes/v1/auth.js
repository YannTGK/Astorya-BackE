import express from 'express';
import User from '../../models/v1/User.js';
import jwt from 'jsonwebtoken';
import verifyToken from '../../middleware/v1/authMiddleware.js'; // ✅ import this
const router = express.Router();

// REGISTER
router.post('/register', async (req, res) => {
  const { firstName, lastName, email, phoneNumber, dob, password } = req.body;

  console.log("📥 Received registration data:");
  console.log({
    firstName,
    lastName,
    email,
    phoneNumber,
    dob,
    password: "[HIDDEN]"
  });

  try {
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      console.log("❌ User already exists");
      return res.status(400).json({ message: 'User already exists' });
    }

    const newUser = new User({ firstName, lastName, email, phoneNumber, dob, password });
    await newUser.save();

    console.log("✅ New user saved:", newUser._id);

    const token = jwt.sign(
      { userId: newUser._id, email: newUser.email },
      process.env.JWT_SECRET_KEY,
      { expiresIn: '7d' }
    );

    console.log("🔐 Token generated");
    res.status(201).json({ token });

  } catch (error) {
    console.error("❌ Error during registration:", error);
    res.status(500).json({ message: 'Server error' });
  }
});

// LOGIN
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ message: 'User does not exist' });

    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) return res.status(401).json({ message: 'Password does not match' });

    const token = jwt.sign(
      { userId: user._id, email: user.email },
      process.env.JWT_SECRET_KEY,
      { expiresIn: '7d' }
    );

    res.json({ token });

  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ✅ GET current user if token is valid
router.get('/me', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select("-password");
    if (!user) return res.status(404).json({ message: "User not found" });

    res.json({ user });
  } catch (err) {
    console.error("GET /me error:", err);
    res.status(500).json({ message: "Server error" });
  }
});



export default router;