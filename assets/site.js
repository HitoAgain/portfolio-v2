// Shared bits for every page: live age, footer year, copy buttons, start of the hero sewing.
(() => {
  const html = document.documentElement;
  const now = new Date();
  const hadBirthday = now >= new Date(now.getFullYear(), 1, 9); // born 9 Feb 2009
  const age = now.getFullYear() - 2009 - (hadBirthday ? 0 : 1);
  document.querySelectorAll('[data-age]').forEach((el) => { el.textContent = age; });

  // Typewriter titles: <span class="type" data-type="text">. Thai is split into whole characters (vowel marks stay attached).
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const chars = (s) => (Intl.Segmenter ? [...new Intl.Segmenter('th', { granularity: 'grapheme' }).segment(s)].map((x) => x.segment) : [...s]);
    document.querySelectorAll('[data-type]').forEach((el) => {
      const parts = chars(el.dataset.type);
      let i = 0;
      el.textContent = '';
      el.classList.add('typing');
      const tick = () => {
        el.textContent += parts[i++];
        if (i < parts.length) setTimeout(tick, 90 + Math.random() * 90); // uneven, like real keystrokes
        else el.classList.add('typed');
      };
      setTimeout(tick, 350);
    });
  }

  // Hero: start sewing once the Thai font is in (or after 1.5 s), once per visit.
  if (document.querySelector('.sew')) {
    Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))])
      .then(() => html.classList.add('fr'));
    try { sessionStorage.setItem('sewn', '1'); } catch { /* storage blocked: animation just replays */ }
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
