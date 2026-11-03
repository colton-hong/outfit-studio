/* Outfit Studio — app.js
 * Vanilla JS, no build. Implements DESIGN.md against the IDs/classes in index.html.
 * Sections: utils, storage/state, color + scoring engine, ui helpers (toast/modal/dialogs),
 * images, wardrobe, studio, today, rate, shop, settings, init.
 */
(function () {
'use strict';

/* ======================================================================
 * 1. Constants & utilities
 * ==================================================================== */
const KEY = 'outfitStudio.v1';
const CATS = ['top', 'bottom', 'dress', 'outerwear', 'shoes', 'accessory'];
const OCCASIONS = ['casual', 'work', 'date', 'formal', 'athletic', 'travel', 'party'];
const OCC_TARGET = { casual: 2, work: 4, date: 3, formal: 5, athletic: 1, travel: 2, party: 3 };
const VIBES = ['relaxed', 'balanced', 'polished', 'minimal', 'bold'];
const SEASONS = ['spring', 'summer', 'fall', 'winter'];
const FAMILIES = ['black', 'white', 'gray', 'cream', 'tan', 'brown', 'navy', 'red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink'];
const FAMILY_HEX = { black: '#1a1a1a', white: '#f5f5f0', gray: '#8c8c8c', cream: '#ece3cf', tan: '#c2a77d', brown: '#6b4528', navy: '#1f2a44', red: '#b3362c', orange: '#d9822b', yellow: '#e3c13b', green: '#4f7f4a', teal: '#2f8785', blue: '#3f6fb0', purple: '#7a52a0', pink: '#d98fa8' };
const NEUTRALS = new Set(['black', 'white', 'gray', 'cream', 'tan', 'brown', 'navy']);
const HUE = { red: 0, orange: 30, yellow: 55, green: 120, teal: 180, blue: 225, purple: 275, pink: 330 };
const FORMALITY_NAMES = ['', 'Loungewear', 'Casual', 'Smart casual', 'Business', 'Formal'];
const WARMTH_NAMES = ['', 'Light', 'Medium', 'Heavy'];
const WEIGHTS = { color: 30, formality: 25, season: 20, completeness: 15, variety: 10 };
const LABEL = { color: 'Color', formality: 'Formality', season: 'Season', completeness: 'Completeness', variety: 'Variety' };
const SEASON_SETS = {
  all: ['spring', 'summer', 'fall', 'winter'],
  warm: ['spring', 'summer'],
  cool: ['fall', 'winter'],
  mild: ['spring', 'fall'],
  nosummer: ['spring', 'fall', 'winter']
};
const SLOT_HINT = { top: 'Add top', bottom: 'Add bottom', dress: 'Add dress', outerwear: 'Add outerwear', shoes: 'Add shoes', accessory: 'Add accessory' };
const MULTI_SLOTS = new Set(['outerwear', 'accessory']);
const GOOD_THRESHOLD = 70;
const ENUM_CAP = 3000;

const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const pad = n => String(n).padStart(2, '0');
const cap = s => { s = String(s == null ? '' : s); return s.charAt(0).toUpperCase() + s.slice(1); };

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function safeColor(c) { return /^#[0-9a-f]{6}$/i.test(c || '') ? c : '#cccccc'; }
function safePhoto(p) { return typeof p === 'string' && p.startsWith('data:image/') ? p : null; }
function uid(prefix) { return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6).padEnd(4, '0'); }

function isoOf(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function todayISO() { return isoOf(new Date()); }
function parseISO(s) { const p = String(s).split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); }
function daysBetween(a, b) { return Math.round((parseISO(b) - parseISO(a)) / 86400000); }
function seasonOfDate(d) { const m = d.getMonth() + 1; return (m === 12 || m <= 2) ? 'winter' : m <= 5 ? 'spring' : m <= 8 ? 'summer' : 'fall'; }
function weekDays() {
  const t = new Date();
  const dow = (t.getDay() + 6) % 7;
  return Array.from({ length: 7 }, (_, i) => new Date(t.getFullYear(), t.getMonth(), t.getDate() - dow + i));
}
function fmtDay(d, opts) { return d.toLocaleDateString(undefined, opts || { weekday: 'short', month: 'short', day: 'numeric' }); }

function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/* ======================================================================
 * 2. Seed data, state, storage
 * ==================================================================== */
// [name, category, color, seasons, formality, warmth, tags]
const SEED_ITEMS = [
  ['White Oxford Shirt', 'top', '#f5f5f0', 'all', 3, 1, 'cotton,work'],
  ['Grey Tee', 'top', '#9a9a9a', 'all', 2, 1, 'cotton,basic'],
  ['Navy Knit', 'top', '#1f2a44', 'nosummer', 3, 2, 'wool,knit'],
  ['Black Tee', 'top', '#151515', 'all', 2, 1, 'cotton,basic'],
  ['Dark Jeans', 'bottom', '#34476b', 'all', 2, 2, 'denim'],
  ['Khaki Chinos', 'bottom', '#c2a77d', 'all', 3, 1, 'cotton'],
  ['Black Trousers', 'bottom', '#1c1c1c', 'all', 4, 1, 'work'],
  ['Grey Joggers', 'bottom', '#7d7d80', 'all', 1, 2, 'lounge'],
  ['Navy Blazer', 'outerwear', '#1f2d4d', 'nosummer', 4, 2, 'blazer,wool,work'],
  ['Camel Coat', 'outerwear', '#b98b5a', 'cool', 4, 3, 'wool,coat'],
  ['White Sneakers', 'shoes', '#f1f1ee', 'all', 2, 1, 'leather,sneakers'],
  ['Brown Loafers', 'shoes', '#5b3a24', 'all', 4, 1, 'leather,loafers'],
  ['Black Boots', 'shoes', '#1a1a1a', 'nosummer', 3, 2, 'leather,boots'],
  ['Brown Leather Belt', 'accessory', '#6b4528', 'all', 3, 1, 'leather,belt']
];

// [name, category, color, seasons, formality, warmth, tags]
const CATALOG = [
  ['White Tee', 'top', '#f6f6f2', 'all', 2, 1, 'cotton,basic'],
  ['Black Tee', 'top', '#151515', 'all', 2, 1, 'cotton,basic'],
  ['Breton Striped Shirt', 'top', '#e8e6df', 'mild', 2, 1, 'cotton,stripes'],
  ['Light Blue Oxford', 'top', '#a9c1dc', 'all', 3, 1, 'cotton,work'],
  ['Navy Polo', 'top', '#1f2a44', 'warm', 2, 1, 'cotton,polo'],
  ['Cream Knit', 'top', '#e9dfc9', 'cool', 3, 2, 'wool,knit'],
  ['Grey Crewneck Sweater', 'top', '#8f8f93', 'cool', 2, 2, 'wool,knit'],
  ['Olive Henley', 'top', '#6b7a3f', 'mild', 2, 1, 'cotton'],
  ['Burgundy Sweater', 'top', '#6e2233', 'cool', 3, 2, 'wool,knit'],
  ['Linen Shirt', 'top', '#ece6d8', 'warm', 2, 1, 'linen'],
  ['Denim Shirt', 'top', '#4d6a94', 'mild', 2, 1, 'denim'],
  ['Crisp Dress Shirt', 'top', '#f7f7f4', 'all', 4, 1, 'cotton,formal'],
  ['Dark Jeans', 'bottom', '#34476b', 'all', 2, 2, 'denim'],
  ['Light Jeans', 'bottom', '#7f9cc4', 'all', 2, 2, 'denim'],
  ['Black Jeans', 'bottom', '#1c1c1c', 'all', 2, 2, 'denim'],
  ['Khaki Chinos', 'bottom', '#c2a77d', 'all', 3, 1, 'cotton'],
  ['Grey Wool Trousers', 'bottom', '#6f6f74', 'cool', 4, 2, 'wool,work'],
  ['Black Trousers', 'bottom', '#1c1c1c', 'all', 4, 1, 'work'],
  ['Olive Chinos', 'bottom', '#5d6340', 'mild', 3, 1, 'cotton'],
  ['Navy Shorts', 'bottom', '#1f2a44', 'warm', 2, 1, 'cotton,shorts'],
  ['Grey Joggers', 'bottom', '#7d7d80', 'all', 1, 2, 'lounge'],
  ['Black Midi Dress', 'dress', '#171717', 'all', 4, 1, 'evening'],
  ['Floral Summer Dress', 'dress', '#d98fa0', 'warm', 2, 1, 'summer'],
  ['Navy Wrap Dress', 'dress', '#1f2d4d', 'mild', 3, 1, 'work'],
  ['Linen Shirt Dress', 'dress', '#d9cdb4', 'warm', 2, 1, 'linen'],
  ['Navy Blazer', 'outerwear', '#1f2d4d', 'nosummer', 4, 2, 'blazer,wool,work'],
  ['Black Leather Jacket', 'outerwear', '#161616', 'mild', 3, 2, 'leather'],
  ['Camel Coat', 'outerwear', '#b98b5a', 'cool', 4, 3, 'wool,coat'],
  ['Denim Jacket', 'outerwear', '#4d6a94', 'mild', 2, 2, 'denim'],
  ['Grey Overcoat', 'outerwear', '#6a6a70', 'cool', 4, 3, 'wool,coat'],
  ['Black Puffer Jacket', 'outerwear', '#1b1b1b', 'cool', 1, 3, 'puffer,warm'],
  ['Tan Trench Coat', 'outerwear', '#c8aa7d', 'mild', 3, 2, 'trench,rain'],
  ['White Sneakers', 'shoes', '#f1f1ee', 'all', 2, 1, 'leather,sneakers'],
  ['Black Sneakers', 'shoes', '#1a1a1a', 'all', 2, 1, 'sneakers'],
  ['Brown Loafers', 'shoes', '#5b3a24', 'all', 4, 1, 'leather,loafers'],
  ['Black Boots', 'shoes', '#1a1a1a', 'nosummer', 3, 2, 'leather,boots'],
  ['Brown Chelsea Boots', 'shoes', '#6b4528', 'nosummer', 3, 2, 'suede,boots'],
  ['Black Oxford Shoes', 'shoes', '#161616', 'all', 5, 1, 'leather,formal'],
  ['Tan Sandals', 'shoes', '#c2a77d', 'warm', 1, 1, 'sandals,summer'],
  ['Brown Leather Belt', 'accessory', '#6b4528', 'all', 3, 1, 'leather,belt'],
  ['Black Leather Belt', 'accessory', '#161616', 'all', 4, 1, 'leather,belt'],
  ['Grey Wool Scarf', 'accessory', '#8a8a90', 'cool', 2, 2, 'wool,scarf'],
  ['Silk Scarf', 'accessory', '#b3362c', 'mild', 3, 1, 'silk,scarf'],
  ['Steel Watch', 'accessory', '#a8a8ac', 'all', 3, 1, 'watch'],
  ['Black Beanie', 'accessory', '#1a1a1a', 'cool', 1, 2, 'wool,hat']
];

function mkItem(t, source) {
  return {
    id: uid('itm'), name: t[0], category: t[1], color: t[2], colorFamily: familyOf(t[2]),
    seasons: SEASON_SETS[t[3]].slice(), formality: t[4], warmth: t[5],
    tags: t[6] ? t[6].split(',') : [], notes: '', photo: null, source: source || 'seed', createdAt: Date.now()
  };
}

function defaultState() {
  return {
    version: 1, items: [], outfits: [], folders: [], calendar: {}, wearLog: {}, wishlist: [],
    prefs: { units: 'C', defaultVibe: 'balanced', todayTime: '08:00', lastContext: { occasion: 'casual', temp: 18, vibe: 'balanced' } },
    seeded: false
  };
}
function seedState() {
  const s = defaultState();
  s.items = SEED_ITEMS.map(t => mkItem(t, 'seed'));
  s.seeded = true;
  return s;
}

function normalizeItem(r) {
  if (!r || typeof r !== 'object') return null;
  const color = safeColor(r.color);
  const category = CATS.includes(r.category) ? r.category : 'top';
  const seasons = Array.isArray(r.seasons) ? r.seasons.filter(s => SEASONS.includes(s)) : SEASONS.slice();
  const out = {
    id: typeof r.id === 'string' && r.id ? r.id : uid('itm'),
    name: String(r.name == null ? 'Untitled' : r.name).slice(0, 60) || 'Untitled',
    category, color,
    colorFamily: FAMILIES.includes(r.colorFamily) ? r.colorFamily : familyOf(color),
    seasons: seasons.length ? seasons : SEASONS.slice(),
    formality: clamp(Math.round(Number(r.formality)) || 3, 1, 5),
    warmth: clamp(Math.round(Number(r.warmth)) || 1, 1, 3),
    tags: Array.isArray(r.tags) ? r.tags.map(t => String(t).trim().toLowerCase()).filter(Boolean).slice(0, 20) : [],
    notes: String(r.notes || '').slice(0, 300),
    photo: safePhoto(r.photo),
    source: ['seed', 'upload', 'rate'].includes(r.source) ? r.source : 'upload',
    createdAt: Number(r.createdAt) || Date.now()
  };
  // optional cut-out fields (older items have neither)
  const po = safePhoto(r.photoOriginal);
  if (out.photo && r.cutout === true) { out.cutout = true; if (po) out.photoOriginal = po; }
  return out;
}

function normalizeState(raw) {
  const s = defaultState();
  if (!raw || typeof raw !== 'object') return null;
  s.items = (Array.isArray(raw.items) ? raw.items : []).map(normalizeItem).filter(Boolean);
  const ids = new Set(s.items.map(i => i.id));
  s.folders = (Array.isArray(raw.folders) ? raw.folders : []).filter(f => f && typeof f.id === 'string').map(f => ({ id: f.id, name: String(f.name || 'Folder').slice(0, 40), createdAt: Number(f.createdAt) || Date.now() }));
  const fids = new Set(s.folders.map(f => f.id));
  s.outfits = (Array.isArray(raw.outfits) ? raw.outfits : []).filter(o => o && typeof o.id === 'string').map(o => {
    const slots = emptySlots();
    CATS.forEach(c => { slots[c] = Array.isArray(o.slots && o.slots[c]) ? o.slots[c].filter(id => ids.has(id)) : []; });
    return {
      id: o.id, name: String(o.name || 'Outfit').slice(0, 60),
      occasion: OCCASIONS.includes(o.occasion) ? o.occasion : 'casual',
      slots, folderId: fids.has(o.folderId) ? o.folderId : null,
      score: clamp(Math.round(Number(o.score)) || 0, 0, 100), createdAt: Number(o.createdAt) || Date.now()
    };
  }).filter(o => CATS.some(c => o.slots[c].length));
  const oids = new Set(s.outfits.map(o => o.id));
  if (raw.calendar && typeof raw.calendar === 'object') {
    Object.keys(raw.calendar).forEach(k => { if (/^\d{4}-\d{2}-\d{2}$/.test(k) && oids.has(raw.calendar[k])) s.calendar[k] = raw.calendar[k]; });
  }
  if (raw.wearLog && typeof raw.wearLog === 'object') {
    Object.keys(raw.wearLog).forEach(k => { if (ids.has(k) && /^\d{4}-\d{2}-\d{2}$/.test(raw.wearLog[k])) s.wearLog[k] = raw.wearLog[k]; });
  }
  s.wishlist = (Array.isArray(raw.wishlist) ? raw.wishlist : []).filter(w => w && typeof w === 'object').map(w => ({
    id: typeof w.id === 'string' ? w.id : uid('wsh'), name: String(w.name || 'Piece').slice(0, 60),
    category: CATS.includes(w.category) ? w.category : 'top', color: safeColor(w.color),
    formality: clamp(Math.round(Number(w.formality)) || 3, 1, 5), warmth: clamp(Math.round(Number(w.warmth)) || 1, 1, 3),
    addedAt: Number(w.addedAt) || Date.now()
  }));
  const p = raw.prefs || {};
  s.prefs.units = p.units === 'F' ? 'F' : 'C';
  s.prefs.defaultVibe = VIBES.includes(p.defaultVibe) ? p.defaultVibe : 'balanced';
  s.prefs.todayTime = /^\d{2}:\d{2}$/.test(p.todayTime || '') ? p.todayTime : '08:00';
  const lc = p.lastContext || {};
  s.prefs.lastContext = {
    occasion: OCCASIONS.includes(lc.occasion) ? lc.occasion : 'casual',
    temp: clamp(Math.round(Number(lc.temp)) || 18, -10, 40),
    vibe: VIBES.includes(lc.vibe) ? lc.vibe : s.prefs.defaultVibe
  };
  if (typeof lc.temp === 'number' && lc.temp === 0) s.prefs.lastContext.temp = 0;
  s.seeded = !!raw.seeded;
  return s;
}

let state = defaultState();
let storageWarned = false;

function readStorage() {
  let raw = null;
  try {
    raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    try { if (raw) localStorage.setItem(KEY + '.backup', raw); } catch (e2) { /* ignore */ }
    return null;
  }
}
function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); return true; }
  catch (e) {
    if (!storageWarned) {
      storageWarned = true;
      toast('Could not save: storage is full or blocked. Try removing photos.', true);
      setTimeout(() => { storageWarned = false; }, 8000);
    }
    return false;
  }
}

function emptySlots() { return { top: [], bottom: [], dress: [], outerwear: [], shoes: [], accessory: [] }; }
function copySlots(s) { const o = emptySlots(); CATS.forEach(c => { o[c] = (s && s[c] ? s[c] : []).slice(); }); return o; }
function getItem(id) { return state.items.find(i => i.id === id) || null; }
function itemsOfSlots(slots) {
  const out = [];
  CATS.forEach(c => (slots[c] || []).forEach(id => { const it = getItem(id); if (it) out.push(it); }));
  return out;
}
function slotsFromItems(items) {
  const s = emptySlots();
  items.forEach(i => { if (!s[i.category].includes(i.id)) s[i.category].push(i.id); });
  return s;
}
function slotCount(slots) { return CATS.reduce((n, c) => n + (slots[c] || []).length, 0); }

/* ======================================================================
 * 3. Color system + scoring engine (DESIGN sections 2 and 3)
 * ==================================================================== */
