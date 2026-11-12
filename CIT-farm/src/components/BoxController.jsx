import React, { useState, useEffect } from 'react';
import { 
  Cpu, Power, Wind, Radio, RefreshCw, CheckCircle2, 
  Terminal, ShieldCheck, Zap, Sliders
} from 'lucide-react';

export default function BoxController() {
  const [ports, setPorts] = useState([]);
  const [selectedPort, setSelectedPort] = useState('COM73');
  const [isConnected, setIsConnected] = useState(true);
  const [fanSpeed, setFanSpeed] = useState('HIGH');
  const [mode, setMode] = useState('USB');
  const [channels, setChannels] = useState(
    Array.from({ length: 20 }, (_, i) => ({
      id: i + 1,
      name: `Kênh ${String(i + 1).padStart(2, '0')}`,
      power: true,
      mode: 'USB'
    }))
  );
  const [lastHex, setLastHex] = useState('DC AC 04 10 01 00 02 85 C1');
  const [logs, setLogs] = useState([
    `[${new Date().toLocaleTimeString()}] Sẵn sàng điều khiển phần cứng Boxphone qua Serial COM.`,
    `[${new Date().toLocaleTimeString()}] Giao thức khung tin: 0xDC 0xAC (Baud: 115200, 8-N-1, CRC16).`
  ]);

  const fetchPorts = async () => {
    try {
      const res = await fetch('/api/box/ports');
      const data = await res.json();
      if (data.success && data.ports) {
        setPorts(data.ports);
        if (data.settings?.fanSpeed) setFanSpeed(data.settings.fanSpeed);
        if (data.settings?.mode) setMode(data.settings.mode);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchPorts();
  }, []);

  const sendCommand = async (type, value, channelId = null) => {
    try {
      const res = await fetch('/api/box/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, value, channelId })
      });
      const data = await res.json();
      if (data.hex) {
        setLastHex(data.hex.toUpperCase().match(/.{1,2}/g).join(' '));
      }
      setLogs(prev => [
        `[${new Date().toLocaleTimeString()}] Lệnh gửi [${type}]: ${value} ${channelId ? `(Kênh ${channelId})` : ''} -> Frame: ${data.hex || 'OK'}`,
        ...prev.slice(0, 30)
      ]);
    } catch (err) {
      console.error(err);
    }
  };

  const handleFanChange = (speed) => {
    setFanSpeed(speed);
    sendCommand('fan', speed);
  };

  const handleModeChange = (newMode) => {
    setMode(newMode);
    sendCommand('mode', newMode);
  };

  const handleBulkAction = (action) => {
    sendCommand('all', action);
    if (action === 'ALL_USB') setChannels(ch => ch.map(c => ({ ...c, mode: 'USB' })));
    if (action === 'ALL_OTG') setChannels(ch => ch.map(c => ({ ...c, mode: 'OTG' })));
    if (action === 'ALL_OFF') setChannels(ch => ch.map(c => ({ ...c, power: false })));
    if (action === 'ALL_RESTART') setChannels(ch => ch.map(c => ({ ...c, power: true })));
  };

  const toggleChannel = (id) => {
    setChannels(prev => prev.map(c => {
      if (c.id === id) {
        const nextState = !c.power;
        sendCommand('channel', nextState, id);
        return { ...c, power: nextState };
      }
      return c;
    }));
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '1.5rem', height: '100%' }}>
      {/* LEFT: 20-Channel Relay Matrix & Quick Control */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', minHeight: 0 }}>
        {/* Top Hardware Status Bar */}
        <div className="glass" style={{ padding: '0.75rem 1.25rem', borderRadius: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Cpu size={20} color="#06b6d4" />
            <span className="font-display" style={{ fontWeight: 700, fontSize: '1.05rem', color: '#f8fafc' }}>
              Boxphone Hardware Controller
            </span>
            <span className="badge badge-cyan">20 Kênh Relay</span>
          </div>

          {/* Quick Bulk Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <button className="btn btn-secondary" onClick={() => handleBulkAction('ALL_USB')} style={{ fontSize: '0.75rem' }}>
              Tất cả USB
            </button>
            <button className="btn btn-secondary" onClick={() => handleBulkAction('ALL_OTG')} style={{ fontSize: '0.75rem' }}>
              Tất cả OTG
            </button>
            <button className="btn btn-secondary" onClick={() => handleBulkAction('ALL_RESTART')} style={{ fontSize: '0.75rem', color: '#38bdf8' }}>
              <Zap size={13} /> Khởi động lại tất cả
            </button>
            <button className="btn btn-danger" onClick={() => handleBulkAction('ALL_OFF')} style={{ fontSize: '0.75rem' }}>
              <Power size={13} /> Tắt nguồn tất cả
            </button>
          </div>
        </div>

        {/* 20-Channel Relay Grid */}
        <div className="glass" style={{ flex: 1, borderRadius: '1rem', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', overflowY: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>
            <span>Trạng thái nguồn bo mạch (Nhấn vào kênh để bật/tắt Relay):</span>
            <span style={{ fontFamily: 'var(--font-mono)' }}>{channels.filter(c => c.power).length}/20 Kênh BẬT</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '0.85rem' }}>
            {channels.map((ch) => (
              <div 
                key={ch.id}
                onClick={() => toggleChannel(ch.id)}
                style={{
                  padding: '0.75rem',
                  borderRadius: '0.75rem',
                  background: ch.power ? 'rgba(16, 185, 129, 0.12)' : 'rgba(244, 63, 94, 0.08)',
                  border: `1px solid ${ch.power ? 'rgba(16, 185, 129, 0.3)' : 'rgba(244, 63, 94, 0.2)'}`,
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.5rem',
                  transition: 'all 0.15s'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 700, fontSize: '0.85rem', color: ch.power ? '#34d399' : '#f87171' }}>
                    {ch.name}
                  </span>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: ch.power ? '#10b981' : '#f43f5e' }} />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem', color: '#94a3b8' }}>
                  <span>Nguồn:</span>
                  <span style={{ fontWeight: 600, color: ch.power ? '#10b981' : '#f43f5e' }}>
                    {ch.power ? 'ON' : 'OFF'}
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem', color: '#94a3b8' }}>
                  <span>Mode:</span>
                  <span className="badge badge-cyan" style={{ fontSize: '0.65rem', padding: '0.1rem 0.35rem' }}>
                    {ch.mode}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* RIGHT: Box Connection & Controls Panel */}
      <div className="glass" style={{ borderRadius: '1rem', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', overflowY: 'auto' }}>
        {/* Connection Box */}
        <div>
          <span className="font-display" style={{ fontWeight: 700, fontSize: '1.05rem', color: '#f8fafc', display: 'block', marginBottom: '0.75rem' }}>
            1. Quản lý Kết nối COM Port
          </span>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <select
              value={selectedPort}
              onChange={e => setSelectedPort(e.target.value)}
              style={{ flex: 1, padding: '0.45rem', borderRadius: 4, background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border)', color: '#fff' }}
            >
              {ports.map(p => (
                <option key={p.port} value={p.port}>{p.port} - {p.description}</option>
              ))}
            </select>
            <button className="btn btn-primary" onClick={() => fetch('/api/box/connect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ port: selectedPort, baudRate: 115200 }) })}>
              Kết nối
            </button>
          </div>
        </div>

        {/* Fan Speed Control */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <Wind size={18} color="#06b6d4" />
            <span className="font-display" style={{ fontWeight: 700, fontSize: '1rem', color: '#f8fafc' }}>
              2. Tốc độ Quạt tản nhiệt
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
            {['OFF', 'LOW', 'HIGH'].map(speed => (
              <button
                key={speed}
                onClick={() => handleFanChange(speed)}
                className={`btn ${fanSpeed === speed ? 'btn-primary' : 'btn-secondary'}`}
                style={{ fontSize: '0.8rem', padding: '0.45rem' }}
              >
                {speed === 'OFF' ? 'Tắt quạt' : speed === 'LOW' ? 'Thấp (L)' : 'Cao (H)'}
              </button>
            ))}
          </div>
        </div>

        {/* Working Mode Control */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <Radio size={18} color="#a78bfa" />
            <span className="font-display" style={{ fontWeight: 700, fontSize: '1rem', color: '#f8fafc' }}>
              3. Chế độ Mặc định
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
            {['USB', 'OTG'].map(m => (
              <button
                key={m}
                onClick={() => handleModeChange(m)}
                className={`btn ${mode === m ? 'btn-primary' : 'btn-secondary'}`}
                style={{ fontSize: '0.8rem', padding: '0.45rem' }}
              >
                {m === 'USB' ? 'USB Hub Mode' : 'OTG / LAN Mode'}
              </button>
            ))}
          </div>
        </div>

        {/* Binary Frame Packet Monitor */}
        <div>
          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#94a3b8', display: 'block', marginBottom: '0.4rem' }}>
            Mã gói tin gửi gần nhất (Hex Frame):
          </span>
          <div style={{ padding: '0.5rem', borderRadius: 4, background: 'rgba(0,0,0,0.5)', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: '#34d399', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
            {lastHex}
          </div>
        </div>

        {/* Hardware Logs Console */}
        <div style={{ flex: 1, minHeight: 120, background: 'rgba(0,0,0,0.4)', borderRadius: 6, padding: '0.5rem', fontFamily: 'var(--font-mono)', fontSize: '0.7rem', overflowY: 'auto' }}>
          {logs.map((l, i) => (
            <div key={i} style={{ color: '#cbd5e1', lineHeight: '1.4', marginBottom: 2 }}>{l}</div>
          ))}
        </div>
      </div>
    </div>
  );
}
