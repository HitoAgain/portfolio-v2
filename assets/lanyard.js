// About page: the ID card hangs on a lanyard. The strap is a small rope simulation (Verlet points);
// the card can be dragged and thrown, then swings back and settles. Stops computing once it is still.
(() => {
  const stage = document.getElementById('lanyard');
  const card = stage?.querySelector('.badge');
  if (!stage || !card) return;
  const paths = stage.querySelectorAll('.strap path');
  const pin = stage.querySelector('.strap-pin');
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const N = 14;          // rope segments
  const ITER = 16;       // constraint passes per step (higher = stiffer strap)
  const GRAVITY = 0.5;   // px per step²
  const DAMP = 0.955;    // air drag per step (lower = settles sooner)
  const MAX_V = 11;      // px per step, so a hard throw swings the card instead of looping it over the top
  const MAX_TILT = 0.55; // rad (~30°): a badge sways, it doesn't spin
  let L = 0, seg = 0, ax = 0, cardW = 0, pts = [], drag = null, raf = 0, last = 0, tilt = 0, tiltGap = 0;

  function layout() {
    const oldAx = ax;
    ax = stage.clientWidth / 2;
    L = parseFloat(getComputedStyle(stage).getPropertyValue('--strap')) || 120;
    seg = L / N;
    cardW = card.offsetWidth;
    stage.style.height = `${L + card.offsetHeight + 48}px`;
    pts.forEach((p) => { p.x += ax - oldAx; p.px += ax - oldAx; }); // keep hanging under the moved anchor
  }

  // Rope from the anchor straight down, or (for the entrance) tilted so the card swings in.
  const hang = (tilt) => Array.from({ length: N + 1 }, (_, i) => {
    const x = ax + (i / N) * tilt, y = (i / N) * L * 0.92;
    return { x, y, px: x, py: y };
  });

  function step() {
    for (let i = 1; i <= N; i++) {
      if (drag && i === N) continue; // the hand holds the card end
      const p = pts[i];
      const vx = Math.max(-MAX_V, Math.min(MAX_V, (p.x - p.px) * DAMP));
      const vy = Math.max(-MAX_V, Math.min(MAX_V, (p.y - p.py) * DAMP));
      p.px = p.x; p.py = p.y;
      p.x += vx; p.y += vy + GRAVITY;
    }
    for (let k = 0; k < ITER; k++) {
      for (let i = 0; i < N; i++) {
        const a = pts[i], b = pts[i + 1];
        const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
        if (d <= seg) continue; // a strap goes slack instead of pushing back
        const wa = i === 0 ? 0 : 1;
        const wb = i + 1 === N ? (drag ? 0 : 0.3) : 1; // the card is heavier than the strap
        if (!wa && !wb) continue;
        const f = (d - seg) / d / (wa + wb);
        a.x += dx * f * wa; a.y += dy * f * wa;
        b.x -= dx * f * wb; b.y -= dy * f * wb;
      }
    }
  }

  function render() {
    const end = pts[N], prev = pts[N - 2];
    // The card follows the strap's direction, eased (it has weight) and limited so it never flips.
    const target = -Math.atan2(end.x - prev.x, Math.max(1, end.y - prev.y));
    const goal = Math.max(-MAX_TILT, Math.min(MAX_TILT, target));
    tilt += (goal - tilt) * 0.25;
    tiltGap = Math.abs(goal - tilt);
    card.style.transform = `translate(${end.x - cardW / 2}px, ${end.y}px) rotate(${tilt}rad)`;
    let d = `M${pts[0].x} ${pts[0].y}`;
    for (let i = 1; i < N; i++) {
      d += ` Q${pts[i].x} ${pts[i].y} ${(pts[i].x + pts[i + 1].x) / 2} ${(pts[i].y + pts[i + 1].y) / 2}`;
    }
    d += ` L${end.x} ${end.y}`;
    paths.forEach((p) => p.setAttribute('d', d));
    pin.setAttribute('cx', ax);
    pin.setAttribute('cy', 0);
  }

  function frame(now) {
    // Fixed 60 Hz steps, so the swing looks the same on 60, 120 and 144 Hz screens.
    const steps = Math.min(4, Math.max(1, Math.round((now - (last || now - 16.7)) / 16.7)));
    last = now;
    for (let s = 0; s < steps; s++) step();
    render();
    const motion = pts.reduce((m, p) => m + Math.abs(p.x - p.px) + Math.abs(p.y - p.py), 0);
    if (!drag && motion < 0.08 && tiltGap < 0.002) { raf = 0; last = 0; return; } // settled: sleep until touched
    raf = requestAnimationFrame(frame);
  }
  const wake = () => { if (!raf && !still) raf = requestAnimationFrame(frame); };

  const local = (e) => {
    const r = stage.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  card.addEventListener('pointerdown', (e) => {
    if (still || e.button !== 0) return;
    const p = local(e);
    drag = { ox: pts[N].x - p.x, oy: pts[N].y - p.y, t: 0 };
    card.setPointerCapture(e.pointerId);
    card.classList.add('grabbing');
    wake();
  });
  card.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const p = local(e);
    let x = p.x + drag.ox, y = p.y + drag.oy;
    const dx = x - ax, dist = Math.hypot(dx, y);
    if (dist > L) { x = ax + (dx / dist) * L; y = (y / dist) * L; } // the strap doesn't stretch
    const end = pts[N];
    end.px = end.x; end.py = end.y; // the last move becomes the throw speed on release
    end.x = x; end.y = y;
    drag.t = performance.now();
  });
  const release = () => {
    if (!drag) return;
    const end = pts[N];
    if (performance.now() - drag.t > 80) { end.px = end.x; end.py = end.y; } // held still: just drop it
    else { end.px = end.x - (end.x - end.px) * 0.4; end.py = end.y - (end.y - end.py) * 0.4; } // soften the throw
    drag = null;
    card.classList.remove('grabbing');
    wake();
  };
  card.addEventListener('pointerup', release);
  card.addEventListener('pointercancel', release);

  stage.classList.add('live');
  layout();
  pts = hang(still ? 0 : Math.min(70, ax * 0.3)); // small entrance sway
  if (still) {
    pts = hang(0);
    pts.forEach((p, i) => { p.y = (i / N) * L; p.py = p.y; });
    render();
  } else {
    render();
    wake();
  }
  new ResizeObserver(() => { layout(); render(); wake(); }).observe(stage);
  document.fonts?.ready.then(() => { layout(); render(); }); // card height changes once the Thai font loads
})();