function hexToHsl(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  const v = m ? m[1] : 'cccccc';
  const r = parseInt(v.slice(0, 2), 16) / 255, g = parseInt(v.slice(2, 4), 16) / 255, b = parseInt(v.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (d > 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === r) h = ((g - b) / d) % 6; else if (max === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360;
  }
  return { h, s, l };
}
function rgbToHex(r, g, b) { return '#' + [r, g, b].map(x => pad(Math.round(clamp(x, 0, 255)).toString(16))).join(''); }

function familyOf(hex) {
  const { h, s, l } = hexToHsl(hex);
  if (l < 0.12) return 'black';
  if (l > 0.92 && s < 0.25) return 'white';
  if (s < 0.12) return 'gray';
  if (s < 0.45 && l > 0.72 && h >= 25 && h <= 60) return 'cream';
  if (h >= 15 && h <= 45 && l < 0.45 && s < 0.7) return 'brown';
  if (h >= 25 && h <= 50 && s < 0.5 && l >= 0.45) return 'tan';
  if (h >= 215 && h <= 250 && l < 0.25) return 'navy';
  if (h >= 345 || h < 15) return 'red';
  if (h < 45) return 'orange';
  if (h < 70) return 'yellow';
  if (h < 165) return 'green';
  if (h < 200) return 'teal';
  if (h < 255) return 'blue';
  if (h < 300) return 'purple';
  return 'pink';
}

function colorInfo(item) {
  const fam = item.colorFamily || familyOf(item.color);
  let neutral = NEUTRALS.has(fam);
  if (!neutral && fam === 'blue') { const hsl = hexToHsl(item.color); if (hsl.l < 0.4 && hsl.s < 0.55) neutral = true; }
  return { fam, neutral, hue: HUE[fam] };
}
function toInfo(x) { return typeof x === 'string' ? { fam: x, neutral: NEUTRALS.has(x), hue: HUE[x] } : x; }

function pairScore(a, b) {
  a = toInfo(a); b = toInfo(b);
  if (a.neutral && b.neutral) {
    const k = [a.fam, b.fam].sort().join('+');
    if (k === 'black+brown' || k === 'black+navy') return 0.75;
    if (k === 'brown+navy') return 0.85;
    return 0.95;
  }
  if (a.neutral || b.neutral) {
    const n = a.neutral ? a : b;
    return (n.fam === 'navy' || n.fam === 'brown' || n.fam === 'blue') ? 0.85 : 0.90;
  }
  if (a.fam === b.fam) return 0.80;
  let diff = Math.abs(a.hue - b.hue); if (diff > 180) diff = 360 - diff;
  if (diff <= 40) return 0.90;
  if (diff >= 165) return 0.80;
  if (diff >= 135) return 0.65;
  if (diff >= 105) return 0.55;
  return 0.40;
}

function fmtTemp(c) {
  if (state.prefs.units === 'F') return Math.round(c * 9 / 5 + 32) + '°F';
  return Math.round(c) + '°C';
}
function idealWarmth(t) { return t <= 5 ? 3 : t <= 14 ? 2.5 : t <= 21 ? 2 : t <= 27 ? 1.3 : 1; }

function colorComp(items, ctx) {
  const vis = items.filter(i => i.category !== 'accessory');
  if (!vis.length) return { value: 0.7, reasons: ['no clothing pieces yet, neutral baseline'], tips: [] };
  const infos = vis.map(colorInfo);
  if (vis.length === 1) return { value: 0.7, reasons: ['single piece (' + infos[0].fam + '), neutral baseline'], tips: [] };
  let sum = 0, n = 0, worst = null;
  for (let i = 0; i < vis.length; i++) for (let j = i + 1; j < vis.length; j++) {
    const s = pairScore(infos[i], infos[j]); sum += s; n++;
    if (!worst || s < worst.s) worst = { s, i, j };
  }
  let v = sum / n;
  const chrom = new Set(infos.filter(x => !x.neutral).map(x => x.fam));
  const nChrom = chrom.size;
  const famList = Array.from(new Set(infos.map(x => x.fam)));
  const reasons = [], tips = [];
  if (nChrom === 0) reasons.push(famList.join(', ') + ' are all neutrals');
  else if (nChrom === 1 && infos.some(x => x.neutral)) { v += 0.05; reasons.push('one ' + Array.from(chrom)[0] + ' accent over neutrals'); }
  else if (nChrom === 1) reasons.push('monochrome ' + Array.from(chrom)[0]);
  else if (nChrom === 2) reasons.push(Array.from(chrom).join(' with ') + ' paired');
  else {
    v -= 0.25; reasons.push(nChrom + ' bright colors (' + Array.from(chrom).join(', ') + ') compete');
    const loud = vis.find((x, k) => !infos[k].neutral);
    tips.push('Too many bright colors. Swap ' + (loud ? loud.name : 'one piece') + ' for a neutral like navy, white or gray.');
  }
  if (ctx && ctx.vibe === 'bold' && nChrom === 1) v += 0.05;
  if (ctx && ctx.vibe === 'minimal' && nChrom === 0) v += 0.05;
  if (worst.s < 0.6) {
    const a = vis[worst.i], b = vis[worst.j];
    reasons.push('weakest pairing: ' + infos[worst.i].fam + ' + ' + infos[worst.j].fam + ' (' + Math.round(worst.s * 100) + '%)');
    const swap = !infos[worst.i].neutral ? a : b;
    tips.push(a.name + ' and ' + b.name + ' clash. Swap ' + swap.name + ' for a neutral like navy, white or gray.');
  }
  return { value: clamp(v, 0, 1), reasons, tips };
}

function formalityComp(items, ctx) {
  const app = items.filter(i => i.category !== 'accessory');
  if (!app.length) return { value: 0.7, reasons: ['no clothing pieces yet'], tips: [] };
  const f = app.map(i => i.formality);
  const mx = Math.max.apply(null, f), mn = Math.min.apply(null, f), spread = mx - mn;
  const coherence = clamp(1 - 0.25 * spread, 0, 1);
  const reasons = [], tips = [];
  reasons.push(spread === 0 ? 'all pieces at level ' + f[0] : 'pieces span levels ' + mn + '–' + mx);
  let value = coherence;
  const sorted = f.slice().sort((a, b) => a - b);
  const median = sorted[Math.floor((sorted.length - 1) / 2)];
  if (typeof ctx.target === 'number') {
    const mean = f.reduce((a, b) => a + b, 0) / f.length;
    const fit = clamp(1 - 0.3 * Math.abs(mean - ctx.target), 0, 1);
    value = 0.5 * coherence + 0.5 * fit;
    reasons.push('average level ' + mean.toFixed(1) + ' vs ' + ctx.target + ' for ' + (ctx.occasion || 'the occasion'));
    if (Math.abs(mean - ctx.target) >= 1) tips.push('Aim ' + (mean < ctx.target ? 'dressier' : 'more casual') + ' (around level ' + ctx.target + ') for ' + (ctx.occasion || 'this occasion') + '.');
  }
  if (spread >= 2) {
    let far = app[0];
    app.forEach(i => { if (Math.abs(i.formality - median) > Math.abs(far.formality - median)) far = i; });
    tips.push('Swap ' + far.name + ' for something closer to level ' + median + '.');
  }
  return { value: clamp(value, 0, 1), reasons, tips };
}

function seasonComp(items, ctx) {
  const season = ctx.season || seasonOfDate(new Date());
  if (!items.length) return { value: 0.7, reasons: ['no pieces yet'], tips: [] };
  const match = items.filter(i => (i.seasons || []).includes(season));
  const share = match.length / items.length;
  const reasons = [share === 1 ? 'every piece works for ' + season : match.length + ' of ' + items.length + ' pieces suit ' + season];
  const tips = [];
  const off = items.find(i => !(i.seasons || []).includes(season));
  if (off) tips.push(off.name + ' is not tagged for ' + season + '. Swap it for a ' + season + '-friendly piece.');
  let v = share;
  if (typeof ctx.temp === 'number') {
    const t = ctx.temp, ideal = idealWarmth(t);
    const core = items.filter(i => i.category === 'top' || i.category === 'dress' || i.category === 'bottom');
    const coreW = core.length ? core.reduce((a, i) => a + i.warmth, 0) / core.length : 1;
    const outs = items.filter(i => i.category === 'outerwear');
    const outW = outs.length ? Math.max.apply(null, outs.map(i => i.warmth)) : 0;
    const ow = Math.min(3, coreW + 0.75 * outW);
    const fit = clamp(1 - 0.45 * Math.abs(ow - ideal), 0, 1);
    v = 0.5 * share + 0.5 * fit;
    reasons.push('warmth ' + ow.toFixed(1) + ' vs ideal ' + ideal + ' at ' + fmtTemp(t));
    if (t <= 5 && !outs.length) { v *= 0.6; tips.push('It is ' + fmtTemp(t) + '. Add outerwear.'); }
    else if (fit < 0.7 && ow < ideal) tips.push('Add a warmer layer for ' + fmtTemp(t) + '.');
    const heavy = items.find(i => i.category !== 'accessory' && i.warmth >= 3);
    if (t >= 27 && heavy) { v *= 0.5; tips.push('Swap ' + heavy.name + ' for something lighter in ' + fmtTemp(t) + ' heat.'); }
    else if (fit < 0.7 && ow > ideal) tips.push('Go lighter for ' + fmtTemp(t) + '.');
  }
  return { value: clamp(v, 0, 1), reasons, tips };
}

function completeComp(items) {
  const has = c => items.some(i => i.category === c);
  const dress = has('dress'), top = has('top'), bottom = has('bottom'), shoes = has('shoes'), outer = has('outerwear'), acc = has('accessory');
  let base = dress ? (shoes ? 1 : 0) * 0.4 + 0.6 : (top ? 0.35 : 0) + (bottom ? 0.35 : 0) + (shoes ? 0.2 : 0);
  let value = base + (outer ? 0.05 : 0) + (acc ? 0.05 : 0) - ((dress && (top || bottom)) ? 0.2 : 0);
  value = clamp(value, 0, 1);
  const missing = [], tips = [];
  if (dress) { if (!shoes) missing.push('shoes'); }
  else { if (!top) missing.push('top'); if (!bottom) missing.push('bottom'); if (!shoes) missing.push('shoes'); }
  missing.forEach(m => tips.push(m === 'shoes' ? 'Add shoes.' : 'Add a ' + m + '.'));
  if (dress && (top || bottom)) tips.push('Pick either a dress or a top and bottom, not both.');
  if (!missing.length && !(dress && (top || bottom)) && !(outer && acc)) tips.push('Add ' + (outer ? 'an accessory' : acc ? 'an outerwear layer' : 'outerwear or an accessory') + ' to finish the look.');
  const present = ['dress', 'top', 'bottom', 'outerwear', 'shoes', 'accessory'].filter(has);
  const reasons = [missing.length ? 'missing ' + missing.join(', ') + (present.length ? ' (has ' + present.join(', ') + ')' : '') : 'complete: ' + present.join(', ')];
  return { value, reasons, tips };
}

function varietyComp(items, ctx) {
  const app = items.filter(i => i.category !== 'accessory');
  if (!app.length) return { value: 0.7, reasons: ['no pieces yet'], tips: [] };
  const today = ctx.today || todayISO(), log = ctx.wearLog || {};
  let sum = 0, recent = null, recentDays = 99;
  app.forEach(i => {
    const days = log[i.id] ? Math.max(0, daysBetween(log[i.id], today)) : 30;
    sum += Math.min(days, 14) / 14;
    if (days < recentDays) { recentDays = days; recent = i; }
  });
  const v = sum / app.length;
  const reasons = [recentDays >= 14 ? 'all pieces are fresh (not worn in 14+ days)' : recent.name + ' was worn ' + (recentDays === 0 ? 'today' : recentDays + ' day' + (recentDays === 1 ? '' : 's') + ' ago')];
  const tips = recentDays <= 3 ? [recent.name + ' was worn ' + (recentDays === 0 ? 'today' : recentDays + ' day(s) ago') + '. Rotate in something fresher.'] : [];
  return { value: v, reasons, tips };
}

function scoreOutfit(items, ctx) {
  ctx = ctx || {};
  const active = ctx.active || (ctx.includeVariety ? ['color', 'formality', 'season', 'completeness', 'variety'] : ['color', 'formality', 'season', 'completeness']);
  const fns = { color: colorComp, formality: formalityComp, season: seasonComp, completeness: completeComp, variety: varietyComp };
  let sum = 0, wsum = 0;
  const breakdown = {}, tipsAll = [];
  active.forEach(k => {
    const r = fns[k](items, ctx), w = WEIGHTS[k], pts = r.value * w;
    sum += pts; wsum += w;
    const p = Math.round(pts);
    breakdown[k] = {
      key: k, label: LABEL[k], value: r.value, points: p, max: w,
      reasons: r.reasons.map((s, i) => i === 0 ? LABEL[k] + ' ' + p + '/' + w + ': ' + s : s), tips: r.tips
    };
    r.tips.forEach(t => tipsAll.push({ t, loss: w * (1 - r.value) }));
  });
  const raw = wsum ? sum / wsum * 100 : 0;
  tipsAll.sort((a, b) => b.loss - a.loss);
  return { total: Math.round(raw), raw, breakdown, active, tips: Array.from(new Set(tipsAll.map(x => x.t))), items };
}

function studioCtx() { return { season: seasonOfDate(new Date()), includeVariety: false }; }
const AGNOSTIC = { active: ['color', 'formality', 'completeness'] };

function scoreClass(n) { return n >= 75 ? 'is-high' : n >= 55 ? 'is-mid' : 'is-low'; }

/* Cartesian enumeration with a cap; samples uniformly when the space is larger than cap. */
function combos(lists, capN, rnd) {
  const sizes = lists.map(l => l.length);
  let N = 1;
  for (let k = 0; k < sizes.length; k++) { if (sizes[k] === 0) return []; N *= sizes[k]; }
  const decode = idx => {
    const out = new Array(lists.length);
    for (let k = lists.length - 1; k >= 0; k--) { out[k] = lists[k][idx % sizes[k]]; idx = Math.floor(idx / sizes[k]); }
    return out;
  };
  const res = [];
  if (N <= capN) { for (let i = 0; i < N; i++) res.push(decode(i)); }
  else {
    const seen = new Set(); let guard = 0;
    while (res.length < capN && guard < capN * 4) {
      guard++;
      const i = Math.floor(rnd() * N);
      if (seen.has(i)) continue;
      seen.add(i); res.push(decode(i));
    }
  }
  return res;
}

/* ======================================================================
 * 4. UI helpers: toast, modals, dialogs, rendering fragments
 * ==================================================================== */
function toast(msg, isError) {
  const reg = $('#toasts'); if (!reg) return;
  const el = document.createElement('div');
  el.className = 'toast' + (isError ? ' is-error' : '');
  el.textContent = msg;
  reg.appendChild(el);
  setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, isError ? 4200 : 2400);
}

let confirmResolve = null, promptResolve = null;
function openModal(id) { const m = $('#' + id); if (!m) return; m.hidden = false; document.body.style.overflow = 'hidden'; }
function closeModal(id) {
  const m = $('#' + id); if (!m || m.hidden) return;
  m.hidden = true;
  if (!$$('.sheet-backdrop:not([hidden])').length) document.body.style.overflow = '';
  if (id === 'confirm-modal' && confirmResolve) { const r = confirmResolve; confirmResolve = null; r(false); }
  if (id === 'prompt-modal' && promptResolve) { const r = promptResolve; promptResolve = null; r(null); }
}
function confirmDialog(title, text, okLabel) {
  return new Promise(res => {
    if (confirmResolve) { const old = confirmResolve; confirmResolve = null; old(false); }
    $('#confirm-title').textContent = title;
    $('#confirm-text').textContent = text;
    $('#confirm-ok').textContent = okLabel || 'Confirm';
    confirmResolve = res;
    openModal('confirm-modal');
    $('#confirm-cancel').focus();
  });
}
function promptDialog(title, value) {
  return new Promise(res => {
    if (promptResolve) { const old = promptResolve; promptResolve = null; old(null); }
    $('#prompt-title').textContent = title;
    const inp = $('#prompt-input'); inp.value = value || '';
    promptResolve = res;
    openModal('prompt-modal');
    inp.focus(); inp.select();
  });
}

function thumbHtml(it) {
  const p = safePhoto(it.photo);
  return '<div class="thumb' + (p ? ' has-photo' : '') + '">' + (p ? '<img src="' + esc(p) + '" alt="">' : '<div class="thumb-swatch" data-cat="' + esc(it.category) + '" style="--item-color:' + safeColor(it.color) + '"></div>') + '</div>';
}
function dotsHtml(n) { let s = '<span class="dots" title="Formality ' + n + '">'; for (let i = 1; i <= 5; i++) s += '<i' + (i <= n ? ' class="on"' : '') + '></i>'; return s + '</span>'; }
function itemCardHtml(it, extraClass, attrs) {
  const fam = it.colorFamily || familyOf(it.color);
  return '<button type="button" class="item-card' + (extraClass ? ' ' + extraClass : '') + '" ' + (attrs || '') + '>' + thumbHtml(it) +
    '<div class="item-meta"><span class="item-name">' + esc(it.name) + '</span>' +
    '<span class="item-sub"><span><i class="swatch" style="width:11px;height:11px;vertical-align:-1px;margin-right:4px;background:' + safeColor(it.color) + '"></i>' + esc(fam) + '</span>' + dotsHtml(it.formality) + '</span></div></button>';
}
function stackRowHtml(items) {
  return '<div class="stack-row">' + items.map(i => '<div class="stack-item">' + thumbHtml(i) + '<div class="stack-name">' + esc(i.name) + '</div></div>').join('') + '</div>';
}
function miniStackHtml(items) {
  const list = items.slice(0, 4);
  return '<div class="mini-stack' + (list.length === 1 ? ' single' : '') + '">' + list.map(i => {
    const p = safePhoto(i.photo);
    return '<div class="mini' + (p ? ' has-photo' : '') + '" style="--item-color:' + safeColor(i.color) + '">' + (p ? '<img src="' + esc(p) + '" alt="">' : '') + '</div>';
  }).join('') + '</div>';
}
function badgeHtml(n, small) { return '<span class="score-badge' + (small ? ' score-badge-sm' : '') + ' ' + scoreClass(n) + '"><span class="score-num">' + n + '</span><span class="score-max">/100</span></span>'; }
function breakdownHtml(result, keys) {
  return keys.filter(k => result.breakdown[k]).map(k => {
    const b = result.breakdown[k];
    const cls = b.value >= 0.75 ? ' is-high' : b.value < 0.5 ? ' is-low' : '';
    return '<div class="bar-row"><div class="bar-top"><span class="bar-name">' + esc(b.label) + '</span><span class="bar-pts">' + b.points + '/' + b.max + '</span></div>' +
      '<div class="bar"><div class="bar-fill' + cls + '" style="width:' + Math.round(b.value * 100) + '%"></div></div>' +
      '<div class="reasons">' + b.reasons.map(esc).join('<br>') + '</div></div>';
  }).join('');
}
function listHtml(arr) { return arr.map(t => '<li>' + esc(t) + '</li>').join(''); }
function barRowHtml(name, frac, val) {
  return '<div class="balance-row"><span>' + esc(name) + '</span><div class="bar"><div class="bar-fill" style="width:' + Math.round(clamp(frac, 0, 1) * 100) + '%"></div></div><span class="bar-pts">' + esc(val) + '</span></div>';
}
function emptyHtml(title, text, buttons) {
  return '<strong>' + esc(title) + '</strong>' + (text ? '<span>' + esc(text) + '</span>' : '') + (buttons || '');
}

