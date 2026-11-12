// Shared WebCodecs GPU H.264 Stream Pool for CIT Farm
// Uses hardwareAcceleration: 'prefer-hardware' (NVIDIA NVDEC / AMD VCN / Intel QuickSync)
// Shares 1 WebSocket + 1 GPU VideoDecoder per device across both Grid & Active Single View

const FRAME_CONFIG = 0x01;
const FRAME_KEY    = 0x02;
const FRAME_DELTA  = 0x03;

function extractAvcCodecFromSps(data) {
  for (let i = 0; i < data.length - 7; i++) {
    let nalOffset = -1;
    if (data[i] === 0 && data[i + 1] === 0 && data[i + 2] === 0 && data[i + 3] === 1) {
      nalOffset = i + 4;
    } else if (data[i] === 0 && data[i + 1] === 0 && data[i + 2] === 1) {
      nalOffset = i + 3;
    }
    if (nalOffset !== -1 && nalOffset + 3 < data.length) {
      const nalType = data[nalOffset] & 0x1f;
      if (nalType === 7) {
        const p = data[nalOffset + 1].toString(16).padStart(2, '0');
        const c = data[nalOffset + 2].toString(16).padStart(2, '0');
        const l = data[nalOffset + 3].toString(16).padStart(2, '0');
        return `avc1.${p}${c}${l}`;
      }
      i = nalOffset;
    }
  }
  return 'avc1.42e01f';
}

function readPtsNumber(uint8) {
  // Bytes 1..8 are uint64 BE microseconds; safe integer up to ~285 years
  const view = new DataView(uint8.buffer, uint8.byteOffset, uint8.byteLength);
  const big = view.getBigUint64(1, false);
  return Number(big & 0x000fffffffffffffn);
}

class DeviceGpuStream {
  constructor(serial, preset) {
    this.serial = serial;
    this.preset = preset || 'smooth';
    this.canvases = new Set();        // Mounted <canvas> DOM elements
    this.statusListeners = new Set(); // Callbacks receiving { fps, width, height, hwAccel, encoder, ready }

    this.ws = null;
    this.decoder = null;
    this.spsPps = null;
    this.hasKeyFrame = false;
    this.queue = Promise.resolve();

    this.width = 0;
    this.height = 0;
    this.hwAccel = false;
    this.encoder = '';
    this.ready = false;
    this.fps = 0;
    this._framesThisSec = 0;

    this.cacheCanvas = document.createElement('canvas');
    this.cacheCtx = this.cacheCanvas.getContext('2d', { alpha: false });

    this.closeTimer = null;
    this.reconnectTimer = null;
    this.disposed = false;

    this.fpsInterval = setInterval(() => {
      this.fps = this._framesThisSec;
      this._framesThisSec = 0;
      this.emitStatus();
    }, 1000);

    this.connect();
  }

  getSnapshotStatus() {
    return {
      fps: this.fps,
      width: this.width,
      height: this.height,
      hwAccel: this.hwAccel,
      encoder: this.encoder,
      ready: this.ready
    };
  }

  emitStatus() {
    const snap = this.getSnapshotStatus();
    for (const cb of this.statusListeners) {
      try { cb(snap); } catch {}
    }
  }

  attachCanvas(canvas, onStatus) {
    if (this.closeTimer) {
      clearTimeout(this.closeTimer);
      this.closeTimer = null;
    }
    if (canvas) {
      this.canvases.add(canvas);
      // Paint cached GPU frame immediately (0ms instant switch!)
      if (this.ready && this.cacheCanvas.width > 0 && this.cacheCanvas.height > 0) {
        canvas.width = this.cacheCanvas.width;
        canvas.height = this.cacheCanvas.height;
        const ctx = canvas.getContext('2d', { alpha: false });
        if (ctx) ctx.drawImage(this.cacheCanvas, 0, 0);
      }
    }
    if (onStatus) {
      this.statusListeners.add(onStatus);
      onStatus(this.getSnapshotStatus());
    }
  }

  detachCanvas(canvas, onStatus) {
    if (canvas) this.canvases.delete(canvas);
    if (onStatus) this.statusListeners.delete(onStatus);

    if (this.canvases.size === 0 && this.statusListeners.size === 0) {
      // Keep warm for 8s so quick tab navigation stays 0ms instant
      this.closeTimer = setTimeout(() => {
        if (this.canvases.size === 0 && this.statusListeners.size === 0) {
          this.dispose();
        }
      }, 8000);
    }
  }

