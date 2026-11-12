import { spawn, exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import { XMLParser } from 'fast-xml-parser';

// Auto-detect best adb path
function findAdbPath() {
  const candidates = [
    'C:\\Users\\ndtam\\GenFarmer V3\\platform-tools\\adb.exe',
    'C:\\platform-tools\\adb.exe',
    process.env.ADB_PATH,
    'adb'
  ];
  for (const c of candidates) {
    if (c && fs.existsSync(c)) {
      return c;
    }
  }
  return 'adb';
}

export const ADB_PATH = findAdbPath();
console.log(`[ADB] Using binary: ${ADB_PATH}`);

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_'
});

export class AdbManager {
  constructor() {
    this.adb = ADB_PATH;
    this.screencapCache = new Map(); // serial -> { buffer, timestamp }
    this.screencapInFlight = new Map(); // serial -> Promise<Buffer>
    this.deviceSpecsCache = new Map(); // serial -> { battery, resolution, isScreenOn, timestamp }
  }

  execCommand(args, retries = 2) {
    return new Promise((resolve, reject) => {
      const attempt = (left) => {
        exec(`"${this.adb}" ${args}`, { maxBuffer: 10 * 1024 * 1024 }, async (err, stdout, stderr) => {
          if (err) {
            const errStr = (stderr || err.message || '').toLowerCase();
            // Auto retry on transient ADB daemon handshake / restart
            if (left > 0 && (errStr.includes('daemon not running') || errStr.includes('could not read ok') || errStr.includes('failed to start daemon'))) {
              await new Promise(r => setTimeout(r, 600));
              return attempt(left - 1);
            }
            return reject(new Error(stderr || err.message));
          }
          resolve(stdout.trim());
        });
      };
      attempt(retries);
    });
  }

