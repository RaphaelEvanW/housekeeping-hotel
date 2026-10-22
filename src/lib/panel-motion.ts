export async function slidePanel(
  dialog: HTMLDialogElement,
  side: "left" | "right",
  phase: "enter" | "exit",
) {
  const offset = side === "left" ? "translateX(-100%)" : "translateX(100%)";
  const from = phase === "enter" ? offset : getComputedStyle(dialog).transform;
  dialog.getAnimations().forEach(animation => animation.cancel());
  dialog.dataset.closing = String(phase === "exit");
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const animation = dialog.animate(
    [{ transform: from }, { transform: phase === "enter" ? "translateX(0)" : offset }],
    { duration: phase === "enter" ? 420 : 280, easing: "cubic-bezier(0.16, 1, 0.3, 1)", fill: "both" },
  );
  try { await animation.finished; } catch { /* A newer transition or unmount cancelled this one. */ }
}
