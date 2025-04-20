import express from 'express';
import multer from 'multer';
import fs from 'fs/promises';

import wasabi from '../../utils/wasabiClient.js';
import Document from '../../models/v2/Document.js';
import Star from '../../models/v2/Star.js';
import verifyToken from '../../middleware/v1/authMiddleware.js';

const router = express.Router({ mergeParams: true });
const upload = multer({ dest: 'uploads/temp/' });

async function uploadToWasabi(localPath, key, contentType) {
  const buffer = await fs.readFile(localPath);
  const params = {
    Bucket: process.env.WASABI_BUCKET_NAME,
    Key: key,
    Body: buffer,
    ACL: 'public-read',
    ContentType: contentType,
  };
  const { Location } = await wasabi.upload(params).promise();
  return Location;
}

// POST /stars/:starId/documents/upload
router.post(
    '/upload',
    verifyToken,
    upload.single('document'),
    async (req, res) => {
      const { starId } = req.params;
      const { docType, sharedWith } = req.body;   // sharedWith komt als string óf array
  
      try {
        /* ── eigendomscontrole ─────────────────────────── */
        const star = await Star.findOne({ _id: starId, userId: req.user.userId });
        if (!star) {
          return res.status(404).json({ message: 'Star not found or forbidden' });
        }
  
        /* ── upload naar Wasabi ────────────────────────── */
        const tempPath = req.file.path;
        const key      = `stars/${starId}/documents/${Date.now()}-${req.file.originalname}`;
        const fileUrl  = await uploadToWasabi(tempPath, key, 'application/pdf');
  
        /* ── sharedWith parsen ─────────────────────────── */
        let parsedSharedWith = [];
  
        if (sharedWith) {
          if (Array.isArray(sharedWith)) {
            // multipart met sharedWith[] of JSON-array
            parsedSharedWith = sharedWith;
          } else if (typeof sharedWith === 'string') {
            // enkele string, evt. met komma’s
            parsedSharedWith = sharedWith
              .split(',')
              .map(s => s.trim())
              .filter(Boolean);      // verwijder lege stukjes
          }
        }
  
        /* ── document opslaan ──────────────────────────── */
        const newDocument = await Document.create({
          starId,
          fileUrl,
          docType: docType || 'pdf',
          sharedWith: parsedSharedWith,
        });
  
        /* ── temp‑file opruimen ────────────────────────── */
        await fs.unlink(tempPath).catch(() => {});
  
        res.status(201).json(newDocument);
      } catch (err) {
        res
          .status(500)
          .json({ message: 'Failed to upload document', error: err.message });
      }
    }
  );

// GET /stars/:starId/documents
router.get('/', verifyToken, async (req, res) => {
  const { starId } = req.params;

  try {
    const star = await Star.findOne({ _id: starId, userId: req.user.userId });
    if (!star) {
      return res.status(404).json({ message: 'Star not found or forbidden' });
    }

    const documents = await Document.find({ starId });
    res.json(documents);
  } catch (err) {
    res.status(500).json({ message: 'Failed to retrieve documents', error: err.message });
  }
});

// PUT /documents/:documentId
router.put('/:documentId', verifyToken, upload.single('document'), async (req, res) => {
    const { documentId } = req.params;
    const { docType, sharedWith } = req.body;
  
    try {
      const document = await Document.findById(documentId);
      if (!document) {
        return res.status(404).json({ message: 'Document not found' });
      }
  
      // Check of de gebruiker eigenaar is van de star
      const star = await Star.findOne({ _id: document.starId, userId: req.user.userId });
      if (!star) {
        return res.status(403).json({ message: 'Forbidden' });
      }
  
      // Als er een nieuwe file is, upload naar Wasabi
      if (req.file) {
        const tempPath = req.file.path;
        const key = `stars/${star._id}/documents/${Date.now()}-${req.file.originalname}`;
        const fileUrl = await uploadToWasabi(tempPath, key, 'application/pdf');
  
        document.fileUrl = fileUrl;
        await fs.unlink(tempPath).catch(() => {});
      }
  
      // docType bijwerken
      if (docType) document.docType = docType;
  
      // sharedWith bijwerken
      if (sharedWith) {
        let parsedSharedWith = [];
        if (Array.isArray(sharedWith)) {
          parsedSharedWith = sharedWith;
        } else if (typeof sharedWith === 'string') {
          parsedSharedWith = sharedWith
            .split(',')
            .map(s => s.trim())
            .filter(Boolean);
        }
        document.sharedWith = parsedSharedWith;
      }
  
      await document.save();
      res.json({ message: 'Document updated', document });
    } catch (err) {
      console.error('Update error:', err);
      res.status(500).json({ message: 'Failed to update document', error: err.message });
    }
  });

// GET /documents/:documentId
router.get('/:documentId', verifyToken, async (req, res) => {
  const { documentId } = req.params;

  try {
    const document = await Document.findById(documentId);
    if (!document) {
      return res.status(404).json({ message: 'Document not found' });
    }

    const star = await Star.findOne({ _id: document.starId, userId: req.user.userId });
    if (!star) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    res.json(document);
  } catch (err) {
    res.status(500).json({ message: 'Failed to retrieve document', error: err.message });
  }
});

// DELETE /documents/:documentId
router.delete('/:documentId', verifyToken, async (req, res) => {
  const { documentId } = req.params;

  try {
    const document = await Document.findById(documentId);
    if (!document) {
      return res.status(404).json({ message: 'Document not found' });
    }

    const star = await Star.findOne({ _id: document.starId, userId: req.user.userId });
    if (!star) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    await document.deleteOne();
    res.json({ message: 'Document deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete document', error: err.message });
  }
});

export default router;