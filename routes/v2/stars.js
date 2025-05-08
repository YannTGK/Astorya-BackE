// routes/v2/stars.js
import express       from "express";
import mongoose      from "mongoose";
import Star          from "../../models/v2/Star.js";
import User          from "../../models/v2/User.js";
import verifyToken   from "../../middleware/v1/authMiddleware.js";

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

router.get("/public", async (_, res) => {
  try {
    const raw = await Star.find(
      {
        /* 1️⃣ niet‑private  OR  2️⃣ dedicate‑ster (maakt niet uit of private) */
        $or: [
          { isPrivate: false },
          { starFor: "dedicate" }
        ],
        /* alleen sterren die al xyz‑coords hebben */
        x: { $type: "number" },
        y: { $type: "number" },
        z: { $type: "number" },
        color: { $exists: true }
      },
      /* we verbergen irrelevante velden */
      { canView: 0, canEdit: 0, createdAt: 0, updatedAt: 0, __v: 0 }
    ).lean();

    /* dedicate‑sterren → initialen */
    const stars = raw.map(s => ({
      ...s,
      publicName:
        s.starFor === "dedicate" ? initials(s.publicName) : s.publicName
    }));

    res.json({ stars });
  } catch (err) {
    console.error("★ public error:", err);
    res.status(500).json({ message: "Server error" });
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