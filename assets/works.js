// Works page: lists works from Firestore (free Spark plan). The admin signs in with Firebase Auth to add,
// edit and delete; firestore.rules is what actually blocks everyone else from writing.
// Data: works/{id} = text + small thumbnail + image ids; works/{id}/images/{imageId} = { data: JPEG data URL }.
// Photos live in Firestore (not Cloud Storage) because Cloud Storage needs the paid Blaze plan.
// When changing the SDK version, also update the modulepreload links in works.html.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import {
  getFirestore, connectFirestoreEmulator, collection, doc, getDoc, getDocs, setDoc, writeBatch,
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore-lite.js';

// firebase-config.js is git-ignored (keeps keys off GitHub); without it the page still loads, just unconnected.
const { firebaseConfig, adminEmail } = await import('./firebase-config.js')
  .catch(() => ({ firebaseConfig: {}, adminEmail: '' }));
const AUTH_SDK ='https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
const MAX_DOC_CHARS = 950_000; // Firestore documents max out at 1 MiB

// Local testing only: works.html?emulator on localhost talks to Firebase emulators, never the real project.
const useEmulator = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && new URLSearchParams(location.search).has('emulator');
const configured = useEmulator || Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);
const app = configured ? initializeApp(useEmulator ? { apiKey: 'demo-key', projectId: 'demo-portfolio' } : firebaseConfig) : null;
const db = app && getFirestore(app);
if (useEmulator) connectFirestoreEmulator(db, '127.0.0.1', 8085);

const $ = (s) => document.querySelector(s);
const el = (tag, props = {}, ...kids) => {
  const n = Object.assign(document.createElement(tag), props);
  n.append(...kids.filter((k) => k || k === 0));
  return n;
};
const session = {
  get: (k) => { try { return sessionStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { v == null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v); } catch { /* blocked */ } },
};

const listEl = $('#works'), bar = $('#admin-bar'), fab = $('#admin-fab');
const dateShort = new Intl.DateTimeFormat('th-TH-u-ca-buddhist', { day: 'numeric', month: 'short', year: 'numeric' });
const dateLong = new Intl.DateTimeFormat('th-TH-u-ca-buddhist', { day: 'numeric', month: 'long', year: 'numeric' });
const parseDate = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const sorted = (list) => [...list].sort((a, b) => b.date.localeCompare(a.date));
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const withScheme = (u) => (/^[a-z][\w+.-]*:/i.test(u) ? u : `https://${u}`);
const safeUrl = (u) => { try { return ['http:', 'https:'].includes(new URL(u).protocol); } catch { return false; } };
const prettyUrl = (u) => u.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');

let isAdmin = false;
let works = [];

// ---------- Firestore ----------
const workCol = () => collection(db, 'works');
const imgCol = (workId) => collection(db, 'works', workId, 'images');
const imageCache = new Map(); // image id -> data URL

