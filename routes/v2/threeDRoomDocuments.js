import express from "express";
import multer from "multer";
import fs from "fs/promises";
import wasabi from "../../utils/wasabiClient.js";
import { presign } from "../../utils/presign.js";
import Star from "../../models/v2/Star.js";
import ThreeDRoom from "../../models/v2/ThreeDRoom.js";
import ThreeDRoomDocument from "../../models/v2/Document.js";
import verifyToken from "../../middleware/v1/authMiddleware.js";

const router = express.Router({ mergeParams: true });
const upload = multer({ dest: "uploads/temp/" });

async function uploadToWasabi(localPath, key, mime) {
  const Body = await fs.readFile(localPath);
  await wasabi.upload({
    Bucket: process.env.WASABI_BUCKET_NAME,
    Key: key,
    Body,
    ContentType: mime,
  }).promise();
}

// ═════════ GET all documents ═════════
// 1) public if star.isPrivate === false
router.get(
  "/",
  async (req, res, next) => {
    const { starId, roomId } = req.params;
    const star = await Star.findById(starId);
    if (!star) return res.status(404).json({ message: "Star not found" });
    if (!star.isPrivate) {
      const docs = await ThreeDRoomDocument.find({ roomId });
      const out = await Promise.all(
        docs.map(async (d) => ({
          _id: d._id,
          originalName: d.originalName,
          url: await presign(d.key, 3600),
          addedAt: d.addedAt,
        }))
      );
      return res.json(out);
    }
    next();
  },
  // 2) private fallback
  verifyToken,
  async (req, res) => {
    const { starId, roomId } = req.params;
    const star = await Star.findOne({ _id: starId, userId: req.user.userId });
    const room = await ThreeDRoom.findOne({ _id: roomId, starId });
    if (!star || !room) return res.status(404).json({ message: "Not found or forbidden" });
    const docs = await ThreeDRoomDocument.find({ roomId });
    const out = await Promise.all(
      docs.map(async (d) => ({
        _id: d._id,
        originalName: d.originalName,
        url: await presign(d.key, 3600),
        addedAt: d.addedAt,
      }))
    );
    res.json(out);
  }
);

// ═════════ POST upload ═════════
router.post(
  "/upload",
  verifyToken,
  upload.single("document"),
  async (req, res) => {
    const { starId, roomId } = req.params;
    const { docType } = req.body;
    const file = req.file;
    if (!file) return res.status(400).json({ message: "No file uploaded" });

    const star = await Star.findOne({ _id: starId, userId: req.user.userId });
    const room = await ThreeDRoom.findOne({ _id: roomId, starId });
    if (!star || !room) return res.status(404).json({ message: "Not found or forbidden" });

    const originalName = file.originalname;
    const key = `stars/${starId}/three-d-rooms/${roomId}/documents/${Date.now()}-${originalName}`;
    await uploadToWasabi(file.path, key, file.mimetype || "application/octet-stream");
    await fs.unlink(file.path);

    const doc = await ThreeDRoomDocument.create({
      roomId,
      key,
      originalName,
      docType: docType || originalName.split(".").pop(),
    });

    res.status(201).json(doc);
  }
);

// ═════════ GET detail ═════════
router.get(
  "/:documentId",
  async (req, res, next) => {
    const { starId, documentId } = req.params;
    const star = await Star.findById(starId);
    if (!star) return res.status(404).json({ message: "Star not found" });
    if (!star.isPrivate) {
      const doc = await ThreeDRoomDocument.findById(documentId);
      if (!doc || doc.roomId.toString() !== req.params.roomId)
        return res.status(404).json({ message: "Document not found" });
      const url = await presign(doc.key, 3600);
      return res.json({ ...doc.toObject(), url });
    }
    next();
  },
  verifyToken,
  async (req, res) => {
    const { starId, documentId } = req.params;
    const doc = await ThreeDRoomDocument.findById(documentId);
    if (!doc || doc.roomId.toString() !== req.params.roomId)
      return res.status(404).json({ message: "Document not found" });

    const star = await Star.findOne({ _id: starId, userId: req.user.userId });
    if (!star) return res.status(403).json({ message: "Forbidden" });

    const url = await presign(doc.key, 3600);
    res.json({ ...doc.toObject(), url });
  }
);

// ═════════ DELETE detail ═════════
router.delete(
  "/:documentId",
  verifyToken,
  async (req, res) => {
    const { documentId, starId } = req.params;
    const doc = await ThreeDRoomDocument.findById(documentId);
    if (!doc) return res.status(404).json({ message: "Document not found" });

    const star = await Star.findOne({ _id: starId, userId: req.user.userId });
    if (!star) return res.status(403).json({ message: "Forbidden" });

    await doc.deleteOne();
    res.json({ message: "Deleted" });
  }
);

export default router;