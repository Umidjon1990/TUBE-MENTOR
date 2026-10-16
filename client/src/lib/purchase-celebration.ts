/** Called once only on a confirmed, newly charged purchase. */
export function celebratePurchase() {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const node = document.createElement("div");
  node.className = "purchase-celebration";
  node.setAttribute("role", "status");
  node.setAttribute("aria-live", "polite");
  const message = document.createElement("strong");
  message.textContent = "Dars sizniki!";
  node.append(message);
  if (!reduced)
    for (let i = 0; i < 30; i++) {
      const piece = document.createElement("i");
      piece.style.setProperty("--x", `${(Math.random() - 0.5) * 85}vw`);
      piece.style.setProperty("--r", `${Math.random() * 720}deg`);
      piece.style.background = ["#7c3aed", "#c4b5fd", "#fbbf24", "#ec4899"][
        i % 4
      ];
      node.append(piece);
    }
  document.body.append(node);
  window.setTimeout(() => node.remove(), reduced ? 2200 : 3000);
  try {
    if (localStorage.getItem("tube-purchase-sound") === "on") {
      const Audio = window.AudioContext || (window as any).webkitAudioContext;
      if (!Audio) return;
      const audio = new Audio();
      [523, 659, 784].forEach((frequency, i) => {
        const oscillator = audio.createOscillator();
        const gain = audio.createGain();
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0.05, audio.currentTime + i * 0.1);
        gain.gain.exponentialRampToValueAtTime(
          0.001,
          audio.currentTime + i * 0.1 + 0.3,
        );
        oscillator.connect(gain);
        gain.connect(audio.destination);
        oscillator.start(audio.currentTime + i * 0.1);
        oscillator.stop(audio.currentTime + i * 0.1 + 0.3);
      });
      window.setTimeout(() => {
        void audio.close();
      }, 1200);
    }
  } catch {
    /* Optional sound never blocks the purchase. */
  }
}