async function fetchWorks() {
  const snap = await getDocs(workCol());
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// One read per image, only when someone opens a work.
const fetchImages = (workId, ids = []) => Promise.all(ids.map(async (id) => {
  if (!imageCache.has(id)) {
    const snap = await getDoc(doc(imgCol(workId), id));
    imageCache.set(id, snap.exists() ? snap.data().data : '');
  }
  return { id, src: imageCache.get(id) };
})).then((items) => items.filter((i) => i.src));

// ---------- Auth (loaded only when the admin needs it) ----------
let auth, authApi;
async function loadAuth() {
  if (!authApi) {
    const api = await import(AUTH_SDK);
    auth = api.initializeAuth(app, { persistence: api.browserSessionPersistence });
    if (useEmulator) api.connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    await auth.authStateReady();
    authApi = api;
  }
  return authApi;
}
const isAdminUser = (user) => user?.email?.toLowerCase() === adminEmail.toLowerCase();

async function restoreAdmin() {
  if (!configured || session.get('admin') !== '1') return;
  try { await loadAuth(); isAdmin = isAdminUser(auth.currentUser); } catch { isAdmin = false; }
  if (!isAdmin) session.set('admin', null);
}

const AUTH_ERRORS = {
  'auth/invalid-credential': 'รหัสผ่านไม่ถูกต้อง ลองอีกครั้ง',
  'auth/invalid-login-credentials': 'รหัสผ่านไม่ถูกต้อง ลองอีกครั้ง',
  'auth/wrong-password': 'รหัสผ่านไม่ถูกต้อง ลองอีกครั้ง',
  'auth/user-not-found': 'ยังไม่มีบัญชีแอดมิน สร้างบัญชีใน Firebase > Authentication > Users ก่อน',
  'auth/too-many-requests': 'ใส่รหัสผิดหลายครั้งเกินไป รอสักครู่แล้วลองใหม่',
  'auth/network-request-failed': 'เชื่อมต่ออินเทอร์เน็ตไม่ได้ ตรวจการเชื่อมต่อแล้วลองอีกครั้ง',
  'auth/operation-not-allowed': 'ยังไม่ได้เปิดล็อกอินแบบอีเมล/รหัสผ่าน ใน Firebase > Authentication > Sign-in method',
  'auth/invalid-api-key': 'ค่าใน assets/firebase-config.js ไม่ถูกต้อง คัดลอกจาก Firebase มาใหม่',
  'auth/api-key-not-valid.-please-pass-a-valid-api-key.': 'apiKey ใน assets/firebase-config.js ไม่ถูกต้อง ตรวจว่าคัดลอกมาครบและไม่มีเครื่องหมายเกิน',
};
const SAVE_ERRORS = {
  'permission-denied': 'บัญชีนี้ยังไม่มีสิทธิ์แก้ไข ตรวจว่าใส่ UID ในกฎของ Firestore ถูกต้อง (ดู FIREBASE-SETUP.md)',
  'unauthenticated': 'หมดเวลาล็อกอินแล้ว ออกจากโหมดแอดมินแล้วเข้าใหม่',
  'resource-exhausted': 'โควตาฟรีของวันนี้เต็มแล้ว ลองใหม่พรุ่งนี้',
  'unavailable': 'เชื่อมต่ออินเทอร์เน็ตไม่ได้ ตรวจการเชื่อมต่อแล้วลองอีกครั้ง',
};

// ---------- Toast ----------
const toastEl = $('#toast');
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => toastEl.classList.remove('show'), 2800);
}
const shake = (node) => { node.classList.remove('shake'); void node.offsetWidth; node.classList.add('shake'); };

// ---------- List ----------
function render() {
  bar.hidden = !isAdmin;
  fab.hidden = isAdmin;
  listEl.replaceChildren();
  if (!works.length) {
    listEl.append(el('p', { className: 'empty', textContent: isAdmin
      ? 'ยังไม่มีผลงาน กด “เพิ่มผลงาน” เพื่อสร้างรายการแรก'
      : 'ยังไม่มีผลงานในตอนนี้ แวะกลับมาดูใหม่เร็วๆ นี้นะครับ' }));
    return;
  }
  const groups = new Map();
  for (const w of sorted(works)) {
    const y = parseDate(w.date).getFullYear() + 543;
    if (!groups.has(y)) groups.set(y, []);
    groups.get(y).push(w);
  }
  for (const [y, items] of groups) {
    const sec = el('section', { className: 'year-group' },
      el('h2', { className: 'year', id: `y${y}` }, `พ.ศ. ${y}`, el('small', { textContent: `${items.length} รายการ` })),
      ...items.map(workRow));
    sec.setAttribute('aria-labelledby', `y${y}`);
    listEl.append(sec);
  }
}

function workRow(w) {
  const open = el('button', { type: 'button', className: 'work-open', textContent: w.title });
  open.addEventListener('click', () => openView(w));
  const body = el('div', { className: 'work-body' },
    el('h3', { className: 'work-title' }, open),
    w.rank && el('span', { className: 'patch', textContent: w.rank }),
    w.details && el('p', { className: 'work-excerpt', textContent: w.details }));
  if (isAdmin) {
    const edit = el('button', { type: 'button', className: 'btn btn-small', textContent: 'แก้ไข' });
    const del = el('button', { type: 'button', className: 'btn btn-small btn-danger', textContent: 'ลบ' });
    edit.addEventListener('click', () => openForm(w));
    del.addEventListener('click', () => removeWork(w));
    body.append(el('div', { className: 'work-admin' }, edit, del));
  }
  const thumb = w.thumb && el('img', { className: 'work-thumb', src: w.thumb, alt: '', loading: 'lazy', decoding: 'async', width: 320, height: 240 });
  const time = el('time', { className: 'work-date', dateTime: w.date, textContent: dateShort.format(parseDate(w.date)) });
  return el('article', { className: thumb ? 'work' : 'work no-thumb' }, time, body, thumb);
}