  async getDevices() {
    try {
      const output = await this.execCommand('devices -l');
      const lines = output.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('List of devices'));
      const devices = [];
      const now = Date.now();

      for (const line of lines) {
        // e.g. "GAGAA68HPVCEJFJV device product:RMX3125 model:CPH2321 device:RE5485 transport_id:16"
        const parts = line.split(/\s+/);
        if (parts.length >= 2) {
          const serial = parts[0];
          const state = parts[1];

          let model = 'Android';
          let product = '';
          for (const p of parts.slice(2)) {
            if (p.startsWith('model:')) model = p.replace('model:', '');
            if (p.startsWith('product:')) product = p.replace('product:', '');
          }

          let battery = '100%';
          let resolution = '720x1600';
          let isScreenOn = true;

          const cached = this.deviceSpecsCache.get(serial);
          if (cached && (now - cached.timestamp < 30000)) {
            battery = cached.battery;
            resolution = cached.resolution;
            isScreenOn = cached.isScreenOn;
          } else if (state === 'device') {
            // Fast probe in background / quick timeout to avoid blocking getDevices
            try {
              const bOut = await this.execCommand(`-s ${serial} shell "dumpsys battery | grep level; dumpsys display | grep -E 'init=|mScreenState'"`);
              const bMatch = bOut.match(/level:\s*(\d+)/i);
              if (bMatch) battery = `${bMatch[1]}%`;

              const rMatch = bOut.match(/init=(\d+x\d+)/i);
              if (rMatch) resolution = rMatch[1];

              isScreenOn = !bOut.includes('mScreenState=OFF');
              this.deviceSpecsCache.set(serial, { battery, resolution, isScreenOn, timestamp: now });
            } catch {
              // fallback to cached if error
              if (cached) {
                battery = cached.battery;
                resolution = cached.resolution;
              }
            }
          }

          devices.push({
            serial,
            state,
            model,
            product,
            battery,
            resolution,
            isScreenOn
          });
        }
      }

      return devices;
    } catch (err) {
      if (!err.message?.includes('daemon not running')) {
        console.warn('[ADB] getDevices:', err.message);
      }
      return [];
    }
  }

  // Raw PNG screencap with deduplication & memory caching to eliminate lag
  screencapBuffer(serial) {
    const now = Date.now();
    const cached = this.screencapCache.get(serial);
    // 400ms TTL: Prevents multiple concurrent screenshot requests from choking USB
    if (cached && (now - cached.timestamp < 400)) {
      return Promise.resolve(cached.buffer);
    }

    // If an ADB capture is already in-flight for this serial, piggyback on that exact promise
    if (this.screencapInFlight.has(serial)) {
      return this.screencapInFlight.get(serial);
    }

    const capturePromise = new Promise((resolve, reject) => {
      const proc = spawn(this.adb, ['-s', serial, 'exec-out', 'screencap', '-p']);
      const chunks = [];
      proc.stdout.on('data', chunk => chunks.push(chunk));
      proc.stderr.on('data', () => {});
      proc.on('close', code => {
        this.screencapInFlight.delete(serial);
        if (code === 0 && chunks.length > 0) {
          const buffer = Buffer.concat(chunks);
          this.screencapCache.set(serial, { buffer, timestamp: Date.now() });
          resolve(buffer);
        } else {
          if (cached) resolve(cached.buffer);
          else reject(new Error(`Screencap failed with exit code ${code}`));
        }
      });
      proc.on('error', err => {
        this.screencapInFlight.delete(serial);
        if (cached) resolve(cached.buffer);
        else reject(err);
      });
    });

    this.screencapInFlight.set(serial, capturePromise);
    return capturePromise;
  }

  async tap(serial, x, y) {
    return this.execCommand(`-s ${serial} shell input tap ${Math.round(x)} ${Math.round(y)}`);
  }

  async swipe(serial, x1, y1, x2, y2, durationMs = 300) {
    return this.execCommand(`-s ${serial} shell input swipe ${Math.round(x1)} ${Math.round(y1)} ${Math.round(x2)} ${Math.round(y2)} ${durationMs}`);
  }

  async isAdbKeyboardActive(serial) {
    try {
      const ime = await this.execCommand(`-s ${serial} shell settings get secure default_input_method`);
      return Boolean(ime && ime.toLowerCase().includes('adbkeyboard'));
    } catch {
      return false;
    }
  }

  async typeText(serial, text) {
    const raw = String(text || '');
    if (!raw) return;

    // Chặn tuyệt đối việc gõ các ký tự biểu tượng biến rác như $, ${}, ${AiPostText} lên màn hình máy
    if (/^[\s\$\{\}]*$/.test(raw)) {
      console.warn(`[ADB] Bỏ qua thao tác gõ ký tự rác/placeholder rỗng: "${raw}" trên thiết bị [${serial}]`);
      return;
    }

    // 1. Try ADBKeyboard Base64 if ADBKeyboard is currently active
    const isAdbKbd = await this.isAdbKeyboardActive(serial);
    if (isAdbKbd) {
      try {
        const b64 = Buffer.from(raw, 'utf8').toString('base64');
        const out = await this.execCommand(`-s ${serial} shell "am broadcast -a ADB_INPUT_B64 --es msg ${b64}"`);
        if (out && out.includes('result=0')) {
          return;
        }
      } catch (err) {
        console.warn(`[ADB] ADBKeyboard failed on ${serial}:`, err.message);
      }
    }

    // 2. Try Scrcpy Clipboard injection (Native clipboard paste - 100% full UTF-8 Vietnamese diacritics for ColorOS / Realme / OneUI)
    try {
      const { scrcpyManager } = await import('./scrcpyManager.js');
      const pasted = await scrcpyManager.pasteText(serial, raw);
      if (pasted) return;
    } catch (err) {
      console.warn(`[ADB] Scrcpy pasteText failed on ${serial}:`, err.message);
    }

    // 3. Fallback: ADB shell input text
    try {
      const escaped = raw.replace(/([$"'\\])/g, '\\$1').replace(/\s+/g, '%s');
      await this.execCommand(`-s ${serial} shell input text "${escaped}"`);
    } catch {}
  }

  async keyevent(serial, keycode) {
    return this.execCommand(`-s ${serial} shell input keyevent ${keycode}`);
  }

  async wake(serial) {
    return this.execCommand(`-s ${serial} shell input keyevent 224`);
  }

  async startApp(serial, packageName) {
    return this.execCommand(`-s ${serial} shell monkey -p ${packageName} -c android.intent.category.LAUNCHER 1`);
  }

  async stopApp(serial, packageName) {
    return this.execCommand(`-s ${serial} shell am force-stop ${packageName}`);
  }

  async shell(serial, command) {
    return this.execCommand(`-s ${serial} shell "${command.replace(/"/g, '\\"')}"`);
  }

  // Get currently focused window & app safely without relying on shell pipe or grep
  async getCurrentFocus(serial) {
    try {
      const out = await this.execCommand(`-s ${serial} shell dumpsys window`);
      const lines = out.split('\n');
      const focusLine = lines.find(l => l.includes('mCurrentFocus') || l.includes('mFocusedApp'));
      return focusLine ? focusLine.trim() : '';
    } catch {
      return '';
    }
  }

  // Check if IME keyboard is currently visible
  async isKeyboardShown(serial) {
    try {
      const out = await this.execCommand(`-s ${serial} shell dumpsys input_method`);
      return out.includes('mInputShown=true');
    } catch {
      return false;
    }
  }

  // Dump UI hierarchy and parse to clean JSON
  async dumpHierarchy(serial) {
    try {
      // Run dump to temp file and read
      await this.execCommand(`-s ${serial} shell uiautomator dump /data/local/tmp/window_dump.xml`);
      const xml = await this.execCommand(`-s ${serial} shell cat /data/local/tmp/window_dump.xml`);
      if (!xml || !xml.includes('<hierarchy')) {
        throw new Error('Invalid uiautomator XML dump');
      }

      const parsed = xmlParser.parse(xml);
      const rootNode = parsed?.hierarchy?.node;
      
      const flattenElements = (node, path = '') => {
        if (!node) return [];
        const elements = [];
        const isArr = Array.isArray(node);
        const list = isArr ? node : [node];

        list.forEach((item, idx) => {
          const currentPath = `${path}/${item['@_class'] || 'node'}[${idx + 1}]`;
          const boundsStr = item['@_bounds'] || ''; // "[x1,y1][x2,y2]"
          let bounds = null;
          const m = boundsStr.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
          if (m) {
            bounds = {
              x1: parseInt(m[1]),
              y1: parseInt(m[2]),
              x2: parseInt(m[3]),
              y2: parseInt(m[4]),
              width: parseInt(m[3]) - parseInt(m[1]),
              height: parseInt(m[4]) - parseInt(m[2]),
              centerX: Math.round((parseInt(m[1]) + parseInt(m[3])) / 2),
              centerY: Math.round((parseInt(m[2]) + parseInt(m[4])) / 2)
            };
          }

          // Generate XPathLite
          let xpathLite = '';
          if (item['@_resource-id']) {
            xpathLite = `//*[@resource-id="${item['@_resource-id']}"]`;
          } else if (item['@_text']) {
            xpathLite = `//*[@text="${item['@_text']}"]`;
          } else if (item['@_content-desc']) {
            xpathLite = `//*[@content-desc="${item['@_content-desc']}"]`;
          } else {
            xpathLite = currentPath;
          }

          elements.push({
            id: `el_${elements.length + 1}`,
            class: item['@_class'] || '',
            resourceId: item['@_resource-id'] || '',
            package: item['@_package'] || '',
            text: item['@_text'] || '',
            contentDesc: item['@_content-desc'] || '',
            checkable: item['@_checkable'] === 'true',
            checked: item['@_checked'] === 'true',
            clickable: item['@_clickable'] === 'true',
            enabled: item['@_enabled'] === 'true',
            focusable: item['@_focusable'] === 'true',
            scrollable: item['@_scrollable'] === 'true',
            bounds,
            xpathLite
          });

          if (item.node) {
            elements.push(...flattenElements(item.node, currentPath));
          }
        });

        return elements;
      };

      const flat = flattenElements(rootNode);
      return { xml, elements: flat };
    } catch (err) {
      console.error('[ADB] dumpHierarchy error:', err.message);
      return { xml: '', elements: [], error: err.message };
    }
  }
}

export const adbManager = new AdbManager();
