// routes/v2/stars.js
import express     from "express";
import mongoose    from "mongoose";
import Star        from "../../models/v2/Star.js";
import User        from "../../models/v2/User.js";
import verifyToken from "../../middleware/v1/authMiddleware.js";

const router = express.Router();

/*───────────────────────────────*
 *  HULPFUNCTIES
 *───────────────────────────────*/
const toId = (v) => new mongoose.Types.ObjectId(v);

const canSee = (star, me) =>
  String(star.userId) === me ||
  star.canView?.some((u) => String(u) === me) ||
  star.canEdit?.some((u) => String(u) === me);

const canModify = (star, me) =>
  String(star.userId) === me ||
  star.canEdit?.some((u) => String(u) === me);

/*───────────────────────────────*
 * 1.  ALLE ZICHTBARE STERREN
 *───────────────────────────────*/
/** GET /api/stars  – alles wat jij kunt zien */
router.get("/", verifyToken, async (req, res) => {
  const me = toId(req.user.userId);

  try {
    const stars = await Star.find({
      $or: [
        { userId: me },
        { canView: me },
        { canEdit: me },
      ],
    });

    res.json({ stars });
  } catch (err) {
    console.error("★ list error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/*───────────────────────────────*
 * 2.  AANMAKEN
 *───────────────────────────────*/
/** POST /api/stars */
router.post("/", verifyToken, async (req, res) => {
  try {
    const star = await Star.create({
      ...req.body,
      userId: req.user.userId,
    });
    return res.status(201).json(star);
  } catch (err) {
    console.error("★ create error:", err);
    res.status(400).json({ message: err.message });
  }
});

/*───────────────────────────────*
 * 3.  DETAILS
 *───────────────────────────────*/
/** GET /api/stars/:id */
router.get("/:id", verifyToken, async (req, res) => {
  try {
    const star = await Star.findById(req.params.id);
    if (!star) return res.status(404).json({ message: "Star not found" });

    if (!canSee(star, req.user.userId))
      return res.status(403).json({ message: "Forbidden" });

    /* optioneel: eigenaar-info */
    const owner = await User.findById(star.userId)
                            .select("username firstName lastName");
    return res.json({ star, owner });
  } catch (err) {
    console.error("★ detail error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/*───────────────────────────────*
 * 4.  UPDATEN (owner + canEdit)
 *───────────────────────────────*/
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
    res.status(400).json({ message: err.message });
  }
});

/*───────────────────────────────*
 * 5.  VERWIJDEREN (alleen owner)
 *───────────────────────────────*/
/** DELETE /api/stars/:id */
router.delete("/:id", verifyToken, async (req, res) => {
  try {
    const star = await Star.findOneAndDelete({
      _id: req.params.id,
      userId: req.user.userId,
    });
    if (!star) return res.status(404).json({ message: "Star not found" });

    res.json({ message: "Star deleted" });
  } catch (err) {
    console.error("★ delete error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/*─────────────────────────────────────────────────────────────*
 *  PATCH  /api/stars/:id/rights
 *─────────────────────────────────────────────────────────────*
 * body: { userId, mode: "view" | "edit", action: "add" | "remove" }
 */
 router.patch("/:id/rights", verifyToken, async (req, res) => {
  const { userId, mode, action } = req.body;
  if (!["view", "edit"].includes(mode) || !["add", "remove"].includes(action)) {
    return res.status(400).json({ message: "Invalid body" });
  }

  try {
    const star = await Star.findById(req.params.id);
    if (!star) return res.status(404).json({ message: "Star not found" });

    const me = req.user.userId;
    const isOwner  = String(star.userId) === me;
    const isEditor = star.canEdit?.some((u) => String(u) === me);

    /* ── 1. mag ik dit wel? ─────────────────────────────────────────── */
    if (!isOwner && !isEditor) {
      return res.status(403).json({ message: "Forbidden" });
    }

    /* canEdit-gebruiker mag alleen view-rechten aanpassen */
    if (!isOwner && mode === "edit") {
      return res.status(403).json({ message: "Only owner can change edit rights" });
    }

    /* ── 2. wijzig lijst ────────────────────────────────────────────── */
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
    res.status(500).json({ message: "Server error" });
  }
});

export default router;