// ---------- Detail view ----------
const viewDlg = $('#view-dlg'), viewBody = $('#view-body');
let viewToken = 0;
const section = (title, content) => el('section', { className: 'view-sec' }, el('h3', { textContent: title }), content);
const gallery = (srcs, cls, label) => el('div', { className: cls }, ...srcs.map((src, i) => {
  const b = el('button', { type: 'button', className: 'shot', title: 'เปิดรูปขนาดเต็มในแท็บใหม่' },
    el('img', { src, alt: `${label} ${i + 1}`, loading: 'lazy', decoding: 'async' }));
  b.addEventListener('click', () => openFull(src));
  return b;
}));

function openView(w) {
  const token = ++viewToken;
  const photos = (title, ids, cls, label) => {
    if (!ids?.length) return null;
    const box = el('p', { className: 'img-loading', textContent: 'กำลังโหลดรูป…' });
    fetchImages(w.id, ids)
      .then((items) => { if (token === viewToken) box.replaceWith(gallery(items.map((i) => i.src), cls, label)); })
      .catch(() => { box.textContent = 'โหลดรูปไม่สำเร็จ ปิดแล้วเปิดรายการนี้ใหม่อีกครั้ง'; });
    return section(title, box);
  };
  const links = (w.links || []).filter(safeUrl);
  viewBody.replaceChildren(...[
    el('time', { className: 'view-date', dateTime: w.date, textContent: dateLong.format(parseDate(w.date)) }),
    el('h2', { className: 'view-title', id: 'view-title', textContent: w.title }),
    w.rank && el('span', { className: 'patch', textContent: w.rank }),
    w.details && el('p', { className: 'view-details', textContent: w.details }),
    photos('รูปภาพ', w.images, 'gallery', `รูปผลงาน ${w.title}`),
    photos('เกียรติบัตร', w.certs, 'gallery certs', `เกียรติบัตร ${w.title}`),
    links.length && section('ลิงก์เพิ่มเติม', el('ul', { className: 'links' }, ...links.map((u) =>
      el('li', {}, el('a', { href: u, target: '_blank', rel: 'noopener noreferrer', textContent: prettyUrl(u) }))))),
  ].filter(Boolean));
  viewDlg.showModal();
  viewDlg.scrollTop = 0;
}

// Browsers block opening data: URLs directly, so hand the tab a blob: URL instead.
function openFull(src) {
  const [head, b64] = src.split(',');
  const bin = atob(b64), bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  window.open(URL.createObjectURL(new Blob([bytes], { type: head.slice(5, head.indexOf(';')) })), '_blank');
}

// ---------- Dialog plumbing ----------
document.addEventListener('click', (e) => {
  const closer = e.target.closest('[data-close]');
  if (closer) closer.closest('dialog').close();
});
viewDlg.addEventListener('click', (e) => { if (e.target === viewDlg) viewDlg.close(); }); // backdrop click

// ---------- Admin login ----------
const loginDlg = $('#login-dlg'), loginForm = $('#login-form'), pw = $('#pw'), loginErr = $('#login-error');
const loginBtn = loginForm.querySelector('[type="submit"]');
fab.addEventListener('click', () => { loginForm.reset(); loginErr.textContent = ''; loginDlg.showModal(); });

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!configured) { loginErr.textContent = 'ยังไม่ได้เชื่อม Firebase ใส่ค่าในไฟล์ assets/firebase-config.js ก่อน (ดู FIREBASE-SETUP.md)'; return; }
  if (!pw.value) { loginErr.textContent = 'ใส่รหัสผ่านก่อน'; shake(loginForm); return; }
  loginBtn.disabled = true;
  loginErr.textContent = '';
  try {
    const api = await loadAuth();
    const cred = await api.signInWithEmailAndPassword(auth, adminEmail, pw.value);
    if (!isAdminUser(cred.user)) throw Object.assign(new Error(), { code: 'auth/invalid-credential' });
  } catch (err) {
    loginErr.textContent = AUTH_ERRORS[err.code] ?? `เข้าสู่ระบบไม่สำเร็จ (${err.code ?? 'โหลดระบบล็อกอินไม่ได้'}) ลองอีกครั้ง`;
    shake(loginForm);
    pw.select();
    return;
  } finally {
    loginBtn.disabled = false;
  }
  session.set('admin', '1');
  isAdmin = true;
  loginDlg.close();
  render();
  toast('เข้าสู่โหมดแอดมินแล้ว');
});

