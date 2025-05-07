// utils/getSpawnRadius.js
export async function getSpawnRadius() {
    const N = await Star.estimatedDocumentCount();   // snel & goedkoop
    const S = 400;                                   // schil‑dikte
    const R0 = 200;                                  // binnenste straal
    const i  = Math.floor(N / 350);                  // elke 500 sterren één ring verder
    const min = R0 + i * S;
    const max = min + S;
    // uniform in de schil
    return Math.random() * (max - min) + min;
  }