// Finds the date written on a certificate from OCR text, e.g. "ให้ไว้ ณ วันที่ ๒๖ กรกฎาคม พ.ศ. ๒๕๖๙".
// Returns { iso: 'YYYY-MM-DD', text: the matched words } or null.
const MONTHS = [
  ['มกราคม', 'ม.ค.', 'january', 'jan'], ['กุมภาพันธ์', 'ก.พ.', 'february', 'feb'], ['มีนาคม', 'มี.ค.', 'march', 'mar'],
  ['เมษายน', 'เม.ย.', 'april', 'apr'], ['พฤษภาคม', 'พ.ค.', 'may'], ['มิถุนายน', 'มิ.ย.', 'june', 'jun'],
  ['กรกฎาคม', 'ก.ค.', 'july', 'jul'], ['สิงหาคม', 'ส.ค.', 'august', 'aug'], ['กันยายน', 'ก.ย.', 'september', 'sep'],
  ['ตุลาคม', 'ต.ค.', 'october', 'oct'], ['พฤศจิกายน', 'พ.ย.', 'november', 'nov'], ['ธันวาคม', 'ธ.ค.', 'december', 'dec'],
];
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\./g, '\\.?'); // dots optional: OCR drops them
const monthIndex = new Map();
MONTHS.forEach((names, i) => names.forEach((n) => monthIndex.set(n.replace(/\./g, ''), i)));
// Longest names first so "มีนาคม" wins over "มี.ค.".
const monthAlt = MONTHS.flat().sort((a, b) => b.length - a.length).map(esc).join('|');
const WORDY = new RegExp(`(\\d{1,2})(?:เดือน)?(${monthAlt})(?:พ\\.?ศ\\.?|ค\\.?ศ\\.?|,)?(\\d{4})`, 'gi');
const NUMERIC = /(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/g;

function toIso(day, month, year) {
  const y = year > 2400 ? year - 543 : year; // Buddhist era to Christian era
  const d = new Date(y, month, day);
  if (y < 1990 || y > 2100 || d.getMonth() !== month || d.getDate() !== day) return null;
  return `${y}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function findDate(raw) {
  // OCR splits Thai words with spaces, so match on text with all spaces removed.
  const text = raw.replace(/[๐-๙]/g, (c) => '๐๑๒๓๔๕๖๗๘๙'.indexOf(c)).replace(/\s+/g, '').toLowerCase();
  const found = [];
  for (const m of text.matchAll(WORDY)) {
    const iso = toIso(+m[1], monthIndex.get(m[2].replace(/\./g, '')), +m[3]);
    if (iso) found.push({ iso, text: m[0] });
  }
  for (const m of text.matchAll(NUMERIC)) {
    const iso = toIso(+m[1], +m[2] - 1, +m[3]);
    if (iso) found.push({ iso, text: m[0] });
  }
  // The issue date ("ให้ไว้ ณ วันที่ ...") is normally the last date on a certificate.
  return found.at(-1) ?? null;
}
