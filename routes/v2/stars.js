// routes/v2/stars.js
import express     from "express";
import mongoose    from "mongoose";
import Star        from "../../models/v2/Star.js";
import User        from "../../models/v2/User.js";
import verifyToken from "../../middleware/v1/authMiddleware.js";

const router = express.Router();
const toId = v => new mongoose.Types.ObjectId(v);

// who can see/edit?
const canSee = (star, me) =>
  String(star.userId) === me ||
  star.canView?.some(u => String(u) === me) ||
  star.canEdit?.some(u => String(u) === me);

const canEdit = (star, me) =>
  String(star.userId) === me ||
  star.canEdit?.some(u => String(u) === me);

// 1. LIST ALL VISIBLE
router.get("/", verifyToken, async (req, res) => {
  try {
    const me = toId(req.user.userId);
    const stars = await Star.find({
      $or: [{ userId: me }, { canView: me }, { canEdit: me }],
    });
    res.json(stars);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// 2. LIST DEDICATE‐ONLY
router.get("/dedicate", verifyToken, async (req, res) => {
  try {
    const me = toId(req.user.userId);
    const stars = await Star.find({
      starFor: "dedicate",
      $or: [{ userId: me }, { canView: me }, { canEdit: me }],
    });
    res.json(stars);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// 3. CREATE
router.post("/", verifyToken, async (req, res) => {
  try {
    const star = await Star.create({ ...req.body, userId: req.user.userId });
    res.status(201).json(star);
  } catch (err) {
    console.error(err);
    res.status(400).json({ message: err.message });
  }
});

// 4. DETAIL
router.get("/:id", verifyToken, async (req, res) => {
  try {
    const star = await Star.findById(req.params.id);
    if (!star) return res.status(404).json({ message: "Star not found" });
    if (!canSee(star, req.user.userId)) return res.status(403).json({ message: "Forbidden" });
    const owner = await User.findById(star.userId).select("username firstName lastName");
    res.json({ star, owner });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// ─── NEW: GET MEMBERS ────────────────────────────────
router.get("/:id/members", verifyToken, async (req, res) => {
  try {
    const star = await Star.findById(req.params.id).lean();
    if (!star) return res.status(404).json({ message: "Star not found" });
    const me = req.user.userId;
    if (!canSee(star, me)) return res.status(403).json({ message: "Forbidden" });

    // build unique list of userIds
    const ids = Array.from(new Set([
      ...star.canView.map(String),
      ...star.canEdit.map(String),
    ]));

    // fetch usernames
    const users = await User.find({ _id: { $in: ids } })
                            .select("username")
                            .lean();

    const members = users.map(u => ({
      _id:      u._id,
      username: u.username,
      role:     star.canEdit.some(id => String(id) === String(u._id))
                ? "Can edit"
                : "Can view",
    }));

    res.json({ members });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// 5. UPDATE
router.put("/:id", verifyToken, async (req, res) => {
  try {
    const star = await Star.findById(req.params.id);
    if (!star) return res.status(404).json({ message: "Star not found" });
    if (!canEdit(star, req.user.userId)) return res.status(403).json({ message: "Forbidden" });
    Object.assign(star, req.body, { updatedAt: new Date() });
    await star.save();
    res.json(star);
  } catch (err) {
    console.error(err);
    res.status(400).json({ message: err.message });
  }
});

// 6. DELETE
router.delete("/:id", verifyToken, async (req, res) => {
  try {
    const star = await Star.findOneAndDelete({ _id: req.params.id, userId: req.user.userId });
    if (!star) return res.status(404).json({ message: "Star not found" });
    res.json({ message: "Star deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// 7. RIGHTS PATCH
router.patch("/:id/rights", verifyToken, async (req, res) => {
  const { userId, mode, action } = req.body;
  if (!["view","edit"].includes(mode) || !["add","remove"].includes(action)) {
    return res.status(400).json({ message: "Invalid body" });
  }
  try {
    const star = await Star.findById(req.params.id);
    if (!star) return res.status(404).json({ message: "Star not found" });
    const me = req.user.userId;
    const isOwner  = String(star.userId) === me;
    const isEditor = star.canEdit?.some(u => String(u) === me);
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
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

export default router;