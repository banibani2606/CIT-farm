import React, { useState, useEffect, useRef } from 'react';
import {
  Smartphone, Power, Volume2, ArrowLeft, Home,
  Layers, Users, Zap, Search, Cpu
} from 'lucide-react';
import { scrcpyPool } from '../utils/scrcpyPool';

// Exact letterbox/pillarbox compensation for CSS object-fit: contain on <canvas>
function getNormalizedCoords(e, canvas) {
  const rect = canvas.getBoundingClientRect();
  const cw = canvas.width || 720;
  const ch = canvas.height || 1600;
  const boxAspect = rect.width / rect.height;
  const vidAspect = cw / ch;

  let renderW = rect.width;
  let renderH = rect.height;
  let offsetX = 0;
  let offsetY = 0;

  if (boxAspect > vidAspect) {
    renderH = rect.height;
    renderW = renderH * vidAspect;
    offsetX = (rect.width - renderW) / 2;
  } else {
    renderW = rect.width;
    renderH = renderW / vidAspect;
    offsetY = (rect.height - renderH) / 2;
  }

  const nx = (e.clientX - rect.left - offsetX) / renderW;
  const ny = (e.clientY - rect.top - offsetY) / renderH;
  return {
    nx: Math.max(0, Math.min(1, nx)),
    ny: Math.max(0, Math.min(1, ny))
  };
}

// Hardware GPU H.264 Scrcpy Video Canvas (WebCodecs NVDEC / QuickSync + 1ms Real-time Touch)
function ScrcpyScreen({
  serial,
  isInteractive = false,
  groupControl = false,
  selectedSlaves = [],
  showStatsBadge = true
}) {
  const canvasRef = useRef(null);
  const pointerDownRef = useRef(false);
  const rafMoveRef = useRef(null);
  const pendingCoordsRef = useRef(null);

  const [stats, setStats] = useState({
    fps: 0,
    width: 0,
    height: 0,
    hwAccel: true,
    encoder: '',
    ready: false
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !serial) return;
    const unsubscribe = scrcpyPool.subscribe(serial, canvas, setStats);
    return () => {
      unsubscribe();
      if (rafMoveRef.current) cancelAnimationFrame(rafMoveRef.current);
    };
  }, [serial]);

  const handlePointerDown = (e) => {
    if (!isInteractive || e.button !== 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    e.preventDefault();
    try { canvas.setPointerCapture(e.pointerId); } catch {}
    pointerDownRef.current = true;

    const { nx, ny } = getNormalizedCoords(e, canvas);
    scrcpyPool.sendTouch(serial, 0, nx, ny, groupControl, selectedSlaves); // ACTION_DOWN = 0
  };

  const handlePointerMove = (e) => {
    if (!isInteractive || !pointerDownRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    pendingCoordsRef.current = getNormalizedCoords(e, canvas);
    if (!rafMoveRef.current) {
      rafMoveRef.current = requestAnimationFrame(() => {
        rafMoveRef.current = null;
        if (pointerDownRef.current && pendingCoordsRef.current) {
          const { nx, ny } = pendingCoordsRef.current;
          scrcpyPool.sendTouch(serial, 2, nx, ny, groupControl, selectedSlaves); // ACTION_MOVE = 2
        }
      });
    }
  };

  const finishPointer = (e) => {
    if (!isInteractive || !pointerDownRef.current) return;
    pointerDownRef.current = false;
    if (rafMoveRef.current) {
      cancelAnimationFrame(rafMoveRef.current);
      rafMoveRef.current = null;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    try { canvas.releasePointerCapture(e.pointerId); } catch {}
    const { nx, ny } = getNormalizedCoords(e, canvas);
    scrcpyPool.sendTouch(serial, 1, nx, ny, groupControl, selectedSlaves); // ACTION_UP = 1
  };

  const handleWheel = (e) => {
    if (!isInteractive) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { nx, ny } = getNormalizedCoords(e, canvas);
    const vScroll = e.deltaY > 0 ? -0.18 : 0.18;
    scrcpyPool.sendScroll(serial, nx, ny, 0, vScroll, groupControl, selectedSlaves);
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishPointer}
        onPointerCancel={finishPointer}
        onWheel={handleWheel}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          display: 'block',
          cursor: isInteractive ? 'crosshair' : 'pointer',
          touchAction: 'none',
          userSelect: 'none'
        }}
      />

      {!stats.ready && (
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.4rem',
          background: 'rgba(5, 7, 10, 0.75)',
          color: '#34d399',
          fontSize: '0.72rem',
          pointerEvents: 'none'
        }}>
          <Cpu size={18} />
          <span>Khởi tạo GPU H.264...</span>
        </div>
      )}

      {showStatsBadge && stats.ready && (
        <div style={{
          position: 'absolute',
          bottom: 6,
          right: 6,
          pointerEvents: 'none',
          display: 'flex',
          alignItems: 'center',
          gap: '0.3rem'
        }}>
          <span
            className="badge badge-emerald"
            style={{
              fontSize: '0.62rem',
              padding: '0.12rem 0.42rem',
              background: 'rgba(6, 78, 59, 0.85)',
              backdropFilter: 'blur(4px)'
            }}
          >
            {stats.hwAccel ? 'GPU' : 'H264'} {stats.fps > 0 ? `• ${stats.fps} FPS` : '• LIVE'}
          </span>
        </div>
      )}
    </div>
  );
}