/* ======================================================================
 * 5. Image processing (photo -> 600px JPEG data URL + sampled color)
 * ==================================================================== */
function processImage(file) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\//.test(file.type || '')) { reject(new Error('Not an image')); return; }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const max = 600, w0 = img.naturalWidth || img.width, h0 = img.naturalHeight || img.height;
        const sc = Math.min(1, max / Math.max(w0, h0));
        const w = Math.max(1, Math.round(w0 * sc)), h = Math.max(1, Math.round(h0 * sc));
        const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
        const cx = cv.getContext('2d');
        cx.fillStyle = '#ffffff'; cx.fillRect(0, 0, w, h);
        cx.drawImage(img, 0, 0, w, h);
        let color = '#cccccc';
        try {
          const rw = Math.max(1, Math.round(w * 0.4)), rh = Math.max(1, Math.round(h * 0.4));
          const d = cx.getImageData(Math.round((w - rw) / 2), Math.round((h - rh) / 2), rw, rh).data;
          let r = 0, g = 0, b = 0, n = 0;
          for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
          if (n) color = rgbToHex(r / n, g / n, b / n);
        } catch (e) { /* tainted or unsupported: keep default */ }
        URL.revokeObjectURL(url);
        resolve({ dataUrl: cv.toDataURL('image/jpeg', 0.8), color, canvas: cv });
      } catch (e) { URL.revokeObjectURL(url); reject(e); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read image')); };
    img.src = url;
  });
}

/* ---- Background removal: pure core (DOM-free; extract between the BEGIN/END markers to unit-test in Node) ---- */
/* BEGIN-SEGMENTATION-CORE */
function segMedian(arr) {
  if (!arr.length) return 0;
  const a = Array.from(arr).sort((x, y) => x - y), m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}
function segHex(r, g, b) {
  return '#' + [r, g, b].map(x => { const v = Math.max(0, Math.min(255, Math.round(x))); return (v < 16 ? '0' : '') + v.toString(16); }).join('');
}
function segmentForeground(data, w, h, opts) {
  const tScale = (opts && Number(opts.thresholdScale) > 0) ? Number(opts.thresholdScale) : 1;
  const n = w * h;
  const mask = new Uint8Array(n);
  if (!(w > 0 && h > 0) || !data || data.length < n * 4) return { mask, fgRatio: 0 };
  // 1. background color = median of the four edges' per-edge median colors
  const edgeCols = [];
  const edge = idxs => {
    const R = [], G = [], B = [];
    idxs.forEach(p => { R.push(data[p * 4]); G.push(data[p * 4 + 1]); B.push(data[p * 4 + 2]); });
    edgeCols.push([segMedian(R), segMedian(G), segMedian(B)]);
  };
  const top = [], bot = [], lef = [], rig = [];
  for (let x = 0; x < w; x++) { top.push(x); bot.push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { lef.push(y * w); rig.push(y * w + w - 1); }
  edge(top); edge(bot); edge(lef); edge(rig);
  const bg = [0, 1, 2].map(c => segMedian(edgeCols.map(e => e[c])));
  const dist = p => {
    const dr = data[p * 4] - bg[0], dg = data[p * 4 + 1] - bg[1], db = data[p * 4 + 2] - bg[2];
    return Math.sqrt(dr * dr + dg * dg + db * db);
  };
  // 2. adaptive threshold from how noisy the border itself is
  const bd = [];
  [top, bot, lef, rig].forEach(e => e.forEach(p => bd.push(dist(p))));
  bd.sort((a, b) => a - b);
  const p90 = bd[Math.min(bd.length - 1, Math.floor(bd.length * 0.9))];
  const thr = Math.max(26, Math.min(80, p90 * 1.6 + 14)) * tScale;
  // 3. flood fill from border through background-like pixels
  const like = new Uint8Array(n);
  for (let p = 0; p < n; p++) like[p] = dist(p) <= thr ? 1 : 0;
  const floodFromBorder = (passable) => {
    const seen = new Uint8Array(n), stack = new Int32Array(n);
    let sp = 0;
    const push = p => { if (!seen[p] && passable(p)) { seen[p] = 1; stack[sp++] = p; } };
    for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
    for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
    while (sp) {
      const p = stack[--sp], x = p % w;
      if (x > 0) push(p - 1);
      if (x < w - 1) push(p + 1);
      if (p >= w) push(p - w);
      if (p < n - w) push(p + w);
    }
    return seen;
  };
  let bgConn = floodFromBorder(p => like[p] === 1);
  // foreground = everything not reachable from the edge (this also fills interior holes)
  for (let p = 0; p < n; p++) mask[p] = bgConn[p] ? 0 : 255;
  // 4. one pass of 3x3 majority filter, then re-fill any holes it opened
  const maj = new Uint8Array(n);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let c = 0;
    for (let dy = -1; dy <= 1; dy++) {
      const yy = y + dy; if (yy < 0 || yy >= h) continue;
      for (let dx = -1; dx <= 1; dx++) { const xx = x + dx; if (xx >= 0 && xx < w && mask[yy * w + xx]) c++; }
    }
    maj[y * w + x] = c >= 5 ? 255 : 0;
  }
  bgConn = floodFromBorder(p => maj[p] === 0);
  let fg = 0;
  for (let p = 0; p < n; p++) { mask[p] = bgConn[p] ? 0 : 255; if (mask[p]) fg++; }
  return { mask, fgRatio: fg / n };
}
function dominantColor(data, w, h, mask) {
  const R = [], G = [], B = [];
  const collect = interiorOnly => {
    const step = Math.max(1, Math.floor((w * h) / 20000));
    for (let p = 0; p < w * h; p += step) {
      if (!mask[p]) continue;
      if (interiorOnly) {
        const x = p % w;
        if (x === 0 || x === w - 1 || p < w || p >= w * h - w || !mask[p - 1] || !mask[p + 1] || !mask[p - w] || !mask[p + w]) continue;
      }
      R.push(data[p * 4]); G.push(data[p * 4 + 1]); B.push(data[p * 4 + 2]);
    }
  };
  collect(true);
  if (!R.length) collect(false);
  if (!R.length) return '#cccccc';
  return segHex(segMedian(R), segMedian(G), segMedian(B));
}
/* 4-connected components of a 0/255 mask. Works on a 2x-downscaled mask when large; results in full-res coords. */
function findComponents(mask, w, h, minArea) {
  const out = [];
  if (!mask || !(w > 0 && h > 0)) return out;
  let m = mask, mw = w, mh = h, f = 1;
  if (w * h > 500000) {
    f = 2; mw = Math.ceil(w / 2); mh = Math.ceil(h / 2);
    m = new Uint8Array(mw * mh);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (mask[y * w + x]) m[(y >> 1) * mw + (x >> 1)] = 1;
  }
  const seen = new Uint8Array(mw * mh), stack = new Int32Array(mw * mh);
  const minA = (minArea || 1) / (f * f);
  for (let s0 = 0; s0 < mw * mh; s0++) {
    if (!m[s0] || seen[s0]) continue;
    let sp = 0, area = 0, x0 = mw, y0 = mh, x1 = -1, y1 = -1;
    stack[sp++] = s0; seen[s0] = 1;
    while (sp) {
      const p = stack[--sp], x = p % mw, y = (p - x) / mw;
      area++;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (x > 0 && m[p - 1] && !seen[p - 1]) { seen[p - 1] = 1; stack[sp++] = p - 1; }
      if (x < mw - 1 && m[p + 1] && !seen[p + 1]) { seen[p + 1] = 1; stack[sp++] = p + 1; }
      if (y > 0 && m[p - mw] && !seen[p - mw]) { seen[p - mw] = 1; stack[sp++] = p - mw; }
      if (y < mh - 1 && m[p + mw] && !seen[p + mw]) { seen[p + mw] = 1; stack[sp++] = p + mw; }
    }
    if (area < minA) continue;
    const bx = x0 * f, by = y0 * f;
    out.push({ x: bx, y: by, w: Math.min(w, (x1 + 1) * f) - bx, h: Math.min(h, (y1 + 1) * f) - by, area: area * f * f });
  }
  out.sort((a, b) => b.area - a.area);
  return out;
}
/* END-SEGMENTATION-CORE */

const CUTOUT_MIN_FG = 0.04, CUTOUT_MAX_FG = 0.93;
function makeCutout(src) {
  try {
    const sw = src.naturalWidth || src.width, sh = src.naturalHeight || src.height;
    if (!sw || !sh) return null;
    const sc = Math.min(1, 720 / Math.max(sw, sh));
    const w = Math.max(1, Math.round(sw * sc)), h = Math.max(1, Math.round(sh * sc));
    const work = document.createElement('canvas'); work.width = w; work.height = h;
    const wx = work.getContext('2d');
    wx.fillStyle = '#ffffff'; wx.fillRect(0, 0, w, h);
    wx.drawImage(src, 0, 0, w, h);
    const data = wx.getImageData(0, 0, w, h).data;
    const seg = segmentForeground(data, w, h);
    if (!(seg.fgRatio >= CUTOUT_MIN_FG && seg.fgRatio <= CUTOUT_MAX_FG)) return null;
    const color = dominantColor(data, w, h, seg.mask);
    // bounding box of the foreground, padded 4%
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (seg.mask[y * w + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 < 0) return null;
    const padX = Math.round((x1 - x0 + 1) * 0.04), padY = Math.round((y1 - y0 + 1) * 0.04);
    x0 = Math.max(0, x0 - padX); y0 = Math.max(0, y0 - padY); x1 = Math.min(w - 1, x1 + padX); y1 = Math.min(h - 1, y1 + padY);
    const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
    const os = Math.min(1, 560 / Math.max(cw, ch));
    const ow = Math.max(1, Math.round(cw * os)), oh = Math.max(1, Math.round(ch * os));
    const out = document.createElement('canvas'); out.width = ow; out.height = oh;
    const ox = out.getContext('2d');
    ox.drawImage(work, x0, y0, cw, ch, 0, 0, ow, oh);
    const img = ox.getImageData(0, 0, ow, oh), px = img.data;
    // alpha from the mask (resampled to output scale), then 1-pass 3x3 box blur on alpha only
    const a = new Float32Array(ow * oh);
    for (let y = 0; y < oh; y++) {
      const my = Math.min(h - 1, y0 + Math.floor((y + 0.5) / os));
      for (let x = 0; x < ow; x++) {
        const mx = Math.min(w - 1, x0 + Math.floor((x + 0.5) / os));
        a[y * ow + x] = seg.mask[my * w + mx];
      }
    }
    for (let y = 0; y < oh; y++) for (let x = 0; x < ow; x++) {
      let s = 0, c = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy; if (yy < 0 || yy >= oh) continue;
        for (let dx = -1; dx <= 1; dx++) { const xx = x + dx; if (xx >= 0 && xx < ow) { s += a[yy * ow + xx]; c++; } }
      }
      px[(y * ow + x) * 4 + 3] = Math.round(s / c);
    }
    ox.putImageData(img, 0, 0);
    let dataUrl = out.toDataURL('image/webp', 0.88);
    if (!dataUrl.startsWith('data:image/webp')) dataUrl = out.toDataURL('image/png');
    return { dataUrl, color };
  } catch (e) { return null; }
}
try { window.__outfitImg = { segmentForeground, dominantColor, findComponents }; } catch (e) { /* non-browser */ }

