import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Load .env if present
try {
  process.loadEnvFile();
} catch (e) {
  // .env may not exist in production or container
}

import { generateTOTP, getRemainingSeconds } from './totp.js';

import { adbManager } from './adb.js';
import { flowRunner } from './flowRunner.js';
import { boxController } from './boxController.js';
import { dataStore } from './dataStore.js';
import { scrcpyManager, STREAM_PRESETS } from './scrcpyManager.js';
import { KEYWORD_CATEGORIES, PERSONA_KEYWORD_PREFERENCES, TOP_15_DAILY_KEYWORDS, TARGET_HASHTAGS, getSmartKeyword, classifyPost } from './keywordRegistry.js';
import { schedulerEngine } from './scheduler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 55555;

// Process-level crash prevention guards (handles device disconnects & network drops)
process.on('unhandledRejection', (reason, promise) => {
  console.warn('[Process] Handled unhandled rejection:', reason?.message || reason);
});
process.on('uncaughtException', (err) => {
  console.error('[Process] Handled uncaught exception:', err.message);
});

app.use(cors());
app.use(express.json({ limit: '50mb' }));

const httpServer = createServer(app);
const wss = new WebSocketServer({ noServer: true });
const scrcpyWss = new WebSocketServer({ noServer: true });

httpServer.on('upgrade', (req, socket, head) => {
  const pathname = new URL(req.url, 'http://127.0.0.1').pathname;
  if (pathname === '/ws/scrcpy') {
    scrcpyWss.handleUpgrade(req, socket, head, (ws) => {
      scrcpyManager.handleWebSocket(ws, req);
    });
  } else if (pathname === '/ws') {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  } else {
    socket.destroy();
  }
});

// Active WebSocket connections
const clients = new Set();

wss.on('connection', (ws) => {
  clients.add(ws);
  ws.send(JSON.stringify({ type: 'connected', time: new Date().toISOString() }));

  ws.on('close', () => clients.delete(ws));
  ws.on('error', () => clients.delete(ws));
});

// Switch global H.264 stream quality preset (60fps / 30fps / 20fps / 12fps)
app.post('/api/scrcpy/preset', (req, res) => {
  const { preset } = req.body;
  const ok = scrcpyManager.setGlobalPreset(preset);
  res.json({ success: ok, preset: scrcpyManager.currentPreset, presets: STREAM_PRESETS });
});

function broadcast(data) {
  const msg = JSON.stringify(data);
  clients.forEach(c => {
    if (c.readyState === WebSocket.OPEN) {
      c.send(msg);
    }
  });
}

// Start background automation scheduler
schedulerEngine.init(broadcast);

