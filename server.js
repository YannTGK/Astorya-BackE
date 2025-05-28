import express   from 'express';
import mongoose  from 'mongoose';
import cors      from 'cors';
import dotenv    from 'dotenv';

// ───────── Route-imports ─────────
import authRoutes            from './routes/v2/auth.js';
import userRoutes            from './routes/v2/user.js';
import starRoutes            from './routes/v2/stars.js';
import threeDRoomRoutes      from './routes/v2/threeDRooms.js';
import photoAlbumsRoutes     from './routes/v2/photoAlbums.js';
import photosRoutes          from './routes/v2/photos.js';
import videoAlbumsRoutes     from './routes/v2/videoAlbums.js';
import videosRoutes          from './routes/v2/video.js';
import audioRoutes           from './routes/v2/audios.js';
import messagesRoutes        from './routes/v2/messages.js';
import documentsRoutes       from './routes/v2/documents.js';
import s3Routes              from './routes/v2/s3.js';

import threeDRoomPhotos      from './routes/v2/threeDRoomPhotos.js';
import threeDRoomVideos      from './routes/v2/threeDRoomVideos.js';
import threeDRoomAudios      from './routes/v2/threeDRoomAudios.js';
import threeDRoomMessages    from './routes/v2/threeDRoomMessages.js';
import threeDRoomDocuments   from './routes/v2/threeDRoomDocuments.js';

dotenv.config();

const app       = express();
const PORT      = process.env.PORT || 5001;
const MONGO_URI = process.env.MONGO_URI;

// ───────── Middleware ─────────
app.use(cors());
app.use(express.json());
app.use((req, _res, next) => {
  console.log(`➡️ [${req.method}] ${req.url}`);
  next();
});

// ───────── DB connect ─────────
mongoose
  .connect(MONGO_URI)
  .then(() => console.log('✅ Connected to MongoDB Atlas'))
  .catch(err => console.error('❌ MongoDB Connection Error:', err));

// ───────── Auth & User & Stars ─────────
app.use('/api/auth',  authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/stars', starRoutes);

// ───────── 3D-Rooms ─────────
// Geneste endpoints onder een specifieke ster
app.use(
  '/api/stars/:starId/three-d-rooms',
  threeDRoomRoutes
);
// Niet-geneste detail endpoint (optioneel)
app.use(
  '/api/three-d-rooms',
  threeDRoomRoutes
);

// ───────── 3D-Room Media (in deze volgorde!) ─────────
// 1) Messages: /three-d-rooms/:roomId/messages
app.use(
  '/api/stars/:starId/three-d-rooms/:roomId/messages',
  threeDRoomMessages
);
// 2) Audios: /three-d-rooms/:roomId/audios
app.use(
  '/api/stars/:starId/three-d-rooms/:roomId/audios',
  threeDRoomAudios
);
// 3) Photos: /three-d-rooms/:roomId/photos
app.use(
  '/api/stars/:starId/three-d-rooms/:roomId/photos',
  threeDRoomPhotos
);
// 4) Videos: /three-d-rooms/:roomId/videos
app.use(
  '/api/stars/:starId/three-d-rooms/:roomId/videos',
  threeDRoomVideos
);
// 5) Documents: /three-d-rooms/:roomId/documents
app.use(
  '/api/stars/:starId/three-d-rooms/:roomId/documents',
  threeDRoomDocuments
);

// ───────── Legacy Photo-album routes ─────────
app.use(
  '/api/stars/:starId/photo-albums',
  photoAlbumsRoutes
);
app.use(
  '/api/photo-albums',
  photoAlbumsRoutes
);
app.use(
  '/api/stars/:starId/photo-albums/:albumId/photos',
  photosRoutes
);
app.use(
  '/api/photos',
  photosRoutes
);

// ───────── Legacy Video-album routes ─────────
app.use(
  '/api/stars/:starId/video-albums',
  videoAlbumsRoutes
);
app.use(
  '/api/video-albums',
  videoAlbumsRoutes
);
app.use(
  '/api/stars/:starId/video-albums/:albumId/videos',
  videosRoutes
);
app.use(
  '/api/videos',
  videosRoutes
);

// ───────── Other media onder de star ─────────
app.use(
  '/api/stars/:starId/audios',
  audioRoutes
);
app.use(
  '/api/stars/:starId/messages',
  messagesRoutes
);
app.use(
  '/api/stars/:starId/documents',
  documentsRoutes
);

// ───────── S3 utilities ─────────
app.use('/api/s3', s3Routes);

// ───────── Start server ─────────
app.listen(PORT, () =>
  console.log(`🚀 Server running on port ${PORT}`)
);