// routes/v2/stars.js
import express     from "express";
import mongoose    from "mongoose";
import Star        from "../../models/v2/Star.js";
import User        from "../../models/v2/User.js";
import verifyToken from "../../middleware/v1/authMiddleware.js";

const router = express.Router();

/*───────────────────────── helpers ─────────────────────────*/

// Zet een string om naar ObjectId
const toId = (v) => new mongoose.Types.ObjectId(v);

// Check of gebruiker 'me' de ster mag zien (owner ∪ canView ∪ canEdit)
function canSee(star, me) {
  const ownerMatch = String(star.userId) === me;
  const viewMatch  = star.canView?.some((u) => String(u) === me);
  const editMatch  = star.canEdit?.some((u) => String(u) === me);
  return ownerMatch || viewMatch || editMatch;
}

// Check of gebruiker 'me' de ster mag bewerken (owner ∪ canEdit)
function canEdit(star, me) {
  return String(star.userId) === me || star.canEdit?.some((u) => String(u) === me);
}

/*───────────────────────── 1. LIJSTEN ──────────────────────*/

/** GET  /api/stars
 *  -> Alle sterren die ik mag zien (owner ∪ canView ∪ canEdit)
 */
router.get("/", verifyToken, async (req, res) => {
  try {
    const me    = toId(req.user.userId);
    const stars = await Star.find({
      $or: [{ userId: me }, { canView: me }, { canEdit: me }],
    });
    res.json(stars);
  } catch (err) {
    console.error("★ list error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/** GET  /api/stars/dedicate
 *  -> Alleen dedicate-sterren die ik mag zien
 */
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

/*───────────────────────── 2. AANMAKEN ─────────────────────*/

/** POST /api/stars */
router.post("/", verifyToken, async (req, res) => {
  try {
    const star = await Star.create({
      ...req.body,
      userId: req.user.userId,
    });
    res.status(201).json(star);
  } catch (err) {
    console.error("★ create error:", err);
    res.status(400).json({ message: err.message });
  }
});

/*───────────────────────── 3. DETAILS ──────────────────────*/

/** GET /api/stars/:id */
router.get("/:id", verifyToken, async (req, res) => {
  try {
    const star = await Star.findById(req.params.id);
    if (!star) return res.status(404).json({ message: "Star not found" });
    if (!canSee(star, req.user.userId))
      return res.status(403).json({ message: "Forbidden" });

    const owner = await User.findById(star.userId)
      .select("username firstName lastName");
    res.json({ star, owner });
  } catch (err) {
    console.error("★ detail error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/*───────────────────────── 4. UPDATEN ──────────────────────*/

/** PUT /api/stars/:id */
router.put("/:id", verifyToken, async (req, res) => {
  try {
    const star = await Star.findById(req.params.id);
    if (!star) return res.status(404).json({ message: "Star not found" });
    if (!canEdit(star, req.user.userId))
      return res.status(403).json({ message: "Forbidden" });

    Object.assign(star, req.body, { updatedAt: new Date() });
    await star.save();
    res.json(star);
  } catch (err) {
    console.error("★ update error:", err);
    res.status(400).json({ message: err.message });
  }
});

/*───────────────────────── 5. VERWIJDEREN ──────────────────*/

/** DELETE /api/stars/:id (alleen owner) */
router.delete("/:id", verifyToken, async (req, res) => {
  try {
    const star = await Star.findOneAndDelete({
      _id:    req.params.id,
      userId: req.user.userId,
    });
    if (!star) return res.status(404).json({ message: "Star not found" });
    res.json({ message: "Star deleted" });
  } catch (err) {
    console.error("★ delete error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/*───────────────────────── 6. RIGHTS ───────────────────────*/

/** PATCH /api/stars/:id/rights
 *  body = { userId, mode:"view"|"edit", action:"add"|"remove" }
 */
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
    const isEditor = star.canEdit?.some((u) => String(u) === me);

    if (!isOwner && !isEditor)
      return res.status(403).json({ message: "Forbidden" });
    if (!isOwner && mode === "edit")
      return res.status(403).json({ message: "Only owner can change edit rights" });

    const field = mode === "view" ? "canView" : "canEdit";

    if (action === "add") {
      if (!star[field].some((u) => String(u) === userId)) {
        star[field].push(userId);
      }
    } else {
      star[field] = star[field].filter((u) => String(u) !== userId);
    }

    await star.save();
    res.json({ message: "Rights updated", star });
  } catch (err) {
    console.error("★ rights error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

export default router;