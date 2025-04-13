import express from 'express';
import User from '../../models/v2/User.js';
import jwt from 'jsonwebtoken';
import verifyToken from '../../middleware/v1/authMiddleware.js';

const router = express.Router();

// REGISTER
router.post('/register', async (req, res) => {
  const {
    firstName,
    lastName,
    username,      // <-- now we accept username
    email,
    phoneNumber,
    dob,
    password
  } = req.body;

  console.log("📥 Received registration data:", {
    firstName,
    lastName,
    username,
    email,
    phoneNumber,
    dob,
    password: "[HIDDEN]"
  });

  try {
    // Check if this email is already in use
    const existingEmail = await User.findOne({ email });
    if (existingEmail) {
      console.log("❌ Email already exists");
      return res.status(400).json({ message: 'Email already exists' });
    }

    // Check if this username is already in use
    const existingUsername = await User.findOne({ username });
    if (existingUsername) {
      console.log("❌ Username already exists");
      return res.status(400).json({ message: 'Username already exists' });
    }

    // Create new user
    const newUser = new User({
      firstName,
      lastName,
      username,     // <-- store username
      email,
      phoneNumber,
      dob,
      password
    });

    await newUser.save();
    console.log("✅ New user saved:", newUser._id);

    // Generate token (optionally including username)
    const token = jwt.sign(
      {
        userId: newUser._id,
        email: newUser.email,
        username: newUser.username
      },
      process.env.JWT_SECRET_KEY,
      { expiresIn: '7d' }
    );

    console.log("🔐 Token generated");
    return res.status(201).json({ token });

  } catch (error) {
    console.error("❌ Error during registration:", error);
    return res.status(500).json({ message: 'Server error' });
  }
});

// LOGIN
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) {
      console.log("❌ User does not exist");
      return res.status(401).json({ message: 'User does not exist' });
    }

    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      console.log("❌ Password does not match");
      return res.status(401).json({ message: 'Password does not match' });
    }

    // Include username in the token if desired
    const token = jwt.sign(
      {
        userId: user._id,
        email: user.email,
        username: user.username
      },
      process.env.JWT_SECRET_KEY,
      { expiresIn: '7d' }
    );

    return res.json({ token });

  } catch (error) {
    console.error("❌ Login error:", error);
    return res.status(500).json({ message: 'Server error' });
  }
});

// ✅ GET current user if token is valid
router.get('/me', verifyToken, async (req, res) => {
  try {
    // Exclude password field
    const user = await User.findById(req.user.userId).select("-password");
    if (!user) {
      console.log("❌ User not found");
      return res.status(404).json({ message: "User not found" });
    }

    return res.json({ user });
  } catch (err) {
    console.error("GET /me error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

export default router;