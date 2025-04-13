// routes/photos.js
import express from 'express';
import multer from 'multer';
import Photo from '../../models/v2/Photo.js';
import PhotoAlbum from '../../models/v2/PhotoAlbum.js';
import Star from '../../models/v2/Star.js';
import verifyToken from '../../middleware/v1/authMiddleware.js';
// import wasabi, compress-functies, etc. net als in je bestaande code

const router = express.Router();
const upload = multer({ dest: "uploads/temp/" });

// POST /photos/upload?albumId=...
router.post('/upload', verifyToken, upload.single("photo"), async (req, res) => {
  try {
    const { albumId } = req.query;
    const album = await PhotoAlbum.findById(albumId);
    if (!album) return res.status(404).json({ message: 'Album not found' });

    // check ownership
    const star = await Star.findById(album.starId);
    if (!star.userId.equals(req.user.userId)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    // hier doe je compressie en upload naar wasabi, net als je al deed
    // stel dat je 'imageUrl' krijgt als resultaat
    const imageUrl = "https://fake.url/your-image.jpg";

    // maak Photo-document aan
    const newPhoto = await Photo.create({
      photoAlbumId: albumId,
      fileUrl: imageUrl,
      uploadedAt: new Date()
    });

    res.status(201).json({ message: "Photo uploaded", photo: newPhoto });

    // opruimen van temp files...
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ message: "Upload failed" });
  }
});

// GET /photos?albumId=...
router.get('/', verifyToken, async (req, res) => {
  try {
    const { albumId } = req.query;
    const album = await PhotoAlbum.findById(albumId);
    if (!album) return res.status(404).json({ message: 'Album not found' });

    const star = await Star.findById(album.starId);
    if (!star.userId.equals(req.user.userId)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const photos = await Photo.find({ photoAlbumId: albumId });
    res.json(photos);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// Je kunt PUT/DELETE voor individuele Photos maken, net als in je bestaande code

export default router;