// -------------------------------------------------------------
// 1. DEVICE & CONTROL CENTER ENDPOINTS
// -------------------------------------------------------------
app.get('/api/devices', async (req, res) => {
  try {
    const devices = await adbManager.getDevices();
    res.json({ success: true, devices });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Single or Group Tap
app.post('/api/devices/tap', async (req, res) => {
  const { serial, x, y, broadcastGroup = false, slaves = [] } = req.body;
  try {
    const targets = broadcastGroup && slaves.length > 0 ? [serial, ...slaves] : [serial];
    await Promise.all(targets.map(s => adbManager.tap(s, x, y)));
    res.json({ success: true, targets, x, y });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Single or Group Swipe
app.post('/api/devices/swipe', async (req, res) => {
  const { serial, x1, y1, x2, y2, duration = 300, broadcastGroup = false, slaves = [] } = req.body;
  try {
    const targets = broadcastGroup && slaves.length > 0 ? [serial, ...slaves] : [serial];
    await Promise.all(targets.map(s => adbManager.swipe(s, x1, y1, x2, y2, duration)));
    res.json({ success: true, targets });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Type text
app.post('/api/devices/type', async (req, res) => {
  const { serial, text, broadcastGroup = false, slaves = [] } = req.body;
  try {
    const targets = broadcastGroup && slaves.length > 0 ? [serial, ...slaves] : [serial];
    await Promise.all(targets.map(s => adbManager.typeText(s, text)));
    res.json({ success: true, targets });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Keyevent (Back, Home, Power, Volume, etc.)
app.post('/api/devices/key', async (req, res) => {
  const { serial, keycode, broadcastGroup = false, slaves = [] } = req.body;
  try {
    const targets = broadcastGroup && slaves.length > 0 ? [serial, ...slaves] : [serial];
    await Promise.all(targets.map(s => adbManager.keyevent(s, keycode)));
    res.json({ success: true, targets, keycode });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Wake up screen
app.post('/api/devices/wake', async (req, res) => {
  const { serial } = req.body;
  try {
    await adbManager.wake(serial);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Screenshot endpoint (returns binary PNG image)
app.get('/api/devices/:serial/screenshot', async (req, res) => {
  const { serial } = req.params;
  try {
    const buffer = await adbManager.screencapBuffer(serial);
    res.writeHead(200, {
      'Content-Type': 'image/png',
      'Content-Length': buffer.length,
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    });
    res.end(buffer);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// -------------------------------------------------------------
// 2. UI INSPECTOR ENDPOINTS
// -------------------------------------------------------------
app.get('/api/devices/:serial/inspector', async (req, res) => {
  const { serial } = req.params;
  try {
    const result = await adbManager.dumpHierarchy(serial);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// -------------------------------------------------------------
// 3. AUTOMATION FLOW & GENFARMER IMPORT ENDPOINTS
// -------------------------------------------------------------
app.get('/api/flows', (req, res) => {
  const flows = dataStore.getSavedFlows();
  res.json({ success: true, flows });
});

app.post('/api/flows', (req, res) => {
  try {
    const saved = dataStore.saveFlow(req.body);
    res.json({ success: true, flow: saved });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/flows/:id', (req, res) => {
  dataStore.deleteFlow(req.params.id);
  res.json({ success: true });
});

// Get Hanpeak keyword categories, top 15 daily keywords, and persona preferences
app.get('/api/keywords', (req, res) => {
  res.json({
    success: true,
    categories: KEYWORD_CATEGORIES,
    top15Keywords: TOP_15_DAILY_KEYWORDS,
    hashtags: TARGET_HASHTAGS,
    personaPreferences: PERSONA_KEYWORD_PREFERENCES
  });
});

// Classify post and check negative filter
app.post('/api/keywords/classify', (req, res) => {
  const { postText } = req.body || {};
  const result = classifyPost(postText || '');
  res.json({ success: true, result });
});

app.get('/api/keywords/pick', (req, res) => {
  const { serial, category, customKeywords } = req.query;
  const picked = getSmartKeyword(serial || 'GAGAA68HPVCEJFJV', { category, customKeywords });
  res.json({ success: true, picked });
});

// Get the pre-loaded 343-node GenFarmer flow sample
app.get('/api/flows/sample', (req, res) => {
  try {
    const samplePath = path.join(__dirname, '../samples/facebook_flow.json');
    if (fs.existsSync(samplePath)) {
      const content = JSON.parse(fs.readFileSync(samplePath, 'utf-8'));
      res.json({ success: true, flow: content });
    } else {
      res.status(404).json({ success: false, error: 'Sample flow not found' });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Import any custom GenFarmer Flow JSON or raw text
app.post('/api/flows/import', (req, res) => {
  try {
    let payload = req.body;
    if (typeof payload === 'string') {
      payload = JSON.parse(payload);
    }

    // Standardize GenFarmer format
    // GenFarmer structure: { id, name, script: { flow: { nodes, edges } } } OR direct { flow: { nodes, edges } }
    let flowObj = payload.script?.flow || payload.flow || payload;
    let name = payload.name || payload.script?.name || 'Imported GenFarmer Flow';

    if (!flowObj.nodes || !Array.isArray(flowObj.nodes)) {
      return res.status(400).json({ success: false, error: 'Invalid flow format. Expected nodes array.' });
    }

    const imported = {
      id: `genfarmer_${Date.now()}`,
      name,
      description: payload.description || 'Imported directly from GenFarmer',
      version: payload.version || '1.0.0',
      flow: flowObj,
      importedFrom: 'GenFarmer',
      nodeCount: flowObj.nodes.length,
      edgeCount: flowObj.edges?.length || 0,
      createdAt: new Date().toISOString()
    };

    dataStore.saveFlow(imported);
    res.json({ success: true, flow: imported });
  } catch (err) {
    res.status(400).json({ success: false, error: 'Failed to import flow: ' + err.message });
  }
});

// Run flow on single device
app.post('/api/flows/run', async (req, res) => {
  const { flow, serial, context = {} } = req.body;
  if (!flow || !serial) {
    return res.status(400).json({ success: false, error: 'Flow and serial are required' });
  }

  // Start execution in background and stream logs via WebSocket
  res.json({ success: true, message: 'Execution initiated' });

  try {
    const flowData = flow.flow || flow;
    const result = await flowRunner.executeFlow(
      flowData,
      serial,
      context,
      (log) => broadcast({ type: 'flow_log', ...log }),
      (step) => broadcast({ type: 'flow_step', ...step })
    );

    // Save run record to dataStore
    dataStore.addRun({
      id: `run_${Date.now()}_${serial.slice(-4)}`,
      flowName: flow.name || 'Untitled Flow',
      serial,
      startedAt: new Date().toISOString(),
      duration: `${result.stepCount || 0} steps`,
      status: result.success ? 'Success' : 'Failed'
    });

    broadcast({ type: 'flow_finished', serial, result });
  } catch (err) {
    broadcast({ type: 'flow_error', serial, error: err.message });
  }
});

// Batch run flow on multiple devices (parallel or staggered with delay)
app.post('/api/flows/batch-run', async (req, res) => {
  const { flow, serials = [], delayBetweenMs = 1200, context = {} } = req.body;
  if (!flow || !Array.isArray(serials) || serials.length === 0) {
    return res.status(400).json({ success: false, error: 'Flow and serials list are required' });
  }

  res.json({ success: true, message: `Batch execution initiated on ${serials.length} devices` });

  const flowData = flow.flow || flow;
  for (const serial of serials) {
    flowRunner.executeFlow(
      flowData,
      serial,
      context,
      (log) => broadcast({ type: 'flow_log', ...log }),
      (step) => broadcast({ type: 'flow_step', ...step })
    ).then((result) => {
      dataStore.addRun({
        id: `run_${Date.now()}_${serial.slice(-4)}`,
        flowName: flow.name || 'Untitled Flow',
        serial,
        startedAt: new Date().toISOString(),
        duration: `${result.stepCount || 0} steps`,
        status: result.success ? 'Success' : 'Failed'
      });
      broadcast({ type: 'flow_finished', serial, result });
    }).catch((err) => {
      broadcast({ type: 'flow_error', serial, error: err.message });
    });

    if (delayBetweenMs > 0 && serial !== serials[serials.length - 1]) {
      await new Promise(r => setTimeout(r, delayBetweenMs));
    }
  }
});

app.post('/api/flows/stop', (req, res) => {
  const { runId } = req.body;
  if (!runId || runId === 'ALL') {
    const count = flowRunner.stopAll();
    return res.json({ success: true, stoppedCount: count });
  }
  const stopped = flowRunner.stopRun(runId);
  res.json({ success: stopped });
});

// -------------------------------------------------------------
// 4. ACCOUNT MANAGER & 2FA TOTP GENERATOR
// -------------------------------------------------------------
app.get('/api/accounts', (req, res) => {
  const accounts = dataStore.getAccounts().map(acc => {
    let totpCode = '';
    let totpRemaining = 30;
    if (acc.twoFactorSecret) {
      try {
        totpCode = generateTOTP(acc.twoFactorSecret);
        totpRemaining = getRemainingSeconds();
      } catch {}
    }
    return { ...acc, totpCode, totpRemaining };
  });

  res.json({ success: true, accounts });
});

app.post('/api/accounts', (req, res) => {
  try {
    const saved = dataStore.saveAccounts(req.body.accounts || []);
    res.json({ success: true, accounts: saved });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Bulk import accounts (supports lines of UID|Password|2FA|Email|EmailPass)
app.post('/api/accounts/bulk-import', async (req, res) => {
  try {
    const { rawText, platform = 'Facebook', targetMode = 'unassigned', assignedDevice = '' } = req.body;
    if (!rawText || typeof rawText !== 'string') {
      return res.status(400).json({ success: false, error: 'Raw text is required' });
    }

    const lines = rawText.split('\n').map(l => l.trim()).filter(l => l.length > 0 && !l.startsWith('#'));
    const onlineDevices = await adbManager.getDevices();
    const onlineSerials = onlineDevices.filter(d => d.state === 'device').map(d => d.serial);

    const newAccounts = [];
    let deviceIndex = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Split by |, comma, or tab
      const parts = line.includes('|') ? line.split('|') : line.includes('\t') ? line.split('\t') : line.split(',');
      const uid = (parts[0] || '').trim();
      const password = (parts[1] || '').trim();
      const twoFactorSecret = (parts[2] || '').trim().replace(/\s+/g, '');
      const email = (parts[3] || '').trim();
      const emailPassword = (parts[4] || '').trim();

      if (!uid) continue;

      let targetSerial = '';
      if (targetMode === 'specific') {
        targetSerial = assignedDevice;
      } else if (targetMode === 'even' && onlineSerials.length > 0) {
        targetSerial = onlineSerials[deviceIndex % onlineSerials.length];
        deviceIndex++;
      }

      newAccounts.push({
        id: `acc_${Date.now()}_${i}_${Math.random().toString(36).substr(2, 4)}`,
        platform,
        uid,
        name: uid,
        password,
        twoFactorSecret,
        email,
        emailPassword,
        assignedDevice: targetSerial,
        status: 'Live',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }

    const existing = dataStore.getAccounts();
    // Filter duplicates by UID
    const existingUids = new Set(existing.map(a => a.uid));
    const toAdd = newAccounts.filter(a => !existingUids.has(a.uid));
    const all = [...existing, ...toAdd];
    dataStore.saveAccounts(all);

    res.json({
      success: true,
      importedCount: toAdd.length,
      skippedCount: newAccounts.length - toAdd.length,
      totalAccounts: all.length
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/accounts/:id', (req, res) => {
  dataStore.deleteAccount(req.params.id);
  res.json({ success: true });
});

// -------------------------------------------------------------
// 5. AUTOMATION SCHEDULER (HẸN GIỜ TỰ ĐỘNG)
// -------------------------------------------------------------
app.get('/api/schedules', (req, res) => {
  const schedules = dataStore.getSchedules();
  res.json({ success: true, schedules });
});

app.post('/api/schedules', (req, res) => {
  try {
    const saved = dataStore.saveSchedule(req.body);
    broadcast({ type: 'schedule_update', schedule: saved });
    res.json({ success: true, schedule: saved });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/schedules/:id', (req, res) => {
  dataStore.deleteSchedule(req.params.id);
  broadcast({ type: 'schedule_deleted', id: req.params.id });
  res.json({ success: true });
});

app.post('/api/schedules/:id/toggle', (req, res) => {
  const updated = dataStore.toggleSchedule(req.params.id, req.body.enabled);
  if (updated) {
    broadcast({ type: 'schedule_update', schedule: updated });
    res.json({ success: true, schedule: updated });
  } else {
    res.status(404).json({ success: false, error: 'Schedule not found' });
  }
});

app.post('/api/schedules/:id/run-now', async (req, res) => {
  try {
    res.json({ success: true, message: 'Schedule execution triggered' });
    schedulerEngine.runSchedule(req.params.id).catch(err => {
      console.error('[API] Error running schedule:', err.message);
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// -------------------------------------------------------------
// 5. HARDWARE BOX CONTROLLER ENDPOINTS
// -------------------------------------------------------------
app.get('/api/box/ports', async (req, res) => {
  const ports = await boxController.getAvailablePorts();
  const settings = dataStore.getBoxSettings();
  res.json({ success: true, ports, settings });
});

app.post('/api/box/connect', async (req, res) => {
  const { port, baudRate } = req.body;
  const result = await boxController.connect(port, baudRate);
  dataStore.updateBoxSettings({ selectedPort: port });
  res.json(result);
});

app.post('/api/box/command', async (req, res) => {
  const { type, value, channelId } = req.body;
  let result = { success: true };

  switch (type) {
    case 'fan':
      result = await boxController.setFanSpeed(value);
      dataStore.updateBoxSettings({ fanSpeed: value });
      break;
    case 'mode':
      result = await boxController.setMode(value);
      dataStore.updateBoxSettings({ mode: value });
      break;
    case 'channel':
      result = await boxController.setChannelPower(channelId, value);
      break;
    case 'all':
      result = await boxController.setAllChannels(value);
      break;
    default:
      return res.status(400).json({ success: false, error: 'Unknown box command' });
  }

  res.json(result);
});

// -------------------------------------------------------------
// 6. RUNS HISTORY & MEMES
// -------------------------------------------------------------
app.get('/api/runs', (req, res) => {
  const runs = dataStore.getRuns();
  res.json({ success: true, runs });
});

app.post('/api/memes/import-all', async (req, res) => {
  try {
    const { importMemesToAllDevices } = await import('./imageService.js');
    const results = await importMemesToAllDevices();
    res.json({ success: true, results });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Start HTTP & WS server
httpServer.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`  CIT-FARM (GenFarmer Local Clone) Backend Running  `);
  console.log(`  Local API:   http://127.0.0.1:${PORT}`);
  console.log(`  WebSocket:   ws://127.0.0.1:${PORT}/ws`);
  console.log(`====================================================`);
});