$('#logout').addEventListener('click', async () => {
  try { await authApi?.signOut(auth); } catch { /* still leave admin mode locally */ }
  session.set('admin', null);
  isAdmin = false;
  render();
  toast('ออกจากโหมดแอดมินแล้ว');
});

// ---------- Add / edit form ----------
const formDlg = $('#work-dlg'), form = $('#work-form'), formErr = $('#form-error'), saveBtn = $('#save-work');
let editing = null;
let workId = null; // fixed when the form opens, so a retried save reuses photos it already uploaded
let imgs = [], certs = []; // { id?: existing image doc id, src: data URL }

function busy(on, label) {
  saveBtn.disabled = on;
  saveBtn.textContent = on ? label : (editing ? 'บันทึกการแก้ไข' : 'เพิ่มผลงาน');
}

async function openForm(w = null) {
  editing = w;
  workId = w?.id ?? doc(workCol()).id;
  form.reset();
  $('#work-dlg-title').textContent = w ? 'แก้ไขผลงาน' : 'เพิ่มผลงาน';
  $('#f-title').value = w?.title ?? '';
  $('#f-rank').value = w?.rank ?? '';
  $('#f-date').value = w?.date ?? today();
  $('#f-details').value = w?.details ?? '';
  $('#f-links').value = (w?.links ?? []).join('\n');
  imgs = [];
  certs = [];
  formErr.textContent = '';
  busy(false);
  drawPreviews();
  formDlg.showModal();
  formDlg.scrollTop = 0;
  if (!w) return;
  busy(true, 'กำลังโหลดรูปเดิม…');
  try {
    [imgs, certs] = await Promise.all([fetchImages(w.id, w.images), fetchImages(w.id, w.certs)]);
  } catch {
    // Keep Save disabled: saving now would delete the photos we failed to load.
    formErr.textContent = 'โหลดรูปเดิมไม่สำเร็จ ปิดหน้าต่างนี้แล้วกดแก้ไขใหม่อีกครั้ง';
    return;
  }
  busy(false);
  drawPreviews();
}
$('#add-work').addEventListener('click', () => openForm());

function drawPreviews() {
  for (const [box, arr, label] of [[$('#prev-images'), imgs, 'รูปภาพ'], [$('#prev-certs'), certs, 'เกียรติบัตร']]) {
    box.replaceChildren(...arr.map((item, i) => {
      const rm = el('button', { type: 'button', textContent: '×' });
      rm.setAttribute('aria-label', `เอา${label}ที่ ${i + 1} ออก`);
      rm.addEventListener('click', () => { arr.splice(i, 1); drawPreviews(); });
      return el('div', { className: 'preview' }, el('img', { src: item.src, alt: `${label}ที่ ${i + 1}` }), rm);
    }));
  }
}

// Shrink photos before upload, stepping down until one fits in a single Firestore document.
async function compress(blob, max, quality) {
  const bmp = await createImageBitmap(blob);
  const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = Object.assign(document.createElement('canvas'), { width: Math.round(bmp.width * s), height: Math.round(bmp.height * s) });
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; // transparent PNGs would turn black as JPEG
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close?.();
  return c.toDataURL('image/jpeg', quality);
}
async function compressToFit(blob) {
  for (const [max, q] of [[1600, 0.82], [1600, 0.7], [1280, 0.7], [1024, 0.65]]) {
    const url = await compress(blob, max, q);
    if (url.length < MAX_DOC_CHARS) return url;
  }
  throw new Error('too big');
}

