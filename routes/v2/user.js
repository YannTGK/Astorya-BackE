// routes/v2/users.js
import express      from "express";
import User         from "../../models/v2/User.js";
import verifyToken  from "../../middleware/v1/authMiddleware.js";
import DeathCertificate from "../../models/v2/DeathCertificate.js";
import wasabi      from "../../utils/wasabiClient.js";
import fs       from 'fs/promises';
import multer from "multer";
import path from "path";

const router = express.Router();
const upload = multer({ dest: "uploads/temp/" });
/*─────────────────────────────────────────────────────────────*
 * HULPFUNCTIES
 *─────────────────────────────────────────────────────────────*/
const collate = { locale: "en", strength: 2 };  // case-insensitive

const loadMe = async (uid) =>
  User.findById(uid)
      .select("+contacts -password")
      .populate("contacts", "-password");

/*─────────────────────────────────────────────────────────────*
 * 1.  SEARCH  – /users/search?username=foo
 *─────────────────────────────────────────────────────────────*/
router.get("/search", verifyToken, async (req, res) => {
  const { username = "" } = req.query;
  const q = username.trim();
  if (!q) {
    return res.status(400).json({ message: "username query missing" });
  }

  try {
    // ^ voor prefix match, 'i' voor case-insensitive
    const regex = new RegExp(`^${q}`, "i");
    const users = await User.find({ username: { $regex: regex } })
      .limit(10)
      .select("username firstName lastName")    // alleen de velden die je nodig hebt
      .sort({ username: 1 });

    return res.json({ users });
  } catch (err) {
    console.error("❌ search-users error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});


/*─────────────────────────────────────────────────────────────*
 * 2.  CONTACTS
 *─────────────────────────────────────────────────────────────*/

/** 2a – lijst eigen contacten */
router.get("/me/contacts", verifyToken, async (req, res) => {
  try {
    /* haalt alleen _id, username en (optioneel) firstName/lastName op */
    const me = await User.findById(req.user.userId)
                         .populate("contacts", "username firstName lastName") // <- kolommen
                         .select("contacts");

    if (!me) return res.status(404).json({ message: "User not found" });

    return res.json({ contacts: me.contacts });
  } catch (err) {
    console.error("❌ get-contacts error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

router.post("/activate", upload.single("certificate"), async (req, res) => {
  const { activationCode, dod } = req.body;

  if (!activationCode || !req.file) {
    return res.status(400).json({ message: "Activation code and certificate are required" });
  }

  try {
    const user = await User.findOne({ activationCode });

    if (!user) {
      return res.status(404).json({ message: "Invalid activation code" });
    }

    if (!user.isAlive) {
      return res.status(400).json({ message: "User is already deactivated" });
    }

    user.isAlive = false;

    if (dod) {
      const parsedDate = new Date(dod);
      if (isNaN(parsedDate)) {
        return res.status(400).json({ message: "Invalid date format for dod" });
      }
      user.dod = parsedDate;
    }

    await user.save();

    const ext = path.extname(req.file.originalname).toLowerCase();
    const key = `certificates/${user._id}_${Date.now()}${ext}`;

    const buffer = await fs.readFile(req.file.path);
    await wasabi.upload({
      Bucket: process.env.WASABI_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: req.file.mimetype,
    }).promise();

    await fs.unlink(req.file.path).catch(() => {});

    await DeathCertificate.create({
      userId: user._id,
      fileKey: key,
    });

    return res.json({
      message: "User successfully deactivated and certificate saved",
      userId: user._id,
      dod: user.dod || null,
    });
  } catch (err) {
    console.error("❌ Activation error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});


/** 2b – voeg een contact toe  */
router.post("/:contactId/contacts", verifyToken, async (req, res) => {
  const contactId = req.params.contactId;          // de persoon die je wilt toevoegen
  const meId      = req.user.userId;               // uit het JWT-token

  if (contactId === meId) {
    return res.status(400).json({ message: "Cannot add yourself" });
  }

  try {
    /* ── 1. haal beide users op ─────────────────────────────────────── */
    const [me, contact] = await Promise.all([
      User.findById(meId).select("contacts"),
      User.findById(contactId).select("-password"),
    ]);

    if (!contact) return res.status(404).json({ message: "User not found" });

    /* ── 2. check of hij al bestaat ─────────────────────────────────── */
    const already = me.contacts.some(
      (c) => c.toString() === contactId          // altijd .toString()!
    );
    if (already)
      return res.status(409).json({ message: "Already in contacts" });

    /* ── 3. push + save ─────────────────────────────────────────────── */
    me.contacts.push(contactId);
    await me.save();

    return res.status(201).json({ message: "Contact added", contact });
  } catch (err) {
    console.error("❌ add-contact error:", err);    // zie terminal
    return res.status(500).json({ message: "Server error" });
  }
});

/** 2c – verwijder een contact  */
router.delete("/:contactId/contacts", verifyToken, async (req, res) => {
  const contactId = req.params.contactId;   // degene die je wìl verwijderen
  const meId      = req.user.userId;        // id uit het JWT-token

  if (contactId === meId) {
    return res.status(400).json({ message: "Cannot remove yourself" });
  }

  try {
    /* ── 1. $pull haalt ObjectId uit array ──────────────────────────── */
    const result = await User.updateOne(
      { _id: meId },
      { $pull: { contacts: contactId } }
    );

    if (result.modifiedCount === 0) {
      return res.status(404).json({ message: "Contact not found" });
    }

    return res.json({ message: "Contact removed" });
  } catch (err) {
    console.error("❌ remove-contact error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

/*─────────────────────────────────────────────────────────────*
 * 3.  STANDAARD CRUD
 *─────────────────────────────────────────────────────────────*/

/** GET – één user op ID */
router.get("/:id", verifyToken, async (req, res) => {
  try {
    const isOwnProfile = req.user.userId === req.params.id;
    const selectFields = isOwnProfile
      ? "-password"
      : "username firstName lastName isAlive";

    const user = await User.findById(req.params.id).select(selectFields);

    if (!user) return res.status(404).json({ message: "User not found" });

    return res.json(user);
  } catch (err) {
    return res.status(500).json({ message: "Server error" });
  }
});

/** PUT – update user */
router.put("/:id", verifyToken, async (req, res) => {
  const allowedUpdates = [
    "firstName",
    "lastName",
    "phoneNumber",
    "dob",
    "dod",
    "country",
    "isAlive",
    "plan"
  ];

  const updates = {};
  allowedUpdates.forEach(field => {
    if (field in req.body) updates[field] = req.body[field];
  });

  try {
    const updated = await User.findByIdAndUpdate(req.params.id, updates, { new: true })
                              .select("-password");

    if (!updated) return res.status(404).json({ message: "User not found" });

    return res.json(updated);
  } catch (err) {
    console.error("❌ User update error:", err);
    return res.status(400).json({ message: err.message });
  }
});

/** DELETE – user */
router.delete("/:id", verifyToken, async (req, res) => {
  try {
    const deleted = await User.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: "User not found" });
    return res.json({ message: "User deleted" });
  } catch (err) {
    return res.status(500).json({ message: "Server error" });
  }
});

export default router;