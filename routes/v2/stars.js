// routes/v2/stars.js
import express     from "express";
import mongoose    from "mongoose";
import Star        from "../../models/v2/Star.js";
import User        from "../../models/v2/User.js";
import verifyToken from "../../middleware/v1/authMiddleware.js";
import { getSpawnRadius } from "../../utils/getSpawnRadius.js";

const router  = express.Router();
const toId    = (v) => new mongoose.Types.ObjectId(v);

/* ───────────────── helpers ────────────────────────────────*/
const POSITION_RANGE = 1200;               // zie uitleg onderaan
const rand = () => (Math.random() - 0.5) * POSITION_RANGE;

const canSee  = (star, me) =>
  String(star.userId) === me ||
  star.canView?.some((u) => String(u) === me) ||
  star.canEdit?.some((u) => String(u) === me);

const canEdit = (star, me) =>
  String(star.userId) === me ||
  star.canEdit?.some((u) => String(u) === me);

/*──────────────── 1. LIJSTEN ──────────────────────────────*/

/** GET /api/stars            – alle sterren die ik kan zien             */
router.get("/", verifyToken, async (req, res) => {
  try {
    const me   = toId(req.user.userId);
    const list = await Star.find({
      $or: [{ userId: me }, { canView: me }, { canEdit: me }],
    });
    res.json(list);
  } catch (err) {
    console.error("★ list error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/** GET /api/stars/dedicate   – alleen dedicate‑sterren zichtbaar voor mij */
router.get("/dedicate", verifyToken, async (req, res) => {
  try {
    const me   = toId(req.user.userId);
    const list = await Star.find({
      starFor: "dedicate",
      $or: [{ userId: me }, { canView: me }, { canEdit: me }],
    });
    res.json(list);
  } catch (err) {
    console.error("★ dedicate error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/** GET /api/stars/public?limit=1000   – publieke sterren (geen auth nodig) */
router.get("/public", async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 500, 5000);
  try {
    const stars = await Star.find({ isPrivate: false })
                            .select("publicName color emissive x y z")
                            .limit(limit)
                            .lean();
    res.json({ stars });
  } catch (err) {
    console.error("★ public error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/*──────────────── 2. AANMAKEN ─────────────────────────────*/

/** POST /api/stars           – nieuwe ster (x,y,z automatisch) */
router.post("/", verifyToken, async (req, res) => {
  try {
    // ❶ kies radius voor deze ster
    const r = await getSpawnRadius();

    // ❷ willekeurige richting op een eenheid‑bol
    const theta = Math.acos(2 * Math.random() - 1);   // 0…π
    const phi   = 2 * Math.PI * Math.random();        // 0…2π

    const xyz = {
      x: r * Math.sin(theta) * Math.cos(phi),
      y: r * Math.sin(theta) * Math.sin(phi),
      z: r * Math.cos(theta),
    };

    const star = await Star.create({
      ...req.body,
      ...xyz,                       // ← nieuwe velden
      userId: req.user.userId,
    });

    res.status(201).json(star);
  } catch (err) {
    console.error("★ create error:", err);
    res.status(400).json({ message: err.message });
  }
});

/*──────────────── 3. DETAILS ──────────────────────────────*/

/** GET /api/stars/:id        – detail + owner‑info */
router.get("/:id", verifyToken, async (req, res) => {
  try {
    const star = await Star.findById(req.params.id);
    if (!star)                     return res.status(404).json({ message: "Star not found" });
    if (!canSee(star, req.user.userId))
                                   return res.status(403).json({ message: "Forbidden" });

    const owner = await User.findById(star.userId).select("username firstName lastName");
    res.json({ star, owner });
  } catch (err) {
    console.error("★ detail error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/** GET /api/stars/:id/members – zichtbare leden + rol */
router.get("/:id/members", verifyToken, async (req, res) => {
  try {
    const star = await Star.findById(req.params.id).lean();
    if (!star)                     return res.status(404).json({ message: "Star not found" });
    if (!canSee(star, req.user.userId))
                                   return res.status(403).json({ message: "Forbidden" });

    const ids = Array.from(new Set([...star.canView, ...star.canEdit].map(String)));

    const users = await User.find({ _id: { $in: ids } })
                            .select("username")
                            .lean();

    const members = users.map((u) => ({
      _id:      u._id,
      username: u.username,
      role:     star.canEdit.some((id) => String(id) === String(u._id))
                ? "Can edit"
                : "Can view",
    }));

    res.json({ members });
  } catch (err) {
    console.error("★ members error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/*──────────────── 4. UPDATEN ──────────────────────────────*/

/** PUT /api/stars/:id         – wijzigen (owner / editor) */
router.put("/:id", verifyToken, async (req, res) => {
  try {
    const star = await Star.findById(req.params.id);
    if (!star)                     return res.status(404).json({ message: "Star not found" });
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

/*──────────────── 5. VERWIJDEREN ─────────────────────────*/

/** DELETE /api/stars/:id      – eigenaar verwijdert ster */
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

/*──────────────── 6. RECHTEN AANPASSEN ───────────────────*/

/** PATCH /api/stars/:id/rights
 *  body = { userId, mode:"view"|"edit", action:"add"|"remove" }
 */
router.patch("/:id/rights", verifyToken, async (req, res) => {
  const { userId, mode, action } = req.body;
  if (!["view", "edit"].includes(mode) || !["add", "remove"].includes(action))
    return res.status(400).json({ message: "Invalid body" });

  try {
    const star = await Star.findById(req.params.id);
    if (!star) return res.status(404).json({ message: "Star not found" });

    const me       = req.user.userId;
    const isOwner  = String(star.userId) === me;
    const isEditor = star.canEdit?.some((u) => String(u) === me);
    if (!isOwner && !isEditor)                       return res.status(403).json({ message: "Forbidden" });
    if (!isOwner && mode === "edit")                 return res.status(403).json({ message: "Only owner can change edit rights" });

    const field = mode === "view" ? "canView" : "canEdit";

    if (action === "add") {
      if (!star[field].some((u) => String(u) === userId))
        star[field].push(userId);
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