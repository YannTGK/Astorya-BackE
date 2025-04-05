import express from "express";
import multer from "multer";
import gmModule from "gm";
import fs from "fs";
import path from "path";
import wasabi from "../../utils/wasabiClient.js";
import verifyToken from "../../middleware/v1/authMiddleware.js";
import User from "../../models/v1/User.js";

const router = express.Router();
const upload = multer({ dest: "uploads/temp/" });
const gm = gmModule.subClass({ imageMagick: true });

console.log("📸 UploadPhoto route loaded");

// Helper voor beeldcompressie
function compressImage(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    gm(inputPath)
      .resize(1080)
      .quality(80)
      .write(outputPath, (err) => {
        if (err) reject(err);
        else resolve();
      });
  });
}

router.post("/upload-photo", verifyToken, upload.single("photo"), async (req, res) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ message: "No photo uploaded" });

    const inputPath = file.path;
    const outputPath = `${file.path}-compressed.jpg`;

    // Compressie uitvoeren
    await compressImage(inputPath, outputPath);

    // Upload naar Wasabi
    const wasabiKey = `user-photos/${req.user.userId}-${Date.now()}.jpg`;
    const uploadResult = await wasabi.upload({
      Bucket: process.env.WASABI_BUCKET_NAME,
      Key: wasabiKey,
      Body: fs.createReadStream(outputPath),
      ACL: "public-read",
      ContentType: "image/jpeg",
    }).promise();

    if (!uploadResult || !uploadResult.Location) {
      throw new Error("Upload failed or no location returned");
    }

    const imageUrl = uploadResult.Location;

    // Foto toevoegen aan gebruiker
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    user.photos.push({ url: imageUrl, uploadedAt: new Date() });
    await user.save();

    // Tijdelijke bestanden opruimen
    await fs.promises.unlink(inputPath);
    await fs.promises.unlink(outputPath);

    console.log(`✅ Compressed image uploaded: ${imageUrl}`);
    res.status(200).json({ message: "Photo uploaded successfully", photo: { url: imageUrl } });

  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ message: "Upload failed" });
  }
});

export default router;