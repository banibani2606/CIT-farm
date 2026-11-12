import { spawn, exec } from 'child_process';
import net from 'net';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocket } from 'ws';
import { ADB_PATH, adbManager } from './adb.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOCAL_SCRCPY_JAR = path.join(__dirname, 'vendor', 'scrcpy-server-v2.4.jar');
const REMOTE_SCRCPY_JAR = '/data/local/tmp/citfarm-scrcpy-2.4.jar';

export const STREAM_PRESETS = {
  ultra:  { maxSize: 960, maxFps: 60, bitRate: 6000000, label: '60 FPS HD' },
  smooth: { maxSize: 720, maxFps: 30, bitRate: 4000000, label: '30 FPS Mượt' },
  farm:   { maxSize: 540, maxFps: 20, bitRate: 2000000, label: '20 FPS Farm' },
  eco:    { maxSize: 480, maxFps: 12, bitRate: 1200000, label: '12 FPS Eco' }
};

// Binary WebSocket frame types (Server -> Browser)
const FRAME_CONFIG = 0x01;
const FRAME_KEY    = 0x02;
const FRAME_DELTA  = 0x03;

function execAsync(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, { maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || err.message));
      resolve(stdout.trim());
    });
  });
}

function packVideoFrame(frameType, ptsUsBigInt, nalBuffer) {
  const out = Buffer.allocUnsafe(9 + nalBuffer.length);
  out[0] = frameType;
  out.writeBigUInt64BE(ptsUsBigInt, 1);
  nalBuffer.copy(out, 9);
  return out;
}

class ScrcpyDeviceSession {
  constructor(serial, port, presetKey, manager) {
    this.serial = serial;
    this.port = port;
    this.presetKey = presetKey;
    this.preset = STREAM_PRESETS[presetKey] || STREAM_PRESETS.smooth;
    this.manager = manager;

    // 8 lowercase hex digits in [0x10000000 .. 0x7fffffff] so scrcpy %08x matches 100%
    const rand31 = 0x10000000 + Math.floor(Math.random() * 0x6fffffff);
    this.scid = rand31.toString(16);

    this.subscribers = new Set();
    this.idleTimer = null;

    this.proc = null;
    this.videoSock = null;
    this.ctrlSock = null;
    this.closed = false;
    this.starting = false;

    this.meta = null;         // { deviceName, codec, width, height, encoder }
    this.encoderName = '';
    this.configPacket = null; // Buffer (9-byte header + SPS/PPS Annex-B)
    this.gopPackets = [];     // Array<Buffer> starting at latest IDR keyframe
  }