async function addFiles(input, arr) {
  const files = [...input.files];
  input.value = '';
  busy(true, 'กำลังย่อรูป…');
  const failed = [];
  for (const f of files) {
    try { arr.push({ src: await compressToFit(f) }); } catch { failed.push(f.name); }
  }
  busy(false);
  formErr.textContent = failed.length ? `เปิดไฟล์นี้ไม่ได้: ${failed.join(', ')} ใช้ไฟล์ JPG หรือ PNG แทน` : '';
  drawPreviews();
}
$('#f-images').addEventListener('change', (e) => addFiles(e.target, imgs));
$('#f-certs').addEventListener('change', (e) => addFiles(e.target, certs));

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (saveBtn.disabled) return;
  const title = $('#f-title').value.trim(), date = $('#f-date').value;
  if (!title || !date) {
    formErr.textContent = 'ใส่ชื่อผลงานและวันที่ก่อนบันทึก';
    (title ? $('#f-date') : $('#f-title')).focus();
    shake(form);
    return;
  }
  const links = $('#f-links').value.split('\n').map((s) => s.trim()).filter(Boolean).map(withScheme);
  const bad = links.find((u) => !safeUrl(u));
  if (bad) { formErr.textContent = `ลิงก์นี้ใช้ไม่ได้: ${bad} ลิงก์ต้องขึ้นต้นด้วย http:// หรือ https://`; $('#f-links').focus(); return; }

  const wasEditing = Boolean(editing);
  const workRef = doc(workCol(), workId);
  try {
    // Upload new photos one by one (keeps each request small); kept photos already have a document.
    const upload = async (list) => {
      const ids = [];
      for (const [i, item] of list.entries()) {
        busy(true, `กำลังอัปโหลดรูป ${i + 1}/${list.length}…`);
        if (!item.id) {
          const ref = doc(imgCol(workRef.id));
          await setDoc(ref, { data: item.src });
          item.id = ref.id;
          imageCache.set(ref.id, item.src);
        }
        ids.push(item.id);
      }
      return ids;
    };
    const imageIds = await upload(imgs);
    const certIds = await upload(certs);
    busy(true, 'กำลังบันทึก…');
    const cover = imgs[0]?.src ?? certs[0]?.src;
    const thumb = cover ? await compress(await (await fetch(cover)).blob(), 480, 0.74) : '';
    const data = { title, rank: $('#f-rank').value.trim(), date, details: $('#f-details').value.trim(), links, thumb, images: imageIds, certs: certIds };
    await setDoc(workRef, data);
    // Only after the work points at the new photo list, remove photos that were taken out.
    const keep = new Set([...imageIds, ...certIds]);
    const gone = [...(editing?.images ?? []), ...(editing?.certs ?? [])].filter((id) => !keep.has(id));
    if (gone.length) {
      const batch = writeBatch(db);
      gone.forEach((id) => batch.delete(doc(imgCol(workRef.id), id)));
      await batch.commit();
    }
    const saved = { id: workRef.id, ...data };
    works = wasEditing ? works.map((w) => (w.id === saved.id ? saved : w)) : [...works, saved];
  } catch (err) {
    busy(false);
    formErr.textContent = SAVE_ERRORS[err.code] ?? `บันทึกไม่สำเร็จ (${err.code ?? err.message}) ลองอีกครั้ง`;
    return;
  }
  busy(false);
  formDlg.close();
  render();
  toast(wasEditing ? 'บันทึกการแก้ไขแล้ว' : 'เพิ่มผลงานแล้ว');
});

async function removeWork(w) {
  if (!confirm(`ลบผลงาน “${w.title}” ใช่ไหม? ลบแล้วกู้คืนไม่ได้`)) return;
  try {
    const batch = writeBatch(db);
    [...(w.images ?? []), ...(w.certs ?? [])].forEach((id) => batch.delete(doc(imgCol(w.id), id)));
    batch.delete(doc(workCol(), w.id));
    await batch.commit();
  } catch (err) {
    toast(SAVE_ERRORS[err.code] ?? 'ลบไม่สำเร็จ ลองอีกครั้ง');
    return;
  }
  works = works.filter((x) => x.id !== w.id);
  render();
  toast('ลบผลงานแล้ว');
}

// ---------- Start ----------
async function start() {
  listEl.replaceChildren(el('p', { className: 'empty', textContent: 'กำลังโหลดผลงาน…' }));
  try {
    [works] = await Promise.all([configured ? fetchWorks() : [], restoreAdmin()]);
  } catch {
    const retry = el('button', { type: 'button', className: 'btn btn-small', textContent: 'ลองอีกครั้ง' });
    retry.addEventListener('click', start);
    listEl.replaceChildren(el('div', { className: 'empty' }, el('p', { textContent: 'โหลดผลงานไม่สำเร็จ ตรวจการเชื่อมต่ออินเทอร์เน็ตแล้วลองอีกครั้ง' }), retry));
    return;
  }
  render();
}
start();
