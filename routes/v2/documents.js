import express  from "express";
import multer   from "multer";
import fs       from "fs/promises";

import wasabi     from "../../utils/wasabiClient.js";
import { presign } from "../../utils/presign.js";

import Document  from "../../models/v2/Document.js";
import Star      from "../../models/v2/Star.js";
import verifyJWT from "../../middleware/v1/authMiddleware.js";

const router = express.Router({ mergeParams: true });
const upload = multer({ dest: "uploads/temp/" });

/* upload helper --------------------------------------------------------- */
async function uploadToWasabi (localPath, key, mime) {
  const Body = await fs.readFile(localPath);
  await wasabi.upload({
    Bucket      : process.env.WASABI_BUCKET_NAME,
    Key         : key,
    Body,
    ACL         : "private",                 // <── alles private
    ContentType : mime,
  }).promise();
}

/* utils ----------------------------------------------------------------- */
const asArray = (v) =>
  Array.isArray(v)  ? v :
  typeof v === "string" && v.trim()
    ? v.split(",").map((s) => s.trim()).filter(Boolean)
    : [];

/* ---------------------------------------------------------------------- */
/* POST  /stars/:starId/documents/upload -------------------------------- */
router.post(
  "/upload",
  verifyJWT,
  upload.single("document"),
  async (req, res) => {
    const { starId }                 = req.params;
    const { docType, canView, canEdit } = req.body;

    try {
      /* owner-check ----------------------------------------------------- */
      const star = await Star.findOne({ _id: starId, userId: req.user.userId });
      if (!star) return res.status(404).json({ message: "Star not found or forbidden" });

      /* upload ---------------------------------------------------------- */
      const tmpPath = req.file.path;
      const key     = `stars/${starId}/documents/${Date.now()}-${req.file.originalname}`;

      await uploadToWasabi(tmpPath, key, req.file.mimetype || "application/octet-stream");
      await fs.unlink(tmpPath).catch(() => {});

      /* save in DB ------------------------------------------------------ */
      const doc = await Document.create({
        starId,
        key,
        docType : docType || "pdf",
        canView : asArray(canView),
        canEdit : asArray(canEdit),
      });

      /* één presigned URL meegeven voor directe preview/download */
      const url = await presign(key);

      res.status(201).json({ ...doc.toObject(), presignedUrl: url });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Document upload failed", error: err.message });
    }
  }
);

/* ---------------------------------------------------------------------- */
/* GET  /stars/:starId/documents  (owner) -------------------------------- */
router.get("/", verifyJWT, async (req, res) => {
  const { starId } = req.params;
  try {
    const star = await Star.findOne({ _id: starId, userId: req.user.userId });
    if (!star) return res.status(404).json({ message: "Star not found or forbidden" });

    const docs = await Document.find({ starId });
    /* voeg presigned URL toe */
    const withUrls = await Promise.all(
      docs.map(async (d) => ({
        ...d.toObject(),
        presignedUrl: await presign(d.key),
      }))
    );
    res.json(withUrls);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch documents", error: err.message });
  }
});

/* ---------------------------------------------------------------------- */
/* GET  /stars/:starId/documents/:documentId ----------------------------- */
router.get("/:documentId", verifyJWT, async (req, res) => {
  const { starId, documentId } = req.params;
  try {
    const doc = await Document.findById(documentId);
    if (!doc || doc.starId.toString() !== starId)
      return res.status(404).json({ message: "Document not found" });

    const owner = await Star.findOne({ _id: starId, userId: req.user.userId });
    const canSee = doc.canView.map(String).includes(req.user.userId);

    if (!owner && !canSee) return res.status(403).json({ message: "Forbidden" });

    res.json({ ...doc.toObject(), presignedUrl: await presign(doc.key) });
  } catch (err) {
    res.status(500).json({ message: "Retrieve failed", error: err.message });
  }
});

/* ---------------------------------------------------------------------- */
/* PUT  /stars/:starId/documents/:documentId ----------------------------- */
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

      const owner   = await Star.findOne({ _id: starId, userId: req.user.userId });
      const canEditU = doc.canEdit.map(String).includes(req.user.userId);
      if (!owner && !canEditU) return res.status(403).json({ message: "Forbidden" });

      /* vervang bestand? */
      if (req.file) {
        const tmpPath = req.file.path;
        const newKey  = `stars/${starId}/documents/${Date.now()}-${req.file.originalname}`;
        await uploadToWasabi(tmpPath, newKey, req.file.mimetype || "application/octet-stream");
        await fs.unlink(tmpPath).catch(() => {});
        doc.key = newKey;
      }

      if (docType) doc.docType = docType;
      if (canView) doc.canView = asArray(canView);
      if (canEdit) doc.canEdit = asArray(canEdit);

      await doc.save();
      res.json({ message: "Document updated", document: { ...doc.toObject(), presignedUrl: await presign(doc.key) } });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Update failed", error: err.message });
    }
  }
);

/* ---------------------------------------------------------------------- */
/* DELETE  /stars/:starId/documents/:documentId (owner) ------------------ */
router.delete("/:documentId", verifyJWT, async (req, res) => {
  const { starId, documentId } = req.params;
  try {
    const doc = await Document.findById(documentId);
    if (!doc || doc.starId.toString() !== starId)
      return res.status(404).json({ message: "Document not found" });

    const owner = await Star.findOne({ _id: starId, userId: req.user.userId });
    if (!owner) return res.status(403).json({ message: "Forbidden" });

    await doc.deleteOne();
    res.json({ message: "Document deleted" });
  } catch (err) {
    res.status(500).json({ message: "Delete failed", error: err.message });
  }
});

export default router;