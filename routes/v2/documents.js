// routes/v2/documents.js
import express   from "express";
import multer    from "multer";
import fs        from "fs/promises";

import wasabi     from "../../utils/wasabiClient.js";
import { presign } from "../../utils/presign.js";
import Document   from "../../models/v2/Document.js";
import Star       from "../../models/v2/Star.js";
import verifyJWT  from "../../middleware/v1/authMiddleware.js";

const router = express.Router({ mergeParams: true });
const upload = multer({ dest: "uploads/temp/" });

/*──────────────── helper to normalize array fields ────────────────*/
const toArray = v =>
  Array.isArray(v)
    ? v
    : typeof v === "string" && v.trim()
      ? v.split(",").map(s => s.trim()).filter(Boolean)
      : [];

/*───────────────── upload helper ────────────────────────────────*/
async function uploadToWasabi(localPath, key, mime) {
  const Body = await fs.readFile(localPath);
  await wasabi
    .upload({
      Bucket: process.env.WASABI_BUCKET_NAME,
      Key:    key,
      Body,
      ContentType: mime,
    })
    .promise();
  return key;
}

/**
 * Helper: load a document + its star and check view/edit rights.
 * @param {string} documentId
 * @param {string} userId
 * @param {boolean} requireEdit if true, needs edit; else view suffices
 * @returns {{ doc: Document, star: Star }|null}
 */
async function loadDocWithAccess(documentId, userId, requireEdit = false) {
  const doc = await Document.findById(documentId);
  if (!doc) return null;

  const star = await Star.findById(doc.starId);
  if (!star) return null;

  const isOwner     = String(star.userId) === userId;
  const starCanView = Array.isArray(star.canView) && star.canView.map(String).includes(userId);
  const starCanEdit = Array.isArray(star.canEdit) && star.canEdit.map(String).includes(userId);
  const docCanView  = Array.isArray(doc.canView)  && doc.canView.map(String).includes(userId);
  const docCanEdit  = Array.isArray(doc.canEdit)  && doc.canEdit.map(String).includes(userId);

  if (requireEdit) {
    if (!isOwner && !starCanEdit && !docCanEdit) return null;
  } else {
    if (!isOwner && !starCanView && !starCanEdit && !docCanView && !docCanEdit) return null;
  }

  return { doc, star };
}

/**
 * Helper: load star-level view rights.
 */
async function loadStarWithView(starId, userId) {
  return Star.findOne({
    _id: starId,
    $or: [
      { userId: userId },
      { canView: userId },
      { canEdit: userId },
    ],
  });
}

/**
 * Helper: load star-level edit rights.
 */
async function loadStarWithEdit(starId, userId) {
  return Star.findOne({
    _id: starId,
    $or: [
      { userId: userId },
      { canEdit: userId },
    ],
  });
}


/*═══════════════════════════════════════════════════════════════
  POST  /stars/:starId/documents/upload
  requires star-level edit rights
  body: multipart: document file + docType, canView[], canEdit[]
═══════════════════════════════════════════════════════════════*/
router.post(
  "/upload",
  verifyJWT,
  upload.single("document"),
  async (req, res) => {
    const { starId } = req.params;
    const { docType, canView = [], canEdit = [] } = req.body;

    try {
      const star = await loadStarWithEdit(starId, req.user.userId);
      if (!star) {
        return res.status(404).json({ message: "Star not found or forbidden" });
      }
      if (!req.file) {
        return res.status(400).json({ message: "No document uploaded" });
      }

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
      console.error("[DOC UPLOAD ERROR]", err);
      res.status(500).json({ message: "Document upload failed", error: err.message });
    }
  }
);


/*═══════════════════════════════════════════════════════════════
  GET  /stars/:starId/documents
  list all docs if star-level view
═══════════════════════════════════════════════════════════════*/
router.get("/", verifyJWT, async (req, res) => {
  const { starId } = req.params;
  try {
    const star = await loadStarWithView(starId, req.user.userId);
    if (!star) {
      return res.status(404).json({ message: "Star not found or forbidden" });
    }
    const docs = await Document.find({ starId }).sort({ addedAt: -1 });
    res.json(docs);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch documents", error: err.message });
  }
});


/*═══════════════════════════════════════════════════════════════
  GET  /stars/:starId/documents/:documentId
  view one doc if star-level or doc-level view
═══════════════════════════════════════════════════════════════*/
router.get("/:documentId", verifyJWT, async (req, res) => {
  const { starId, documentId } = req.params;
  try {
    const access = await loadDocWithAccess(documentId, req.user.userId, false);
    if (!access || String(access.doc.starId) !== starId) {
      return res.status(404).json({ message: "Document not found or forbidden" });
    }
    const url = await presign(access.doc.key, 3600);
    res.json({ ...access.doc.toObject(), url });
  } catch (err) {
    res.status(500).json({ message: "Failed to retrieve document", error: err.message });
  }
});


/*═══════════════════════════════════════════════════════════════
  PUT  /stars/:starId/documents/:documentId
  update if star-level or doc-level edit
═══════════════════════════════════════════════════════════════*/
router.put(
  "/:documentId",
  verifyJWT,
  upload.single("document"),
  async (req, res) => {
    const { starId, documentId } = req.params;
    const { docType, canView, canEdit } = req.body;

    try {
      const access = await loadDocWithAccess(documentId, req.user.userId, true);
      if (!access || String(access.doc.starId) !== starId) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const { doc } = access;

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
      if (docType)  doc.docType  = docType;
      if (canView)  doc.canView  = toArray(canView);
      if (canEdit)  doc.canEdit  = toArray(canEdit);
      doc.updatedAt = new Date();

      await doc.save();
      res.json({ message: "Document updated", document: doc });
    } catch (err) {
      console.error("[DOC UPDATE ERROR]", err);
      res.status(500).json({ message: "Update failed", error: err.message });
    }
  }
);


/*═══════════════════════════════════════════════════════════════
  DELETE /stars/:starId/documents/:documentId
  delete if star-level or doc-level edit
═══════════════════════════════════════════════════════════════*/
router.delete("/:documentId", verifyJWT, async (req, res) => {
  const { starId, documentId } = req.params;
  try {
    const access = await loadDocWithAccess(documentId, req.user.userId, true);
    if (!access || String(access.doc.starId) !== starId) {
      return res.status(403).json({ message: "Forbidden" });
    }
    await access.doc.deleteOne();
    res.json({ message: "Document deleted" });
  } catch (err) {
    console.error("[DOC DELETE ERROR]", err);
    res.status(500).json({ message: "Delete failed", error: err.message });
  }
});

export default router;