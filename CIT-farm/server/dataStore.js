import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_FILE = path.join(__dirname, 'data.json');

const DEFAULT_DATA = {
  accounts: [
    {
      id: 'acc_1',
      uid: '100089123456789',
      name: 'Nguyen Van A',
      password: 'SecurePassword123!',
      twoFactorSecret: 'JBSWY3DPEHPK3PXP', // Sample Base32 secret for TOTP
      email: 'nguyenvana@gmail.com',
      emailPassword: 'app_password_987',
      assignedDevice: 'GAGAA68HPVCEJFJV',
      status: 'Live',
      updatedAt: new Date().toISOString()
    },
    {
      id: 'acc_2',
      uid: '100098765432100',
      name: 'Tran Thi B',
      password: 'MyPassword456@',
      twoFactorSecret: 'HXDMVJECJJWSRB3HWIZR4IFUGFTMXBOZ',
      email: 'tranthib@outlook.com',
      emailPassword: 'app_password_654',
      assignedDevice: '',
      status: 'Live',
      updatedAt: new Date().toISOString()
    }
  ],
  savedFlows: [],
  runs: [],
  schedules: [
    {
      id: 'sched_sample_morning',
      name: 'Nuôi tương tác Facebook buổi sáng',
      enabled: false,
      flowId: 'sample',
      flowName: 'Nuôi Facebook tối ưu',
      targetMode: 'all',
      targetSerials: [],
      type: 'daily',
      time: '08:00',
      intervalMinutes: 60,
      daysOfWeek: [1, 2, 3, 4, 5, 6, 0],
      wakeScreen: true,
      rotateAccounts: true,
      lastRun: null,
      status: 'idle',
      createdAt: new Date().toISOString()
    }
  ],
  boxSettings: {
    selectedPort: 'COM73',
    fanSpeed: 'HIGH', // OFF, LOW, HIGH
    mode: 'USB', // USB, OTG
    channels: Array.from({ length: 20 }, (_, i) => ({
      id: i + 1,
      name: `Slot ${String(i + 1).padStart(2, '0')}`,
      power: true,
      mode: 'USB',
      status: 'Active'
    }))
  },
  settings: {
    streamQuality: 'Medium', // Low, Medium, High
    streamFps: 15,
    autoWakeDevices: true,
    groupMasterDevice: 'GAGAA68HPVCEJFJV',
    selectedSlaves: []
  }
};

