import React, { useState, useEffect } from 'react';
import { 
  Smartphone, Search, GitBranch, Users, Cpu, History, 
  RefreshCw, Power, Home, ArrowLeft, Volume2, ShieldCheck, 
  ExternalLink, Layers, Sparkles, Terminal, Activity, CalendarClock
} from 'lucide-react';

import ControlCenter from './components/ControlCenter';
import Inspector from './components/Inspector';
import FlowBuilder from './components/FlowBuilder';
import AccountManager from './components/AccountManager';
import SchedulerManager from './components/SchedulerManager';
import BoxController from './components/BoxController';
import RunsLog from './components/RunsLog';

export default function App() {
  const [activeTab, setActiveTab] = useState('control');
  const [devices, setDevices] = useState([]);
  const [activeSerial, setActiveSerial] = useState('');
  const [loadingDevices, setLoadingDevices] = useState(false);
  const [serverOnline, setServerOnline] = useState(true);

  // Fetch connected ADB devices
  const fetchDevices = async () => {
    setLoadingDevices(true);
    try {
      const res = await fetch('/api/devices');
      const data = await res.json();
      if (data.success && data.devices) {
        setDevices(data.devices);
        setServerOnline(true);
        if (data.devices.length > 0) {
          setActiveSerial(prev => {
            if (prev && data.devices.some(d => d.serial === prev)) return prev;
            return data.devices[0].serial;
          });
        }
      }
    } catch (err) {
      console.error('Lỗi kết nối ADB Backend:', err);
      setServerOnline(false);
    } finally {
      setLoadingDevices(false);
    }
  };

  useEffect(() => {
    fetchDevices();
    const interval = setInterval(fetchDevices, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleOpenInspector = (serial) => {
    setActiveSerial(serial);
    setActiveTab('inspector');
  };

  const navItems = [
    { id: 'control', label: 'Control Center', icon: Smartphone, badge: devices.length },
    { id: 'inspector', label: 'UI Inspector', icon: Search, badge: null },
    { id: 'automation', label: 'Flow Automation', icon: GitBranch, badge: 'GenFarmer' },
    { id: 'accounts', label: 'Account & 2FA', icon: Users, badge: null },
    { id: 'scheduler', label: 'Scheduler', icon: CalendarClock, badge: 'Auto' },
    { id: 'box', label: 'Box Controller', icon: Cpu, badge: 'COM' },
    { id: 'runs', label: 'Runs & Terminal', icon: History, badge: null },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      {/* Top Header */}
      <header className="glass" style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between', 
        padding: '0.65rem 1.25rem',
        borderBottom: '1px solid var(--border)',
        zIndex: 50
      }}>
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <div style={{ 
            width: '38px', 
            height: '38px', 
            borderRadius: '10px', 
            background: 'linear-gradient(135deg, #10b981 0%, #06b6d4 100%)',
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            boxShadow: '0 0 15px rgba(16, 185, 129, 0.4)'
          }}>
            <Sparkles size={20} color="#0f172a" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span className="font-display" style={{ fontWeight: 800, fontSize: '1.2rem', letterSpacing: '-0.02em' }}>
                CIT <span style={{ color: 'var(--primary)' }}>FARM</span>
              </span>
              <span className="badge badge-emerald" style={{ fontSize: '0.65rem', padding: '0.1rem 0.45rem' }}>
                PRO v3.0
              </span>
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', letterSpacing: '0.02em' }}>
              Phone Farm Automation Platform • GenFarmer Flow Compatible
            </div>
          </div>
        </div>

        {/* Global Tab Navigation */}
        <nav style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', background: 'rgba(0,0,0,0.3)', padding: '0.25rem', borderRadius: '0.6rem', border: '1px solid var(--border)' }}>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`btn ${isActive ? 'btn-primary' : 'btn-ghost'}`}
                style={{
                  padding: '0.45rem 0.85rem',
                  fontSize: '0.825rem',
                  borderRadius: '0.45rem',
                  gap: '0.45rem'
                }}
              >
                <Icon size={15} />
                <span>{item.label}</span>
                {item.badge !== null && (
                  <span style={{ 
                    fontSize: '0.65rem', 
                    padding: '0.05rem 0.35rem', 
                    borderRadius: '999px',
                    background: isActive ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.1)',
                    fontWeight: 600
                  }}>
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Device Status & Quick Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {/* Active device pill */}
          <div className="glass" style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '0.5rem', 
            padding: '0.35rem 0.75rem', 
            borderRadius: '999px',
            fontSize: '0.75rem'
          }}>
            <div style={{ 
              width: '8px', 
              height: '8px', 
              borderRadius: '50%', 
              background: serverOnline && devices.length > 0 ? '#10b981' : '#f43f5e',
              boxShadow: serverOnline && devices.length > 0 ? '0 0 8px #10b981' : 'none'
            }} />
            <span style={{ color: 'var(--text-muted)' }}>Thiết bị:</span>
            <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>
              {devices.length > 0 
                ? `${devices.find(d => d.serial === activeSerial)?.model || 'Android'} (${devices.length} Online)`
                : 'Chưa có máy kết nối'}
            </span>
          </div>

          <button 
            onClick={fetchDevices} 
            className="btn btn-secondary" 
            title="Làm mới danh sách thiết bị ADB"
            style={{ padding: '0.45rem 0.65rem' }}
          >
            <RefreshCw size={14} className={loadingDevices ? 'spin' : ''} />
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        {activeTab === 'control' && (
          <ControlCenter 
            devices={devices} 
            activeSerial={activeSerial} 
            onSelectDevice={setActiveSerial}
            onOpenInspector={handleOpenInspector}
          />
        )}

        {activeTab === 'inspector' && (
          <Inspector 
            devices={devices} 
            activeSerial={activeSerial} 
            onSelectDevice={setActiveSerial}
          />
        )}

        {activeTab === 'automation' && (
          <FlowBuilder 
            devices={devices} 
            activeSerial={activeSerial} 
          />
        )}

        {activeTab === 'accounts' && (
          <AccountManager 
            devices={devices} 
          />
        )}

        {activeTab === 'scheduler' && (
          <SchedulerManager 
            devices={devices} 
          />
        )}

        {activeTab === 'box' && (
          <BoxController />
        )}

        {activeTab === 'runs' && (
          <RunsLog />
        )}
      </main>

      {/* Bottom Global Status Bar */}
      <footer className="glass" style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between', 
        padding: '0.35rem 1rem', 
        borderTop: '1px solid var(--border)',
        fontSize: '0.72rem',
        color: 'var(--text-dim)',
        zIndex: 40
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <Activity size={12} color="#10b981" />
            Backend: <b style={{ color: '#10b981' }}>http://127.0.0.1:55555</b>
          </span>
          <span>•</span>
          <span>ADB Engine: <b>GenFarmer platform-tools/adb.exe</b></span>
          <span>•</span>
          <span>Flow Compatibility: <b>GenFarmer V3 (All Nodes & Graphs)</b></span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span>Device Resolution: <b>{devices.find(d => d.serial === activeSerial)?.resolution || '720x1600'}</b></span>
          <span>•</span>
          <span style={{ color: 'var(--text-muted)' }}>CIT Farm Automation Suite © 2026</span>
        </div>
      </footer>
    </div>
  );
}