  createDecoder() {
    if (this.decoder) {
      try {
        if (this.decoder.state !== 'closed') this.decoder.close();
      } catch {}
    }

    if (typeof window.VideoDecoder === 'undefined') {
      console.error('[ScrcpyGPU] Browser does not support WebCodecs VideoDecoder');
      return null;
    }

    const decoder = new window.VideoDecoder({
      output: (frame) => {
        try {
          const fw = frame.displayWidth || frame.codedWidth;
          const fh = frame.displayHeight || frame.codedHeight;

          if (fw > 0 && fh > 0 && (fw !== this.width || fh !== this.height)) {
            this.width = fw;
            this.height = fh;
            this.sendControl({ type: 'dimensions', width: fw, height: fh });
          }

          if (this.cacheCanvas.width !== fw || this.cacheCanvas.height !== fh) {
            this.cacheCanvas.width = fw;
            this.cacheCanvas.height = fh;
          }
          if (this.cacheCtx) {
            this.cacheCtx.drawImage(frame, 0, 0, fw, fh);
          }

          for (const canvas of this.canvases) {
            if (canvas.width !== fw || canvas.height !== fh) {
              canvas.width = fw;
              canvas.height = fh;
            }
            const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true }) || canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(frame, 0, 0, fw, fh);
            }
          }

          this._framesThisSec++;
          if (!this.ready) {
            this.ready = true;
            this.emitStatus();
          }
        } finally {
          // CRITICAL: Always release GPU VRAM frame surface immediately!
          frame.close();
        }
      },
      error: (err) => {
        console.warn(`[ScrcpyGPU] Decoder reset on ${this.serial}:`, err.message);
        this.hasKeyFrame = false;
      }
    });

    this.decoder = decoder;
    return decoder;
  }

  async configureFromSps(spsPpsBytes) {
    this.spsPps = new Uint8Array(spsPpsBytes);
    this.hasKeyFrame = false;

    const extracted = extractAvcCodecFromSps(this.spsPps);
    const candidates = [
      { codec: extracted,       hardwareAcceleration: 'prefer-hardware', optimizeForLatency: true },
      { codec: 'avc1.42e01f',   hardwareAcceleration: 'prefer-hardware', optimizeForLatency: true },
      { codec: 'avc1.64002a',   hardwareAcceleration: 'prefer-hardware', optimizeForLatency: true },
      { codec: extracted,       hardwareAcceleration: 'no-preference',   optimizeForLatency: true },
      { codec: 'avc1.42e01f',   hardwareAcceleration: 'no-preference',   optimizeForLatency: true }
    ];

    let chosen = candidates[candidates.length - 1];
    for (const cfg of candidates) {
      try {
        const res = await window.VideoDecoder.isConfigSupported(cfg);
        if (res && res.supported) {
          chosen = res.config || cfg;
          break;
        }
      } catch {}
    }

    const decoder = this.createDecoder();
    if (!decoder) return;

    decoder.configure(chosen);
    this.hwAccel = chosen.hardwareAcceleration === 'prefer-hardware';
    this.emitStatus();
  }

  enqueuePacket(arrayBuffer) {
    this.queue = this.queue
      .then(() => this.processPacket(arrayBuffer))
      .catch(() => {});
  }

  async processPacket(arrayBuffer) {
    if (this.disposed) return;
    const bytes = new Uint8Array(arrayBuffer);
    if (bytes.length <= 9) return;

    const frameType = bytes[0];
    const pts = readPtsNumber(bytes);
    const payload = bytes.subarray(9);

    if (frameType === FRAME_CONFIG) {
      await this.configureFromSps(payload);
      return;
    }

    if (!this.decoder || this.decoder.state !== 'configured') {
      if (this.spsPps) {
        await this.configureFromSps(this.spsPps);
      }
      if (!this.decoder || this.decoder.state !== 'configured') return;
    }

    if (frameType === FRAME_KEY) {
      let data = payload;
      if (this.spsPps && this.spsPps.length > 0) {
        const combined = new Uint8Array(this.spsPps.length + payload.length);
        combined.set(this.spsPps, 0);
        combined.set(payload, this.spsPps.length);
        data = combined;
      }
      try {
        this.decoder.decode(new window.EncodedVideoChunk({
          type: 'key',
          timestamp: pts,
          data
        }));
        this.hasKeyFrame = true;
      } catch {
        this.hasKeyFrame = false;
      }
    } else if (frameType === FRAME_DELTA) {
      if (!this.hasKeyFrame) return;
      // Zero-latency guard: drop backlog if browser tab was backgrounded
      if (this.decoder.decodeQueueSize > 14) {
        this.hasKeyFrame = false;
        return;
      }
      try {
        this.decoder.decode(new window.EncodedVideoChunk({
          type: 'delta',
          timestamp: pts,
          data: payload
        }));
      } catch {
        this.hasKeyFrame = false;
      }
    }
  }

  connect() {
    if (this.disposed) return;
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${proto}//${window.location.host}/ws/scrcpy?serial=${encodeURIComponent(this.serial)}&preset=${encodeURIComponent(this.preset)}`;

    const ws = new WebSocket(wsUrl);
    ws.binaryType = 'arraybuffer';
    this.ws = ws;

    ws.onmessage = (ev) => {
      if (typeof ev.data === 'string') {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === 'meta') {
            if (msg.width && msg.height && !this.ready) {
              this.width = msg.width;
              this.height = msg.height;
            }
            if (msg.encoder) this.encoder = msg.encoder;
            this.emitStatus();
          }
        } catch {}
      } else if (ev.data instanceof ArrayBuffer) {
        this.enqueuePacket(ev.data);
      }
    };

    ws.onclose = () => {
      if (!this.disposed && (this.canvases.size > 0 || this.statusListeners.size > 0)) {
        this.reconnectTimer = setTimeout(() => this.connect(), 900);
      }
    };

    ws.onerror = () => {};
  }

  sendControl(payload) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
      return true;
    }
    return false;
  }

  dispose() {
    this.disposed = true;
    clearInterval(this.fpsInterval);
    if (this.closeTimer) clearTimeout(this.closeTimer);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.ws) {
      try { this.ws.close(); } catch {}
      this.ws = null;
    }
    if (this.decoder) {
      try {
        if (this.decoder.state !== 'closed') this.decoder.close();
      } catch {}
      this.decoder = null;
    }
    scrcpyPool.streams.delete(this.serial);
  }
}

