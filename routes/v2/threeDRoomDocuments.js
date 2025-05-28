// routes/v2/threeDRoomDocuments.js
import express from "express";
import multer from "multer";
import fs from "fs/promises";

import wasabi from "../../utils/wasabiClient.js";
import { presign } from "../../utils/presign.js";
import Star from "../../models/v2/Star.js";
import ThreeDRoom from "../../models/v2/ThreeDRoom.js";
import ThreeDRoomDocument from "../../models/v2/3DDocuments.js";
import verifyJWT from "../../middleware/v1/authMiddleware.js";

const router = express.Router({ mergeParams: true });
const upload = multer({ dest: "uploads/temp/" });

// Helper om file naar Wasabi te uploaden
async function uploadToWasabi(localPath, key, mime) {
  const Body = await fs.readFile(localPath);
  await wasabi
    .upload({
      Bucket: process.env.WASABI_BUCKET_NAME,
      Key: key,
      Body,
      ContentType: mime,
    })
    .promise();
}

// GET  /stars/:starId/three-d-rooms/:roomId/documents
router.get(
  "/",
  async (req, res, next) => {
    const { starId, roomId } = req.params;
    const star = await Star.findById(starId);
    if (!star) return res.status(404).json({ message: "Star not found" });
    if (!star.isPrivate) {
      const docs = await ThreeDRoomDocument.find({ starId, roomId }).sort({ addedAt: -1 });
      const out = await Promise.all(
        docs.map(async (d) => ({
          _id: d._id,
          originalName: d.originalName,
          docType: d.docType,
          url: await presign(d.key, 3600),
          addedAt: d.addedAt,
        }))
      );
      return res.json(out);
    }
    next();
  },
  verifyJWT,
  async (req, res) => {
    const { starId, roomId } = req.params;
    const star = await Star.findOne({ _id: starId, userId: req.user.userId });
    const room = await ThreeDRoom.findOne({ _id: roomId, starId });
    if (!star || !room) return res.status(404).json({ message: "Not found or forbidden" });

    const docs = await ThreeDRoomDocument.find({ starId, roomId }).sort({ addedAt: -1 });
    const out = await Promise.all(
      docs.map(async (d) => ({
        _id: d._id,
        originalName: d.originalName,
        docType: d.docType,
        url: await presign(d.key, 3600),
        addedAt: d.addedAt,
      }))
    );
    res.json(out);
  }
);

// POST upload
router.post(
  "/upload",
  verifyJWT,
  upload.single("document"),
  async (req, res) => {
    const { starId, roomId } = req.params;
    const { docType, canView = [], canEdit = [] } = req.body;
    const file = req.file;
    if (!file) return res.status(400).json({ message: "No document file" });

    const star = await Star.findOne({ _id: starId, userId: req.user.userId });
    const room = await ThreeDRoom.findOne({ _id: roomId, starId });
    if (!star || !room) return res.status(404).json({ message: "Not found or forbidden" });

    const originalName = decodeURIComponent(file.originalname);
    const key = `stars/${starId}/three-d-rooms/${roomId}/documents/${Date.now()}-${originalName}`;

    try {
      await uploadToWasabi(file.path, key, file.mimetype || "application/octet-stream");
      await fs.unlink(file.path).catch(() => {});

      const newDoc = await ThreeDRoomDocument.create({
        starId,
        roomId,
        key,
        originalName,
        docType:
          docType ||
          originalName
            .split(".")
            .pop()
            .toLowerCase() ||
          "pdf",
        canView: Array.isArray(canView) ? canView : [canView],
        canEdit: Array.isArray(canEdit) ? canEdit : [canEdit],
      });

      res.status(201).json(newDoc);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Upload failed", error: err.message });
    }
  }
);

// GET single document (met presigned URL)
router.get("/:documentId", verifyJWT, async (req, res) => {
  const { starId, roomId, documentId } = req.params;
  try {
    const doc = await ThreeDRoomDocument.findById(documentId);
    if (
      !doc ||
      doc.starId.toString() !== starId ||
      doc.roomId.toString() !== roomId
    ) {
      return res.status(404).json({ message: "Not found" });
    }

    const isOwner = await Star.exists({ _id: starId, userId: req.user.userId });
    const canSee = doc.canView.map(String).includes(req.user.userId);
    if (!isOwner && !canSee) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const url = await presign(doc.key, 3600);
    res.json({ ...doc.toObject(), url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to retrieve document", error: err.message });
  }
});

// PUT update document / vervang bestand
router.put(
  "/:documentId",
  verifyJWT,
  upload.single("document"),
  async (req, res) => {
    const { starId, roomId, documentId } = req.params;
    const { docType, canView, canEdit } = req.body;

    try {
      const doc = await ThreeDRoomDocument.findById(documentId);
      if (
        !doc ||
        doc.starId.toString() !== starId ||
        doc.roomId.toString() !== roomId
      ) {
        return res.status(404).json({ message: "Not found" });
      }

      const isOwner = await Star.exists({ _id: starId, userId: req.user.userId });
      const hasEdit = doc.canEdit.map(String).includes(req.user.userId);
      if (!isOwner && !hasEdit) {
        return res.status(403).json({ message: "Forbidden" });
      }

      if (req.file) {
        const originalName = decodeURIComponent(req.file.originalname);
        const newKey = `stars/${starId}/three-d-rooms/${roomId}/documents/${Date.now()}-${originalName}`;

        await uploadToWasabi(
          req.file.path,
          newKey,
          req.file.mimetype || "application/octet-stream"
        );
        await fs.unlink(req.file.path).catch(() => {});

        doc.key = newKey;
        doc.originalName = originalName;
      }

      if (docType) doc.docType = docType;
      if (canView) doc.canView = Array.isArray(canView) ? canView : [canView];
      if (canEdit) doc.canEdit = Array.isArray(canEdit) ? canEdit : [canEdit];

      await doc.save();
      res.json({ message: "Document updated", document: doc });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Update failed", error: err.message });
    }
  }
);

// DELETE document
router.delete("/:documentId", verifyJWT, async (req, res) => {
  const { starId, roomId, documentId } = req.params;
  try {
    const doc = await ThreeDRoomDocument.findById(documentId);
    if (
      !doc ||
      doc.starId.toString() !== starId ||
      doc.roomId.toString() !== roomId
    ) {
      return res.status(404).json({ message: "Not found" });
    }

    const isOwner = await Star.exists({ _id: starId, userId: req.user.userId });
    if (!isOwner) return res.status(403).json({ message: "Forbidden" });

    await doc.deleteOne();
    res.json({ message: "Document deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Delete failed", error: err.message });
  }
});

export default router;