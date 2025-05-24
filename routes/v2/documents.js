import express   from "express";
import multer    from "multer";
import fs        from "fs/promises";
import path      from "path";

import wasabi     from "../../utils/wasabiClient.js";
import Document   from "../../models/v2/Document.js";
import Star       from "../../models/v2/Star.js";
import verifyJWT  from "../../middleware/v1/authMiddleware.js";

const router  = express.Router({ mergeParams:true });
const upload  = multer({ dest:"uploads/temp/" });

/* ---------- hulpfunctie: upload naar Wasabi ---------- */
async function uploadToWasabi(localPath, key, mime) {
  const Body = await fs.readFile(localPath);

  await wasabi.upload({
    Bucket      : process.env.WASABI_BUCKET_NAME,
    Key         : key,
    Body,
    ACL         : "public-read",
    ContentType : mime,
  }).promise();

  return key;               // we slaan alléén de key op (geen volledige URL)
}

/* ------ helper voor string → array ------------------- */
const toArray = (v) =>
  Array.isArray(v)
    ? v
    : typeof v === "string" && v.trim()
    ? v.split(",").map((s) => s.trim()).filter(Boolean)
    : [];

/* ═════════════════════════════════════════════════════
 * POST  /stars/:starId/documents/upload
 * veld-naam bestand: 'document'
 * body-fields: docType, canView[] / canEdit[]
 * (alleen eigenaar)
 * ════════════════════════════════════════════════════ */
router.post(
  "/upload",
  verifyJWT,
  upload.single("document"),
  async (req, res) => {
    const { starId } = req.params;
    const { docType, canView = [], canEdit = [] } = req.body;

    try {
      /* eigenaar-check */
      const star = await Star.findOne({ _id: starId, userId: req.user.userId });
      if (!star)
        return res.status(404).json({ message: "Star not found or forbidden" });

      /* bestandsnaam ont-encoden (spaties ipv %20) */
      const originalName = decodeURIComponent(req.file.originalname);

      /* upload */
      const tempPath = req.file.path;
      const key = `stars/${starId}/documents/${Date.now()}-${originalName}`;
      await uploadToWasabi(
        tempPath,
        key,
        req.file.mimetype || "application/octet-stream",
      );
      await fs.unlink(tempPath).catch(() => {});

      /* opslaan in DB */
      const newDoc = await Document.create({
        starId,
        key,
        docType : docType || "pdf",
        canView : toArray(canView),
        canEdit : toArray(canEdit),
      });

      res.status(201).json(newDoc);
    } catch (err) {
      console.error(err);
      res
        .status(500)
        .json({ message: "Document upload failed", error: err.message });
    }
  },
);

/* ═════════════════════════════════════════════════════
 * GET  /stars/:starId/documents    (alle documenten, alleen owner)
 * ════════════════════════════════════════════════════ */
router.get("/", verifyJWT, async (req, res) => {
  const { starId } = req.params;
  try {
    const star = await Star.findOne({ _id: starId, userId: req.user.userId });
    if (!star)
      return res.status(404).json({ message: "Star not found or forbidden" });

    const docs = await Document.find({ starId });
    res.json(docs);
  } catch (err) {
    res
      .status(500)
      .json({ message: "Failed to fetch documents", error: err.message });
  }
});

/* ═════════════════════════════════════════════════════
 * GET  /stars/:starId/documents/:documentId
 * ════════════════════════════════════════════════════ */
router.get("/:documentId", verifyJWT, async (req, res) => {
  const { starId, documentId } = req.params;
  try {
    const doc = await Document.findById(documentId);
    if (!doc || doc.starId.toString() !== starId)
      return res.status(404).json({ message: "Document not found" });

    const isOwner = await Star.exists({
      _id: starId,
      userId: req.user.userId,
    });
    const canSee = doc.canView.map(String).includes(req.user.userId);

    if (!isOwner && !canSee)
      return res.status(403).json({ message: "Forbidden" });

    res.json(doc);
  } catch (err) {
    res
      .status(500)
      .json({ message: "Failed to retrieve document", error: err.message });
  }
});

/* ═════════════════════════════════════════════════════
 * PUT  /stars/:starId/documents/:documentId
 * – eigenaar of canEdit
 * – optioneel nieuw bestand + velden
 * ════════════════════════════════════════════════════ */
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

      const isOwner = await Star.exists({
        _id: starId,
        userId: req.user.userId,
      });
      const canEditUser = doc.canEdit.map(String).includes(req.user.userId);
      if (!isOwner && !canEditUser)
        return res.status(403).json({ message: "Forbidden" });

      /* vervang bestand? */
      if (req.file) {
        const originalName = decodeURIComponent(req.file.originalname);
        const newKey = `stars/${starId}/documents/${Date.now()}-${originalName}`;

        const tmp = req.file.path;
        await uploadToWasabi(
          tmp,
          newKey,
          req.file.mimetype || "application/octet-stream",
        );
        await fs.unlink(tmp).catch(() => {});

        doc.key = newKey;
      }

      if (docType) doc.docType = docType;
      if (canView) doc.canView = toArray(canView);
      if (canEdit) doc.canEdit = toArray(canEdit);

      await doc.save();
      res.json({ message: "Document updated", document: doc });
    } catch (err) {
      console.error(err);
      res
        .status(500)
        .json({ message: "Update failed", error: err.message });
    }
  },
);

/* ═════════════════════════════════════════════════════
 * DELETE  /stars/:starId/documents/:documentId   (alleen owner)
 * ════════════════════════════════════════════════════ */
router.delete("/:documentId", verifyJWT, async (req, res) => {
  const { starId, documentId } = req.params;
  try {
    const doc = await Document.findById(documentId);
    if (!doc || doc.starId.toString() !== starId)
      return res.status(404).json({ message: "Document not found" });

    const isOwner = await Star.exists({
      _id: starId,
      userId: req.user.userId,
    });
    if (!isOwner) return res.status(403).json({ message: "Forbidden" });

    await doc.deleteOne();
    res.json({ message: "Document deleted" });
  } catch (err) {
    res
      .status(500)
      .json({ message: "Delete failed", error: err.message });
  }
});

export default router;