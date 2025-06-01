
import dotenv from "dotenv";
dotenv.config();
import mongoose from "mongoose";
import User from "../models/v2/User.js"; // pas het pad aan indien nodig

const MONGO_URI = process.env.MONGO_URI;

const generateCode = async () => {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let code;
  let exists = true;

  while (exists) {
    code = Array.from({ length: 7 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    exists = await User.exists({ activationCode: code });
  }

  return code;
};

const run = async () => {
  await mongoose.connect(MONGO_URI);
  console.log("✅ Verbonden met database");

  const usersWithoutCode = await User.find({ activationCode: { $exists: false } });

  console.log(`🔍 ${usersWithoutCode.length} gebruikers zonder activatiecode gevonden`);

  for (const user of usersWithoutCode) {
    const code = await generateCode();
    user.activationCode = code;
    await user.save();
    console.log(`✅ Code toegevoegd aan ${user.username}: ${code}`);
  }

  console.log("🎉 Alle codes gegenereerd!");
  await mongoose.disconnect();
};

run().catch((err) => {
  console.error("❌ Fout tijdens uitvoeren script:", err);
  process.exit(1);
});