  addSubscriber(ws) {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    this.subscribers.add(ws);

    // Replay cached metadata + SPS/PPS + GOP immediately so static screens render in <15ms
    if (this.meta && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'meta', serial: this.serial, ...this.meta }));
    }
    if (this.configPacket && ws.readyState === WebSocket.OPEN) {
      ws.send(this.configPacket, { binary: true });
      for (const pkt of this.gopPackets) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(pkt, { binary: true });
        }
      }
    }

    if (!this.starting && !this.videoSock && !this.closed) {
      this.start().catch((err) => {
        this.broadcastJson({ type: 'status', state: 'error', message: err.message });
      });
    }
  }

  removeSubscriber(ws) {
    this.subscribers.delete(ws);
    if (this.subscribers.size === 0 && !this.closed) {
      // Keep warm for 20s so tab switches are 0ms instant, then release encoder
      this.idleTimer = setTimeout(() => {
        if (this.subscribers.size === 0) {
          this.stop();
        }
      }, 20000);
    }
  }

  broadcastJson(obj) {
    const str = JSON.stringify(obj);
    for (const ws of this.subscribers) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(str);
      }
    }
  }

  broadcastBinary(buf) {
    for (const ws of this.subscribers) {
      // Backpressure guard: skip delta frames if a slow client socket buffer > 2MB
      if (ws.readyState === WebSocket.OPEN) {
        if (ws.bufferedAmount > 2 * 1024 * 1024 && buf[0] === FRAME_DELTA) {
          continue;
        }
        ws.send(buf, { binary: true });
      }
    }
  }

  async start() {
    if (this.starting || this.closed) return;
    this.starting = true;
    this.broadcastJson({ type: 'status', state: 'connecting' });

    try {
      await this.manager.ensureJarPushed(this.serial);
      if (this.closed) return;

      await execAsync(`"${ADB_PATH}" -s ${this.serial} forward tcp:${this.port} localabstract:scrcpy_${this.scid}`);
      if (this.closed) return;

      const args = [
        '-s', this.serial, 'shell',
        `CLASSPATH=${REMOTE_SCRCPY_JAR}`,
        'app_process', '/', 'com.genymobile.scrcpy.Server', '2.4',
        `scid=${this.scid}`,
        'tunnel_forward=true',
        'audio=false',
        'control=true',
        'cleanup=false',
        'clipboard_autosync=false',
        'power_on=false',
        `max_size=${this.preset.maxSize}`,
        `max_fps=${this.preset.maxFps}`,
        `video_bit_rate=${this.preset.bitRate}`,
        'video_codec_options=i-frame-interval=1'
      ];

      this.proc = spawn(ADB_PATH, args);

      this.proc.stdout.on('data', (chunk) => {
        const text = chunk.toString();
        const encMatch = text.match(/Using video encoder:\s*'([^']+)'/i);
        if (encMatch) {
          this.encoderName = encMatch[1];
          if (this.meta) {
            this.meta.encoder = this.encoderName;
            this.broadcastJson({ type: 'meta', serial: this.serial, ...this.meta });
          }
        }
        if (text.includes('ClassNotFoundException') || text.includes('No such file')) {
          this.manager.pushedSerials.delete(this.serial);
        }
      });

      this.proc.stderr.on('data', (chunk) => {
        const text = chunk.toString();
        if (text.includes('ClassNotFoundException') || text.includes('No such file')) {
          this.manager.pushedSerials.delete(this.serial);
        }
      });

      this.proc.on('close', () => {
        if (!this.closed) {
          this.cleanupSockets();
          // Auto-reconnect if subscribers are still watching
          if (this.subscribers.size > 0) {
            setTimeout(() => {
              if (!this.closed && this.subscribers.size > 0) {
                this.starting = false;
                this.start().catch(() => {});
              }
            }, 800);
          }
        }
      });

      // 1. Connect video socket and wait for 1-byte dummy handshake
      const { sock: videoSock, initialChunk } = await this.connectVideoSocket();
      if (this.closed) {
        videoSock.destroy();
        return;
      }
      this.videoSock = videoSock;
      this.videoSock.setNoDelay(true);

      // 2. Immediately open control socket
      this.ctrlSock = net.createConnection({ host: '127.0.0.1', port: this.port });
      this.ctrlSock.setNoDelay(true);
      this.ctrlSock.on('error', () => {});

      // 3. Parse stream metadata + H.264 packets
      this.setupVideoParser(initialChunk);
    } catch (err) {
      this.starting = false;
      if (!this.closed) {
        this.broadcastJson({ type: 'status', state: 'error', message: err.message });
      }
    }
  }

  connectVideoSocket() {
    return new Promise((resolve, reject) => {
      let attempts = 0;
      const maxAttempts = 50; // ~4s max

      const tryConnect = () => {
        if (this.closed) return reject(new Error('Session closed'));
        attempts++;
        const sock = net.createConnection({ host: '127.0.0.1', port: this.port });
        let gotDummy = false;

        const timer = setTimeout(() => {
          if (!gotDummy) {
            sock.destroy();
          }
        }, 450);

        sock.once('data', (chunk) => {
          gotDummy = true;
          clearTimeout(timer);
          // First byte is scrcpy dummy byte (0x00)
          resolve({ sock, initialChunk: chunk.subarray(1) });
        });

        const retryOrFail = () => {
          clearTimeout(timer);
          if (gotDummy) return;
          if (attempts >= maxAttempts) {
            reject(new Error(`Timeout kết nối scrcpy stream trên ${this.serial}`));
          } else {
            setTimeout(tryConnect, 80);
          }
        };

        sock.on('error', retryOrFail);
        sock.on('close', retryOrFail);
      };

      setTimeout(tryConnect, 90);
    });
  }

  setupVideoParser(initialChunk) {
    let buffer = initialChunk && initialChunk.length > 0 ? Buffer.from(initialChunk) : Buffer.alloc(0);
    let offset = 0;
    let stage = 'meta'; // 'meta' (76 bytes) -> 'frames' (12-byte header + payload)

    const consume = (incoming) => {
      if (incoming && incoming.length > 0) {
        if (offset > 0) {
          buffer = buffer.subarray(offset);
          offset = 0;
        }
        buffer = buffer.length > 0 ? Buffer.concat([buffer, incoming]) : incoming;
      }

      if (stage === 'meta') {
        if (buffer.length - offset < 76) return;
        const deviceName = buffer.subarray(offset, offset + 64).toString('utf8').replace(/\0/g, '').trim();
        const codec = buffer.subarray(offset + 64, offset + 68).toString('ascii');
        const width = buffer.readUInt32BE(offset + 68);
        const height = buffer.readUInt32BE(offset + 72);
        offset += 76;

        this.meta = {
          deviceName,
          codec,
          width,
          height,
          encoder: this.encoderName || 'Hardware AVC',
          preset: this.presetKey
        };
        this.broadcastJson({ type: 'meta', serial: this.serial, ...this.meta });
        stage = 'frames';
      }

      while (stage === 'frames' && buffer.length - offset >= 12) {
        const ptsAndFlags = buffer.readBigUInt64BE(offset);
        const packetSize = buffer.readUInt32BE(offset + 8);
        if (buffer.length - offset < 12 + packetSize) break;

        const nalPayload = buffer.subarray(offset + 12, offset + 12 + packetSize);
        offset += 12 + packetSize;

        const isConfig = (ptsAndFlags & (1n << 63n)) !== 0n;
        const isKey = (ptsAndFlags & (1n << 62n)) !== 0n;
        const ptsUs = BigInt.asUintN(62, ptsAndFlags);

        if (isConfig) {
          const framed = packVideoFrame(FRAME_CONFIG, 0n, nalPayload);
          this.configPacket = framed;
          this.gopPackets = [];
          this.broadcastBinary(framed);
        } else if (isKey) {
          const framed = packVideoFrame(FRAME_KEY, ptsUs, nalPayload);
          this.gopPackets = [framed];
          this.broadcastBinary(framed);
        } else {
          const framed = packVideoFrame(FRAME_DELTA, ptsUs, nalPayload);
          if (this.gopPackets.length < 100) {
            this.gopPackets.push(framed);
          }
          this.broadcastBinary(framed);
        }
      }

      if (offset > 0 && offset === buffer.length) {
        buffer = Buffer.alloc(0);
        offset = 0;
      } else if (offset > 65536) {
        buffer = Buffer.from(buffer.subarray(offset));
        offset = 0;
      }
    };

    if (buffer.length > 0) consume(null);

    this.videoSock.on('data', consume);
    this.videoSock.on('error', () => {});
  }

  // --- REAL-TIME 1ms SCRCPY CONTROL INJECTION ---

  injectTouch(action, nx, ny) {
    if (!this.ctrlSock || this.ctrlSock.destroyed || !this.meta) return false;
    const w = this.meta.width || 720;
    const h = this.meta.height || 1600;
    const x = Math.max(0, Math.min(w - 1, Math.round(nx * w)));
    const y = Math.max(0, Math.min(h - 1, Math.round(ny * h)));

    // 32-byte TYPE_INJECT_TOUCH_EVENT (type = 2)
    const buf = Buffer.allocUnsafe(32);
    buf.writeUInt8(2, 0);                        // TYPE_INJECT_TOUCH_EVENT
    buf.writeUInt8(action, 1);                   // 0=DOWN, 1=UP, 2=MOVE
    buf.writeBigInt64BE(-2n, 2);                 // POINTER_ID_GENERIC_FINGER (-2)
    buf.writeInt32BE(x, 10);
    buf.writeInt32BE(y, 14);
    buf.writeUInt16BE(w, 18);
    buf.writeUInt16BE(h, 20);
    buf.writeUInt16BE(action === 1 ? 0 : 0xffff, 22); // pressure
    buf.writeInt32BE(0, 24);                     // actionButton
    buf.writeInt32BE(0, 28);                     // buttons
    this.ctrlSock.write(buf);
    return true;
  }

  injectScroll(nx, ny, hScrollFloat, vScrollFloat) {
    if (!this.ctrlSock || this.ctrlSock.destroyed || !this.meta) return false;
    const w = this.meta.width || 720;
    const h = this.meta.height || 1600;
    const x = Math.max(0, Math.min(w - 1, Math.round(nx * w)));
    const y = Math.max(0, Math.min(h - 1, Math.round(ny * h)));

    const clampI16 = (v) => Math.max(-32768, Math.min(32767, Math.round(v * 32767)));

    // 21-byte TYPE_INJECT_SCROLL_EVENT (type = 3) in scrcpy 2.x
    const buf = Buffer.allocUnsafe(21);
    buf.writeUInt8(3, 0);
    buf.writeInt32BE(x, 1);
    buf.writeInt32BE(y, 5);
    buf.writeUInt16BE(w, 9);
    buf.writeUInt16BE(h, 11);
    buf.writeInt16BE(clampI16(hScrollFloat), 13);
    buf.writeInt16BE(clampI16(vScrollFloat), 15);
    buf.writeInt32BE(0, 17);
    this.ctrlSock.write(buf);
    return true;
  }

  injectKeycode(keycode) {
    if (!this.ctrlSock || this.ctrlSock.destroyed) {
      adbManager.keyevent(this.serial, keycode).catch(() => {});
      return;
    }
    // 14-byte TYPE_INJECT_KEYCODE (type = 0): DOWN then UP
    for (const action of [0, 1]) {
      const buf = Buffer.allocUnsafe(14);
      buf.writeUInt8(0, 0);
      buf.writeUInt8(action, 1);
      buf.writeInt32BE(keycode, 2);
      buf.writeInt32BE(0, 6);
      buf.writeInt32BE(0, 10);
      this.ctrlSock.write(buf);
    }
  }

  injectText(text) {
    if (!this.ctrlSock || this.ctrlSock.destroyed) {
      adbManager.typeText(this.serial, text).catch(() => {});
      return;
    }
    const strBytes = Buffer.from(String(text), 'utf8');
    const buf = Buffer.allocUnsafe(5 + strBytes.length);
    buf.writeUInt8(1, 0); // TYPE_INJECT_TEXT
    buf.writeUInt32BE(strBytes.length, 1);
    strBytes.copy(buf, 5);
    this.ctrlSock.write(buf);
  }

  setClipboard(text, paste = true) {
    if (!this.ctrlSock || this.ctrlSock.destroyed) return false;
    const strBytes = Buffer.from(String(text), 'utf8');
    // Scrcpy 2.x CONTROL_MSG_TYPE_SET_CLIPBOARD = 9:
    // Header: type(1B) + sequence(8B) + paste(1B) + length(4B) = 14 bytes + text
    const buf = Buffer.allocUnsafe(14 + strBytes.length);
    buf.writeUInt8(9, 0);
    buf.writeBigUInt64BE(0n, 1);
    buf.writeUInt8(paste ? 1 : 0, 9);
    buf.writeUInt32BE(strBytes.length, 10);
    strBytes.copy(buf, 14);
    this.ctrlSock.write(buf);
    return true;
  }

  updateDimResolution(width, height) {
    if (this.meta) {
      this.meta.width = width;
      this.meta.height = height;
    }
  }

  cleanupSockets() {
    if (this.videoSock) {
      try { this.videoSock.destroy(); } catch {}
      this.videoSock = null;
    }
    if (this.ctrlSock) {
      try { this.ctrlSock.destroy(); } catch {}
      this.ctrlSock = null;
    }
    exec(`"${ADB_PATH}" -s ${this.serial} forward --remove tcp:${this.port}`, () => {});
  }

  stop() {
    this.closed = true;
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    this.cleanupSockets();
    if (this.proc) {
      try { this.proc.kill(); } catch {}
      this.proc = null;
    }
    this.manager.onSessionStopped(this.serial, this);
  }
}