export class DataStore {
  constructor() {
    this.data = { ...DEFAULT_DATA };
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(DATA_FILE)) {
        const raw = fs.readFileSync(DATA_FILE, 'utf-8');
        this.data = { ...DEFAULT_DATA, ...JSON.parse(raw) };
      } else {
        const defaultFile = path.join(__dirname, 'data.default.json');
        if (fs.existsSync(defaultFile)) {
          const raw = fs.readFileSync(defaultFile, 'utf-8');
          this.data = { ...DEFAULT_DATA, ...JSON.parse(raw) };
        }
        this.save();
      }
    } catch (err) {
      console.error('[DataStore] Load error, using default:', err.message);
      this.data = { ...DEFAULT_DATA };
    }
  }

  save() {
    try {
      fs.writeFileSync(DATA_FILE, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (err) {
      console.error('[DataStore] Save error:', err.message);
    }
  }

  getAccounts() {
    this.load();
    return this.data.accounts || [];
  }
  saveAccounts(accounts) {
    this.data.accounts = accounts;
    this.save();
    return this.data.accounts;
  }
  addAccounts(newAccs) {
    this.load();
    if (!this.data.accounts) this.data.accounts = [];
    this.data.accounts.push(...newAccs);
    this.save();
    return this.data.accounts;
  }
  deleteAccount(id) {
    this.load();
    this.data.accounts = (this.data.accounts || []).filter(a => a.id !== id);
    this.save();
    return true;
  }

  getSchedules() {
    this.load();
    return this.data.schedules || [];
  }
  saveSchedule(sched) {
    this.load();
    if (!this.data.schedules) this.data.schedules = [];
    const idx = this.data.schedules.findIndex(s => s.id === sched.id);
    if (idx >= 0) {
      this.data.schedules[idx] = {
        ...this.data.schedules[idx],
        ...sched,
        updatedAt: new Date().toISOString()
      };
    } else {
      const newSched = {
        ...sched,
        id: sched.id || 'sched_' + Date.now(),
        enabled: sched.enabled !== undefined ? sched.enabled : true,
        status: 'idle',
        lastRun: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      this.data.schedules.push(newSched);
    }
    this.save();
    return sched;
  }
  deleteSchedule(id) {
    this.load();
    this.data.schedules = (this.data.schedules || []).filter(s => s.id !== id);
    this.save();
  }
  toggleSchedule(id, enabled) {
    this.load();
    const item = (this.data.schedules || []).find(s => s.id === id);
    if (item) {
      item.enabled = enabled !== undefined ? enabled : !item.enabled;
      item.updatedAt = new Date().toISOString();
      this.save();
      return item;
    }
    return null;
  }
  updateScheduleStatus(id, patch) {
    this.load();
    const item = (this.data.schedules || []).find(s => s.id === id);
    if (item) {
      Object.assign(item, patch);
      this.save();
      return item;
    }
    return null;
  }

  getSavedFlows() {
    this.load();
    return this.data.savedFlows;
  }
  saveFlow(flow) {
    const idx = this.data.savedFlows.findIndex(f => f.id === flow.id);
    if (idx >= 0) {
      this.data.savedFlows[idx] = { ...flow, updatedAt: new Date().toISOString() };
    } else {
      this.data.savedFlows.push({
        ...flow,
        id: flow.id || 'flow_' + Date.now(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }
    this.save();
    return flow;
  }

  deleteFlow(id) {
    this.data.savedFlows = this.data.savedFlows.filter(f => f.id !== id);
    this.save();
  }

  getRuns() { return this.data.runs; }
  addRun(run) {
    this.data.runs.unshift(run);
    if (this.data.runs.length > 100) this.data.runs.pop();
    this.save();
  }

  getBoxSettings() { return this.data.boxSettings; }
  updateBoxSettings(settings) {
    this.data.boxSettings = { ...this.data.boxSettings, ...settings };
    this.save();
    return this.data.boxSettings;
  }

  getSettings() { return this.data.settings; }
  updateSettings(settings) {
    this.data.settings = { ...this.data.settings, ...settings };
    this.save();
    return this.data.settings;
  }

  getInteractedPosts() {
    this.load();
    return this.data.interactedPosts || [];
  }

  recordInteractedPost(postText, serial, keyword = '') {
    if (!postText || typeof postText !== 'string') return;
    this.load();
    if (!this.data.interactedPosts) this.data.interactedPosts = [];

    const normalized = postText
      .toLowerCase()
      .replace(/[\r\n\t]+/g, ' ')
      .replace(/[^\p{L}\p{N}\s]/gu, '')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 80);

    if (normalized.length < 10) return;

    const exists = this.data.interactedPosts.some(p => p.fingerprint === normalized);
    if (!exists) {
      this.data.interactedPosts.push({
        fingerprint: normalized,
        snippet: postText.substring(0, 100),
        serial,
        keyword,
        timestamp: new Date().toISOString()
      });
      if (this.data.interactedPosts.length > 500) {
        this.data.interactedPosts.shift();
      }
      this.save();
    }
  }

  isPostInteracted(postText) {
    if (!postText || typeof postText !== 'string') return false;
    this.load();
    const list = this.data.interactedPosts || [];
    if (list.length === 0) return false;

    const normalized = postText
      .toLowerCase()
      .replace(/[\r\n\t]+/g, ' ')
      .replace(/[^\p{L}\p{N}\s]/gu, '')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 80);

    if (normalized.length < 10) return false;

    return list.some(item => {
      const itemFp = item.fingerprint || '';
      return itemFp === normalized || 
             (normalized.length > 25 && itemFp.includes(normalized.substring(0, 25))) ||
             (itemFp.length > 25 && normalized.includes(itemFp.substring(0, 25)));
    });
  }
}

export const dataStore = new DataStore();
