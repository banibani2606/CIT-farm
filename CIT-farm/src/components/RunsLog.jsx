import React, { useState, useEffect } from 'react';
import { 
  History, CheckCircle2, XCircle, Clock, Smartphone, 
  Terminal, RefreshCw, Activity, Play
} from 'lucide-react';

export default function RunsLog() {
  const [runs, setRuns] = useState([]);
  const [liveLogs, setLiveLogs] = useState([]);

  const fetchRuns = async () => {
    try {
      const res = await fetch('/api/runs');
      const data = await res.json();
      if (data.success && data.runs) {
        setRuns(data.runs);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchRuns();

    // WebSocket listener for live logs
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${wsProtocol}//${window.location.host}/ws`);

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'flow_log') {
          setLiveLogs(prev => [msg, ...prev.slice(0, 100)]);
        }
        if (msg.type === 'flow_finished' || msg.type === 'flow_error') {
          fetchRuns();
        }
      } catch {}
    };

    return () => ws.close();
  }, []);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 450px', gap: '1.5rem', height: '100%' }}>
      {/* LEFT: Runs History Table */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', minHeight: 0 }}>
        {/* Top Header */}
        <div className="glass" style={{ padding: '0.75rem 1.25rem', borderRadius: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <History size={20} color="#8b5cf6" />
            <span className="font-display" style={{ fontWeight: 700, fontSize: '1.05rem', color: '#f8fafc' }}>
              Lịch sử các phiên chạy (Runs)
            </span>
            <span className="badge badge-cyan">{runs.length} bản ghi</span>
          </div>

          <button className="btn btn-secondary" onClick={fetchRuns}>
            <RefreshCw size={15} /> Làm mới
          </button>
        </div>

        {/* History Table */}
        <div className="glass" style={{ flex: 1, borderRadius: '1rem', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ overflowX: 'auto', flex: 1 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ background: 'rgba(0,0,0,0.4)', borderBottom: '1px solid var(--border)', color: '#94a3b8' }}>
                  <th style={{ padding: '0.85rem 1rem' }}>Tên kịch bản</th>
                  <th style={{ padding: '0.85rem 1rem' }}>Thiết bị</th>
                  <th style={{ padding: '0.85rem 1rem' }}>Thời gian bắt đầu</th>
                  <th style={{ padding: '0.85rem 1rem' }}>Số bước thực thi</th>
                  <th style={{ padding: '0.85rem 1rem' }}>Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {runs.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>
                      Chưa có phiên chạy nào. Hãy chọn kịch bản trong Flow Builder và bấm "Chạy Kịch Bản"!
                    </td>
                  </tr>
                ) : (
                  runs.map((r, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '0.85rem 1rem', fontWeight: 600, color: '#f8fafc' }}>
                        {r.flowName}
                      </td>
                      <td style={{ padding: '0.85rem 1rem', fontFamily: 'var(--font-mono)', color: '#38bdf8' }}>
                        {r.serial}
                      </td>
                      <td style={{ padding: '0.85rem 1rem', color: '#cbd5e1' }}>
                        {new Date(r.startedAt).toLocaleString()}
                      </td>
                      <td style={{ padding: '0.85rem 1rem', color: '#a78bfa', fontWeight: 600 }}>
                        {r.duration}
                      </td>
                      <td style={{ padding: '0.85rem 1rem' }}>
                        <span className={`badge ${r.status === 'Success' ? 'badge-emerald' : 'badge-rose'}`}>
                          {r.status === 'Success' ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                          {r.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* RIGHT: Real-time Terminal Log Stream */}
      <div className="glass" style={{ borderRadius: '1rem', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem', minHeight: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '0.75rem', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Terminal size={18} color="#10b981" />
            <span className="font-display" style={{ fontWeight: 700, fontSize: '1.05rem', color: '#f8fafc' }}>
              Live Runner Terminal
            </span>
          </div>
          <button 
            className="btn btn-secondary" 
            style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}
            onClick={() => setLiveLogs([])}
          >
            Xóa màn hình
          </button>
        </div>

        <div style={{ flex: 1, background: '#000', borderRadius: '0.5rem', padding: '0.75rem', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          {liveLogs.length === 0 ? (
            <div style={{ color: '#64748b', textAlign: 'center', margin: 'auto' }}>
              Chờ log từ các phiên chạy tự động hóa...
            </div>
          ) : (
            liveLogs.map((l, i) => (
              <div key={i} style={{ lineHeight: '1.4', color: l.level === 'ERROR' ? '#f87171' : l.level === 'WARN' ? '#fbbf24' : '#e2e8f0' }}>
                <span style={{ color: '#64748b' }}>[{new Date(l.time).toLocaleTimeString()}]</span>{' '}
                <span style={{ color: '#38bdf8' }}>[{l.serial?.substring(0, 8) || 'SYS'}]</span>{' '}
                <span style={{ fontWeight: 600, color: l.level === 'ERROR' ? '#f87171' : '#34d399' }}>[{l.level}]</span>{' '}
                {l.msg}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
