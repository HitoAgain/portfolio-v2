// Shared bits for every page: live age, typing effects, hopping letters, copy buttons, start of the hero sewing.
(() => {
  const html = document.documentElement;
  const now = new Date();
  const hadBirthday = now >= new Date(now.getFullYear(), 1, 9); // born 9 Feb 2009
  const age = now.getFullYear() - 2009 - (hadBirthday ? 0 : 1);
  document.querySelectorAll('[data-age]').forEach((el) => { el.textContent = age; });

  const moving = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Thai is split into whole characters, so vowel and tone marks stay with their letter.
  const chars = (s) => (Intl.Segmenter ? [...new Intl.Segmenter('th', { granularity: 'grapheme' }).segment(s)].map((x) => x.segment) : [...s]);
  const keystroke = () => 80 + Math.random() * 90; // uneven, like real typing

  // Letters that hop one by one when the cursor comes close: <span data-bounce>.
  function hopWhenNear(el) {
    el.replaceChildren(...chars(el.textContent).map((c, i) => Object.assign(document.createElement('span'), {
      className: 'ch', textContent: c, style: `--i:${i}`,
    })));
    let armed = true;
    document.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      const dx = Math.max(r.left - e.clientX, 0, e.clientX - r.right);
      const dy = Math.max(r.top - e.clientY, 0, e.clientY - r.bottom);
      const near = Math.hypot(dx, dy) < 90;
      if (near && armed) {
        armed = false; // hop once per approach, not on every mouse move
        el.classList.remove('hop');
        void el.offsetWidth; // restart the animation
        el.classList.add('hop');
      } else if (!near) armed = true;
    }, { passive: true });
  }

  // Typewriter titles: <span class="type" data-type="text">.
  document.querySelectorAll('[data-type]').forEach((el) => {
    const done = () => { el.classList.add('typed'); if (moving && el.hasAttribute('data-bounce')) hopWhenNear(el); };
    if (!moving) { done(); return; }
    const parts = chars(el.dataset.type);
    let i = 0;
    el.textContent = '';
    el.classList.add('typing');
    const tick = () => {
      el.textContent += parts[i++];
      if (i < parts.length) setTimeout(tick, keystroke());
      else done();
    };
    setTimeout(tick, 350);
  });

  // Typing that keeps switching between words: <span data-type-loop='["ไทย","English"]'>.
  document.querySelectorAll('[data-type-loop]').forEach((el) => {
    const words = JSON.parse(el.dataset.typeLoop).map(chars);
    if (!moving) return; // the first word is already in the markup
    let w = 0, i = words[0].length, deleting = false;
    el.classList.add('typing');
    const tick = () => {
      const word = words[w];
      i += deleting ? -1 : 1;
      el.textContent = word.slice(0, i).join('');
      if (!deleting && i === word.length) { deleting = true; setTimeout(tick, 2600); return; }
      if (deleting && i === 0) { deleting = false; w = (w + 1) % words.length; setTimeout(tick, 450); return; }
      setTimeout(tick, deleting ? 45 : keystroke());
    };
    deleting = true;
    setTimeout(tick, 2600); // show the Thai name first, then start switching
  });

  // Hero: start sewing the name once the Thai font is in (or after 1.5 s).
  if (document.querySelector('.sew')) {
    Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))])
      .then(() => html.classList.add('fr'));
  }

  // Copy buttons: <button data-copy="text" data-done-label="...">
  const status = document.getElementById('copy-status');
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-copy]');
    if (!btn) return;
    const text = btn.dataset.copy;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const t = Object.assign(document.createElement('textarea'), { value: text });
      document.body.append(t); t.select(); document.execCommand('copy'); t.remove();
    }
    btn.dataset.label ??= btn.textContent;
    btn.textContent = 'คัดลอกแล้ว';
    btn.dataset.done = '';
    if (status) status.textContent = `คัดลอก ${text} แล้ว`;
    clearTimeout(btn._t);
    btn._t = setTimeout(() => { btn.textContent = btn.dataset.label; delete btn.dataset.done; }, 2200);
  });
})();
