import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { adbManager } from './adb.js';
import { DEVICE_PERSONAS } from './aiCommentService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEMP_DIR = path.join(__dirname, 'temp_images');
const ASSETS_DIR = path.join(__dirname, 'assets', 'memes');

if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });
if (!fs.existsSync(ASSETS_DIR)) fs.mkdirSync(ASSETS_DIR, { recursive: true });

// Curated blank reaction meme templates mapped by device persona (NO TEXT, zero font errors)
export const PERSONA_MEME_POOLS = {
  // Device 1: Vsmart Aris - Gen Z hướng nội sợ giao tiếp
  'BDE00051677': ['awkward', 'cryingfloor', 'rollsafe', 'fine', 'facepalm', 'sadfrog'],

  // Device 2: Realme CPH2321 - Gen Z mới đi làm bị dí tiếng Trung
  'GAGAA68HPVCEJFJV': ['panik-kalm-panik', 'cheems', 'drake', 'woman-cat', 'fine'],

  // Device 3: Samsung A14 - Chiến thần nhồi từ vựng nhưng não lag
  'R58W41KSL2Y': ['headaches', 'fry', 'doge', 'facepalm', 'sadfrog'],

  // Device 4: Oppo A53 - Bà tám Gen Z mách nước phát âm
  'c216669c': ['spongebob', 'woman-cat', 'drake', 'grumpycat', 'agnes'],

  // Device 5: Realme 5s - Gen Z mê app xịn trải nghiệm free
  'fcec5b9c': ['rollsafe', 'drake', 'buzz', 'disastergirl', 'cheems']
};

// Global fallback pool
const ALL_MEMES = [
  'fine', 'drake', 'rollsafe', 'panik-kalm-panik', 'cheems', 'doge',
  'spongebob', 'woman-cat', 'headaches', 'fry', 'awkward', 'cryingfloor',
  'facepalm', 'sadfrog', 'grumpycat', 'agnes', 'buzz', 'disastergirl'
];

// Tracking index for rotating memes per device
const memeRotationCounters = {};

/**
 * Get pure blank meme buffer (from local cache first, online fallback)
 */
export async function getPureMemeBuffer(template) {
  const localFile = path.join(ASSETS_DIR, `${template}.jpg`);
  if (fs.existsSync(localFile) && fs.statSync(localFile).size > 1000) {
    return fs.readFileSync(localFile);
  }

  // Fallback to fetch from memegen.link
  try {
    const url = `https://api.memegen.link/images/${template}.jpg`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer());
      fs.writeFileSync(localFile, buf);
      return buf;
    }
  } catch (err) {
    console.warn(`[Meme Service] Could not fetch ${template} online: ${err.message}`);
  }

  // Fallback to any available local meme
  const files = fs.readdirSync(ASSETS_DIR).filter(f => f.endsWith('.jpg'));
  if (files.length > 0) {
    return fs.readFileSync(path.join(ASSETS_DIR, files[0]));
  }

  throw new Error(`No meme template found for ${template}`);
}

/**
 * Prepares a pure meme image (NO TEXT overlay) and pushes it to an Android device.
 * Pushes to both /sdcard/Pictures/Hanpeak and /sdcard/DCIM/Camera to ensure
 * all OEM galleries (Samsung, Realme, Oppo, Vsmart) immediately index it as the newest photo.
 */
export async function prepareAndPushMeme(serial, topic = '') {
  const persona = DEVICE_PERSONAS[serial] || { name: 'Gen Z học tiếng Trung' };
  const pool = PERSONA_MEME_POOLS[serial] || ALL_MEMES;
  const idx = (memeRotationCounters[serial] || 0) % pool.length;
  memeRotationCounters[serial] = idx + 1;
  const template = pool[idx];

  const timestamp = Date.now();
  const filename = `meme_${template}_${timestamp}.jpg`;
  const localFilePath = path.join(TEMP_DIR, filename);

  // 1. Get pure meme buffer (no text, zero font glitches)
  const buffer = await getPureMemeBuffer(template);
  fs.writeFileSync(localFilePath, buffer);

  // 2. Target directories on device
  const picturesDir = '/sdcard/Pictures/Hanpeak';
  const cameraDir = '/sdcard/DCIM/Camera';

  const picturesPath = `${picturesDir}/${filename}`;
  const cameraPath = `${cameraDir}/${filename}`;

  // Ensure directories exist
  await adbManager.execCommand(`-s ${serial} shell mkdir -p ${picturesDir}`);
  await adbManager.execCommand(`-s ${serial} shell mkdir -p ${cameraDir}`);

  // 3. Push to both Pictures and DCIM/Camera for universal OEM Gallery support
  await adbManager.execCommand(`-s ${serial} push "${localFilePath}" "${picturesPath}"`);
  try {
    await adbManager.execCommand(`-s ${serial} push "${localFilePath}" "${cameraPath}"`);
  } catch {}

  // 4. Force Android Media Scanner to index the images
  await adbManager.execCommand(`-s ${serial} shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d file://${picturesPath}`);
  try {
    await adbManager.execCommand(`-s ${serial} shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d file://${cameraPath}`);
  } catch {}

  return {
    success: true,
    localPath: localFilePath,
    remotePath: picturesPath,
    filename,
    template,
    persona: persona.name,
    bytes: buffer.length
  };
}

/**
 * Import distinct meme images to all connected devices in parallel
 */
export async function importMemesToAllDevices() {
  const devices = await adbManager.getDevices();
  const online = devices.filter(d => d.state === 'device');
  const results = [];

  for (const d of online) {
    try {
      const res = await prepareAndPushMeme(d.serial);
      results.push({ serial: d.serial, model: d.model, success: true, template: res.template, bytes: res.bytes });
    } catch (e) {
      results.push({ serial: d.serial, model: d.model, success: false, error: e.message });
    }
  }

  return results;
}
