// scripts/migrate-add-star-positions.js
import mongoose  from 'mongoose';
import Star from '../models/v2/Star.js';

async function getSpawnPosition() {
  const N = await Star.estimatedDocumentCount();
  const S = 400, R0 = 200;
  const shell = Math.floor(N / 350);
  const minR = R0 + shell * S;
  const maxR = minR + S;
  const r    = Math.random() * (maxR - minR) + minR;

  const θ = Math.random() * Math.PI * 2;
  const φ = Math.acos(2 * Math.random() - 1);

  return {
    x: r * Math.sin(φ) * Math.cos(θ),
    y: r * Math.sin(φ) * Math.sin(θ),
    z: r * Math.cos(φ)
  };
}

(async () => {
  await mongoose.connect(process.env.MONGO_URI);

  const cursor = Star.find({
    $or: [{ x: { $exists: false } }, { y: { $exists: false } }, { z: { $exists: false } }]
  }).cursor();

  let count = 0;
  for (let doc = await cursor.next(); doc; doc = await cursor.next()) {
    Object.assign(doc, await getSpawnPosition());
    await doc.save();
    count++;
  }

  console.log(`✅ positie toegevoegd aan ${count} sterren`);
  await mongoose.disconnect();
})();