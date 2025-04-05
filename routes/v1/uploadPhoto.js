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

router.post("/upload-photo", verifyToken, upload.single("photo"), async (req, res) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ message: "No photo uploaded" });

    const inputPath = file.path;
    const outputPath = `${file.path}-compressed.jpg`;

    await new Promise((resolve, reject) => {
      gm(inputPath)
        .resize(1080)
        .quality(80)
        .write(outputPath, (err) => (err ? reject(err) : resolve()));
    });

    const wasabiKey = `user-photos/${req.user.userId}-${Date.now()}.jpg`;
    const uploadResult = await wasabi.upload({
      Bucket: process.env.WASABI_BUCKET_NAME,
      Key: wasabiKey,
      Body: fs.createReadStream(outputPath),
      ACL: "public-read",
      ContentType: "image/jpeg"
    }).promise();

    const imageUrl = uploadResult.Location;

    const user = await User.findById(req.user.userId);
    user.photos.push({ url: imageUrl, uploadedAt: new Date() });
    await user.save();

    fs.unlinkSync(inputPath);
    fs.unlinkSync(outputPath);

    res.status(200).json({ message: "Photo uploaded successfully", photo: { url: imageUrl } });

  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ message: "Upload failed" });
  }
});

export default router;