import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, RefreshCw, Grid, Crop, Copy, Check, MousePointer, 
  ExternalLink, Layers, Crosshair, Sparkles
} from 'lucide-react';

export default function Inspector({ devices, activeSerial, onSelectDevice }) {
  const [elements, setElements] = useState([]);
  const [selectedEl, setSelectedEl] = useState(null);
  const [hoveredEl, setHoveredEl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [enableGrid, setEnableGrid] = useState(true);
  const [enableCrop, setEnableCrop] = useState(false);
  const [cropBox, setCropBox] = useState(null);
  const [cropStart, setCropStart] = useState(null);
  const [cropBase64, setCropBase64] = useState('');
  const [copiedKey, setCopiedKey] = useState('');
  const [screenshotTs, setScreenshotTs] = useState(Date.now());

  const canvasRef = useRef(null);
  const imgRef = useRef(null);

  const activeDevice = devices.find(d => d.serial === activeSerial) || devices[0];

  // Load hierarchy and screenshot
  const refreshInspector = async () => {
    if (!activeDevice) return;
    setLoading(true);
    try {
      setScreenshotTs(Date.now());
      const res = await fetch(`/api/devices/${activeDevice.serial}/inspector`);
      const data = await res.json();
      if (data.success && data.elements) {
        setElements(data.elements);
        setSelectedEl(null);
      }
    } catch (err) {
      console.error('Inspector dump failed:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshInspector();
  }, [activeDevice?.serial]);

  // Handle Canvas mouse move for hover bounding box
  const handleMouseMove = (e) => {
    if (enableCrop && cropStart) {
      const rect = e.currentTarget.getBoundingClientRect();
      const currentX = e.clientX - rect.left;
      const currentY = e.clientY - rect.top;
      setCropBox({
        x: Math.min(cropStart.x, currentX),
        y: Math.min(cropStart.y, currentY),
        w: Math.abs(currentX - cropStart.x),
        h: Math.abs(currentY - cropStart.y)
      });
      return;
    }

    if (!enableGrid || elements.length === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const [resW, resH] = (activeDevice?.resolution || '720x1600').split('x').map(Number);
    const scaleX = (resW || 720) / rect.width;
    const scaleY = (resH || 1600) / rect.height;

    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    // Find smallest bounding box containing mouse
    const matched = elements
      .filter(el => el.bounds && x >= el.bounds.x1 && x <= el.bounds.x2 && y >= el.bounds.y1 && y <= el.bounds.y2)
      .sort((a, b) => (a.bounds.width * a.bounds.height) - (b.bounds.width * b.bounds.height));

    if (matched.length > 0) {
      setHoveredEl(matched[0]);
    } else {
      setHoveredEl(null);
    }
  };

  const handleMouseDown = (e) => {
    if (enableCrop) {
      const rect = e.currentTarget.getBoundingClientRect();
      setCropStart({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      });
      setCropBox(null);
    }
  };

  const handleMouseUp = () => {
    if (enableCrop && cropBox && imgRef.current) {
      // Snip canvas to Base64
      const canvas = document.createElement('canvas');
      canvas.width = cropBox.w;
      canvas.height = cropBox.h;
      const ctx = canvas.getContext('2d');
      // Calculate image natural proportions
      const img = imgRef.current;
      const scaleX = img.naturalWidth / img.width;
      const scaleY = img.naturalHeight / img.height;

      ctx.drawImage(
        img,
        cropBox.x * scaleX, cropBox.y * scaleY, cropBox.w * scaleX, cropBox.h * scaleY,
        0, 0, cropBox.w, cropBox.h
      );

      const b64 = canvas.toDataURL('image/png');
      setCropBase64(b64);
      setCropStart(null);
    }
  };

  const handleClick = (e) => {
    if (enableCrop) return;
    if (hoveredEl) {
      setSelectedEl(hoveredEl);
    }
  };

  const copyToClipboard = (text, key) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(''), 1500);
  };

  const testClickOnDevice = async () => {
    if (!selectedEl?.bounds || !activeDevice) return;
    try {
      await fetch('/api/devices/tap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serial: activeDevice.serial,
          x: selectedEl.bounds.centerX,
          y: selectedEl.bounds.centerY
        })
      });
      setTimeout(() => refreshInspector(), 600);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 420px', gap: '1.5rem', height: '100%' }}>
      {/* LEFT: Toolbar & Interactive Screen View */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', minHeight: 0 }}>
        {/* Toolbar */}
        <div className="glass" style={{ padding: '0.75rem 1.25rem', borderRadius: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Search size={18} color="#06b6d4" />
            <span className="font-display" style={{ fontWeight: 700, fontSize: '1.05rem' }}>UI Inspector:</span>
            <select
              value={activeSerial}
              onChange={(e) => onSelectDevice(e.target.value)}
              style={{
                background: 'rgba(0,0,0,0.4)',
                color: '#f8fafc',
                border: '1px solid var(--border)',
                borderRadius: '0.5rem',
                padding: '0.35rem 0.75rem',
                fontSize: '0.85rem'
              }}
            >
              {devices.map(d => (
                <option key={d.serial} value={d.serial}>{d.model} ({d.serial})</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button 
              className={`btn ${enableGrid ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => { setEnableGrid(!enableGrid); setEnableCrop(false); }}
            >
              <Grid size={15} /> Lưới Element ({enableGrid ? 'Bật' : 'Tắt'})
            </button>
            <button 
              className={`btn ${enableCrop ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => { setEnableCrop(!enableCrop); setCropBase64(''); }}
            >
              <Crop size={15} /> Cắt ảnh (Crop Base64)
            </button>
            <button 
              className="btn btn-secondary" 
              onClick={refreshInspector}
              disabled={loading}
            >
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> 
              {loading ? 'Đang soi...' : 'Tải lại (Reload)'}
            </button>
          </div>
        </div>

        {/* Screen Canvas Area */}
        <div 
          className="glass"
          style={{ 
            flex: 1, 
            borderRadius: '1rem', 
            position: 'relative', 
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#000',
            userSelect: 'none'
          }}
        >
          {activeDevice && (
            <div 
              style={{ position: 'relative', height: '100%', aspectRatio: '9/19.5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              onMouseMove={handleMouseMove}
              onMouseDown={handleMouseDown}
              onMouseUp={handleMouseUp}
              onClick={handleClick}
            >
              <img 
                ref={imgRef}
                src={`/api/devices/${activeDevice.serial}/screenshot?t=${screenshotTs}`}
                alt="Inspector Screen"
                draggable="false"
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />

              {/* Grid Bounding Boxes Overlay */}
              {enableGrid && imgRef.current && elements.map((el, i) => {
                if (!el.bounds) return null;
                const [resW, resH] = (activeDevice.resolution || '720x1600').split('x').map(Number);
                const isSelected = selectedEl?.id === el.id;
                const isHovered = hoveredEl?.id === el.id;

                const left = `${(el.bounds.x1 / (resW || 720)) * 100}%`;
                const top = `${(el.bounds.y1 / (resH || 1600)) * 100}%`;
                const width = `${(el.bounds.width / (resW || 720)) * 100}%`;
                const height = `${(el.bounds.height / (resH || 1600)) * 100}%`;

                if (!isSelected && !isHovered) {
                  return (
                    <div 
                      key={i}
                      style={{
                        position: 'absolute',
                        left, top, width, height,
                        border: '1px dashed rgba(6, 182, 212, 0.25)',
                        pointerEvents: 'none'
                      }}
                    />
                  );
                }

                return (
                  <div 
                    key={i}
                    style={{
                      position: 'absolute',
                      left, top, width, height,
                      border: isSelected ? '2px solid #f59e0b' : '2px solid #10b981',
                      background: isSelected ? 'rgba(245, 158, 11, 0.25)' : 'rgba(16, 185, 129, 0.2)',
                      pointerEvents: 'none',
                      zIndex: isSelected ? 20 : 10
                    }}
                  />
                );
              })}

              {/* Crop box visual indicator */}
              {cropBox && (
                <div 
                  style={{
                    position: 'absolute',
                    left: cropBox.x,
                    top: cropBox.y,
                    width: cropBox.w,
                    height: cropBox.h,
                    border: '2px solid #ec4899',
                    background: 'rgba(236, 72, 153, 0.25)',
                    pointerEvents: 'none',
                    zIndex: 50
                  }}
                />
              )}
            </div>
          )}
        </div>
      </div>

      {/* RIGHT: Element Detail Attributes Inspector */}
      <div className="glass" style={{ borderRadius: '1rem', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '0.75rem', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Layers size={18} color="#f59e0b" />
            <span className="font-display" style={{ fontWeight: 700, fontSize: '1.05rem' }}>Chi tiết Element</span>
          </div>
          {selectedEl && (
            <button className="btn btn-primary" style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem' }} onClick={testClickOnDevice}>
              <MousePointer size={14} /> Click Thử
            </button>
          )}
        </div>

        {/* Cropped Base64 Result preview */}
        {cropBase64 && (
          <div style={{ padding: '0.75rem', borderRadius: '0.5rem', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(236, 72, 153, 0.3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#f472b6' }}>Ảnh Crop đã chuyển Base64:</span>
              <button 
                className="btn btn-secondary" 
                style={{ padding: '0.2rem 0.5rem', fontSize: '0.7rem' }}
                onClick={() => copyToClipboard(cropBase64, 'base64')}
              >
                {copiedKey === 'base64' ? <Check size={12} color="#10b981" /> : <Copy size={12} />} Copy Base64
              </button>
            </div>
            <img src={cropBase64} alt="Crop" style={{ maxHeight: 60, borderRadius: 4, display: 'block', margin: '0 auto' }} />
          </div>
        )}

        {selectedEl ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', fontSize: '0.85rem' }}>
            {/* XPathLite */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#94a3b8', fontWeight: 600 }}>XPathLite:</span>
                <button 
                  className="btn btn-secondary" 
                  style={{ padding: '0.2rem 0.5rem', fontSize: '0.7rem' }}
                  onClick={() => copyToClipboard(selectedEl.xpathLite, 'xpath')}
                >
                  {copiedKey === 'xpath' ? <Check size={12} color="#10b981" /> : <Copy size={12} />} Copy XPath
                </button>
              </div>
              <div style={{ padding: '0.5rem', borderRadius: '0.35rem', background: 'rgba(0,0,0,0.4)', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', wordBreak: 'break-all', color: '#38bdf8' }}>
                {selectedEl.xpathLite || 'N/A'}
              </div>
            </div>

            {/* Resource ID */}
            {selectedEl.resourceId && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#94a3b8', fontWeight: 600 }}>ResourceID:</span>
                  <button 
                    className="btn btn-secondary" 
                    style={{ padding: '0.2rem 0.5rem', fontSize: '0.7rem' }}
                    onClick={() => copyToClipboard(selectedEl.resourceId, 'resId')}
                  >
                    {copiedKey === 'resId' ? <Check size={12} color="#10b981" /> : <Copy size={12} />} Copy ID
                  </button>
                </div>
                <div style={{ padding: '0.5rem', borderRadius: '0.35rem', background: 'rgba(0,0,0,0.4)', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', wordBreak: 'break-all', color: '#a78bfa' }}>
                  {selectedEl.resourceId}
                </div>
              </div>
            )}

            {/* Text & Content Description */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div>
                <span style={{ color: '#94a3b8', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>Text:</span>
                <div style={{ padding: '0.45rem', borderRadius: '0.35rem', background: 'rgba(0,0,0,0.3)', color: '#f8fafc' }}>
                  {selectedEl.text || '<Trống>'}
                </div>
              </div>
              <div>
                <span style={{ color: '#94a3b8', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>Description:</span>
                <div style={{ padding: '0.45rem', borderRadius: '0.35rem', background: 'rgba(0,0,0,0.3)', color: '#f8fafc' }}>
                  {selectedEl.contentDesc || '<Trống>'}
                </div>
              </div>
            </div>

            {/* Class & Package */}
            <div>
              <span style={{ color: '#94a3b8', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>ClassName:</span>
              <div style={{ padding: '0.45rem', borderRadius: '0.35rem', background: 'rgba(0,0,0,0.3)', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: '#cbd5e1' }}>
                {selectedEl.class}
              </div>
            </div>

            {/* Coordinates Bounds */}
            {selectedEl.bounds && (
              <div>
                <span style={{ color: '#94a3b8', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>Element Rect & Center:</span>
                <div style={{ padding: '0.45rem', borderRadius: '0.35rem', background: 'rgba(0,0,0,0.3)', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
                  Bounds: [{selectedEl.bounds.x1}, {selectedEl.bounds.y1}] [{selectedEl.bounds.x2}, {selectedEl.bounds.y2}]<br />
                  Center: ({selectedEl.bounds.centerX}, {selectedEl.bounds.centerY}) • Size: {selectedEl.bounds.width}x{selectedEl.bounds.height}px
                </div>
              </div>
            )}

            {/* Flags & State */}
            <div>
              <span style={{ color: '#94a3b8', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>Trạng thái:</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                {selectedEl.clickable && <span className="badge badge-emerald">Clickable</span>}
                {selectedEl.enabled && <span className="badge badge-cyan">Enabled</span>}
                {selectedEl.focusable && <span className="badge badge-amber">Focusable</span>}
                {selectedEl.scrollable && <span className="badge badge-rose">Scrollable</span>}
              </div>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 260, color: '#64748b', textAlign: 'center', gap: '0.75rem' }}>
            <Crosshair size={32} strokeWidth={1.5} />
            <p style={{ fontSize: '0.85rem' }}>Di chuột và click vào phần tử trên màn hình điện thoại bên trái để xem đầy đủ thông số XPath và ID.</p>
          </div>
        )}
      </div>
    </div>
  );
}
