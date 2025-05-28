// routes/v2/threeDRoomAudios.js
import express from "express";
import multer from "multer";
import fs from "fs/promises";
import wasabi from "../../utils/wasabiClient.js";
import { presign } from "../../utils/presign.js";
import Star from "../../models/v2/Star.js";
import ThreeDRoom from "../../models/v2/ThreeDRoom.js";
import ThreeDRoomAudio from "../../models/v2/3DAudio.js";
import verifyToken from "../../middleware/v1/authMiddleware.js";

const router = express.Router({ mergeParams: true });
const upload = multer({ dest: "uploads/temp/" });

async function uploadToWasabi(localPath, key, contentType) {
  const Body = await fs.readFile(localPath);
  await wasabi
    .upload({
      Bucket: process.env.WASABI_BUCKET_NAME,
      Key: key,
      Body,
      ContentType: contentType,
    })
    .promise();
}

// GET all audios (public first, otherwise auth-protected)
router.get(
  "/",
  async (req, res, next) => {
    const { starId, roomId } = req.params;
    const star = await Star.findById(starId);
    if (!star) return res.status(404).json({ message: "Star not found" });

    // Openbaar inzicht
    if (!star.isPrivate) {
      const list = await ThreeDRoomAudio.find({ roomId });
      const out = await Promise.all(
        list.map(async (a) => ({
          _id: a._id,
          title: a.title,
          url: await presign(a.key, 3600),
          addedAt: a.addedAt,
        }))
      );
      return res.json(out);
    }

    // Anders verder naar verifyToken
    next();
  },
  verifyToken,
  async (req, res) => {
    const { starId, roomId } = req.params;
    // Alleen de eigenaar van de ster + kamer mag na verificatie
    const star = await Star.findOne({ _id: starId, userId: req.user.userId });
    const room = await ThreeDRoom.findOne({ _id: roomId, starId });
    if (!star || !room)
      return res.status(404).json({ message: "Not found or forbidden" });

    const list = await ThreeDRoomAudio.find({ roomId });
    const out = await Promise.all(
      list.map(async (a) => ({
        _id: a._id,
        title: a.title,
        url: await presign(a.key, 3600),
        addedAt: a.addedAt,
      }))
    );
    res.json(out);
  }
);

// POST upload audio
router.post(
  "/upload",
  verifyToken,
  upload.single("audio"),
  async (req, res) => {
    const { starId, roomId } = req.params;
    const { title = "Untitled" } = req.body;
    const file = req.file;
    if (!file) return res.status(400).json({ message: "No audio file" });

    // Check eigenaar
    const star = await Star.findOne({ _id: starId, userId: req.user.userId });
    const room = await ThreeDRoom.findOne({ _id: roomId, starId });
    if (!star || !room)
      return res.status(404).json({ message: "Not found or forbidden" });

    // Upload naar Wasabi
    const key = `stars/${starId}/three-d-rooms/${roomId}/audios/${
      Date.now()
    }-${file.originalname}`;
    await uploadToWasabi(file.path, key, file.mimetype || "audio/mpeg");
    await fs.unlink(file.path);

    // Maak document aan met zowel starId als roomId
    const audio = await ThreeDRoomAudio.create({
      starId,
      roomId,
      title,
      key,
    });

    res.status(201).json(audio);
  }
);

// DELETE audio
router.delete(
  "/:audioId",
  verifyToken,
  async (req, res) => {
    const { starId, roomId, audioId } = req.params;
    const a = await ThreeDRoomAudio.findById(audioId);
    if (!a) return res.status(404).json({ message: "Audio not found" });

    // Alleen de ster-eigenaar mag verwijderen
    const star = await Star.findOne({ _id: starId, userId: req.user.userId });
    if (!star) return res.status(403).json({ message: "Forbidden" });

    await a.deleteOne();
    res.json({ message: "Deleted" });
  }
);

export default router;