/* ---- Flat-lay scan: one photo -> several cutouts ---- */
const scan = { canvas: null, pieces: [], busy: false };
function scanCutout(work, data, w, h, mask, c) {
  const padX = Math.round(c.w * 0.04), padY = Math.round(c.h * 0.04);
  const x0 = Math.max(0, c.x - padX), y0 = Math.max(0, c.y - padY);
  const x1 = Math.min(w - 1, c.x + c.w - 1 + padX), y1 = Math.min(h - 1, c.y + c.h - 1 + padY);
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
  // component-local mask so neighbouring pieces in the padded box are not included
  const local = new Uint8Array(cw * ch);
  const lstack = []; const cx0 = c.x, cy0 = c.y;
  // restrict to this component via flood fill from a seed pixel inside its bbox
  let seed = -1;
  for (let y = c.y; y < c.y + c.h && seed < 0; y++) for (let x = c.x; x < c.x + c.w; x++) if (mask[y * w + x]) { seed = y * w + x; break; }
  if (seed < 0) return null;
  lstack.push(seed); local[(Math.floor(seed / w) - y0) * cw + (seed % w - x0)] = 1;
  while (lstack.length) {
    const p = lstack.pop(), px = p % w, py = (p - px) / w;
    const nb = [[px - 1, py], [px + 1, py], [px, py - 1], [px, py + 1]];
    for (const [nx, ny] of nb) {
      if (nx < x0 || nx > x1 || ny < y0 || ny > y1 || !mask[ny * w + nx]) continue;
      const li = (ny - y0) * cw + (nx - x0);
      if (local[li]) continue;
      local[li] = 1; lstack.push(ny * w + nx);
    }
  }
  const os = Math.min(1, 560 / Math.max(cw, ch));
  const ow = Math.max(1, Math.round(cw * os)), oh = Math.max(1, Math.round(ch * os));
  const out = document.createElement('canvas'); out.width = ow; out.height = oh;
  const ox = out.getContext('2d');
  ox.drawImage(work, x0, y0, cw, ch, 0, 0, ow, oh);
  const img = ox.getImageData(0, 0, ow, oh), px = img.data;
  const a = new Float32Array(ow * oh);
  for (let y = 0; y < oh; y++) {
    const my = Math.min(ch - 1, Math.floor((y + 0.5) / os));
    for (let x = 0; x < ow; x++) a[y * ow + x] = local[my * cw + Math.min(cw - 1, Math.floor((x + 0.5) / os))];
  }
  for (let y = 0; y < oh; y++) for (let x = 0; x < ow; x++) {
    let s = 0, n = 0;
    for (let dy = -1; dy <= 1; dy++) {
      const yy = y + dy; if (yy < 0 || yy >= oh) continue;
      for (let dx = -1; dx <= 1; dx++) { const xx = x + dx; if (xx >= 0 && xx < ow) { s += a[yy * ow + xx]; n++; } }
    }
    px[(y * ow + x) * 4 + 3] = Math.round(s / n);
  }
  ox.putImageData(img, 0, 0);
  let dataUrl = out.toDataURL('image/webp', 0.88);
  if (!dataUrl.startsWith('data:image/webp')) dataUrl = out.toDataURL('image/png');
  const color = dominantColor(data, w, h, local.length ? (() => { const m2 = new Uint8Array(w * h); for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) if (local[y * cw + x]) m2[(y0 + y) * w + x0 + x] = 255; return m2; })() : mask);
  return { dataUrl, color, bw: c.w, bh: c.h };
}
function scanGuessCategory(p) {
  if (p.bh > p.bw * 1.25) return 'bottom';
  if (Math.max(p.bw, p.bh) < 0.25 * Math.max(scan.canvas.width, scan.canvas.height) && p.bw / p.bh < 1.25 && p.bh / p.bw < 1.25) return 'accessory';
  return 'top';
}
function scanDetect(scale) {
  const src = scan.canvas, w = src.width, h = src.height;
  const data = src.getContext('2d').getImageData(0, 0, w, h).data;
  const seg = segmentForeground(data, w, h, { thresholdScale: scale });
  const total = w * h;
  const comps = findComponents(seg.mask, w, h, Math.round(total * 0.012)).filter(c => c.area <= total * 0.7).slice(0, 12);
  const pieces = [];
  comps.forEach(c => { const cut = scanCutout(src, data, w, h, seg.mask, c); if (cut) pieces.push(cut); });
  pieces.sort((a, b) => 0);
  return pieces;
}
function scanSetStep(step) {
  ['intro', 'busy', 'review', 'empty'].forEach(s => { $('#scan-step-' + s).hidden = s !== step; });
}
function scanRun(scale) {
  if (scan.busy || !scan.canvas) return;
  scan.busy = true; scanSetStep('busy');
  setTimeout(() => {
    try { scan.pieces = scanDetect(scale); } catch (e) { scan.pieces = []; }
    scan.busy = false;
    scanRender();
  }, 30);
}
function scanRender() {
  if (!scan.pieces.length) { scanSetStep('empty'); return; }
  scanSetStep('review');
  const catOpts = sel => CATS.map(c => '<option value="' + c + '"' + (c === sel ? ' selected' : '') + '>' + c[0].toUpperCase() + c.slice(1) + '</option>').join('');
  $('#scan-count').textContent = scan.pieces.length + (scan.pieces.length === 1 ? ' piece found' : ' pieces found');
  $('#scan-cards').innerHTML = scan.pieces.map((p, i) => {
    const fam = familyOf(p.color), cap = fam[0].toUpperCase() + fam.slice(1);
    return '<div class="scan-card" data-i="' + i + '">' +
      '<div class="scan-thumb checker"><img src="' + esc(safePhoto(p.dataUrl) || '') + '" alt="Detected piece ' + (i + 1) + '"></div>' +
      '<div class="scan-fields">' +
      '<label class="check scan-include"><input type="checkbox" class="scan-inc" checked> Include</label>' +
      '<input type="text" class="scan-name" maxlength="60" value="' + esc(cap + ' piece ' + (i + 1)) + '" aria-label="Name">' +
      '<div class="scan-row"><select class="scan-cat" aria-label="Category">' + catOpts(scanGuessCategory(p)) + '</select>' +
      '<input type="color" class="scan-color" value="' + safeColor(p.color) + '" aria-label="Color"></div>' +
      '<p class="hint scan-guess">Category is a guess — change it if needed.</p>' +
      '<div class="scan-row"><label class="label label-sm" for="scan-form-' + i + '">Formality</label><select class="scan-form" id="scan-form-' + i + '">' +
      [1, 2, 3, 4, 5].map(n => '<option value="' + n + '"' + (n === 2 ? ' selected' : '') + '>' + n + ' ' + FORMALITY_NAMES[n] + '</option>').join('') + '</select></div>' +
      '</div></div>';
  }).join('');
  scanUpdateCount();
}
function scanUpdateCount() {
  const n = $$('#scan-cards .scan-inc').filter(c => c.checked).length;
  const b = $('#scan-add');
  b.textContent = 'Add ' + n + ' selected item' + (n === 1 ? '' : 's');
  b.disabled = n === 0;
}
function scanOpen() {
  scan.canvas = null; scan.pieces = []; scan.busy = false;
  $('#scan-photo').value = ''; $('#scan-photo-camera').value = '';
  scanSetStep('intro'); openModal('scan-modal');
}
async function onScanPhoto(e) {
  const f = e.target.files && e.target.files[0]; if (!f) return;
  scanSetStep('busy');
  try {
    const url = URL.createObjectURL(f);
    const img = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error('bad')); im.src = url; });
    const w0 = img.naturalWidth || img.width, h0 = img.naturalHeight || img.height;
    const sc = Math.min(1, 900 / Math.max(w0, h0));
    const cv = document.createElement('canvas'); cv.width = Math.max(1, Math.round(w0 * sc)); cv.height = Math.max(1, Math.round(h0 * sc));
    const cx = cv.getContext('2d'); cx.fillStyle = '#ffffff'; cx.fillRect(0, 0, cv.width, cv.height); cx.drawImage(img, 0, 0, cv.width, cv.height);
    URL.revokeObjectURL(url);
    scan.canvas = cv; scan.wholeUrl = cv.toDataURL('image/jpeg', 0.8);
    e.target.value = '';
    scanRun(1);
  } catch (err) { toast('Could not read that image', true); scanSetStep('intro'); e.target.value = ''; }
}
function scanAddSelected() {
  const cards = $$('#scan-cards .scan-card');
  let n = 0;
  cards.forEach(card => {
    if (!card.querySelector('.scan-inc').checked) return;
    const p = scan.pieces[Number(card.dataset.i)]; if (!p) return;
    const color = safeColor(card.querySelector('.scan-color').value);
    const name = card.querySelector('.scan-name').value.trim().slice(0, 60) || 'Scanned piece';
    state.items.push({
      id: uid('itm'), name, category: card.querySelector('.scan-cat').value, color, colorFamily: familyOf(color),
      seasons: SEASONS.slice(), formality: Number(card.querySelector('.scan-form').value) || 2, warmth: 2,
      tags: ['flat-lay'], notes: '', photo: p.dataUrl, cutout: true, source: 'scan', createdAt: Date.now() + n
    });
    n++;
  });
  if (!n) return;
  dataChanged();
  closeModal('scan-modal');
  showTab('wardrobe');
  toast('Added ' + n + ' items from one photo');
  const g = $('#wardrobe-grid'); if (g && g.scrollIntoView) g.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ======================================================================
 * 6. Tabs
 * ==================================================================== */
let currentTab = 'today';
let todayDirty = true;

function showTab(name) {
  if (!$('#tab-' + name)) return;
  currentTab = name;
  $$('.tab-panel').forEach(p => { const on = p.dataset.panel === name; p.hidden = !on; p.classList.toggle('is-active', on); });
  $$('#tabbar .tab').forEach(b => {
    const on = b.dataset.tab === name;
    b.classList.toggle('is-active', on);
    if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  if (name === 'today') { renderTodayControls(); if (todayDirty) runToday(false); renderWeek(); }
  if (name === 'wardrobe') renderWardrobe();
  if (name === 'studio') renderStudio();
  if (name === 'rate') renderRate();
  if (name === 'shop') renderShop();
  window.scrollTo(0, 0);
}

/* ======================================================================
 * 7. Wardrobe
 * ==================================================================== */
const wf = { q: '', category: '', color: '', season: '', formality: '' };

function chipHtml(val, label, active, swatchColor) {
  return '<button type="button" class="chip' + (active ? ' is-active' : '') + '" aria-pressed="' + (active ? 'true' : 'false') + '" data-val="' + esc(val) + '">' +
    (swatchColor ? '<span class="swatch" style="background:' + safeColor(swatchColor) + '"></span>' : '') + esc(label) + '</button>';
}

function renderWardrobe() {
  $('#wardrobe-count').textContent = state.items.length;
  // filter chips
  $('#filter-category').innerHTML = chipHtml('', 'All', !wf.category) + CATS.map(c => chipHtml(c, c, wf.category === c)).join('');
  const present = FAMILIES.filter(f => state.items.some(i => (i.colorFamily || familyOf(i.color)) === f));
  $('#filter-color').innerHTML = chipHtml('', 'Any color', !wf.color) + present.map(f => chipHtml(f, f, wf.color === f, FAMILY_HEX[f])).join('');
  $('#filter-season').innerHTML = chipHtml('', 'All seasons', !wf.season) + SEASONS.map(s => chipHtml(s, s, wf.season === s)).join('');
  $('#filter-formality').value = wf.formality;
  if (document.activeElement !== $('#wardrobe-search')) $('#wardrobe-search').value = wf.q;

  renderWardrobeStats();

  const q = wf.q.trim().toLowerCase();
  const list = state.items.filter(i => {
    if (wf.category && i.category !== wf.category) return false;
    if (wf.color && (i.colorFamily || familyOf(i.color)) !== wf.color) return false;
    if (wf.season && !i.seasons.includes(wf.season)) return false;
    if (wf.formality && String(i.formality) !== wf.formality) return false;
    if (q) {
      const hay = (i.name + ' ' + i.tags.join(' ') + ' ' + i.notes + ' ' + i.category + ' ' + (i.colorFamily || '')).toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  const empty = $('#wardrobe-empty'), grid = $('#wardrobe-grid');
  if (!state.items.length) {
    empty.hidden = false;
    empty.innerHTML = emptyHtml('Your wardrobe is empty', 'Add a photo of something you own, or start from the built-in set.',
      '<div class="btn-row" style="justify-content:center;margin-top:12px"><button type="button" class="btn btn-primary" data-action="add-item">Add photo</button><button type="button" class="btn" data-action="load-starter">Load starter wardrobe</button></div>');
    grid.innerHTML = '';
  } else if (!list.length) {
    empty.hidden = false;
    empty.innerHTML = emptyHtml('No matches', 'Nothing fits those filters.', '<button type="button" class="btn" data-action="clear-filters">Clear filters</button>');
    grid.innerHTML = '';
  } else {
    empty.hidden = true;
    grid.innerHTML = list.map(i => itemCardHtml(i, '', 'data-id="' + esc(i.id) + '"')).join('');
  }
}

function renderWardrobeStats() {
  const box = $('#wardrobe-stats');
  if (!state.items.length) { box.innerHTML = '<p class="muted small">No items yet.</p>'; return; }
  const counts = {}; CATS.forEach(c => { counts[c] = 0; });
  state.items.forEach(i => { counts[i.category]++; });
  const fams = {};
  state.items.forEach(i => { const f = i.colorFamily || familyOf(i.color); fams[f] = (fams[f] || 0) + 1; });
  const topFams = Object.keys(fams).sort((a, b) => fams[b] - fams[a]).slice(0, 3);
  const today = todayISO();
  const withDays = state.items.filter(i => i.category !== 'accessory').map(i => ({ i, d: state.wearLog[i.id] ? daysBetween(state.wearLog[i.id], today) : null }));
  const worn = withDays.filter(x => x.d !== null).sort((a, b) => a.d - b.d);
  const never = withDays.filter(x => x.d === null);
  const unworn = never.length ? { i: never[0].i, label: 'never worn' } : worn.length ? { i: worn[worn.length - 1].i, label: worn[worn.length - 1].d + ' days ago' } : null;
  const avgF = (state.items.reduce((a, i) => a + i.formality, 0) / state.items.length).toFixed(1);
  box.innerHTML =
    '<div><h4>By category</h4>' + CATS.map(c => '<div class="stat-line"><span style="text-transform:capitalize">' + c + '</span><strong>' + counts[c] + '</strong></div>').join('') + '</div>' +
    '<div><h4>Top colors</h4>' + topFams.map(f => '<div class="stat-line"><span><i class="swatch" style="width:12px;height:12px;vertical-align:-1px;margin-right:6px;background:' + FAMILY_HEX[f] + '"></i>' + esc(f) + '</span><strong>' + fams[f] + '</strong></div>').join('') +
    '<h4 style="margin-top:10px">Average formality</h4><div class="stat-line"><span>Level</span><strong>' + avgF + '</strong></div></div>' +
    '<div><h4>Worn most recently</h4>' + (worn.length ? '<div class="stat-line"><span>' + esc(worn[0].i.name) + '</span><strong>' + (worn[0].d === 0 ? 'today' : worn[0].d + 'd') + '</strong></div>' : '<p class="muted small">Nothing logged yet</p>') + '</div>' +
    '<div><h4>Longest unworn</h4>' + (unworn ? '<div class="stat-line"><span>' + esc(unworn.i.name) + '</span><strong>' + esc(unworn.label) + '</strong></div>' : '<p class="muted small">-</p>') + '</div>';
}

/* ---- Item add/edit modal ---- */
// photo = what will be saved; photoOriginal/cutoutUrl = the two candidates when a cut-out exists; cutout = cut-out currently chosen
let itemEdit = { editingId: null, photo: null, photoOriginal: null, cutoutUrl: null, cutout: false, note: '', source: 'upload', manualFamily: false };

function updateItemColorUI() {
  const c = $('#item-color').value;
  $('#item-swatch').style.background = safeColor(c);
  const auto = familyOf(c);
  $('#item-family-auto').textContent = auto;
  if (!itemEdit.manualFamily) $('#item-family').value = auto;
}
function updateItemSliderUI() {
  const f = Number($('#item-formality').value), w = Number($('#item-warmth').value);
  $('#item-formality-out').textContent = f; $('#item-formality-name').textContent = FORMALITY_NAMES[f] || '';
  $('#item-warmth-out').textContent = w; $('#item-warmth-name').textContent = WARMTH_NAMES[w] || '';
}
function setItemPhotoUI() {
  const p = itemEdit.photo;
  $('#item-photo-preview').hidden = !p;
  $('#item-photo-remove').hidden = !p;
  if (p) $('#item-photo-img').src = p; else $('#item-photo-img').removeAttribute('src');
  $('#item-photo-preview').classList.toggle('is-cutout', !!(p && itemEdit.cutout));
  const canToggle = !!(p && itemEdit.cutoutUrl && itemEdit.photoOriginal);
  const tg = $('#item-photo-toggle');
  tg.hidden = !canToggle;
  tg.textContent = itemEdit.cutout ? 'Use original photo instead' : 'Use cut-out';
  const note = $('#item-photo-note');
  note.hidden = !(p && itemEdit.note);
  note.textContent = itemEdit.note || '';
}
function fillItemForm(t) {
  // t: {name, category, color, seasons[], formality, warmth, tags[]|string, notes, colorFamily}
  $('#item-name').value = t.name || '';
  $('#item-category').value = CATS.includes(t.category) ? t.category : 'top';
  $('#item-color').value = safeColor(t.color || '#f5f5f0');
  const auto = familyOf($('#item-color').value);
  itemEdit.manualFamily = !!(t.colorFamily && t.colorFamily !== auto);
  if (itemEdit.manualFamily) $('#item-family').value = t.colorFamily;
  const seasons = t.seasons && t.seasons.length ? t.seasons : SEASONS;
  $$('#item-seasons input[name="seasons"]').forEach(cb => { cb.checked = seasons.includes(cb.value); });
  $('#item-formality').value = clamp(t.formality || 3, 1, 5);
  $('#item-warmth').value = clamp(t.warmth || 1, 1, 3);
  $('#item-tags').value = Array.isArray(t.tags) ? t.tags.join(', ') : (t.tags || '');
  $('#item-notes').value = t.notes || '';
  updateItemColorUI(); updateItemSliderUI();
}
function openItemModal(opts) {
  opts = opts || {};
  const it = opts.item || null;
  const isCut = it ? !!(it.cutout && it.photo) : !!(opts.cutout && opts.photo);
  itemEdit = {
    editingId: it ? it.id : null, photo: it ? it.photo : (opts.photo || null),
    photoOriginal: isCut ? ((it ? it.photoOriginal : opts.photoOriginal) || null) : null,
    cutoutUrl: isCut ? (it ? it.photo : opts.photo) : null, cutout: isCut, note: '',
    source: it ? it.source : (opts.source || 'upload'), manualFamily: false
  };
  $('#item-modal-title').textContent = it ? 'Edit item' : 'Add item';
  $('#item-id').value = it ? it.id : '';
  $('#item-photo').value = '';
  $('#item-photo-camera').value = '';
  fillItemForm(it || opts.prefill || { name: '', category: 'top', color: opts.color || '#f5f5f0', seasons: SEASONS, formality: 3, warmth: 1 });
  if (!it && opts.color) { $('#item-color').value = safeColor(opts.color); updateItemColorUI(); }
  setItemPhotoUI();
  $('#item-delete').hidden = !it;
  openModal('item-modal');
  $('#item-name').focus();
}

function saveItemFromForm() {
  const name = $('#item-name').value.trim();
  if (!name) { toast('Give the item a name', true); $('#item-name').focus(); return; }
  let seasons = $$('#item-seasons input[name="seasons"]').filter(cb => cb.checked).map(cb => cb.value);
  if (!seasons.length) seasons = SEASONS.slice();
  const tags = Array.from(new Set($('#item-tags').value.split(',').map(t => t.trim().toLowerCase()).filter(Boolean))).slice(0, 20);
  const color = safeColor($('#item-color').value);
  const data = {
    name: name.slice(0, 60), category: $('#item-category').value, color,
    colorFamily: FAMILIES.includes($('#item-family').value) ? $('#item-family').value : familyOf(color),
    seasons, formality: Number($('#item-formality').value), warmth: Number($('#item-warmth').value),
    tags, notes: $('#item-notes').value.slice(0, 300), photo: itemEdit.photo
  };
  const usingCut = !!(itemEdit.photo && itemEdit.cutout);
  if (usingCut) { data.cutout = true; if (itemEdit.photoOriginal) data.photoOriginal = itemEdit.photoOriginal; }
  if (itemEdit.editingId) {
    const it = getItem(itemEdit.editingId);
    if (it) {
      if (!usingCut) { delete it.cutout; delete it.photoOriginal; }
      Object.assign(it, data);
      // category change: purge from studio/rate/outfit slots of the old category
      [studio.slots, rate.slots].forEach(s => purgeMismatched(s));
      state.outfits.forEach(o => purgeMismatched(o.slots));
    }
    toast('Item updated');
  } else {
    state.items.push(Object.assign({ id: uid('itm'), source: itemEdit.source, createdAt: Date.now() }, data));
    toast('Added ' + data.name);
  }
  dataChanged();
  closeModal('item-modal');
}
function purgeMismatched(slots) {
  CATS.forEach(c => { slots[c] = slots[c].filter(id => { const it = getItem(id); return it && it.category === c; }); });
}

async function deleteItem(id) {
  const it = getItem(id); if (!it) return;
  const ok = await confirmDialog('Delete item?', '"' + it.name + '" will be removed from your wardrobe and any outfits using it.', 'Delete');
  if (!ok) return;
  state.items = state.items.filter(i => i.id !== id);
  delete state.wearLog[id];
  const strip = s => { CATS.forEach(c => { s[c] = s[c].filter(x => x !== id); }); };
  strip(studio.slots); strip(rate.slots);
  state.outfits.forEach(o => strip(o.slots));
  const dead = state.outfits.filter(o => !slotCount(o.slots)).map(o => o.id);
  state.outfits = state.outfits.filter(o => !dead.includes(o.id));
  Object.keys(state.calendar).forEach(k => { if (dead.includes(state.calendar[k])) delete state.calendar[k]; });
  closeModal('item-modal'); closeModal('detail-modal');
  dataChanged();
  toast('Deleted ' + it.name);
}

/* ---- Item detail ---- */
let detailId = null;
function openDetail(id) {
  const it = getItem(id); if (!it) return;
  detailId = id;
  $('#detail-title').textContent = it.name;
  const last = state.wearLog[id];
  const used = state.outfits.filter(o => CATS.some(c => o.slots[c].includes(id))).length;
  const row = (k, v) => '<dt>' + esc(k) + '</dt><dd>' + v + '</dd>';
  $('#detail-body').innerHTML =
    '<div class="detail-photo">' + thumbHtml(it) + '</div><dl class="detail-list">' +
    row('Category', esc(it.category)) +
    row('Color', '<i class="swatch" style="width:14px;height:14px;vertical-align:-2px;margin-right:6px;background:' + safeColor(it.color) + '"></i>' + esc(it.colorFamily || familyOf(it.color))) +
    row('Seasons', it.seasons.length === 4 ? 'Year-round' : esc(it.seasons.join(', '))) +
    row('Formality', it.formality + ' ' + esc(FORMALITY_NAMES[it.formality])) +
    row('Warmth', it.warmth + ' ' + esc(WARMTH_NAMES[it.warmth])) +
    row('Tags', it.tags.length ? esc(it.tags.join(', ')) : '-') +
    row('Notes', it.notes ? '<span style="text-transform:none">' + esc(it.notes) + '</span>' : '-') +
    row('Last worn', last ? esc(last) : 'Not logged') +
    row('In outfits', used) + '</dl>';
  openModal('detail-modal');
}

/* ---- Catalog ---- */
function openCatalog() {
  const html = CATS.map(c => {
    const list = CATALOG.map((t, i) => ({ t, i })).filter(x => x.t[1] === c);
    if (!list.length) return '';
    return '<div class="catalog-group"><h3>' + esc(c) + '</h3><div class="item-grid item-grid-sm">' + list.map(x => {
      const pseudo = { name: x.t[0], category: x.t[1], color: x.t[2], formality: x.t[4], colorFamily: familyOf(x.t[2]), photo: null };
      return itemCardHtml(pseudo, '', 'data-cat-idx="' + x.i + '"');
    }).join('') + '</div></div>';
  }).join('');
  $('#catalog-list').innerHTML = html;
  openModal('catalog-modal');
}
function pickCatalog(idx) {
  const t = CATALOG[idx]; if (!t) return;
  const keepPhoto = itemEdit.photo;
  fillItemForm({ name: t[0], category: t[1], color: t[2], seasons: SEASON_SETS[t[3]], formality: t[4], warmth: t[5], tags: t[6] });
  itemEdit.photo = keepPhoto; setItemPhotoUI();
  closeModal('catalog-modal');
}

function loadStarter() {
  const have = new Set(state.items.map(i => i.name.toLowerCase() + '|' + i.category));
  let n = 0;
  SEED_ITEMS.forEach(t => { if (!have.has(t[0].toLowerCase() + '|' + t[1])) { state.items.push(mkItem(t, 'seed')); n++; } });
  state.seeded = true;
  dataChanged();
  toast(n ? 'Loaded ' + n + ' starter items' : 'Starter items already in your wardrobe');
}

/* ======================================================================
 * 8. Slots (shared by Studio and Rate), picker
 * ==================================================================== */
const studio = { slots: emptySlots(), locks: {}, folder: 'all' };
const rate = { slots: emptySlots(), mode: 'items', result: null };

function setSlotIds(slots, slot, ids, strict) {
  ids = ids.filter(id => getItem(id));
  if (slot === 'top') {
    const dressIds = ids.filter(id => getItem(id).category === 'dress');
    const topIds = ids.filter(id => getItem(id).category === 'top');
    if (dressIds.length) { slots.dress = [dressIds[0]]; slots.top = []; slots.bottom = []; }
    else slots.top = topIds.slice(0, 1);
  } else if (slot === 'dress') {
    slots.dress = ids.slice(0, 1);
    if (slots.dress.length && strict) { slots.top = []; slots.bottom = []; }
  } else if (MULTI_SLOTS.has(slot)) {
    slots[slot] = Array.from(new Set(ids));
  } else {
    slots[slot] = ids.slice(0, 1);
    if (strict && slots[slot].length && slots.dress.length) slots.dress = [];
  }
}
function addItemToSlots(slots, it) {
  if (it.category === 'dress') { slots.dress = [it.id]; slots.top = []; slots.bottom = []; }
  else if (MULTI_SLOTS.has(it.category)) { if (!slots[it.category].includes(it.id)) slots[it.category].push(it.id); }
  else { slots[it.category] = [it.id]; if (it.category === 'top' || it.category === 'bottom') slots.dress = []; }
}

const LOCK_SVG = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
function renderSlot(el, slot, ids, opts) {
  opts = opts || {};
  const its = ids.map(getItem).filter(Boolean);
  el.classList.toggle('is-filled', its.length > 0);
  el.classList.toggle('is-locked', !!opts.locked);
  el.setAttribute('role', 'button'); el.tabIndex = 0;
  el.setAttribute('aria-label', its.length ? cap(slot) + ': ' + its.map(i => i.name).join(', ') + '. Change' : SLOT_HINT[slot]);
  if (!its.length) { el.innerHTML = '<span>' + esc(SLOT_HINT[slot]) + '</span>'; return; }
  el.innerHTML = thumbHtml(its[0]) +
    '<span class="slot-label">' + esc(its[0].name) + (its.length > 1 ? ' +' + (its.length - 1) : '') + '</span>' +
    '<button type="button" class="slot-x" data-act="clear" aria-label="Remove ' + esc(slot) + '">&times;</button>' +
    (opts.lock ? '<button type="button" class="slot-lock' + (opts.locked ? ' is-on' : '') + '" data-act="lock" aria-pressed="' + (opts.locked ? 'true' : 'false') + '" aria-label="Lock ' + esc(slot) + '">' + LOCK_SVG + '</button>' : '');
}

let pickerCtx = null;
function openPicker(cfg) {
  pickerCtx = { cats: cfg.cats, selected: cfg.selected.slice(), multi: !!cfg.multi, onChange: cfg.onChange };
  $('#picker-title').textContent = cfg.title;
  renderPicker();
  openModal('picker-modal');
}
function renderPicker() {
  const p = pickerCtx; if (!p) return;
  const list = [];
  p.cats.forEach(c => state.items.filter(i => i.category === c).forEach(i => list.push(i)));
  const grid = $('#picker-grid'), empty = $('#picker-empty');
  if (!list.length) {
    grid.innerHTML = '';
    empty.hidden = false;
    empty.innerHTML = emptyHtml('Nothing here yet', 'You have no ' + p.cats.join(' or ') + ' items.', '<button type="button" class="btn" data-action="goto-wardrobe">Add to wardrobe</button>');
  } else {
    empty.hidden = true;
    grid.innerHTML = list.map(i => itemCardHtml(i, p.selected.includes(i.id) ? 'is-selected' : '', 'data-id="' + esc(i.id) + '"')).join('');
  }
}
function pickerClick(id) {
  const p = pickerCtx; if (!p) return;
  const has = p.selected.includes(id);
  if (p.multi) {
    p.selected = has ? p.selected.filter(x => x !== id) : p.selected.concat(id);
    p.onChange(p.selected.slice()); renderPicker();
  } else {
    p.selected = has ? [] : [id];
    p.onChange(p.selected.slice()); closeModal('picker-modal');
  }
}

/* ======================================================================
 * 9. Outfits (save/menu/folders/calendar helpers)
 * ==================================================================== */
function outfitItems(o) { return itemsOfSlots(o.slots); }
function outfitScore(o) { return scoreOutfit(outfitItems(o), studioCtx()).total; }

function openOutfitModal(cfg) {
  // cfg: {slots, outfit, name, occasion, folderId}
  const o = cfg.outfit || null;
  $('#outfit-modal-title').textContent = o ? 'Edit outfit' : 'Save outfit';
  $('#outfit-id').value = o ? o.id : '';
  $('#outfit-name').value = o ? o.name : (cfg.name || '');
  $('#outfit-occasion').value = o ? o.occasion : (cfg.occasion || 'casual');
  $('#outfit-folder').innerHTML = '<option value="">Unfiled</option>' + state.folders.map(f => '<option value="' + esc(f.id) + '">' + esc(f.name) + '</option>').join('');
  $('#outfit-folder').value = o ? (o.folderId || '') : (cfg.folderId || '');
  $('#outfit-new-folder').value = '';
  outfitDraftSlots = o ? null : copySlots(cfg.slots);
  openModal('outfit-modal');
  $('#outfit-name').focus();
}
let outfitDraftSlots = null;

function saveOutfitFromForm() {
  const name = $('#outfit-name').value.trim();
  if (!name) { toast('Give the outfit a name', true); return; }
  let folderId = $('#outfit-folder').value || null;
  const nf = $('#outfit-new-folder').value.trim();
  if (nf) {
    let f = state.folders.find(x => x.name.toLowerCase() === nf.toLowerCase());
    if (!f) { f = { id: uid('fld'), name: nf.slice(0, 40), createdAt: Date.now() }; state.folders.push(f); }
    folderId = f.id;
  }
  const occasion = $('#outfit-occasion').value;
  const id = $('#outfit-id').value;
  if (id) {
    const o = state.outfits.find(x => x.id === id);
    if (o) { o.name = name; o.occasion = occasion; o.folderId = folderId; o.score = outfitScore(o); }
    toast('Outfit updated');
  } else {
    const slots = outfitDraftSlots || emptySlots();
    if (!slotCount(slots)) { toast('Pick at least one item first', true); return; }
    const o = { id: uid('out'), name, occasion, slots, folderId, score: 0, createdAt: Date.now() };
    o.score = outfitScore(o);
    state.outfits.push(o);
    toast('Saved "' + name + '"');
  }
  outfitDraftSlots = null;
  closeModal('outfit-modal');
  dataChanged();
}

function deleteOutfit(id) {
  const o = state.outfits.find(x => x.id === id); if (!o) return;
  state.outfits = state.outfits.filter(x => x.id !== id);
  Object.keys(state.calendar).forEach(k => { if (state.calendar[k] === id) delete state.calendar[k]; });
  dataChanged();
  toast('Deleted "' + o.name + '"');
}

function logWear(slots, iso) {
  itemsOfSlots(slots).forEach(i => { if (i.category !== 'accessory' || true) state.wearLog[i.id] = iso; });
}
function assignDay(iso, outfitId) {
  const o = state.outfits.find(x => x.id === outfitId); if (!o) return;
  state.calendar[iso] = outfitId;
  if (daysBetween(iso, todayISO()) >= 0) logWear(o.slots, iso);
  todayDirty = true;
  persist(); renderWeek(); if (currentTab === 'studio') renderStudio();
  toast('Planned "' + o.name + '" for ' + fmtDay(parseISO(iso)));
}
function removeDay(iso) {
  delete state.calendar[iso];
  persist(); renderWeek();
  toast('Cleared ' + fmtDay(parseISO(iso)));
}

function wearToday(slots, name, occasion) {
  const items = itemsOfSlots(slots);
  if (!items.length) return;
  const ids = items.map(i => i.id).sort().join(',');
  let o = state.outfits.find(x => itemsOfSlots(x.slots).map(i => i.id).sort().join(',') === ids);
  if (!o) {
    o = { id: uid('out'), name: name || ('Worn ' + fmtDay(new Date(), { month: 'short', day: 'numeric' })), occasion: occasion || 'casual', slots: copySlots(slots), folderId: null, score: 0, createdAt: Date.now() };
    o.score = outfitScore(o);
    state.outfits.push(o);
  }
  const iso = todayISO();
  state.calendar[iso] = o.id;
  logWear(o.slots, iso);
  todayDirty = true;
  persist(); renderWeek(); renderWardrobeStats();
  toast('Logged as worn today');
}

function openInStudio(slots) {
  studio.slots = copySlots(slots); studio.locks = {};
  showTab('studio');
}

/* ---- Outfit menu ---- */
let menuOutfitId = null;
function openOutfitMenu(id) { menuOutfitId = id; renderOutfitMenu('main'); openModal('outfit-menu-modal'); }
function renderOutfitMenu(view) {
  const o = state.outfits.find(x => x.id === menuOutfitId); if (!o) { closeModal('outfit-menu-modal'); return; }
  $('#outfit-menu-title').textContent = o.name;
  const body = $('#outfit-menu-body');
  const btn = (act, label, cls, extra) => '<button type="button" class="btn btn-block ' + (cls || '') + '" data-act="' + act + '"' + (extra || '') + '>' + esc(label) + '</button>';
  if (view === 'main') {
    const its = outfitItems(o), sc = scoreOutfit(its, studioCtx()).total;
    const folder = state.folders.find(f => f.id === o.folderId);
    body.innerHTML = stackRowHtml(its) +
      '<p class="muted small" style="margin:10px 0 14px">' + esc(cap(o.occasion)) + ' &middot; ' + esc(folder ? folder.name : 'Unfiled') + ' &middot; score ' + sc + '/100</p>' +
      '<div style="display:flex;flex-direction:column;gap:8px">' +
      btn('open', 'Open in Studio', 'btn-primary') + btn('edit', 'Edit details') + btn('rename', 'Rename') + btn('move', 'Move to folder') + btn('assign', 'Assign to day') + btn('delete', 'Delete', 'btn-danger') + '</div>';
  } else if (view === 'move') {
    body.innerHTML = '<div style="display:flex;flex-direction:column;gap:8px">' +
      btn('moveto', 'Unfiled', o.folderId ? '' : 'btn-primary', ' data-folder=""') +
      state.folders.map(f => btn('moveto', f.name, o.folderId === f.id ? 'btn-primary' : '', ' data-folder="' + esc(f.id) + '"')).join('') +
      btn('newfolder', '+ New folder', 'btn-link') + btn('back', 'Back', 'btn-link') + '</div>';
  } else if (view === 'assign') {
    const days = weekDays();
    body.innerHTML = '<div style="display:flex;flex-direction:column;gap:8px">' +
      days.map(d => btn('assignto', fmtDay(d) + (state.calendar[isoOf(d)] ? ' (planned)' : ''), isoOf(d) === todayISO() ? 'btn-primary' : '', ' data-date="' + isoOf(d) + '"')).join('') +
      btn('back', 'Back', 'btn-link') + '</div>';
  }
}

/* ---- Day modal ---- */
let dayDate = null;
function openDayModal(iso) {
  dayDate = iso;
  $('#day-modal-title').textContent = fmtDay(parseISO(iso), { weekday: 'long', month: 'short', day: 'numeric' });
  const assigned = state.calendar[iso];
  const list = $('#day-outfit-list');
  $('#day-empty').hidden = state.outfits.length > 0;
  list.innerHTML = state.outfits.map(o => {
    const its = outfitItems(o);
    return '<button type="button" class="outfit-pick' + (assigned === o.id ? ' is-selected' : '') + '" data-id="' + esc(o.id) + '">' + miniStackHtml(its) +
      '<div class="grow"><div class="outfit-name">' + esc(o.name) + '</div><div class="outfit-occ">' + esc(o.occasion) + '</div></div>' + badgeHtml(scoreOutfit(its, studioCtx()).total, true) + '</button>';
  }).join('');
  $('#day-remove').hidden = !assigned;
  openModal('day-modal');
}

/* ======================================================================
 * 10. Studio
 * ==================================================================== */
function openStudioPicker(slot) {
  openPicker({
    title: 'Choose ' + slot,
    cats: slot === 'top' ? ['top', 'dress'] : [slot],
    selected: slot === 'top' ? studio.slots.top.concat(studio.slots.dress) : studio.slots[slot],
    multi: MULTI_SLOTS.has(slot),
    onChange: ids => { setSlotIds(studio.slots, slot, ids, true); renderStudio(); }
  });
}

function randomOutfitSlots(base, locks, rnd) {
  const pick = a => a[Math.floor(rnd() * a.length)];
  const by = c => state.items.filter(i => i.category === c);
  const out = emptySlots();
  CATS.forEach(c => { if (locks[c]) out[c] = base[c].slice(); });
  const dresses = by('dress'), tops = by('top'), bottoms = by('bottom');
  let useDress;
  if (locks.dress && out.dress.length) useDress = true;
  else if ((locks.top && out.top.length) || (locks.bottom && out.bottom.length)) useDress = false;
  else if (!dresses.length) useDress = false;
  else if (!tops.length || !bottoms.length) useDress = true;
  else useDress = rnd() < 0.2;
  if (useDress) {
    if (!locks.dress && dresses.length) out.dress = [pick(dresses).id];
    if (!locks.top) out.top = []; if (!locks.bottom) out.bottom = [];
  } else {
    if (!locks.top && tops.length) out.top = [pick(tops).id];
    if (!locks.bottom && bottoms.length) out.bottom = [pick(bottoms).id];
    if (!locks.dress) out.dress = [];
  }
  const shoes = by('shoes'), outers = by('outerwear'), accs = by('accessory');
  if (!locks.shoes && shoes.length) out.shoes = [pick(shoes).id];
  if (!locks.outerwear) out.outerwear = (outers.length && rnd() < 0.4) ? [pick(outers).id] : [];
  if (!locks.accessory) out.accessory = (accs.length && rnd() < 0.4) ? [pick(accs).id] : [];
  return out;
}

function studioRandomize() {
  if (state.items.length < 2) { toast('Add a few items first', true); return; }
  const rnd = mulberry32(hashStr(String(Date.now()) + Math.random()));
  let best = null, bestRaw = -1;
  for (let k = 0; k < 10; k++) {
    const cand = randomOutfitSlots(studio.slots, studio.locks, rnd);
    const r = scoreOutfit(itemsOfSlots(cand), studioCtx()).raw + rnd() * 4;
    if (r > bestRaw) { bestRaw = r; best = cand; }
  }
  if (best) { studio.slots = best; renderStudio(); }
}

function suggestCompletion(slots) {
  const by = c => state.items.filter(i => i.category === c);
  const filled = c => (slots[c] || []).map(getItem).filter(Boolean);
  const opts = c => { if (filled(c).length) return [filled(c)]; const l = by(c).map(i => [i]); return l.length ? l : [[]]; };
  const hasDress = slots.dress.length > 0, hasTB = slots.top.length > 0 || slots.bottom.length > 0;
  const shoesOpts = filled('shoes').length ? [filled('shoes')] : (by('shoes').length ? by('shoes').map(i => [i]) : [[]]);
  const rnd = mulberry32(hashStr('suggest' + todayISO()));
  let all = [];
  if (hasDress) all = combos([[filled('dress')], [filled('top')], [filled('bottom')], shoesOpts], ENUM_CAP, rnd);
  else {
    all = combos([[[]], opts('top'), opts('bottom'), shoesOpts], ENUM_CAP, rnd);
    if (!hasTB && by('dress').length) all = all.concat(combos([by('dress').map(i => [i]), [[]], [[]], shoesOpts], ENUM_CAP, rnd));
  }
  const ctx = studioCtx();
  let best = null, bestRaw = -1;
  all.forEach(c => {
    const its = [].concat.apply([], c);
    if (!its.length) return;
    const r = scoreOutfit(its.concat(itemsOfSlots({ outerwear: slots.outerwear, accessory: slots.accessory })), ctx).raw;
    if (r > bestRaw) { bestRaw = r; best = its; }
  });
  if (!best) return null;
  const result = slotsFromItems(best);
  result.outerwear = slots.outerwear.slice(); result.accessory = slots.accessory.slice();
  ['outerwear', 'accessory'].forEach(cat => {
    if (result[cat].length) return;
    const cur = scoreOutfit(itemsOfSlots(result), ctx).raw;
    let pb = null, pr = cur;
    by(cat).forEach(i => { const r = scoreOutfit(itemsOfSlots(result).concat(i), ctx).raw; if (r > pr + 1e-9) { pr = r; pb = i; } });
    if (pb) result[cat] = [pb.id];
  });
  return result;
}

function renderStudio() {
  const cv = $('#studio-canvas');
  const slots = studio.slots;
  const items = itemsOfSlots(slots);
  cv.classList.toggle('has-dress', slots.dress.length > 0);
  cv.classList.toggle('is-empty', items.length === 0);
  $$('.slot', cv).forEach(el => { const s = el.dataset.slot; renderSlot(el, s, slots[s], { lock: true, locked: !!studio.locks[s] }); });

  const badge = $('#studio-score');
  badge.classList.remove('is-high', 'is-mid', 'is-low');
  if (!items.length) {
    badge.innerHTML = '<span class="score-num">--</span><span class="score-max">/100</span>';
    $('#studio-breakdown').innerHTML = '<p class="muted small">Pick a few pieces to see the score.</p>';
    $('#studio-tips').innerHTML = '';
  } else {
    const r = scoreOutfit(items, studioCtx());
    badge.innerHTML = '<span class="score-num">' + r.total + '</span><span class="score-max">/100</span>';
    badge.classList.add(scoreClass(r.total));
    $('#studio-breakdown').innerHTML = '<div class="breakdown">' + breakdownHtml(r, ['color', 'formality', 'season', 'completeness']) + '</div>';
    $('#studio-tips').innerHTML = listHtml(r.tips.length ? r.tips.slice(0, 5) : ['No weak spots found. This outfit is working.']);
  }
  renderFolders();
  renderSavedOutfits();
}

function renderFolders() {
  if (studio.folder !== 'all' && studio.folder !== 'none' && !state.folders.some(f => f.id === studio.folder)) studio.folder = 'all';
  const chip = (val, label, active) => '<button type="button" class="chip' + (active ? ' is-active' : '') + '" role="tab" aria-selected="' + (active ? 'true' : 'false') + '" data-folder="' + esc(val) + '">' + esc(label) + '</button>';
  $('#studio-folders').innerHTML = chip('all', 'All', studio.folder === 'all') + chip('none', 'Unfiled', studio.folder === 'none') +
    state.folders.map(f => chip(f.id, f.name, studio.folder === f.id)).join('') + chip('__new', '+ New folder', false);
  $('#studio-folder-actions').hidden = !state.folders.some(f => f.id === studio.folder);
}

function renderSavedOutfits() {
  const list = state.outfits.filter(o => studio.folder === 'all' ? true : studio.folder === 'none' ? !o.folderId : o.folderId === studio.folder);
  const empty = $('#studio-empty'), grid = $('#studio-outfits');
  if (!list.length) {
    empty.hidden = false;
    empty.innerHTML = state.outfits.length ? emptyHtml('No outfits in this folder', '') : emptyHtml('Save your first outfit', 'Build a look on the canvas and press Save.');
    grid.innerHTML = '';
    return;
  }
  empty.hidden = true;
  grid.innerHTML = list.slice().sort((a, b) => b.createdAt - a.createdAt).map(o => {
    const its = outfitItems(o);
    return '<button type="button" class="outfit-card" data-id="' + esc(o.id) + '">' + miniStackHtml(its) +
      '<div class="outfit-meta"><div><div class="outfit-name">' + esc(o.name) + '</div><div class="outfit-occ">' + esc(o.occasion) + '</div></div>' + badgeHtml(scoreOutfit(its, studioCtx()).total, true) + '</div></button>';
  }).join('');
}

/* ======================================================================
 * 11. Today
 * ==================================================================== */
let today = { results: [], exclude: new Set(), regen: 0 };

function todayCtx() { return state.prefs.lastContext; }
function occasionTarget(c) { return clamp(OCC_TARGET[c.occasion] + (c.vibe === 'relaxed' ? -1 : c.vibe === 'polished' ? 1 : 0), 1, 5); }

function renderTodayControls() {
  const c = todayCtx();
  $('#today-occasions').innerHTML = OCCASIONS.map(o => '<button type="button" class="chip' + (c.occasion === o ? ' is-active' : '') + '" aria-pressed="' + (c.occasion === o) + '" data-occ="' + o + '">' + o + '</button>').join('');
  $('#today-vibes').innerHTML = VIBES.map(v => '<button type="button" data-vibe="' + v + '" class="' + (c.vibe === v ? 'is-active' : '') + '">' + v + '</button>').join('');
  $('#today-temp').value = c.temp;
  $('#today-temp-out').textContent = fmtTemp(c.temp);
  $('#today-season-label').textContent = seasonOfDate(new Date());
  $$('#today-units button').forEach(b => b.classList.toggle('is-active', b.dataset.unit === state.prefs.units));
  $('#today-date').textContent = fmtDay(new Date(), { weekday: 'long', month: 'long', day: 'numeric' });
}

function generateToday(c, opts) {
  const t = c.temp, target = occasionTarget(c), season = seasonOfDate(new Date());
  const rnd = mulberry32(hashStr(opts.seed));
  let pool = state.items.filter(i => i.category === 'accessory' || Math.abs(i.formality - target) <= 2);
  if (t >= 27) pool = pool.filter(i => i.warmth < 3);   // heat: drop heavy pieces (warmth mismatch > 1)
  const by = cat => pool.filter(i => i.category === cat);
  const tops = by('top'), bottoms = by('bottom'), dresses = by('dress'), shoes = by('shoes'), accs = by('accessory');
  const outersAll = by('outerwear');

  let bases = dresses.map(d => [d]);
  tops.forEach(tp => bottoms.forEach(b => bases.push([tp, b])));
  if (!bases.length) {
    const hasAny = state.items.some(i => i.category === 'dress') || (state.items.some(i => i.category === 'top') && state.items.some(i => i.category === 'bottom'));
    return { results: [], reason: hasAny ? 'Nothing in your wardrobe sits near formality level ' + target + ' for ' + c.occasion + '. Try another occasion or add pieces at that level.' : 'You need a top and a bottom (or a dress) to build outfits.' };
  }
  const keyOf = b => b.map(i => i.id).join('+');
  bases = bases.filter(b => !opts.exclude.has(keyOf(b)));
  if (!bases.length) return { results: [], exhausted: true };

  let outerOpts = [null];
  if (t <= 8) {
    let o = outersAll;
    if (t <= 5) { const w = outersAll.filter(x => x.warmth >= 2); if (w.length) o = w; }
    if (!o.length) return { results: [], reason: 'No outerwear in your wardrobe suits ' + fmtTemp(t) + ' at this formality. A coat would unlock outfits for cold days.' };
    outerOpts = o;
  } else if (t <= 18) outerOpts = [null].concat(outersAll);
  const shoeOpts = shoes.length ? shoes : [null];

  const ctx = { season, temp: t, target, occasion: c.occasion, wearLog: state.wearLog, today: todayISO(), includeVariety: true, vibe: c.vibe };
  const scored = combos([bases, shoeOpts, outerOpts], ENUM_CAP, rnd).map(cb => {
    const items = cb[0].slice(); if (cb[1]) items.push(cb[1]); if (cb[2]) items.push(cb[2]);
    const r = scoreOutfit(items, ctx);
    return { items, base: cb[0], r, key: keyOf(cb[0]) };
  });
  scored.sort((a, b) => b.r.raw - a.r.raw);

  const picked = [];
  const overlap = (a, b) => { const ids = new Set(a.items.filter(i => i.category !== 'accessory').map(i => i.id)); return b.items.filter(i => i.category !== 'accessory' && ids.has(i.id)).length; };
  for (let k = 0; k < scored.length && picked.length < 5; k++) {
    if (picked.every(p => overlap(p, scored[k]) < 2)) picked.push(scored[k]);
  }
  for (let k = 0; k < scored.length && picked.length < 3; k++) if (!picked.includes(scored[k])) picked.push(scored[k]);

  const results = picked.map(p => {
    let items = p.items, r = p.r;
    const shoe = items.find(i => i.category === 'shoes');
    let bestAcc = null, bestRaw = r.raw, bestPair = -1;
    accs.forEach(a => {
      const rr = scoreOutfit(items.concat(a), ctx);
      const pair = shoe ? pairScore(colorInfo(a), colorInfo(shoe)) : 0;
      if (rr.raw > r.raw + 1e-9 && (rr.raw > bestRaw + 1e-9 || (Math.abs(rr.raw - bestRaw) < 1e-9 && pair > bestPair))) { bestAcc = { a, rr }; bestRaw = rr.raw; bestPair = pair; }
    });
    if (bestAcc) { items = items.concat(bestAcc.a); r = bestAcc.rr; }
    return { items, slots: slotsFromItems(items), total: r.total, raw: r.raw, breakdown: r.breakdown, key: p.key };
  });
  return { results, target };
}

function runToday(manual) {
  todayDirty = false;
  const c = todayCtx();
  const empty = $('#today-empty'), box = $('#today-suggestions');
  if (state.items.length < 3) {
    today.results = []; box.innerHTML = '';
    empty.hidden = false;
    empty.innerHTML = emptyHtml('Add a top, a bottom and shoes to get suggestions', '', '<button type="button" class="btn btn-primary" data-action="goto-wardrobe">Go to Wardrobe</button>');
    return;
  }
  if (manual) { today.results.forEach(r => today.exclude.add(r.key)); today.regen++; }
  const seedBase = [todayISO(), c.occasion, c.temp, c.vibe].join('|');
  let out = generateToday(c, { exclude: today.exclude, seed: seedBase + '|' + today.regen });
  if (out.exhausted) {
    today.exclude.clear(); today.regen = 0;
    out = generateToday(c, { exclude: today.exclude, seed: seedBase + '|0' });
    toast('That was every combination. Showing the best again.');
  }
  today.results = out.results;
  if (!out.results.length) {
    box.innerHTML = '';
    empty.hidden = false;
    empty.innerHTML = emptyHtml('Nothing fits this weather and occasion yet', out.reason || 'Try a different occasion or temperature.', '<button type="button" class="btn" data-action="goto-shop">See what to shop</button>');
    return;
  }
  empty.hidden = true;
  box.innerHTML = out.results.map((r, i) =>
    '<article class="suggestion" data-idx="' + i + '"><div class="suggestion-head"><span class="suggestion-title">' + esc(cap(c.occasion)) + ' look ' + (i + 1) + '</span>' + badgeHtml(r.total, true).replace('score-badge-sm', 'score-badge-sm') + '</div>' +
    stackRowHtml(r.items) +
    '<details><summary>Why this scored ' + r.total + '</summary><div class="breakdown" style="margin-top:10px">' + breakdownHtml(r, ['color', 'formality', 'season', 'completeness', 'variety']) + '</div></details>' +
    '<div class="btn-row"><button type="button" class="btn btn-sm" data-act="save">Save</button><button type="button" class="btn btn-sm" data-act="studio">Open in Studio</button><button type="button" class="btn btn-sm btn-primary" data-act="wore">Wore this</button></div></article>'
  ).join('');
}

function todayContextChanged() {
  today.exclude.clear(); today.regen = 0;
  persist();
  renderTodayControls();
  runToday(false);
}

function renderWeek() {
  const days = weekDays(), t = todayISO();
  $('#week-range').textContent = fmtDay(days[0], { month: 'short', day: 'numeric' }) + ' – ' + fmtDay(days[6], { month: 'short', day: 'numeric' });
  $('#today-week').innerHTML = days.map(d => {
    const iso = isoOf(d), o = state.outfits.find(x => x.id === state.calendar[iso]);
    return '<button type="button" class="week-day' + (iso === t ? ' is-today' : '') + '" data-date="' + iso + '" aria-label="' + esc(fmtDay(d)) + (o ? ': ' + esc(o.name) : ': nothing planned') + '"><span>' + esc(d.toLocaleDateString(undefined, { weekday: 'short' })) + '</span><span class="day-num">' + d.getDate() + '</span>' +
      (o ? miniStackHtml(outfitItems(o)) : '<span class="add-tile">+</span>') + '</button>';
  }).join('');
}

/* ======================================================================
 * 12. Rate
 * ==================================================================== */
let ratePhoto = null;

function renderRate() {
  const sl = $('#rate-slots');
  if (!sl.children.length) sl.innerHTML = CATS.map(c => '<div class="slot slot-' + c + '" data-slot="' + c + '"></div>').join('');
  $$('.slot', sl).forEach(el => { const s = el.dataset.slot; renderSlot(el, s, rate.slots[s], {}); });
  $$('#rate-mode button').forEach(b => b.classList.toggle('is-active', b.dataset.mode === rate.mode));
  $('#rate-items').hidden = rate.mode !== 'items';
  $('#rate-outfits').hidden = rate.mode !== 'outfit';
  const list = $('#rate-outfit-list');
  const sig = itemsOfSlots(rate.slots).map(i => i.id).sort().join(',');
  list.innerHTML = state.outfits.length ? state.outfits.map(o => {
    const its = outfitItems(o);
    const sel = its.map(i => i.id).sort().join(',') === sig;
    return '<button type="button" class="outfit-pick' + (sel ? ' is-selected' : '') + '" data-id="' + esc(o.id) + '">' + miniStackHtml(its) +
      '<div class="grow"><div class="outfit-name">' + esc(o.name) + '</div><div class="outfit-occ">' + esc(o.occasion) + '</div></div></button>';
  }).join('') : '<div class="empty">No saved outfits yet. Build one in Studio.</div>';
  const n = itemsOfSlots(rate.slots).length;
  $('#rate-go').disabled = n < 2;
  $('#rate-empty').hidden = !!rate.result || n >= 2;
  $('#rate-result').hidden = !rate.result;
  $('#rate-temp-out').textContent = $('#rate-temp-on').checked ? fmtTemp(Number($('#rate-temp').value)) : 'Not set';
}

function rateSelectionChanged() { rate.result = null; renderRate(); }

function doRate() {
  const items = itemsOfSlots(rate.slots);
  if (items.length < 2) { toast('Choose at least two pieces to rate', true); return; }
  const occ = $('#rate-occasion').value;
  const ctx = { season: seasonOfDate(new Date()), includeVariety: false, occasion: occ || undefined };
  if (occ) ctx.target = OCC_TARGET[occ];
  if ($('#rate-temp-on').checked) ctx.temp = Number($('#rate-temp').value);
  const r = scoreOutfit(items, ctx);
  rate.result = r;
  const s10 = r.total / 10;
  $('#rate-score-num').textContent = s10.toFixed(1);
  const verdict = s10 < 5 ? 'Needs work' : s10 < 7 ? 'Solid' : s10 <= 8.5 ? 'Strong' : 'Sharp';
  $('#rate-verdict').textContent = verdict + ' · ' + r.total + '/100';
  $('#rate-breakdown').innerHTML = breakdownHtml(r, ['color', 'formality', 'season', 'completeness']);
  $('#rate-tips').innerHTML = listHtml(r.tips.length ? r.tips.slice(0, 4) : ['No weak spots found. The pieces are well coordinated.']);
  renderRate();
  $('#rate-result').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ======================================================================
 * 13. Shop
 * ==================================================================== */
const BASICS = [
  { id: 'whitetee', label: 'White tee or shirt', test: i => i.category === 'top' && fam(i) === 'white' && i.formality >= 2 && i.formality <= 3, tpl: { name: 'White tee or shirt', category: 'top', color: '#f5f5f0', formality: 2, warmth: 1 } },
  { id: 'darkbottom', label: 'Black or dark trousers/jeans', test: i => i.category === 'bottom' && i.formality >= 2 && i.formality <= 4 && (['black', 'navy'].includes(fam(i)) || (fam(i) === 'blue' && colorInfo(i).neutral)), tpl: { name: 'Dark trousers or jeans', category: 'bottom', color: '#1c1c1c', formality: 3, warmth: 1 } },
  { id: 'sneakers', label: 'Neutral sneakers', test: i => i.category === 'shoes' && ['white', 'black', 'gray'].includes(fam(i)) && i.formality <= 2, tpl: { name: 'Neutral sneakers', category: 'shoes', color: '#f1f1ee', formality: 2, warmth: 1 } },
  { id: 'dressshoes', label: 'Dress shoes or loafers', test: i => i.category === 'shoes' && ['brown', 'black'].includes(fam(i)) && i.formality >= 4, tpl: { name: 'Loafers or dress shoes', category: 'shoes', color: '#5b3a24', formality: 4, warmth: 1 } },
  { id: 'outerwear', label: 'Versatile outerwear', test: i => i.category === 'outerwear' && ['navy', 'black', 'tan', 'gray'].includes(fam(i)), tpl: { name: 'Versatile jacket or coat', category: 'outerwear', color: '#1f2d4d', formality: 3, warmth: 2 } },
  { id: 'knit', label: 'Navy or gray knit', test: i => i.category === 'top' && ['navy', 'gray'].includes(fam(i)) && i.warmth >= 2, tpl: { name: 'Navy knit', category: 'top', color: '#1f2a44', formality: 3, warmth: 2 } },
  { id: 'blazer', label: 'Blazer', test: i => i.category === 'outerwear' && (/blazer|sport ?coat/i.test(i.name) || i.tags.includes('blazer')), tpl: { name: 'Blazer', category: 'outerwear', color: '#1f2d4d', formality: 4, warmth: 2 } },
  { id: 'belt', label: 'Belt', test: i => i.category === 'accessory' && (/belt/i.test(i.name) || i.tags.includes('belt')), tpl: { name: 'Leather belt', category: 'accessory', color: '#6b4528', formality: 3, warmth: 1 } }
];
function fam(i) { return i.colorFamily || familyOf(i.color); }

function makeHyp(tpl) {
  const color = safeColor(tpl.color);
  return {
    id: 'hyp_' + Math.random().toString(36).slice(2, 8), name: tpl.name, category: tpl.category, color,
    colorFamily: familyOf(color), seasons: tpl.seasons ? tpl.seasons.slice() : SEASONS.slice(),
    formality: tpl.formality, warmth: tpl.warmth || 1, tags: [], notes: '', photo: tpl.photo || null, hyp: true
  };
}

/* Exact combinatorial count of good (>=70) outfits; items with identical
 * (category, color family/neutrality, formality) are grouped and multiplied. */
function countOutfits(items) {
  const groups = {};
  items.forEach(it => {
    const ci = colorInfo(it);
    const sig = ci.fam + (ci.neutral ? 'n' : 'c') + '|' + it.formality;
    const g = groups[it.category] || (groups[it.category] = new Map());
    const e = g.get(sig);
    if (e) e.n++; else g.set(sig, { rep: it, n: 1 });
  });
  const cat = c => groups[c] ? Array.from(groups[c].values()) : [];
  const tops = cat('top'), bottoms = cat('bottom'), dresses = cat('dress'), shoes = cat('shoes');
  const shoeG = shoes.length ? shoes : [{ rep: null, n: 1 }];
  let total = 0;
  const check = (base, sh) => {
    const its = base.map(g => g.rep); if (sh.rep) its.push(sh.rep);
    if (scoreOutfit(its, AGNOSTIC).total >= GOOD_THRESHOLD) total += base.reduce((a, g) => a * g.n, 1) * sh.n;
  };
  dresses.forEach(d => shoeG.forEach(s => check([d], s)));
  tops.forEach(t => bottoms.forEach(b => shoeG.forEach(s => check([t, b], s))));
  return total;
}

function topOutfitsWith(hyp, items, n) {
  const by = c => items.filter(i => i.category === c);
  const shoeL = hyp.category === 'shoes' ? [hyp] : (by('shoes').length ? by('shoes') : [null]);
  let bases = [];
  const dresses = by('dress'), tops = by('top'), bottoms = by('bottom');
  if (hyp.category === 'dress') bases = [[hyp]];
  else if (hyp.category === 'top') bases = bottoms.length ? bottoms.map(b => [hyp, b]) : [[hyp]];
  else if (hyp.category === 'bottom') bases = tops.length ? tops.map(t => [t, hyp]) : [[hyp]];
  else { dresses.forEach(d => bases.push([d])); tops.forEach(t => bottoms.forEach(b => bases.push([t, b]))); }
  const extra = (hyp.category === 'outerwear' || hyp.category === 'accessory') ? [hyp] : [];
  const rnd = mulberry32(hashStr('shop' + hyp.id));
  const res = combos([bases, shoeL], ENUM_CAP, rnd).map(cb => {
    const its = cb[0].concat(cb[1] ? [cb[1]] : [], extra);
    return { items: its, r: scoreOutfit(its, AGNOSTIC) };
  });
  res.sort((a, b) => b.r.raw - a.r.raw);
  const picked = [];
  res.forEach(x => {
    if (picked.length >= n) return;
    const others = x.items.filter(i => i !== hyp);
    if (picked.every(p => p.items.filter(i => i !== hyp && others.includes(i)).length < Math.max(1, others.length - 1))) picked.push(x);
  });
  res.forEach(x => { if (picked.length < n && !picked.includes(x)) picked.push(x); });
  return picked.map(p => ({ items: p.items, total: p.r.total }));
}

function gapCandidates() {
  const items = state.items, out = [], seen = new Set();
  let prio = 0;
  const add = (tpl, why) => {
    const color = safeColor(tpl.color), key = tpl.category + '|' + familyOf(color) + '|' + tpl.formality + '|' + (tpl.seasons ? tpl.seasons.join('') : '');
    if (seen.has(key)) return; seen.add(key);
    out.push({ tpl, why, prio: prio++ });
  };
  // 1. basics
  BASICS.forEach(b => { if (!items.some(b.test)) add(b.tpl, 'Missing basic: ' + b.label.toLowerCase()); });
  // 2. category balance 4:3:2:2
  const ratios = { top: 4, bottom: 3, shoes: 2, outerwear: 2 };
  const counts = {}; Object.keys(ratios).forEach(c => { counts[c] = items.filter(i => i.category === c).length; });
  const T = Object.keys(ratios).reduce((a, c) => a + counts[c], 0), R = 11;
  const fillers = { top: { name: 'Gray crewneck', color: '#8f8f93', formality: 2, warmth: 1 }, bottom: { name: 'Neutral trousers', color: '#3a3a3e', formality: 3, warmth: 1 }, shoes: { name: 'Everyday shoes', color: '#2a2a2a', formality: 3, warmth: 1 }, outerwear: { name: 'Neutral jacket', color: '#6a6a70', formality: 3, warmth: 2 } };
  Object.keys(ratios).forEach(c => {
    const expected = Math.max(T, 6) * ratios[c] / R;
    if (counts[c] < 0.6 * expected) add(Object.assign({ category: c }, fillers[c]), 'Balance: only ' + counts[c] + ' ' + c + (counts[c] === 1 ? '' : (c === 'shoes' ? '' : 's')) + ' vs about ' + Math.round(expected) + ' expected');
  });
  // 3. color
  const infos = items.filter(i => i.category !== 'accessory').map(colorInfo);
  const neutralShare = infos.length ? infos.filter(x => x.neutral).length / infos.length : 0;
  if (infos.length && neutralShare > 0.9) {
    add({ name: 'Olive top', category: 'top', color: '#6b7a3f', formality: 2, warmth: 1 }, 'Color: ' + Math.round(neutralShare * 100) + '% of your wardrobe is neutral. An accent adds range');
    add({ name: 'Burgundy sweater', category: 'top', color: '#6e2233', formality: 3, warmth: 2 }, 'Color: no accent color yet');
    add({ name: 'Mid-blue shirt', category: 'top', color: '#4a76a8', formality: 3, warmth: 1 }, 'Color: no accent color yet');
  }
  // 4. formality
  const app = items.filter(i => i.category !== 'accessory');
  if (!app.some(i => i.formality >= 4)) add({ name: 'Dress shirt', category: 'top', color: '#f7f7f4', formality: 4, warmth: 1 }, 'Formality: nothing at business level or above');
  if (!app.some(i => i.formality <= 1)) add({ name: 'Lounge pants', category: 'bottom', color: '#7d7d80', formality: 1, warmth: 2 }, 'Formality: no loungewear');
  [2, 3, 4].forEach(l => {
    if (app.filter(i => i.formality === l).length < 2) add({ name: 'Level ' + l + ' ' + (FORMALITY_NAMES[l] || '').toLowerCase() + ' top', category: 'top', color: '#8f8f93', formality: l, warmth: 1 }, 'Formality: fewer than 2 pieces at level ' + l);
  });
  // 5. seasons
  const seasonTpl = {
    winter: { name: 'Heavy knit', category: 'top', color: '#2f3a52', formality: 3, warmth: 3 },
    summer: { name: 'Light linen shirt', category: 'top', color: '#ece3cf', formality: 2, warmth: 1 },
    spring: { name: 'Light jacket', category: 'outerwear', color: '#6a6a70', formality: 3, warmth: 1 },
    fall: { name: 'Mid-weight sweater', category: 'top', color: '#6f6f74', formality: 3, warmth: 2 }
  };
  SEASONS.forEach(s => {
    const n = items.filter(i => i.seasons.includes(s)).length;
    if (n < 3) add(Object.assign({}, seasonTpl[s], { seasons: [s] }), 'Season: only ' + n + ' piece' + (n === 1 ? '' : 's') + ' cover ' + s);
  });
  return out;
}

function computeShopSuggestions() {
  const base = countOutfits(state.items);
  const cands = gapCandidates().map(c => {
    const hyp = makeHyp(c.tpl);
    const unlocks = countOutfits(state.items.concat(hyp)) - base;
    const ex = topOutfitsWith(hyp, state.items, 1)[0] || null;
    return Object.assign({}, c, { hyp, unlocks, example: ex });
  });
  cands.sort((a, b) => (b.unlocks - a.unlocks) || (a.prio - b.prio));
  return { base, list: cands.slice(0, 8) };
}

let shopList = [];

function renderShop() {
  const n = state.items.length;
  const heads = $$('#tab-shop > .section-head');
  const lowData = n < 3;
  const emptyEl = $('#shop-empty');
  emptyEl.hidden = !lowData;
  if (lowData) emptyEl.innerHTML = emptyHtml('Add a few items so we can find gaps', 'Shop analysis needs at least three pieces.', '<button type="button" class="btn" data-action="goto-wardrobe">Go to Wardrobe</button>');
  [$('#shop-health'), $('#shop-basics'), $('#shop-suggestions'), $('#shop-balance')].forEach(el => { el.hidden = lowData; });
  heads.slice(0, 3).forEach(h => { h.hidden = lowData; });
  if (!lowData) {
    const owned = BASICS.filter(b => state.items.some(b.test));
    $('#shop-health-line').textContent = 'Core coverage ' + owned.length + '/' + BASICS.length + ' basics';
    $('#shop-health-bar').style.width = Math.round(owned.length / BASICS.length * 100) + '%';
    $('#shop-basics').innerHTML = BASICS.map(b => {
      const has = state.items.some(b.test);
      return '<li class="' + (has ? 'is-owned' : 'is-missing') + '">' + esc(b.label) + (has ? '' : ' <span class="muted small" style="margin-left:auto">missing</span>') + '</li>';
    }).join('');

    const res = computeShopSuggestions();
    shopList = res.list;
    const box = $('#shop-suggestions');
    if (!shopList.length) box.innerHTML = '<div class="empty">' + emptyHtml('Your wardrobe covers the basics', 'No gaps found. See the balance panel below.') + '</div>';
    else box.innerHTML = shopList.map((c, i) =>
      '<article class="suggestion" data-idx="' + i + '"><div class="piece-head"><span class="swatch" style="background:' + safeColor(c.tpl.color) + '"></span><div class="grow"><div class="piece-name">' + esc(c.tpl.name) + '</div><div class="piece-why">' + esc(c.why) + '</div></div></div>' +
      '<span class="unlock">Unlocks ' + c.unlocks + ' new outfit' + (c.unlocks === 1 ? '' : 's') + '</span>' +
      (c.example ? '<details><summary>Example outfit (' + c.example.total + '/100)</summary>' + stackRowHtml(c.example.items.map(it => it.hyp ? Object.assign({}, it, { name: 'New: ' + it.name }) : it)) + '</details>' : '') +
      '<div class="btn-row"><button type="button" class="btn btn-sm" data-act="wish">Add to wishlist</button><button type="button" class="btn btn-sm" data-act="own">I own this</button></div></article>').join('');
    renderBalance();
  }
  renderWishlist();
}

function renderBalance() {
  const items = state.items, total = items.length || 1;
  const ratios = { top: 4, bottom: 3, shoes: 2, outerwear: 2 };
  const T = Object.keys(ratios).reduce((a, c) => a + items.filter(i => i.category === c).length, 0);
  let h = '<h4>Categories (count vs target)</h4>';
  Object.keys(ratios).forEach(c => {
    const cnt = items.filter(i => i.category === c).length, tgt = Math.max(T, 6) * ratios[c] / 11;
    h += barRowHtml(cap(c), cnt / Math.max(tgt, 1), cnt + ' / ' + tgt.toFixed(1));
  });
  ['dress', 'accessory'].forEach(c => { const cnt = items.filter(i => i.category === c).length; h += barRowHtml(cap(c), cnt / total, String(cnt)); });
  const app = items.filter(i => i.category !== 'accessory');
  const neutral = app.filter(i => colorInfo(i).neutral).length, chrom = app.length - neutral;
  h += '<h4>Color mix</h4>' + barRowHtml('Neutral', app.length ? neutral / app.length : 0, neutral + ' pieces') + barRowHtml('Color', app.length ? chrom / app.length : 0, chrom + ' pieces');
  h += '<h4>Formality</h4>';
  for (let l = 1; l <= 5; l++) { const c = app.filter(i => i.formality === l).length; h += barRowHtml(l + ' ' + FORMALITY_NAMES[l], app.length ? c / app.length : 0, String(c)); }
  h += '<h4>Season coverage</h4>';
  SEASONS.forEach(s => { const c = items.filter(i => i.seasons.includes(s)).length; h += barRowHtml(cap(s), c / total, c + ' / ' + items.length); });
  $('#shop-balance').innerHTML = h;
}

function addWishlist(tpl) {
  const color = safeColor(tpl.color);
  if (state.wishlist.some(w => w.name === tpl.name && w.category === tpl.category && w.color === color && w.formality === tpl.formality)) { toast('Already on your wishlist'); return; }
  state.wishlist.push({ id: uid('wsh'), name: tpl.name, category: tpl.category, color, formality: tpl.formality, warmth: tpl.warmth || 1, addedAt: Date.now() });
  persist(); renderWishlist();
  toast('Added to wishlist');
}
function renderWishlist() {
  const box = $('#shop-wishlist');
  if (!state.wishlist.length) { box.innerHTML = '<div class="empty">' + emptyHtml('Nothing saved', 'Add suggested or considered pieces here.') + '</div>'; return; }
  box.innerHTML = state.wishlist.map(w =>
    '<div class="wishlist-item" data-id="' + esc(w.id) + '"><span class="swatch" style="background:' + safeColor(w.color) + '"></span><div class="grow"><div class="piece-name">' + esc(w.name) + '</div><div class="piece-why">' + esc(cap(w.category)) + ' &middot; level ' + w.formality + '</div></div>' +
    '<button type="button" class="btn btn-sm" data-act="own">I own this</button><button type="button" class="btn btn-sm btn-danger" data-act="remove" aria-label="Remove ' + esc(w.name) + ' from wishlist">Remove</button></div>').join('');
}

let considerPhoto = null, lastConsider = null;
function doConsider() {
  const cat = $('#consider-category').value, color = $('#consider-color').value, f = Number($('#consider-formality').value);
  const family = familyOf(color);
  const tpl = { name: cap(family) + ' ' + cat, category: cat, color, formality: f, warmth: cat === 'outerwear' ? 2 : 1, photo: considerPhoto };
  const hyp = makeHyp(tpl);
  const unlocks = countOutfits(state.items.concat(hyp)) - countOutfits(state.items);
  const outfits = topOutfitsWith(hyp, state.items, 3);
  lastConsider = tpl;
  const box = $('#shop-consider-result');
  const show = it => it.hyp ? Object.assign({}, it, { name: 'New: ' + it.name }) : it;
  box.hidden = false;
  box.innerHTML = '<div class="card"><div class="piece-head">' + (considerPhoto ? '<span class="swatch" style="background:#efe9e0 url(' + "'" + esc(considerPhoto) + "'" + ') center / contain no-repeat"></span>' : '<span class="swatch" style="background:' + safeColor(color) + '"></span>') + '<div class="grow"><div class="piece-name">' + esc(tpl.name) + '</div><div class="piece-why">Formality level ' + f + '</div></div></div>' +
    '<span class="unlock">Unlocks ' + unlocks + ' new outfit' + (unlocks === 1 ? '' : 's') + ' (scoring 70+)</span>' +
    '<div class="btn-row"><button type="button" class="btn btn-sm" data-act="consider-wish">Add to wishlist</button></div></div>' +
    (outfits.length ? outfits.map((o, i) => '<div class="card"><div class="suggestion-head"><span class="suggestion-title">Outfit ' + (i + 1) + '</span>' + badgeHtml(o.total, true) + '</div>' + stackRowHtml(o.items.map(show)) + '</div>').join('')
      : '<div class="empty">' + emptyHtml('No complete outfit yet', 'You need more pieces to build a full outfit around this one.') + '</div>');
}

/* ======================================================================
 * 14. Settings
 * ==================================================================== */
function openSettings() {
  $('#pref-units').value = state.prefs.units;
  $('#pref-vibe').value = state.prefs.defaultVibe;
  $('#pref-time').value = state.prefs.todayTime;
  let kb = 0; try { kb = Math.round(JSON.stringify(state).length / 1024); } catch (e) { /* ignore */ }
  $('#settings-storage').textContent = 'Using about ' + kb + ' KB of browser storage (' + state.items.length + ' items, ' + state.outfits.length + ' outfits).';
  openModal('settings-modal');
}
function setUnits(u) {
  state.prefs.units = u === 'F' ? 'F' : 'C';
  persist();
  renderTodayControls();
  $('#pref-units').value = state.prefs.units;
  $('#consider-formality-out').textContent = $('#consider-formality').value;
  if (currentTab === 'today') runToday(false);
  renderRate();
}
function exportData() {
  try {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'outfit-studio-' + todayISO() + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast('Exported backup');
  } catch (e) { toast('Export failed', true); }
}
function importData(file) {
  const fr = new FileReader();
  fr.onerror = () => toast('Could not read that file', true);
  fr.onload = async () => {
    let parsed = null;
    try { parsed = JSON.parse(String(fr.result)); } catch (e) { parsed = null; }
    const next = parsed && Array.isArray(parsed.items) ? normalizeState(parsed) : null;
    if (!next) { toast('That file is not an Outfit Studio backup', true); return; }
    const ok = await confirmDialog('Replace your data?', 'Import ' + next.items.length + ' items and ' + next.outfits.length + ' outfits? This replaces everything currently stored.', 'Import');
    if (!ok) return;
    replaceState(next);
    closeModal('settings-modal');
    toast('Import complete');
  };
  fr.readAsText(file);
}
function replaceState(next) {
  state = next;
  studio.slots = emptySlots(); studio.locks = {}; studio.folder = 'all';
  rate.slots = emptySlots(); rate.result = null;
  today = { results: [], exclude: new Set(), regen: 0 };
  todayDirty = true;
  persist();
  showTab(currentTab);
}

/* ======================================================================
 * 15. Data-changed refresh + event wiring
 * ==================================================================== */
function dataChanged() {
  persist();
  todayDirty = true;
  $('#wardrobe-count').textContent = state.items.length;
  if (currentTab === 'today') { runToday(false); renderWeek(); }
  else showTab(currentTab);
  // keep other panels fresh without switching
  if (currentTab !== 'wardrobe') { /* rendered on show */ }
  if (!$('#picker-modal').hidden) renderPicker();
}

function bind() {
  // Tabs
  $('#tabbar').addEventListener('click', e => { const b = e.target.closest('.tab'); if (b) showTab(b.dataset.tab); });

  // Global modal close + actions
  document.addEventListener('click', e => {
    const closeBtn = e.target.closest('[data-close]');
    if (closeBtn) { const m = closeBtn.closest('.sheet-backdrop'); if (m) closeModal(m.id); return; }
    if (e.target.classList && e.target.classList.contains('sheet-backdrop')) { closeModal(e.target.id); return; }
    const a = e.target.closest('[data-action]');
    if (a) {
      const act = a.dataset.action;
      if (act === 'add-item') openItemModal();
      else if (act === 'load-starter') loadStarter();
      else if (act === 'clear-filters') clearFilters();
      else if (act === 'goto-wardrobe') { closeModal('picker-modal'); showTab('wardrobe'); }
      else if (act === 'goto-shop') showTab('shop');
    }
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { const open = $$('.sheet-backdrop:not([hidden])'); if (open.length) closeModal(open[open.length - 1].id); }
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('slot') && e.target === document.activeElement) { e.preventDefault(); e.target.click(); }
  });

  // Confirm / prompt
  $('#confirm-ok').addEventListener('click', () => { const r = confirmResolve; confirmResolve = null; closeModal('confirm-modal'); if (r) r(true); });
  $('#confirm-cancel').addEventListener('click', () => closeModal('confirm-modal'));
  $('#prompt-cancel').addEventListener('click', () => closeModal('prompt-modal'));
  $('#prompt-form').addEventListener('submit', e => {
    e.preventDefault();
    const v = $('#prompt-input').value.trim(); if (!v) return;
    const r = promptResolve; promptResolve = null; closeModal('prompt-modal'); if (r) r(v);
  });

  /* ---- Wardrobe ---- */
  $('#wardrobe-add').addEventListener('click', () => openItemModal());
  /* ---- Scan flat-lay ---- */
  $('#wardrobe-scan').addEventListener('click', scanOpen);
  $('#scan-photo').addEventListener('change', onScanPhoto);
  $('#scan-photo-camera').addEventListener('change', onScanPhoto);
  $('#scan-photo-take').addEventListener('click', () => $('#scan-photo-camera').click());
  $('#scan-cards').addEventListener('change', e => { if (e.target.classList.contains('scan-inc')) scanUpdateCount(); });
  $('#scan-add').addEventListener('click', scanAddSelected);
  $('#scan-more').addEventListener('click', () => scanRun(0.8));
  $('#scan-less').addEventListener('click', () => scanRun(1.25));
  $('#scan-retry').addEventListener('click', () => { scan.canvas = null; scanSetStep('intro'); });
  $('#scan-whole').addEventListener('click', () => { const url = scan.wholeUrl; closeModal('scan-modal'); openItemModal({ photo: url, source: 'upload' }); });
  $('#open-settings').addEventListener('click', openSettings);
  $('#wardrobe-search').addEventListener('input', e => { wf.q = e.target.value; renderWardrobe(); });
  const chipFilter = (sel, key) => $(sel).addEventListener('click', e => { const b = e.target.closest('[data-val]'); if (!b) return; wf[key] = b.dataset.val; renderWardrobe(); });
  chipFilter('#filter-category', 'category'); chipFilter('#filter-color', 'color'); chipFilter('#filter-season', 'season');
  $('#filter-formality').addEventListener('change', e => { wf.formality = e.target.value; renderWardrobe(); });
  $('#filter-clear').addEventListener('click', clearFilters);
  $('#wardrobe-grid').addEventListener('click', e => { const c = e.target.closest('.item-card'); if (c) openDetail(c.dataset.id); });

  $('#detail-edit').addEventListener('click', () => { const it = getItem(detailId); if (it) { closeModal('detail-modal'); openItemModal({ item: it }); } });
  $('#detail-delete').addEventListener('click', () => deleteItem(detailId));
  $('#detail-studio').addEventListener('click', () => {
    const it = getItem(detailId); if (!it) return;
    addItemToSlots(studio.slots, it);
    closeModal('detail-modal'); showTab('studio'); toast('Added to Studio');
  });

  // item form
  $('#item-color').addEventListener('input', () => { itemEdit.manualFamily = false; updateItemColorUI(); });
  $('#item-family').addEventListener('change', () => { itemEdit.manualFamily = $('#item-family').value !== familyOf($('#item-color').value); });
  $('#item-formality').addEventListener('input', updateItemSliderUI);
  $('#item-warmth').addEventListener('input', updateItemSliderUI);
  const onItemPhoto = async e => {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    try {
      const r = await processImage(f);
      const cut = makeCutout(r.canvas);
      if (cut) {
        itemEdit.photoOriginal = r.dataUrl; itemEdit.cutoutUrl = cut.dataUrl; itemEdit.cutout = true;
        itemEdit.photo = cut.dataUrl; itemEdit.note = '';
      } else {
        itemEdit.photoOriginal = null; itemEdit.cutoutUrl = null; itemEdit.cutout = false;
        itemEdit.photo = r.dataUrl; itemEdit.note = "Background removal didn't work on this photo — keeping the original.";
      }
      setItemPhotoUI();
      $('#item-color').value = cut ? cut.color : r.color; itemEdit.manualFamily = false; updateItemColorUI();
      toast(cut ? 'Photo added. Background removed.' : 'Photo added. Color sampled from the center.');
    } catch (err) { toast('Could not read that image', true); }
    e.target.value = '';
  };
  $('#item-photo').addEventListener('change', onItemPhoto);
  $('#item-photo-camera').addEventListener('change', onItemPhoto);
  $('#item-photo-take').addEventListener('click', () => $('#item-photo-camera').click());
  $('#item-photo-remove').addEventListener('click', () => { itemEdit.photo = null; itemEdit.photoOriginal = null; itemEdit.cutoutUrl = null; itemEdit.cutout = false; itemEdit.note = ''; setItemPhotoUI(); });
  $('#item-photo-toggle').addEventListener('click', () => {
    if (!itemEdit.cutoutUrl || !itemEdit.photoOriginal) return;
    itemEdit.cutout = !itemEdit.cutout;
    itemEdit.photo = itemEdit.cutout ? itemEdit.cutoutUrl : itemEdit.photoOriginal;
    setItemPhotoUI();
  });
  $('#item-catalog-btn').addEventListener('click', openCatalog);
  $('#catalog-list').addEventListener('click', e => { const c = e.target.closest('[data-cat-idx]'); if (c) pickCatalog(Number(c.dataset.catIdx)); });
  $('#item-form').addEventListener('submit', e => { e.preventDefault(); saveItemFromForm(); });
  $('#item-delete').addEventListener('click', () => { if (itemEdit.editingId) deleteItem(itemEdit.editingId); });

  /* ---- Picker ---- */
  $('#picker-grid').addEventListener('click', e => { const c = e.target.closest('.item-card'); if (c) pickerClick(c.dataset.id); });
  $('#picker-clear').addEventListener('click', () => { if (pickerCtx) { pickerCtx.selected = []; pickerCtx.onChange([]); } closeModal('picker-modal'); });
  $('#picker-done').addEventListener('click', () => closeModal('picker-modal'));

  /* ---- Studio ---- */
  $('#studio-canvas').addEventListener('click', e => {
    const slotEl = e.target.closest('.slot'); if (!slotEl) return;
    const slot = slotEl.dataset.slot, actBtn = e.target.closest('[data-act]');
    if (actBtn && actBtn.dataset.act === 'clear') { studio.slots[slot] = []; renderStudio(); return; }
    if (actBtn && actBtn.dataset.act === 'lock') { studio.locks[slot] = !studio.locks[slot]; renderStudio(); return; }
    openStudioPicker(slot);
  });
  $('#studio-randomize').addEventListener('click', studioRandomize);
  $('#studio-suggest').addEventListener('click', () => {
    if (!state.items.length) { toast('Add items to your wardrobe first', true); return; }
    const s = suggestCompletion(studio.slots);
    if (!s) { toast('Nothing to suggest yet', true); return; }
    const before = JSON.stringify(studio.slots); studio.slots = s;
    renderStudio();
    toast(JSON.stringify(s) === before ? 'This outfit is already the best completion' : 'Suggested the best-scoring completion');
  });
  $('#studio-clear').addEventListener('click', () => { studio.slots = emptySlots(); studio.locks = {}; renderStudio(); });
  $('#studio-save').addEventListener('click', () => {
    if (!slotCount(studio.slots)) { toast('Pick at least one item first', true); return; }
    openOutfitModal({ slots: studio.slots, folderId: state.folders.some(f => f.id === studio.folder) ? studio.folder : '' });
  });
  $('#outfit-form').addEventListener('submit', e => { e.preventDefault(); saveOutfitFromForm(); });
  $('#studio-folders').addEventListener('click', async e => {
    const b = e.target.closest('[data-folder]'); if (!b) return;
    if (b.dataset.folder === '__new') {
      const name = await promptDialog('New folder', '');
      if (!name) return;
      const f = { id: uid('fld'), name: name.slice(0, 40), createdAt: Date.now() };
      state.folders.push(f); studio.folder = f.id; persist(); renderStudio(); toast('Created folder "' + f.name + '"');
    } else { studio.folder = b.dataset.folder; renderStudio(); }
  });
  $('#folder-rename').addEventListener('click', async () => {
    const f = state.folders.find(x => x.id === studio.folder); if (!f) return;
    const name = await promptDialog('Rename folder', f.name);
    if (!name) return;
    f.name = name.slice(0, 40); persist(); renderStudio(); toast('Folder renamed');
  });
  $('#folder-delete').addEventListener('click', async () => {
    const f = state.folders.find(x => x.id === studio.folder); if (!f) return;
    const ok = await confirmDialog('Delete folder?', '"' + f.name + '" will be removed. Its outfits move to Unfiled.', 'Delete');
    if (!ok) return;
    state.outfits.forEach(o => { if (o.folderId === f.id) o.folderId = null; });
    state.folders = state.folders.filter(x => x.id !== f.id);
    studio.folder = 'all'; persist(); renderStudio(); toast('Folder deleted');
  });
  $('#studio-outfits').addEventListener('click', e => { const c = e.target.closest('.outfit-card'); if (c) openOutfitMenu(c.dataset.id); });

  // outfit menu
  $('#outfit-menu-body').addEventListener('click', async e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const o = state.outfits.find(x => x.id === menuOutfitId); if (!o) return;
    const act = b.dataset.act;
    if (act === 'open') { closeModal('outfit-menu-modal'); openInStudio(o.slots); toast('Loaded "' + o.name + '"'); }
    else if (act === 'edit') { closeModal('outfit-menu-modal'); openOutfitModal({ outfit: o }); }
    else if (act === 'rename') {
      const name = await promptDialog('Rename outfit', o.name);
      if (name) { o.name = name.slice(0, 60); persist(); renderStudio(); renderWeek(); renderOutfitMenu('main'); toast('Renamed'); }
    }
    else if (act === 'move') renderOutfitMenu('move');
    else if (act === 'assign') renderOutfitMenu('assign');
    else if (act === 'back') renderOutfitMenu('main');
    else if (act === 'moveto') { o.folderId = b.dataset.folder || null; persist(); renderStudio(); renderOutfitMenu('main'); toast('Moved'); }
    else if (act === 'newfolder') {
      const name = await promptDialog('New folder', '');
      if (name) { const f = { id: uid('fld'), name: name.slice(0, 40), createdAt: Date.now() }; state.folders.push(f); o.folderId = f.id; persist(); renderStudio(); renderOutfitMenu('main'); toast('Moved to "' + f.name + '"'); }
    }
    else if (act === 'assignto') { assignDay(b.dataset.date, o.id); closeModal('outfit-menu-modal'); }
    else if (act === 'delete') {
      const ok = await confirmDialog('Delete outfit?', '"' + o.name + '" and its planned days will be removed.', 'Delete');
      if (ok) { closeModal('outfit-menu-modal'); deleteOutfit(o.id); }
    }
  });

  // day modal
  $('#today-week').addEventListener('click', e => { const b = e.target.closest('.week-day'); if (b) openDayModal(b.dataset.date); });
  $('#day-outfit-list').addEventListener('click', e => { const b = e.target.closest('.outfit-pick'); if (b && dayDate) { assignDay(dayDate, b.dataset.id); closeModal('day-modal'); } });
  $('#day-remove').addEventListener('click', () => { if (dayDate) { removeDay(dayDate); closeModal('day-modal'); } });

  /* ---- Today ---- */
  $('#today-occasions').addEventListener('click', e => { const b = e.target.closest('[data-occ]'); if (!b) return; todayCtx().occasion = b.dataset.occ; todayContextChanged(); });
  $('#today-vibes').addEventListener('click', e => { const b = e.target.closest('[data-vibe]'); if (!b) return; todayCtx().vibe = b.dataset.vibe; todayContextChanged(); });
  $('#today-temp').addEventListener('input', e => {
    todayCtx().temp = Number(e.target.value);
    $('#today-temp-out').textContent = fmtTemp(todayCtx().temp);
  });
  $('#today-temp').addEventListener('change', todayContextChanged);
  $('#today-units').addEventListener('click', e => { const b = e.target.closest('[data-unit]'); if (b) setUnits(b.dataset.unit); });
  $('#today-generate').addEventListener('click', () => { runToday(true); persist(); });
  $('#today-suggestions').addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const card = b.closest('.suggestion'); const r = today.results[Number(card.dataset.idx)]; if (!r) return;
    const c = todayCtx();
    if (b.dataset.act === 'save') openOutfitModal({ slots: r.slots, name: cap(c.occasion) + ' look', occasion: c.occasion });
    else if (b.dataset.act === 'studio') openInStudio(r.slots);
    else if (b.dataset.act === 'wore') { wearToday(r.slots, cap(c.occasion) + ' look', c.occasion); }
  });

  /* ---- Rate ---- */
  $('#rate-mode').addEventListener('click', e => { const b = e.target.closest('[data-mode]'); if (b) { rate.mode = b.dataset.mode; renderRate(); } });
  $('#rate-slots').addEventListener('click', e => {
    const slotEl = e.target.closest('.slot'); if (!slotEl) return;
    const slot = slotEl.dataset.slot, actBtn = e.target.closest('[data-act]');
    if (actBtn && actBtn.dataset.act === 'clear') { rate.slots[slot] = []; rateSelectionChanged(); return; }
    openPicker({
      title: 'Choose ' + slot, cats: [slot], selected: rate.slots[slot], multi: MULTI_SLOTS.has(slot),
      onChange: ids => { setSlotIds(rate.slots, slot, ids, false); rateSelectionChanged(); }
    });
  });
  $('#rate-outfit-list').addEventListener('click', e => {
    const b = e.target.closest('.outfit-pick'); if (!b) return;
    const o = state.outfits.find(x => x.id === b.dataset.id); if (!o) return;
    rate.slots = copySlots(o.slots); rateSelectionChanged();
  });
  $('#rate-temp').addEventListener('input', () => { $('#rate-temp-on').checked = true; rateSelectionChanged(); });
  $('#rate-temp-on').addEventListener('change', rateSelectionChanged);
  $('#rate-occasion').addEventListener('change', () => { if (rate.result) doRate(); });
  $('#rate-go').addEventListener('click', doRate);
  $('#rate-open-studio').addEventListener('click', () => openInStudio(rate.slots));
  $('#rate-save').addEventListener('click', () => openOutfitModal({ slots: rate.slots, occasion: $('#rate-occasion').value || 'casual' }));
  $('#rate-photo').addEventListener('change', async e => {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    try {
      const r = await processImage(f);
      const cut = makeCutout(r.canvas);
      ratePhoto = cut ? { dataUrl: cut.dataUrl, color: cut.color, original: r.dataUrl, cutout: true } : { dataUrl: r.dataUrl, color: r.color, original: null, cutout: false };
      $('#rate-photo-img').src = ratePhoto.dataUrl;
      $('#rate-photo-preview').classList.toggle('is-cutout', ratePhoto.cutout);
      $('#rate-photo-preview').hidden = false;
      $('#rate-add-wardrobe').hidden = false;
    } catch (err) { toast('Could not read that image', true); }
    e.target.value = '';
  });
  $('#rate-add-wardrobe').addEventListener('click', () => { if (ratePhoto) openItemModal({ photo: ratePhoto.dataUrl, photoOriginal: ratePhoto.original, cutout: ratePhoto.cutout, color: ratePhoto.color, source: 'rate' }); });

  /* ---- Shop ---- */
  $('#shop-suggestions').addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const c = shopList[Number(b.closest('.suggestion').dataset.idx)]; if (!c) return;
    if (b.dataset.act === 'wish') addWishlist(c.tpl);
    else if (b.dataset.act === 'own') openItemModal({ prefill: { name: c.tpl.name, category: c.tpl.category, color: c.tpl.color, seasons: c.tpl.seasons || SEASONS, formality: c.tpl.formality, warmth: c.tpl.warmth } });
  });
  $('#consider-formality').addEventListener('input', e => { $('#consider-formality-out').textContent = e.target.value; });
  $('#consider-photo').addEventListener('change', async e => {
    const f = e.target.files && e.target.files[0];
    if (!f) { considerPhoto = null; return; }
    try { const r = await processImage(f); const cut = makeCutout(r.canvas); considerPhoto = cut ? cut.dataUrl : r.dataUrl; $('#consider-color').value = cut ? cut.color : r.color; toast(cut ? 'Photo added. Background removed.' : 'Photo added. Color sampled.'); }
    catch (err) { considerPhoto = null; toast('Could not read that image', true); }
  });
  $('#shop-consider-form').addEventListener('submit', e => { e.preventDefault(); doConsider(); });
  $('#shop-consider-result').addEventListener('click', e => { if (e.target.closest('[data-act="consider-wish"]') && lastConsider) addWishlist(lastConsider); });
  $('#shop-wishlist').addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const w = state.wishlist.find(x => x.id === b.closest('.wishlist-item').dataset.id); if (!w) return;
    if (b.dataset.act === 'remove') { state.wishlist = state.wishlist.filter(x => x.id !== w.id); persist(); renderWishlist(); toast('Removed from wishlist'); }
    else if (b.dataset.act === 'own') openItemModal({ prefill: { name: w.name, category: w.category, color: w.color, seasons: SEASONS, formality: w.formality, warmth: w.warmth } });
  });

  /* ---- Settings ---- */
  $('#pref-units').addEventListener('change', e => setUnits(e.target.value));
  $('#pref-vibe').addEventListener('change', e => { state.prefs.defaultVibe = e.target.value; persist(); toast('Default vibe saved'); });
  $('#pref-time').addEventListener('change', e => { if (/^\d{2}:\d{2}$/.test(e.target.value)) { state.prefs.todayTime = e.target.value; persist(); } });
  $('#settings-export').addEventListener('click', exportData);
  $('#settings-import').addEventListener('change', e => { const f = e.target.files && e.target.files[0]; if (f) importData(f); e.target.value = ''; });
  $('#settings-reset').addEventListener('click', async () => {
    const ok = await confirmDialog('Reset everything?', 'This replaces your wardrobe, outfits and plans with the 14-item starter wardrobe.', 'Reset');
    if (!ok) return;
    const prefs = state.prefs;
    const fresh = seedState(); fresh.prefs.units = prefs.units; fresh.prefs.todayTime = prefs.todayTime; fresh.prefs.defaultVibe = prefs.defaultVibe; fresh.prefs.lastContext.vibe = prefs.defaultVibe;
    replaceState(fresh);
    closeModal('settings-modal');
    toast('Reset to starter wardrobe');
  });
}

function clearFilters() {
  wf.q = ''; wf.category = ''; wf.color = ''; wf.season = ''; wf.formality = '';
  renderWardrobe();
}

/* ======================================================================
 * 16. Init
 * ==================================================================== */
function init() {
  const stored = readStorage();
  let loaded = stored ? normalizeState(stored) : null;
  if (!loaded) { loaded = seedState(); state = loaded; persist(); }
  else state = loaded;
  $('#app-date').textContent = fmtDay(new Date(), { weekday: 'short', month: 'short', day: 'numeric' });
  bind();
  showTab('today');
  try {
    if ((location.protocol === 'http:' || location.protocol === 'https:') && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  } catch (e) { /* ignore */ }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