export default function ControlCenter({ devices, activeSerial, onSelectDevice, onOpenInspector }) {
  const [groupControl, setGroupControl] = useState(false);
  const [selectedSlaves, setSelectedSlaves] = useState([]);
  const [quickText, setQuickText] = useState('');
  const [preset, setPreset] = useState(scrcpyPool.preset || 'smooth');

  const activeDevice = devices.find((d) => d.serial === activeSerial) || devices[0];

  // Auto-select all slave devices when toggling Group Control ON if none chosen yet
  const toggleGroupControl = () => {
    const next = !groupControl;
    setGroupControl(next);
    if (next && selectedSlaves.length === 0) {
      setSelectedSlaves(devices.filter((d) => d.serial !== activeSerial).map((d) => d.serial));
    }
  };

  const handleChangePreset = async (newPreset) => {
    setPreset(newPreset);
    try {
      await scrcpyPool.setPreset(newPreset);
    } catch (err) {
      console.error('Switch preset failed:', err);
    }
  };

  const sendKey = (keycode) => {
    if (!activeDevice) return;
    scrcpyPool.sendKey(activeDevice.serial, keycode, groupControl, selectedSlaves);
  };

  const sendQuickText = (e) => {
    e.preventDefault();
    if (!quickText || !activeDevice) return;
    scrcpyPool.sendText(activeDevice.serial, quickText, groupControl, selectedSlaves);
    setQuickText('');
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: activeDevice ? '1fr 390px' : '1fr', gap: '1.25rem', height: '100%', padding: '1rem 1.25rem' }}>
      {/* LEFT: Multi-Device GPU H.264 Stream Grid */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', minWidth: 0, minHeight: 0 }}>
        {/* Top Controls Bar */}
        <div className="glass" style={{ padding: '0.75rem 1.15rem', borderRadius: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.85rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Smartphone size={20} color="#10b981" />
              <span className="font-display" style={{ fontWeight: 700, fontSize: '1.05rem' }}>Dàn máy:</span>
              <span className="badge badge-emerald">{devices.length} Online</span>
            </div>

            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.28rem 0.65rem',
              borderRadius: '999px',
              background: 'rgba(6, 182, 212, 0.12)',
              border: '1px solid rgba(6, 182, 212, 0.3)',
              fontSize: '0.72rem',
              color: '#22d3ee',
              fontWeight: 600
            }}>
              <Cpu size={13} />
              <span>Scrcpy 2.4 • GPU WebCodecs H.264</span>
            </div>

            {/* Group Control Toggle */}
            <div
              onClick={toggleGroupControl}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.45rem',
                padding: '0.32rem 0.7rem',
                borderRadius: '0.5rem',
                background: groupControl ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                border: `1px solid ${groupControl ? '#10b981' : 'var(--border)'}`,
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              <Users size={15} color={groupControl ? '#10b981' : '#94a3b8'} />
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: groupControl ? '#34d399' : '#94a3b8' }}>
                Đồng bộ thao tác {groupControl ? `(${selectedSlaves.length} máy)` : '(TẮT)'}
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            {/* H.264 Hardware Quality / FPS Preset Selector */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', background: 'rgba(0,0,0,0.35)', padding: '0.2rem 0.35rem', borderRadius: '0.5rem', border: '1px solid var(--border)' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', padding: '0 0.25rem' }}>Chất lượng:</span>
              {[
                { id: 'ultra',  label: '⚡ 60 FPS HD' },
                { id: 'smooth', label: '🚀 30 FPS Mượt' },
                { id: 'farm',   label: '⚖️ 20 FPS Farm' },
                { id: 'eco',    label: '🍃 12 FPS Eco' }
              ].map((m) => (
                <button
                  key={m.id}
                  onClick={() => handleChangePreset(m.id)}
                  style={{
                    padding: '0.24rem 0.52rem',
                    fontSize: '0.72rem',
                    borderRadius: '0.35rem',
                    background: preset === m.id ? 'var(--primary)' : 'transparent',
                    color: preset === m.id ? '#0f172a' : 'var(--text-muted)',
                    fontWeight: preset === m.id ? 700 : 500,
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'all 0.15s'
                  }}
                >
                  {m.label}
                </button>
              ))}
            </div>

            <button
              className="btn btn-secondary"
              onClick={() => {
                devices.forEach((d) => {
                  fetch('/api/devices/wake', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ serial: d.serial })
                  });
                });
              }}
            >
              <Zap size={15} color="#f59e0b" /> Sáng tất cả
            </button>
          </div>
        </div>

        {/* Multi-Device Real-Time H.264 Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(195px, 1fr))',
            gap: '1.1rem',
            overflowY: 'auto',
            paddingRight: '0.35rem',
            flex: 1,
            alignContent: 'start'
          }}
        >
          {devices.map((d) => {
            const isSelected = activeSerial === d.serial;
            const isSlave = selectedSlaves.includes(d.serial);

            return (
              <div
                key={d.serial}
                className="glass"
                onClick={() => onSelectDevice(d.serial)}
                style={{
                  borderRadius: '0.9rem',
                  overflow: 'hidden',
                  cursor: 'pointer',
                  border: isSelected ? '2px solid #10b981' : isSlave && groupControl ? '2px solid #06b6d4' : '1px solid var(--border)',
                  boxShadow: isSelected ? '0 0 20px -3px rgba(16, 185, 129, 0.4)' : 'none',
                  transition: 'border-color 0.2s, box-shadow 0.2s',
                  display: 'flex',
                  flexDirection: 'column'
                }}
              >
                {/* Device Header */}
                <div style={{ padding: '0.5rem 0.8rem', background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981' }} />
                    <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#f8fafc' }}>
                      {d.model || d.serial.substring(0, 10)}
                    </span>
                  </div>
                  <span style={{ fontSize: '0.73rem', color: '#94a3b8' }}>{d.battery}</span>
                </div>

                {/* Live GPU H.264 Stream Thumbnail */}
                <div
                  style={{
                    position: 'relative',
                    aspectRatio: '9/19.5',
                    background: '#05070a',
                    overflow: 'hidden'
                  }}
                >
                  <ScrcpyScreen
                    serial={d.serial}
                    isInteractive={false}
                    showStatsBadge={true}
                  />
                </div>

                {/* Device Footer */}
                <div style={{ padding: '0.45rem 0.75rem', background: 'rgba(0,0,0,0.25)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.68rem', color: '#64748b', fontFamily: 'var(--font-mono)' }}>
                    {d.serial.length > 13 ? d.serial.substring(0, 13) + '…' : d.serial}
                  </span>
                  {groupControl && d.serial !== activeSerial && (
                    <label
                      onClick={(e) => e.stopPropagation()}
                      style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.73rem', cursor: 'pointer', color: '#38bdf8' }}
                    >
                      <input
                        type="checkbox"
                        checked={isSlave}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedSlaves([...selectedSlaves, d.serial]);
                          else setSelectedSlaves(selectedSlaves.filter((s) => s !== d.serial));
                        }}
                      />
                      Sync
                    </label>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* RIGHT: Active Single Device Interactive Real-Time Panel */}
      {activeDevice && (
        <div className="glass" style={{ borderRadius: '1rem', padding: '1.1rem', display: 'flex', flexDirection: 'column', gap: '0.85rem', minHeight: 0 }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '0.65rem', borderBottom: '1px solid var(--border)' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span className="font-display" style={{ fontWeight: 700, fontSize: '1.05rem' }}>
                  {activeDevice.model}
                </span>
                <span className="badge badge-emerald">{activeDevice.battery}</span>
              </div>
              <span style={{ fontSize: '0.73rem', color: '#64748b', fontFamily: 'var(--font-mono)' }}>
                {activeDevice.serial} • {activeDevice.resolution}
              </span>
            </div>

            <button
              className="btn btn-secondary"
              style={{ padding: '0.35rem 0.6rem', fontSize: '0.75rem' }}
              onClick={() => onOpenInspector(activeDevice.serial)}
            >
              <Search size={14} color="#06b6d4" /> Soi Inspector
            </button>
          </div>

          {/* Interactive 60Hz Touch + GPU H.264 Phone Screen */}
          <div
            style={{
              flex: 1,
              minHeight: 0,
              background: '#05070a',
              borderRadius: '0.75rem',
              overflow: 'hidden',
              position: 'relative',
              boxShadow: 'inset 0 0 20px rgba(0,0,0,0.8)'
            }}
          >
            <ScrcpyScreen
              serial={activeDevice.serial}
              isInteractive={true}
              groupControl={groupControl}
              selectedSlaves={selectedSlaves}
              showStatsBadge={true}
            />
          </div>

          {/* Hardware Quick Action Buttons (1ms Scrcpy Control Socket) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.4rem' }}>
            <button className="btn btn-secondary" title="Quay lại (Back)" onClick={() => sendKey(4)}>
              <ArrowLeft size={16} />
            </button>
            <button className="btn btn-secondary" title="Màn hình chính (Home)" onClick={() => sendKey(3)}>
              <Home size={16} />
            </button>
            <button className="btn btn-secondary" title="Ứng dụng gần đây (Recent)" onClick={() => sendKey(187)}>
              <Layers size={16} />
            </button>
            <button className="btn btn-secondary" title="Tăng âm lượng" onClick={() => sendKey(24)}>
              <Volume2 size={16} />
            </button>
            <button className="btn btn-secondary" title="Bật/Tắt màn hình" onClick={() => sendKey(26)}>
              <Power size={16} color="#f43f5e" />
            </button>
          </div>

          {/* Quick Text Input (Direct Scrcpy INJECT_TEXT) */}
          <form onSubmit={sendQuickText} style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              type="text"
              placeholder="Nhập chữ gửi trực tiếp..."
              value={quickText}
              onChange={(e) => setQuickText(e.target.value)}
              style={{
                flex: 1,
                padding: '0.45rem 0.75rem',
                borderRadius: '0.5rem',
                background: 'rgba(0,0,0,0.3)',
                border: '1px solid var(--border)',
                color: '#fff',
                fontSize: '0.85rem'
              }}
            />
            <button type="submit" className="btn btn-primary" style={{ padding: '0.45rem 0.85rem' }}>
              Gửi
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
