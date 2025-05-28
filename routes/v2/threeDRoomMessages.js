import express from "express";
import Star from "../../models/v2/Star.js";
import ThreeDRoom from "../../models/v2/ThreeDRoom.js";
import ThreeDRoomMessage from "../../models/v2/Messages.js";
import verifyToken from "../../middleware/v1/authMiddleware.js";

const router = express.Router({ mergeParams: true });

// POST create message
router.post("/", verifyToken, async (req, res) => {
  const { starId, roomId } = req.params;
  const { message, canView = [], canEdit = [] } = req.body;

  const star = await Star.findOne({ _id: starId, userId: req.user.userId });
  const room = await ThreeDRoom.findOne({ _id: roomId, starId });
  if (!star || !room) return res.status(404).json({ message: "Not found or forbidden" });

  const msg = await ThreeDRoomMessage.create({
    roomId,
    message,
    sender: req.user.userId,
    canView,
    canEdit,
  });
  res.status(201).json(msg);
});

// GET all messages
router.get("/", verifyToken, async (req, res) => {
  const { starId, roomId } = req.params;
  const star = await Star.findOne({ _id: starId, userId: req.user.userId });
  const room = await ThreeDRoom.findOne({ _id: roomId, starId });
  if (!star || !room) return res.status(404).json({ message: "Not found or forbidden" });

  const msgs = await ThreeDRoomMessage.find({ roomId });
  res.json(msgs);
});

// GET detail
router.get("/:msgId", verifyToken, async (req, res) => {
  const { starId, msgId } = req.params;
  const msg = await ThreeDRoomMessage.findById(msgId);
  if (!msg) return res.status(404).json({ message: "Message not found" });

  const star = await Star.findOne({ _id: starId, userId: req.user.userId });
  const room = await ThreeDRoom.findById(msg.roomId);
  if (!star || !room) return res.status(403).json({ message: "Forbidden" });

  // alleen owner of in canView
  const isOwner = msg.sender.toString() === req.user.userId;
  const canSee  = msg.canView.map(String).includes(req.user.userId);
  if (!isOwner && !canSee) return res.status(403).json({ message: "Forbidden" });

  res.json(msg);
});

// DELETE
router.delete("/:msgId", verifyToken, async (req, res) => {
  const { starId, msgId } = req.params;
  const msg = await ThreeDRoomMessage.findById(msgId);
  if (!msg) return res.status(404).json({ message: "Message not found" });

  const star = await Star.findOne({ _id: starId, userId: req.user.userId });
  if (!star) return res.status(403).json({ message: "Forbidden" });

  await msg.deleteOne();
  res.json({ message: "Deleted" });
});

export default router;