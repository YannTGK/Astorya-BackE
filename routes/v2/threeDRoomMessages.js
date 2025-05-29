// routes/v2/threeDRoomMessages.js
import express from "express";
import Star from "../../models/v2/Star.js";
import ThreeDRoom from "../../models/v2/ThreeDRoom.js";
import ThreeDRoomMessage from "../../models/v2/3DMessages.js";         // your Message model
import verifyToken from "../../middleware/v1/authMiddleware.js";

const router = express.Router({ mergeParams: true });

router.get("/", async (req, res, next) => {
  const { starId, roomId } = req.params;
  const star = await Star.findById(starId);
  if (!star) return res.status(404).json({ message: "Star not found" });
  if (!star.isPrivate) {
    // public star → return all messages (you probably want to filter by canView?)
    const msgs = await ThreeDRoomMessage.find({ starId, roomId })
      .sort({ addedAt: -1 });
    return res.json(msgs);
  }
  next();
});


/** POST  /stars/:starId/three-d-rooms/:roomId/messages */
router.post("/", verifyToken, async (req, res) => {
  const { starId, roomId } = req.params;
  const { message, canView = [], canEdit = [] } = req.body;

  // 1) owner check
  const star = await Star.findOne({ _id: starId, userId: req.user.userId });
  const room = await ThreeDRoom.findOne({ _id: roomId, starId });
  if (!star || !room) {
    return res.status(404).json({ message: "Star or Room not found" });
  }

  // 2) create message
  const msg = await ThreeDRoomMessage.create({
    starId,
    roomId,
    message,
    sender: req.user.userId,
    canView,
    canEdit,
  });

  res.status(201).json(msg);
});

/** PATCH  /stars/:starId/three-d-rooms/:roomId/messages/:msgId */
router.patch("/:msgId", verifyToken, async (req, res) => {
  const { starId, roomId, msgId } = req.params;
  const { message, canView = [], canEdit = [] } = req.body;

  // find and check exists
  const msg = await ThreeDRoomMessage.findById(msgId);
  if (!msg)
    return res.status(404).json({ message: "Message not found" });

  // ensure star+room match
  if (
    msg.starId.toString() !== starId ||
    msg.roomId.toString() !== roomId
  ) {
    return res.status(404).json({ message: "Message not found in this room" });
  }

  // only sender or star owner can edit
  const isSender = msg.sender.toString() === req.user.userId;
  const isStarOwner = await Star.exists({ _id: starId, userId: req.user.userId });
  if (!isSender && !isStarOwner)
    return res.status(403).json({ message: "Forbidden" });

  // update fields
  msg.message = message;
  msg.canView = canView;
  msg.canEdit = canEdit;
  await msg.save();

  res.json(msg);
});

/** GET  /stars/:starId/three-d-rooms/:roomId/messages */
router.get("/", verifyToken, async (req, res) => {
  const { starId, roomId } = req.params;

  // same ownership check
  const star = await Star.findOne({ _id: starId, userId: req.user.userId });
  const room = await ThreeDRoom.findOne({ _id: roomId, starId });
  if (!star || !room) {
    return res.status(404).json({ message: "Not found or forbidden" });
  }

  // fetch this room’s messages
  const msgs = await ThreeDRoomMessage
    .find({ starId, roomId })
    .sort({ addedAt: -1 })
    .exec();

  res.json(msgs);
});

/** GET  /stars/:starId/three-d-rooms/:roomId/messages/:msgId */
router.get("/:msgId", verifyToken, async (req, res) => {
  const { starId, roomId, msgId } = req.params;
  const msg = await ThreeDRoomMessage.findById(msgId);
  if (!msg) {
    return res.status(404).json({ message: "Message not found" });
  }

  // ensure it belongs to this star+room
  if (
    msg.starId.toString() !== starId ||
    msg.roomId.toString() !== roomId
  ) {
    return res.status(404).json({ message: "Message not found in this room" });
  }

  // permission: sender or in canView
  const isOwner = msg.sender.toString() === req.user.userId;
  const canSee = msg.canView.map(String).includes(req.user.userId);
  if (!isOwner && !canSee) {
    return res.status(403).json({ message: "Forbidden" });
  }

  res.json(msg);
});

/** DELETE  /stars/:starId/three-d-rooms/:roomId/messages/:msgId */
router.delete("/:msgId", verifyToken, async (req, res) => {
  const { starId, roomId, msgId } = req.params;
  const msg = await ThreeDRoomMessage.findById(msgId);
  if (!msg) {
    return res.status(404).json({ message: "Message not found" });
  }

  // same star+room check
  if (
    msg.starId.toString() !== starId ||
    msg.roomId.toString() !== roomId
  ) {
    return res.status(404).json({ message: "Message not found in this room" });
  }

  // only the sender or star owner can delete
  const isOwner = msg.sender.toString() === req.user.userId;
  const isStarOwner = await Star.exists({ _id: starId, userId: req.user.userId });
  if (!isOwner && !isStarOwner) {
    return res.status(403).json({ message: "Forbidden" });
  }

  await msg.deleteOne();
  res.json({ message: "Deleted" });
});

export default router;