export class ScrcpyManager {
  constructor() {
    this.sessions = new Map(); // serial -> ScrcpyDeviceSession
    this.pushedSerials = new Set();
    this.pushPromises = new Map();
    this.nextPort = 29200;
    this.currentPreset = 'smooth';
  }

  allocatePort() {
    const p = this.nextPort;
    this.nextPort = this.nextPort >= 29900 ? 29200 : this.nextPort + 1;
    return p;
  }

  async ensureJarPushed(serial) {
    if (!fs.existsSync(LOCAL_SCRCPY_JAR)) {
      throw new Error(`Missing scrcpy-server-v2.4.jar at ${LOCAL_SCRCPY_JAR}`);
    }
    if (this.pushedSerials.has(serial)) return;
    if (this.pushPromises.has(serial)) return this.pushPromises.get(serial);

    const p = execAsync(`"${ADB_PATH}" -s ${serial} push "${LOCAL_SCRCPY_JAR}" ${REMOTE_SCRCPY_JAR}`)
      .then(() => {
        this.pushedSerials.add(serial);
        this.pushPromises.delete(serial);
      })
      .catch((err) => {
        this.pushPromises.delete(serial);
        throw err;
      });

    this.pushPromises.set(serial, p);
    return p;
  }

  getOrCreateSession(serial, presetKey) {
    const targetPreset = STREAM_PRESETS[presetKey] ? presetKey : this.currentPreset;
    let session = this.sessions.get(serial);
    if (session && !session.closed) {
      if (presetKey && STREAM_PRESETS[presetKey] && session.presetKey !== presetKey) {
        // Migrate subscribers to new quality preset session
        const oldSubs = Array.from(session.subscribers);
        session.subscribers.clear();
        session.stop();
        session = new ScrcpyDeviceSession(serial, this.allocatePort(), targetPreset, this);
        this.sessions.set(serial, session);
        oldSubs.forEach((ws) => session.addSubscriber(ws));
      }
      return session;
    }

    session = new ScrcpyDeviceSession(serial, this.allocatePort(), targetPreset, this);
    this.sessions.set(serial, session);
    return session;
  }

