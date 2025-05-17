// routes/v2/s3.js  (⟵ nieuw, lightweight)
import express from 'express';
import wasabi  from '../../utils/wasabiClient.js';
import verifyToken from '../../middleware/v1/authMiddleware.js';

const router = express.Router();

/**
 * GET /api/s3/sign?key=stars/…/image.jpg&expires=3600
 * → { url: "https://…wasabisys.com/stars/…?X-Amz-Expires=…" }
 */
router.get('/sign', verifyToken, async (req, res) => {
  const { key, expires = 3600 } = req.query;      // default: 1 u
  if (!key) return res.status(400).json({ message: 'key required' });

  try {
    const url = await wasabi.getSignedUrlPromise('getObject', {
      Bucket: process.env.WASABI_BUCKET_NAME,
      Key:    key,
      Expires: Number(expires),
    });
    res.json({ url });
  } catch (err) {
    console.error('[S3 sign] error:', err);
    res.status(500).json({ message: 'Could not sign URL' });
  }
});

export default router;