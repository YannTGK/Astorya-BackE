// routes/v2/stars.js
import express      from "express";
import mongoose     from "mongoose";
import Star         from "../../models/v2/Star.js";
import User         from "../../models/v2/User.js";
import verifyToken  from "../../middleware/v1/authMiddleware.js";

const router = express.Router();

/* ───────────────────────── HELPERS ───────────────────────── */
const toId = (v) => new mongoose.Types.ObjectId(v);

const canSee = (star, me) =>
  String(star.userId) === me ||
  star.canView?.some((u) => String(u) === me) ||
  star.canEdit?.some((u) => String(u) === me);

const canModify = (star, me) =>
  String(star.userId) === me ||
  star.canEdit?.some((u) => String(u) === me);

/* ───────────────────────── 1. LIST ───────────────────────── */
/** GET /api/stars – alles wat jij kunt zien (owner / view / edit) */
router.get("/", verifyToken, async (req, res) => {
  const me = toId(req.user.userId);

  try {
    const stars = await Star.find({
      $or: [{ userId: me }, { canView: me }, { canEdit: me }],
    });
    return res.json({ stars });
  } catch (err) {
    console.error("★ list error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

/** 🔸 GET /api/stars/dedicate – alleen *dedicated* sterren die jij ziet */
router.get("/dedicate", verifyToken, async (req, res) => {
  const me = toId(req.user.userId);

  try {
    const stars = await Star.find({
      starFor: "dedicate",
      $or: [{ userId: me }, { canView: me }, { canEdit: me }],
    });

    return res.json({ stars });
  } catch (err) {
    console.error("★ dedicate list error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

/* ───────────────────────── 2. CREATE ─────────────────────── */
/** POST /api/stars */
router.post("/", verifyToken, async (req, res) => {
  try {
    const star = await Star.create({ ...req.body, userId: req.user.userId });
    return res.status(201).json(star);
  } catch (err) {
    console.error("★ create error:", err);
    return res.status(400).json({ message: err.message });
  }
});

/* ───────────────────────── 3. DETAIL ─────────────────────── */
/** GET /api/stars/:id */
router.get("/:id", verifyToken, async (req, res) => {
  try {
    const star = await Star.findById(req.params.id);
    if (!star) return res.status(404).json({ message: "Star not found" });

    if (!canSee(star, req.user.userId))
      return res.status(403).json({ message: "Forbidden" });

    const owner = await User.findById(star.userId).select(
      "username firstName lastName"
    );

    return res.json({ star, owner });
  } catch (err) {
    console.error("★ detail error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

/* ───────────────────────── 4. UPDATE ─────────────────────── */
/** PUT /api/stars/:id */
router.put("/:id", verifyToken, async (req, res) => {
  try {
    const star = await Star.findById(req.params.id);
    if (!star) return res.status(404).json({ message: "Star not found" });

    if (!canModify(star, req.user.userId))
      return res.status(403).json({ message: "Forbidden" });

    Object.assign(star, req.body, { updatedAt: new Date() });
    await star.save();

    return res.json(star);
  } catch (err) {
    console.error("★ update error:", err);
    return res.status(400).json({ message: err.message });
  }
});

/* ───────────────────────── 5. DELETE ─────────────────────── */
/** DELETE /api/stars/:id – alleen owner */
router.delete("/:id", verifyToken, async (req, res) => {
  try {
    const star = await Star.findOneAndDelete({
      _id: req.params.id,
      userId: req.user.userId,
    });
    if (!star) return res.status(404).json({ message: "Star not found" });

    return res.json({ message: "Star deleted" });
  } catch (err) {
    console.error("★ delete error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

/* ───────────────────────── 6. RIGHTS PATCH ───────────────── */
/**
 * PATCH /api/stars/:id/rights
 * body: { userId, mode: "view" | "edit", action: "add" | "remove" }
 */
router.patch("/:id/rights", verifyToken, async (req, res) => {
  const { userId, mode, action } = req.body;
  if (
    !["view", "edit"].includes(mode) ||
    !["add", "remove"].includes(action)
  ) {
    return res.status(400).json({ message: "Invalid body" });
  }

  try {
    const star = await Star.findById(req.params.id);
    if (!star) return res.status(404).json({ message: "Star not found" });

    const me = req.user.userId;
    const isOwner = String(star.userId) === me;
    const isEditor = star.canEdit?.some((u) => String(u) === me);

    if (!isOwner && !isEditor)
      return res.status(403).json({ message: "Forbidden" });

    if (!isOwner && mode === "edit")
      return res
        .status(403)
        .json({ message: "Only owner can change edit rights" });

    const field = mode === "view" ? "canView" : "canEdit";

    if (action === "add") {
      if (!star[field].some((u) => String(u) === userId)) {
        star[field].push(userId);
      }
    } else {
      star[field] = star[field].filter((u) => String(u) !== userId);
    }

    await star.save();
    return res.json({ message: "Rights updated", star });
  } catch (err) {
    console.error("★ rights error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

export default router;