  async pasteText(serial, text) {
    let session = this.sessions.get(serial);
    if (!session || !session.ctrlSock || session.ctrlSock.destroyed) {
      session = this.getOrCreateSession(serial, 'eco');
      await session.start().catch(() => {});
      for (let i = 0; i < 20; i++) {
        if (session.ctrlSock && !session.ctrlSock.destroyed) break;
        await new Promise(r => setTimeout(r, 150));
      }
    }
    if (session && session.ctrlSock && !session.ctrlSock.destroyed) {
      return session.setClipboard(text, true);
    }
    return false;
  }

  setGlobalPreset(presetKey) {
    if (!STREAM_PRESETS[presetKey]) return false;
    this.currentPreset = presetKey;
    for (const [serial, session] of Array.from(this.sessions.entries())) {
      if (!session.closed && session.presetKey !== presetKey) {
        this.getOrCreateSession(serial, presetKey);
      }
    }
    return true;
  }

  onSessionStopped(serial, session) {
    if (this.sessions.get(serial) === session) {
      this.sessions.delete(serial);
    }
  }

  handleWebSocket(ws, req) {
    const url = new URL(req.url, 'http://127.0.0.1');
    const serial = url.searchParams.get('serial');
    const preset = url.searchParams.get('preset') || this.currentPreset;

    if (!serial) {
      ws.close(1008, 'Missing serial');
      return;
    }

    const session = this.getOrCreateSession(serial, preset);
    session.addSubscriber(ws);

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        const targets = msg.broadcastGroup && Array.isArray(msg.slaves) && msg.slaves.length > 0
          ? [serial, ...msg.slaves.filter((s) => s !== serial)]
          : [serial];

        if (msg.type === 'touch') {
          for (const targetSerial of targets) {
            const s = this.sessions.get(targetSerial);
            if (s) s.injectTouch(msg.action, msg.nx, msg.ny);
          }
        } else if (msg.type === 'scroll') {
          for (const targetSerial of targets) {
            const s = this.sessions.get(targetSerial);
            if (s) s.injectScroll(msg.nx, msg.ny, msg.hScroll || 0, msg.vScroll || 0);
          }
        } else if (msg.type === 'key') {
          for (const targetSerial of targets) {
            const s = this.sessions.get(targetSerial);
            if (s) s.injectKeycode(msg.keycode);
            else adbManager.keyevent(targetSerial, msg.keycode).catch(() => {});
          }
        } else if (msg.type === 'text') {
          for (const targetSerial of targets) {
            const s = this.sessions.get(targetSerial);
            if (s) s.injectText(msg.text);
            else adbManager.typeText(targetSerial, msg.text).catch(() => {});
          }
        } else if (msg.type === 'dimensions' && msg.width && msg.height) {
          session.updateDimResolution(msg.width, msg.height);
        }
      } catch {
        // ignore malformed client frame
      }
    });

    const detach = () => {
      const current = this.sessions.get(serial);
      if (current) current.removeSubscriber(ws);
      session.removeSubscriber(ws);
    };

    ws.on('close', detach);
    ws.on('error', detach);
  }
}

export const scrcpyManager = new ScrcpyManager();

