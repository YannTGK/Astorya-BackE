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


/* helper om mimetype → extensie te krijgen (heel simpel) */
const mimeToExt = (mime = "") =>
  mime.includes("pdf")  ? "pdf"  :
  mime.includes("word") ? "word" :
  mime.includes("officedocument") ? "word" :
  mime.includes("msword") ? "word" : "file";

/* ---------- UPLOAD ---------- */
router.post(
  "/upload",
  verifyJWT,
  upload.single("document"),
  async (req, res) => {
    const { starId } = req.params;
    const { canView = [], canEdit = [] } = req.body;

    try {
      const star = await Star.findOne({ _id: starId, userId: req.user.userId });
      if (!star) return res.status(404).json({ message: "Star not found or forbidden" });

      /* 1. upload naar Wasabi */
      const originalName = req.file.originalname;
      const key = `stars/${starId}/documents/${Date.now()}-${originalName}`;
      await uploadToWasabi(req.file.path, key, req.file.mimetype || "application/octet-stream");
      await fs.unlink(req.file.path).catch(() => {});

      /* 2. helpers om string -> array te maken */
      const toArr = (v) =>
        Array.isArray(v) ? v :
        typeof v === "string" && v.trim() ? v.split(",").map((s) => s.trim()).filter(Boolean) : [];

      /* 3. opslaan in DB */
      const newDoc = await Document.create({
        starId,
        key,
        originalName,
        docType: mimeToExt(req.file.mimetype),
        canView: toArr(canView),
        canEdit: toArr(canEdit),
      });

      res.status(201).json(newDoc);
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


/* ---------- UPDATE ---------- */
router.put(
  "/:documentId",
  verifyJWT,
  upload.single("document"),      // mag ontbreken
  async (req, res) => {
    const { starId, documentId } = req.params;
    const { docType, canView, canEdit } = req.body;

    const toArr = (v) =>
      Array.isArray(v) ? v :
      typeof v === "string" && v.trim() ? v.split(",").map((s) => s.trim()).filter(Boolean) : [];

    try {
      const doc = await Document.findById(documentId);
      if (!doc || doc.starId.toString() !== starId) {
        return res.status(404).json({ message: "Document not found" });
      }

      /* rechten */
      const isOwner = await Star.exists({ _id: starId, userId: req.user.userId });
      const canEditUser = doc.canEdit.map(String).includes(req.user.userId);
      if (!isOwner && !canEditUser) return res.status(403).json({ message: "Forbidden" });

      /* eventueel nieuwe file */
      if (req.file) {
        const originalName = req.file.originalname;
        const key = `stars/${starId}/documents/${Date.now()}-${originalName}`;
        await uploadToWasabi(req.file.path, key, req.file.mimetype || "application/octet-stream");
        await fs.unlink(req.file.path).catch(() => {});

        doc.key = key;
        doc.originalName = originalName;
        doc.docType = mimeToExt(req.file.mimetype);
      }

      if (docType)     doc.docType = docType;
      if (canView)     doc.canView = toArr(canView);
      if (canEdit)     doc.canEdit = toArr(canEdit);

      await doc.save();
      res.json({ message: "Document updated", document: doc });
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