// routes/v2/stars.js
import express       from "express";
import mongoose      from "mongoose";
import Star          from "../../models/v2/Star.js";
import User          from "../../models/v2/User.js";
import verifyToken   from "../../middleware/v1/authMiddleware.js";
import PhotoAlbum from "../../models/v2/PhotoAlbum.js";
import VideoAlbum from "../../models/v2/VideoAlbum.js";
import Audio from "../../models/v2/Audio.js";
import Document      from "../../models/v2/Document.js";
import Message from "../../models/v2/Messages.js";

const router = express.Router();
const toId = v => new mongoose.Types.ObjectId(v);

/* ───────────────────────── helpers ───────────────────────── */

const canSee  = (star, me) =>
  String(star.userId) === me ||
  star.canView?.some(u => String(u) === me) ||
  star.canEdit?.some(u => String(u) === me);

const canEdit = (star, me) =>
  String(star.userId) === me ||
  star.canEdit?.some(u => String(u) === me);

/* ronde op 1 cijfer na de komma */
const round1 = v => Math.round(v * 10) / 10;

/* helper: “Elina De Vos” → “E.D.V.” */
const initials = name =>
  (name ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(w => w[0].toUpperCase())
    .join(".") + ".";

/* genereer willekeurige positie in een “shell” */
async function randomCoords() {
  const TOTAL = await Star.estimatedDocumentCount();
  const SHELL = 400;          // dikte
  const R0    = 200;          // binnenste straal
  const idx   = Math.floor(TOTAL / 350);
  const minR  = R0 + idx * SHELL;
  const maxR  = minR + SHELL;
  const r     = Math.random() * (maxR - minR) + minR;

  const θ = Math.random() * Math.PI * 2;       // 0‑2π
  const φ = Math.acos(2 * Math.random() - 1);  // 0‑π

  return {
    x: round1(r * Math.sin(φ) * Math.cos(θ)),
    y: round1(r * Math.sin(φ) * Math.sin(θ)),
    z: round1(r * Math.cos(φ)),
  };
}

/* geef gegarandeerd nog‑niet‑geclaimde positie (max 10 pogingen) */
async function getSpawnPosition() {
  for (let i = 0; i < 10; i++) {
    const pos = await randomCoords();
    const exists = await Star.exists({ x: pos.x, y: pos.y, z: pos.z });
    if (!exists) return pos;
  }
  // fallback: laat duplicate toe – kans is erg klein
  return randomCoords();
}

/* ───────────────────── 1. LIST ALL VISIBLE ───────────────── */
router.get("/", verifyToken, async (req, res) => {
  try {
    const me = toId(req.user.userId);
    const stars = await Star.find({
      $or: [{ userId: me }, { canView: me }, { canEdit: me }],
    });
    res.json(stars);
  } catch (err) {
    console.error("★ list error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/* ───────────────────── 2. LIST DEDICATE ONLY ─────────────── */
router.get("/dedicate", verifyToken, async (req, res) => {
  try {
    const me = toId(req.user.userId);
    const stars = await Star.find({
      starFor: "dedicate",
      $or: [{ userId: me }, { canView: me }, { canEdit: me }],
    });
    res.json(stars);
  } catch (err) {
    console.error("★ dedicate error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/* ───────────────────────── /stars/public ─────────────────────────
   - dedicate‑sterren: altijd tonen
   - gewone publieke sterren: alleen als owner isAlive == false
------------------------------------------------------------------- */
router.get("/public", verifyToken, async (req, res) => {
  try {
    const me = req.user ? String(req.user.userId) : null;

    const base = {
      $or: [{ isPrivate: false }, { starFor: "dedicate" }],
      x: { $type: "number" },
      y: { $type: "number" },
      z: { $type: "number" },
      color: { $exists: true },
    };

    const raw = await Star.find(base)
      .populate({
        path: "userId",
        select: "isAlive dob dod country", // ← extra velden hier
      })
      .lean();

    const visible = raw.filter(
      (s) => s.starFor === "dedicate" || s.userId?.isAlive === false
    );

    const stars = visible.map((s) => {
      const related =
        !!me &&
        (
          String(s.userId?._id) === me ||
          s.canView?.some((id) => String(id) === me) ||
          s.canEdit?.some((id) => String(id) === me)
        );

      return {
        _id:        s._id,
        x:          s.x,
        y:          s.y,
        z:          s.z,
        color:      s.color,
        starFor:    s.starFor,
        publicName: s.starFor === "dedicate" ? initials(s.publicName) : s.publicName,
        related,
        createdAt:  s.createdAt, 
        user: {                                      // ← nieuwe nested user-data
          dob:     s.userId?.dob ?? null,
          dod:     s.userId?.dod ?? null,
          country: s.userId?.country ?? null,
        },
      };
    });

    res.json({ stars });
  } catch (err) {
    console.error("★ public error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/* ───────────────────────── /stars/private ─────────────────────────
   • dedicate‑sterren die ik kan zien  → altijd
   • gewone private sterren die ik kan zien → alleen als owner.isAlive == false
   • userId wordt wél meegegeven, maar alleen als id‑string
-------------------------------------------------------------------- */
router.get("/private", verifyToken, async (req, res) => {
  try {
    const me = toId(req.user.userId);

    // Alleen sterren waar je toegang toe hebt
    const access = [{ userId: me }, { canView: me }, { canEdit: me }];

    const baseFilter = {
      $or: [
        { starFor: "dedicate", $or: access },
        { isPrivate: true,     $or: access },
      ],
    };

    // Projection: we sluiten alleen overbodige velden uit
    const raw = await Star.find(
      baseFilter,
      {
        canView:   0,
        canEdit:   0,
        updatedAt: 0,
        __v:       0,
      }
    )
      // Nu ook dob, dod en country ophalen van de eigenaar
      .populate({ path: "userId", select: "isAlive dob dod country" })
      .lean();

    // Alleen dedicated sterren of sterren waarvan de eigenaar overleden is
    const visible = raw.filter(
      (s) =>
        s.starFor === "dedicate" ||
        (s.userId && !s.userId.isAlive)
    );

    // Mappen naar de shape die de client verwacht
    const stars = visible.map((s) => ({
      _id:        s._id,
      x:          s.x,
      y:          s.y,
      z:          s.z,
      color:      s.color,
      publicName: s.publicName,
      word:       s.word,
      starFor:    s.starFor,
      createdAt:  s.createdAt,
      // Geneste user-data voor filters in de client
      user: {
        dob:     s.userId?.dob ?? null,
        dod:     s.userId?.dod ?? null,
        country: s.userId?.country ?? null,
      },
      //userId:     typeof s.userId === "object" ? s.userId._id.toString() : s.userId,
    }));

    return res.json({ stars });
  } catch (err) {
    console.error("★ private error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

router.get("/private-access", verifyToken, async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.userId);

    // 1. DEDICATE sterren waar ik rechten op heb op de ster zelf
    const dedicateStars = await Star.find({
      starFor: "dedicate",
      $or: [{ userId }, { canView: userId }, { canEdit: userId }],
    }).lean();

    // 2. MYSELF sterren waar ik geen sterrechten op heb, maar wél op content
    const myselfStars = await Star.find({
      starFor: "myself",
    }).lean();

    const myselfStarIds = myselfStars.map((s) => s._id);

    // Laad alle content-items per type voor deze sterren
    const [photoAlbums, videoAlbums, audios, documents, messages] = await Promise.all([
      mongoose.connection.collection("photoalbums").find({ starId: { $in: myselfStarIds } }).toArray(),
      mongoose.connection.collection("videoalbums").find({ starId: { $in: myselfStarIds } }).toArray(),
      mongoose.connection.collection("audios").find({ starId: { $in: myselfStarIds } }).toArray(),
      mongoose.connection.collection("documents").find({ starId: { $in: myselfStarIds } }).toArray(),
      mongoose.connection.collection("messages").find({ starId: { $in: myselfStarIds } }).toArray(),
    ]);

    // Helper: maak rights object per sterId
    const rightsMap = {};

    const processItems = (items, field) => {
      items.forEach((item) => {
        const sid = String(item.starId);
        const hasAccess =
          (item.canView || []).map(String).includes(String(userId)) ||
          (item.canEdit || []).map(String).includes(String(userId));

        if (!rightsMap[sid]) {
          rightsMap[sid] = {
            canViewPhotos: false,
            canViewVideos: false,
            canViewAudios: false,
            canViewDocuments: false,
            canViewMessages: false,
          };
        }

        if (hasAccess) {
          rightsMap[sid][field] = true;
        }
      });
    };

    processItems(photoAlbums, "canViewPhotos");
    processItems(videoAlbums, "canViewVideos");
    processItems(audios, "canViewAudios");
    processItems(documents, "canViewDocuments");
    processItems(messages, "canViewMessages");

    // Filter enkel sterren waar je op min 1 contenttype toegang hebt
    const filteredMyselfStars = myselfStars
      .filter((s) => rightsMap[String(s._id)] && Object.values(rightsMap[String(s._id)]).includes(true))
      .map((s) => ({
        ...s,
        rights: rightsMap[String(s._id)],
      }));

    // Voeg de dedicate sterren toe met volledige rechten
    const mappedDedicateStars = dedicateStars.map((s) => ({
      ...s,
      rights: {
        canViewPhotos: true,
        canViewVideos: true,
        canViewAudios: true,
        canViewDocuments: true,
        canViewMessages: true,
      },
    }));

    // Combineer en stuur terug
    const allStars = [...mappedDedicateStars, ...filteredMyselfStars];

    return res.json({ stars: allStars });
  } catch (err) {
    console.error("★ private-access error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

/* ───────────────────── 3. CREATE ─────────────────────────── */
router.post("/", verifyToken, async (req, res) => {
  try {
    let { x, y, z } = req.body;
    if (x == null || y == null || z == null) {
      ({ x, y, z } = await getSpawnPosition());
    } else {
      x = round1(x); y = round1(y); z = round1(z);
    }

    const star = await Star.create({
      ...req.body,
      x, y, z,
      userId: req.user.userId,
    });
    res.status(201).json(star);
  } catch (err) {
    console.error("★ create error:", err);
    res.status(400).json({ message: err.message });
  }
});

/* ───────────────────── 4. DETAIL ─────────────────────────── */
router.get("/:id", verifyToken, async (req, res) => {
  try {
    const star = await Star.findById(req.params.id);
    if (!star)                           return res.status(404).json({ message: "Star not found" });
    if (!canSee(star, req.user.userId)) return res.status(403).json({ message: "Forbidden" });

    const owner = await User.findById(star.userId).select("username firstName lastName");
    res.json({ star, owner });
  } catch (err) {
    console.error("★ detail error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/* ───────────────────── 4b. MEMBERS ───────────────────────── */
router.get("/:id/members", verifyToken, async (req, res) => {
  try {
    const star = await Star.findById(req.params.id).lean();
    if (!star)                           return res.status(404).json({ message: "Star not found" });
    if (!canSee(star, req.user.userId)) return res.status(403).json({ message: "Forbidden" });

    const ids = Array.from(new Set([...star.canView, ...star.canEdit].map(String)));
    const users = await User.find({ _id: { $in: ids } }).select("username").lean();

    const members = users.map(u => ({
      _id: u._id,
      username: u.username,
      role: star.canEdit.some(id => String(id) === String(u._id)) ? "Can edit" : "Can view",
    }));
    res.json({ members });
  } catch (err) {
    console.error("★ members error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/* ───────────────────── 5. UPDATE ─────────────────────────── */
router.put("/:id", verifyToken, async (req, res) => {
  try {
    const star = await Star.findById(req.params.id);
    if (!star)                           return res.status(404).json({ message: "Star not found" });
    if (!canEdit(star, req.user.userId)) return res.status(403).json({ message: "Forbidden" });

    const { x, y, z, ...allowed } = req.body;      // position niet mutabel
    Object.assign(star, allowed, { updatedAt: new Date() });

    await star.save();
    res.json(star);
  } catch (err) {
    console.error("★ update error:", err);
    res.status(400).json({ message: err.message });
  }
});

/* ───────────────────── 6. DELETE ─────────────────────────── */
router.delete("/:id", verifyToken, async (req, res) => {
  try {
    const star = await Star.findOneAndDelete({ _id: req.params.id, userId: req.user.userId });
    if (!star) return res.status(404).json({ message: "Star not found" });
    res.json({ message: "Star deleted" });
  } catch (err) {
    console.error("★ delete error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/* ───────────────────── 7. RIGHTS PATCH ───────────────────── */
router.patch("/:id/rights", verifyToken, async (req, res) => {
  const { userId, mode, action } = req.body;
  if (!["view", "edit"].includes(mode) || !["add", "remove"].includes(action)) {
    return res.status(400).json({ message: "Invalid body" });
  }
  try {
    const star = await Star.findById(req.params.id);
    if (!star) return res.status(404).json({ message: "Star not found" });

    const me       = req.user.userId;
    const isOwner  = String(star.userId) === me;
    const isEditor = star.canEdit.some(u => String(u) === me);
    if (!isOwner && !isEditor)                  return res.status(403).json({ message: "Forbidden" });
    if (!isOwner && mode === "edit")            return res.status(403).json({ message: "Only owner can change edit rights" });

    const field = mode === "view" ? "canView" : "canEdit";
    if (action === "add") {
      if (!star[field].some(u => String(u) === userId)) star[field].push(userId);
    } else {
      star[field] = star[field].filter(u => String(u) !== userId);
    }

    await star.save();
    res.json({ message: "Rights updated", star });
  } catch (err) {
    console.error("★ rights error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

export default router;