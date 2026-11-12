import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dataStore } from './dataStore.js';
import { adbManager } from './adb.js';
import { flowRunner } from './flowRunner.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class SchedulerEngine {
  constructor() {
    this.timer = null;
    this.isRunning = false;
    this.broadcast = () => {};
    this.executingSchedules = new Set();
  }

  init(broadcastFn) {
    if (broadcastFn) this.broadcast = broadcastFn;
    this.start();
  }

  start() {
    if (this.timer) clearInterval(this.timer);
    console.log('[Scheduler] Background engine started (checking every 10s)');
    this.timer = setInterval(() => this.tick(), 10000);
    // Initial check after 3s
    setTimeout(() => this.tick(), 3000);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async tick() {
    const schedules = dataStore.getSchedules().filter(s => s.enabled);
    const now = new Date();
    const currentHourMin = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const currentDay = now.getDay(); // 0 = Sun, 1 = Mon ...
    const todayStr = now.toISOString().slice(0, 10);

    for (const sched of schedules) {
      if (this.executingSchedules.has(sched.id)) continue;

      let shouldRun = false;

      if (sched.type === 'daily') {
        const allowedDays = Array.isArray(sched.daysOfWeek) ? sched.daysOfWeek : [0, 1, 2, 3, 4, 5, 6];
        const lastRunDate = sched.lastRun ? new Date(sched.lastRun).toISOString().slice(0, 10) : '';
        const isTimeMatch = sched.time === currentHourMin;
        const isDayMatch = allowedDays.includes(currentDay);
        const notRunToday = lastRunDate !== todayStr;

        if (isTimeMatch && isDayMatch && notRunToday) {
          shouldRun = true;
        }
      } else if (sched.type === 'interval') {
        const intervalMs = (parseInt(sched.intervalMinutes) || 60) * 60 * 1000;
        const lastRunMs = sched.lastRun ? new Date(sched.lastRun).getTime() : 0;
        if (Date.now() - lastRunMs >= intervalMs) {
          shouldRun = true;
        }
      }

      if (shouldRun) {
        this.runSchedule(sched.id).catch(err => {
          console.error(`[Scheduler] Error running schedule ${sched.name}:`, err.message);
        });
      }
    }
  }

  async runSchedule(scheduleId) {
    if (this.executingSchedules.has(scheduleId)) return { success: false, error: 'Already running' };

    const schedules = dataStore.getSchedules();
    const sched = schedules.find(s => s.id === scheduleId);
    if (!sched) return { success: false, error: 'Schedule not found' };

    this.executingSchedules.add(scheduleId);
    dataStore.updateScheduleStatus(scheduleId, { status: 'running', lastRun: new Date().toISOString() });
    this.broadcast({ type: 'schedule_update', schedule: sched, status: 'running' });

    console.log(`[Scheduler] 🚀 Triggering schedule: "${sched.name}"`);

    try {
      // 1. Resolve Flow
      let flowObj = null;
      if (sched.flowId === 'sample') {
        const samplePath = path.join(__dirname, '../samples/facebook_flow.json');
        if (fs.existsSync(samplePath)) {
          const raw = JSON.parse(fs.readFileSync(samplePath, 'utf-8'));
          flowObj = raw.script?.flow || raw.flow || raw;
        }
      } else {
        const saved = dataStore.getSavedFlows().find(f => f.id === sched.flowId);
        if (saved) {
          flowObj = saved.flow?.script?.flow || saved.flow?.flow || saved.flow || saved;
        }
      }

      if (!flowObj || !flowObj.nodes) {
        throw new Error('Flow script not found or invalid');
      }

      // 2. Resolve Target Devices
      const onlineDevices = await adbManager.getDevices();
      const onlineSerials = onlineDevices.filter(d => d.state === 'device').map(d => d.serial);

      let targetSerials = [];
      if (sched.targetMode === 'all') {
        targetSerials = onlineSerials;
      } else if (Array.isArray(sched.targetSerials) && sched.targetSerials.length > 0) {
        targetSerials = sched.targetSerials.filter(s => onlineSerials.includes(s));
      } else {
        targetSerials = onlineSerials;
      }

      if (targetSerials.length === 0) {
        throw new Error('No online devices available for this schedule');
      }

      // 3. Wake screens if requested
      if (sched.wakeScreen) {
        await Promise.all(targetSerials.map(s => adbManager.wake(s).catch(() => {})));
      }

      const allAccounts = dataStore.getAccounts();

      // 4. Execute on devices
      const deviceRuns = targetSerials.map(async (serial) => {
        // Multi-Account Rotation logic
        if (sched.rotateAccounts) {
          const assignedAccs = allAccounts.filter(a => a.assignedDevice === serial && a.status !== 'Die');
          if (assignedAccs.length > 0) {
            console.log(`[Scheduler] Rotating ${assignedAccs.length} accounts on device [${serial}]...`);
            for (let i = 0; i < assignedAccs.length; i++) {
              const acc = assignedAccs[i];
              this.broadcast({
                type: 'flow_log',
                level: 'INFO',
                serial,
                msg: `[Scheduler] [${i + 1}/${assignedAccs.length}] Bắt đầu tài khoản: ${acc.uid} (${acc.name || ''})`
              });

              await flowRunner.executeFlow(
                flowObj,
                serial,
                { account: acc, scheduleName: sched.name, accountIndex: i + 1, totalAccounts: assignedAccs.length },
                (log) => this.broadcast({ type: 'flow_log', ...log }),
                (step) => this.broadcast({ type: 'flow_step', serial, ...step })
              );

              // Update account last active time
              acc.lastRun = new Date().toISOString();
              dataStore.saveAccounts(allAccounts);

              // Pause 3 seconds between account rotations
              if (i < assignedAccs.length - 1) {
                await new Promise(r => setTimeout(r, 3000));
              }
            }
            return;
          }
        }

        // Standard single execution per device
        await flowRunner.executeFlow(
          flowObj,
          serial,
          { scheduleName: sched.name },
          (log) => this.broadcast({ type: 'flow_log', ...log }),
          (step) => this.broadcast({ type: 'flow_step', serial, ...step })
        );
      });

      await Promise.all(deviceRuns);

      // Record in run history
      dataStore.addRun({
        id: `run_sched_${Date.now()}`,
        flowName: sched.flowName || sched.name,
        target: `${targetSerials.length} thiết bị (${sched.name})`,
        status: 'Completed',
        timestamp: new Date().toISOString(),
        duration: 'Tự động theo lịch'
      });

      dataStore.updateScheduleStatus(scheduleId, { status: 'idle', lastStatus: 'Thành công' });
      this.broadcast({ type: 'schedule_update', scheduleId, status: 'idle', lastStatus: 'Thành công' });
      console.log(`[Scheduler] ✅ Finished schedule: "${sched.name}"`);
      return { success: true };
    } catch (err) {
      console.error(`[Scheduler] ❌ Failed schedule "${sched.name}":`, err.message);
      dataStore.updateScheduleStatus(scheduleId, { status: 'error', lastError: err.message, lastStatus: 'Thất bại' });
      this.broadcast({ type: 'schedule_update', scheduleId, status: 'error', error: err.message });
      return { success: false, error: err.message };
    } finally {
      this.executingSchedules.delete(scheduleId);
    }
  }
}

export const schedulerEngine = new SchedulerEngine();

