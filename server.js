import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";

// Route imports
import authRoutes from "./routes/v1/auth.js";
import uploadPhotoRoutes from "./routes/v1/uploadPhoto.js";
import uploadVideoRoutes from "./routes/v1/uploadVideo.js"; // <-- nieuw toegevoegd

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5001;
const MONGO_URI = process.env.MONGO_URI;

// Debugging logs (optioneel verwijderen in productie)
console.log("🔑 WASABI_ACCESS_KEY:", process.env.WASABI_ACCESS_KEY);
console.log("🔑 WASABI_SECRET_KEY:", process.env.WASABI_SECRET_KEY);
console.log("🪣 WASABI_BUCKET_NAME:", process.env.WASABI_BUCKET_NAME);

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
app.use("/api/auth", authRoutes);            // login, register, etc.
app.use("/api/auth", uploadPhotoRoutes);     // /upload-photo
app.use("/api/auth", uploadVideoRoutes);     // /upload-video

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});