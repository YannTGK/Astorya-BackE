import express from "express";
import multer from "multer";
import fs from "fs";
import ffmpeg from "fluent-ffmpeg";
import path from "path";
import wasabi from "../../utils/wasabiClient.js";
import verifyToken from "../../middleware/v1/authMiddleware.js";
import User from "../../models/v1/User.js";

const router = express.Router();
const upload = multer({ dest: "uploads/temp/" });

console.log("🎥 UploadVideo route loaded");

// Helper: video compressie via ffmpeg
function compressVideo(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .outputOptions([
        "-c:v libx264",        // H.264 encoding
        "-preset veryfast",    // Compressiesnelheid
        "-crf 28",             // Quality (lager = beter, 23 is standaard)
        "-c:a aac",            // Audio compressie
        "-b:a 128k",           // Audiobitrate
        "-movflags +faststart" // Sneller streambaar maken
      ])
      .on("end", resolve)
      .on("error", reject)
      .save(outputPath);
  });
}

router.post("/upload-video", verifyToken, upload.single("video"), async (req, res) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ message: "No video uploaded" });

    const inputPath = file.path;
    const outputPath = `${file.path}-compressed.mp4`;

    await compressVideo(inputPath, outputPath);

    const wasabiKey = `user-videos/${req.user.userId}-${Date.now()}.mp4`;
    const uploadResult = await wasabi.upload({
      Bucket: process.env.WASABI_BUCKET_NAME,
      Key: wasabiKey,
      Body: fs.createReadStream(outputPath),
      ACL: "public-read",
      ContentType: "video/mp4",
    }).promise();

    if (!uploadResult || !uploadResult.Location) {
      throw new Error("Upload failed or no location returned");
    }

    const videoUrl = uploadResult.Location;

    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    // Zorg dat je in je User-model een "videos" array hebt
    user.videos.push({ url: videoUrl, uploadedAt: new Date() });
    await user.save();

    await fs.promises.unlink(inputPath);
    await fs.promises.unlink(outputPath);

    console.log(`✅ Compressed video uploaded: ${videoUrl}`);
    res.status(200).json({ message: "Video uploaded successfully", video: { url: videoUrl } });

  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ message: "Upload failed" });
  }
});

export default router;