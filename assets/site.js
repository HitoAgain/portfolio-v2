// Shared bits for every page: live age, footer year, copy buttons, start of the hero sewing.
(() => {
  const html = document.documentElement;
  const now = new Date();
  const hadBirthday = now >= new Date(now.getFullYear(), 1, 9); // born 9 Feb 2009
  const age = now.getFullYear() - 2009 - (hadBirthday ? 0 : 1);
  document.querySelectorAll('[data-age]').forEach((el) => { el.textContent = age; });
  document.querySelectorAll('[data-year]').forEach((el) => { el.textContent = now.getFullYear(); });

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
