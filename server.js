import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";

// Route imports
import authRoutes from "./routes/v2/auth.js";
import userRoutes from "./routes/v2/user.js"
import starRoutes from "./routes/v2/stars.js";
import vrRoomsRoutes from "./routes/v2/vrRooms.js";
import photoAlbumRoutes from "./routes/v2/photoAlbums.js";
import photoRoutes from "./routes/v2/photos.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5001;
const MONGO_URI = process.env.MONGO_URI;

// Middleware
app.use(cors());
app.use(express.json());
app.use((req, res, next) => {
  console.log(`➡️ [${req.method}] ${req.url}`);
  next();
});

// Connect to MongoDB Atlas
mongoose
  .connect(MONGO_URI)
  .then(() => console.log("✅ Connected to MongoDB Atlas"))
  .catch((err) => console.error("❌ MongoDB Connection Error:", err));

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/stars", starRoutes);
app.use('/api/stars/:starId/vr-rooms', vrRoomsRoutes);
app.use('/api/vrRooms', vrRoomsRoutes);
app.use("/api/photo-albums", photoAlbumRoutes);
app.use("/api/photos", photoRoutes);
// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});