class ScrcpyStreamPool {
  constructor() {
    this.streams = new Map(); // serial -> DeviceGpuStream
    this.preset = 'smooth';
  }

  getStream(serial) {
    let s = this.streams.get(serial);
    if (!s || s.disposed) {
      s = new DeviceGpuStream(serial, this.preset);
      this.streams.set(serial, s);
    }
    return s;
  }

  subscribe(serial, canvas, onStatus) {
    const stream = this.getStream(serial);
    stream.attachCanvas(canvas, onStatus);
    return () => stream.detachCanvas(canvas, onStatus);
  }

  async setPreset(presetKey) {
    this.preset = presetKey;
    for (const s of this.streams.values()) {
      s.preset = presetKey;
      s.ready = false;
    }
    await fetch('/api/scrcpy/preset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preset: presetKey })
    });
  }

  sendTouch(serial, action, nx, ny, broadcastGroup = false, slaves = []) {
    const s = this.streams.get(serial);
    if (s) {
      return s.sendControl({ type: 'touch', action, nx, ny, broadcastGroup, slaves });
    }
    return false;
  }

  sendScroll(serial, nx, ny, hScroll, vScroll, broadcastGroup = false, slaves = []) {
    const s = this.streams.get(serial);
    if (s) {
      return s.sendControl({ type: 'scroll', nx, ny, hScroll, vScroll, broadcastGroup, slaves });
    }
    return false;
  }

  sendKey(serial, keycode, broadcastGroup = false, slaves = []) {
    const s = this.streams.get(serial);
    if (s && s.sendControl({ type: 'key', keycode, broadcastGroup, slaves })) {
      return true;
    }
    fetch('/api/devices/key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ serial, keycode, broadcastGroup, slaves })
    }).catch(() => {});
    return true;
  }

  sendText(serial, text, broadcastGroup = false, slaves = []) {
    const s = this.streams.get(serial);
    if (s && s.sendControl({ type: 'text', text, broadcastGroup, slaves })) {
      return true;
    }
    fetch('/api/devices/type', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ serial, text, broadcastGroup, slaves })
    }).catch(() => {});
    return true;
  }
}

export const scrcpyPool = new ScrcpyStreamPool();

