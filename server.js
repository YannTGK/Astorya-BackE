import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";

// Route imports
import authRoutes from "./routes/v2/auth.js";
import userRoutes from "./routes/v2/user.js"
import starRoutes from "./routes/v2/stars.js";
import vrRoomsRoutes from "./routes/v2/vrRooms.js";
import photoAlbumsRoutes from "./routes/v2/photoAlbums.js";
import photosRoutes from "./routes/v2/photos.js";  
import videoAlbumsRoutes from "./routes/v2/videoAlbums.js";
import videosRoutes from "./routes/v2/video.js";
import audioRoutes from "./routes/v2/audios.js";
import messagesRoutes from "./routes/v2/messages.js"
import documentsRoutes from "./routes/v2/documents.js"
import s3Routes from "./routes/v2/s3.js"


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
app.use('/api/stars/:starId/photo-albums', photoAlbumsRoutes);
app.use('/api/photo-albums', photoAlbumsRoutes);
app.use('/api/stars/:starId/photo-albums/:albumId/photos', photosRoutes);
app.use('/api/photos', photosRoutes );
app.use('/api/stars/:starId/video-albums', videoAlbumsRoutes);
app.use('/api/video-albums', videoAlbumsRoutes);
app.use("/api/stars/:starId/video-albums/:albumId/videos", videosRoutes); 
app.use('/api/stars/:starId/audios', audioRoutes);
app.use('/api/stars/:starId/messages', messagesRoutes);
app.use('/api/stars/:starId/documents', documentsRoutes);
app.use('/api/s3', s3Routes); 

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});