/* routes/v2/documents.js */
import express   from "express";
import multer    from "multer";
import fs        from "fs/promises";

import wasabi     from "../../utils/wasabiClient.js";
import { presign } from "../../utils/presign.js";   // ↙︎ presigned-URL helper
import Document   from "../../models/v2/Document.js";
import Star       from "../../models/v2/Star.js";
import verifyJWT  from "../../middleware/v1/authMiddleware.js";

const router = express.Router({ mergeParams: true });
const upload = multer({ dest: "uploads/temp/" });

/* ───────────────── helpers ───────────────────────────── */
const toArray = (v) =>
  Array.isArray(v)
    ? v
    : typeof v === "string" && v.trim()
    ? v.split(",").map((s) => s.trim()).filter(Boolean)
    : [];

async function uploadToWasabi(localPath, key, mime) {
  const Body = await fs.readFile(localPath);
  await wasabi
    .upload({
      Bucket: process.env.WASABI_BUCKET_NAME,
      Key: key,
      Body,
      ACL: "public-read",                // optioneel – jij gebruikt presigned URL’s
      ContentType: mime,
    })
    .promise();
  return key;                            // we bewaren alléén de key
}

/* ═══════════════════════════════════════════════════════
   POST  /stars/:starId/documents/upload
   veld-naam bestand:  document
   body-velden (multipart): docType, canView[], canEdit[]
  ═══════════════════════════════════════════════════════ */
router.post(
  "/upload",
  verifyJWT,
  upload.single("document"),
  async (req, res) => {
    const { starId }                               = req.params;
    const { docType, canView = [], canEdit = [] }  = req.body;

    try {
      const star = await Star.findOne({ _id: starId, userId: req.user.userId });
      if (!star)
        return res.status(404).json({ message: "Star not found or forbidden" });

      const originalName = decodeURIComponent(req.file.originalname);
      const key = `stars/${starId}/documents/${Date.now()}-${originalName}`;

      await uploadToWasabi(
        req.file.path,
        key,
        req.file.mimetype || "application/octet-stream"
      );
      await fs.unlink(req.file.path).catch(() => {});

      const newDoc = await Document.create({
        starId,
        key,
        originalName,
        docType: docType || originalName.split(".").pop()?.toLowerCase() || "pdf",
        canView: toArray(canView),
        canEdit: toArray(canEdit),
      });

      res.status(201).json(newDoc);
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Document upload failed", error: err.message });
    }
  }
);

/* ═══════════════════════════════════════════════════════
   GET  /stars/:starId/documents
   -> alle docs (alleen owner)
  ═══════════════════════════════════════════════════════ */
router.get("/", verifyJWT, async (req, res) => {
  const { starId } = req.params;
  try {
    const star = await Star.findOne({ _id: starId, userId: req.user.userId });
    if (!star)
      return res.status(404).json({ message: "Star not found or forbidden" });

    const docs = await Document.find({ starId }).sort({ addedAt: -1 });
    res.json(docs);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch documents", error: err.message });
  }
});

/* ═══════════════════════════════════════════════════════
   GET  /stars/:starId/documents/:documentId
   -> owner óf gebruiker in canView
   -> voegt presigned URL toe in response
  ═══════════════════════════════════════════════════════ */
router.get("/:documentId", verifyJWT, async (req, res) => {
  const { starId, documentId } = req.params;

  try {
    const doc = await Document.findById(documentId);
    if (!doc || doc.starId.toString() !== starId)
      return res.status(404).json({ message: "Document not found" });

    const isOwner = await Star.exists({ _id: starId, userId: req.user.userId });
    const canSee  = doc.canView.map(String).includes(req.user.userId);
    if (!isOwner && !canSee)
      return res.status(403).json({ message: "Forbidden" });

    /* presigned download-link (1 uur geldig) */
    const url = await presign(doc.key, 3600);
    res.json({ ...doc.toObject(), url });
  } catch (err) {
    res.status(500).json({ message: "Failed to retrieve document", error: err.message });
  }
});

/* ═══════════════════════════════════════════════════════
   PUT  /stars/:starId/documents/:documentId
   -> owner of canEdit
  ═══════════════════════════════════════════════════════ */
router.put(
  "/:documentId",
  verifyJWT,
  upload.single("document"),
  async (req, res) => {
    const { starId, documentId } = req.params;
    const { docType, canView, canEdit } = req.body;

    try {
      const doc = await Document.findById(documentId);
      if (!doc || doc.starId.toString() !== starId)
        return res.status(404).json({ message: "Document not found" });

      const isOwner = await Star.exists({ _id: starId, userId: req.user.userId });
      const hasEdit = doc.canEdit.map(String).includes(req.user.userId);
      if (!isOwner && !hasEdit)
        return res.status(403).json({ message: "Forbidden" });

      /* vervang bestand indien meegegeven */
      if (req.file) {
        const originalName = decodeURIComponent(req.file.originalname);
        const newKey = `stars/${starId}/documents/${Date.now()}-${originalName}`;

        await uploadToWasabi(
          req.file.path,
          newKey,
          req.file.mimetype || "application/octet-stream"
        );
        await fs.unlink(req.file.path).catch(() => {});

        doc.key = newKey;
        doc.originalName = originalName;
      }

      if (docType)   doc.docType = docType;
      if (canView)   doc.canView = toArray(canView);
      if (canEdit)   doc.canEdit = toArray(canEdit);

      await doc.save();
      res.json({ message: "Document updated", document: doc });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Update failed", error: err.message });
    }
  }
);

/* ═══════════════════════════════════════════════════════
   DELETE /stars/:starId/documents/:documentId
   -> alleen owner
  ═══════════════════════════════════════════════════════ */
router.delete("/:documentId", verifyJWT, async (req, res) => {
  const { starId, documentId } = req.params;

  try {
    const doc = await Document.findById(documentId);
    if (!doc || doc.starId.toString() !== starId)
      return res.status(404).json({ message: "Document not found" });

    const isOwner = await Star.exists({ _id: starId, userId: req.user.userId });
    if (!isOwner) return res.status(403).json({ message: "Forbidden" });

    await doc.deleteOne();
    res.json({ message: "Document deleted" });
  } catch (err) {
    res.status(500).json({ message: "Delete failed", error: err.message });
  }
});

export default router;