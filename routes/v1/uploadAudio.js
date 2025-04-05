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

console.log("🎧 UploadAudio route loaded");

// Helper: audio compressie naar mp3
function compressAudio(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .audioBitrate("128k")
      .toFormat("mp3")
      .on("end", resolve)
      .on("error", reject)
      .save(outputPath);
  });
}

router.post("/upload-audio", verifyToken, upload.single("audio"), async (req, res) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ message: "No audio uploaded" });

    const inputPath = file.path;
    const outputPath = `${file.path}-compressed.mp3`;

    await compressAudio(inputPath, outputPath);

    const wasabiKey = `user-audios/${req.user.userId}-${Date.now()}.mp3`;
    const uploadResult = await wasabi.upload({
      Bucket: process.env.WASABI_BUCKET_NAME,
      Key: wasabiKey,
      Body: fs.createReadStream(outputPath),
      ACL: "public-read",
      ContentType: "audio/mpeg",
    }).promise();

    if (!uploadResult || !uploadResult.Location) {
      throw new Error("Upload failed or no location returned");
    }

    const audioUrl = uploadResult.Location;

    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    // Voeg audio toe aan user
    user.audios.push({ url: audioUrl, uploadedAt: new Date() });
    await user.save();

    await fs.promises.unlink(inputPath);
    await fs.promises.unlink(outputPath);

    console.log(`✅ Compressed audio uploaded: ${audioUrl}`);
    res.status(200).json({ message: "Audio uploaded successfully", audio: { url: audioUrl } });

  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ message: "Upload failed" });
  }
});

export default router;