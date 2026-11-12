import React, { useState, useEffect } from 'react';
import { 
  CalendarClock, Clock, Play, Pause, Plus, Trash2, Edit3, 
  CheckCircle2, AlertTriangle, RefreshCw, Smartphone, Zap, 
  Layers, Users, Check, Calendar, ArrowRight, ShieldCheck
} from 'lucide-react';

export default function SchedulerManager({ devices }) {
  const [schedules, setSchedules] = useState([]);
  const [flows, setFlows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState(null);
  const [runningIds, setRunningIds] = useState(new Set());

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    flowId: 'sample',
    flowName: 'Nuôi Facebook tối ưu',
    type: 'daily', // 'daily' or 'interval'
    time: '08:00',
    intervalMinutes: 60,
    daysOfWeek: [1, 2, 3, 4, 5, 6, 0],
    targetMode: 'all', // 'all' or 'selected'
    targetSerials: [],
    wakeScreen: true,
    rotateAccounts: true
  });

  const fetchSchedules = async () => {
    try {
      const res = await fetch('/api/schedules');
      const data = await res.json();
      if (data.success && data.schedules) {
        setSchedules(data.schedules);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchFlows = async () => {
    try {
      const res = await fetch('/api/flows');
      const data = await res.json();
      const list = [{ id: 'sample', name: 'Nuôi Facebook tối ưu (GenFarmer v1.1.0)' }];
      if (data.success && Array.isArray(data.flows)) {
        data.flows.forEach(f => {
          if (!list.some(x => x.id === f.id)) {
            list.push({ id: f.id, name: f.name });
          }
        });
      }
      setFlows(list);
    } catch {}
  };

  useEffect(() => {
    fetchSchedules();
    fetchFlows();

    // Listen to WebSocket for live schedule execution events
    const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${wsProto}//${window.location.host}/ws`);
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === 'schedule_update') {
          fetchSchedules();
          if (msg.status === 'running') {
            setRunningIds(prev => new Set(prev).add(msg.scheduleId || msg.schedule?.id));
          } else {
            setRunningIds(prev => {
              const next = new Set(prev);
              next.delete(msg.scheduleId || msg.schedule?.id);
              return next;
            });
          }
        }
      } catch {}
    };

    return () => ws.close();
  }, []);

  const handleToggle = async (id, currentEnabled) => {
    try {
      await fetch(`/api/schedules/${id}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !currentEnabled })
      });
      await fetchSchedules();
    } catch (err) {
      console.error(err);
    }
  };

  const handleRunNow = async (id) => {
    setRunningIds(prev => new Set(prev).add(id));
    try {
      await fetch(`/api/schedules/${id}/run-now`, { method: 'POST' });
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Bạn có chắc muốn xóa lịch hẹn này?')) return;
    try {
      await fetch(`/api/schedules/${id}`, { method: 'DELETE' });
      await fetchSchedules();
    } catch (err) {
      console.error(err);
    }
  };

  const openCreateModal = () => {
    setEditingSchedule(null);
    setFormData({
      name: '',
      flowId: flows[0]?.id || 'sample',
      flowName: flows[0]?.name || 'Nuôi Facebook tối ưu',
      type: 'daily',
      time: '08:00',
      intervalMinutes: 60,
      daysOfWeek: [1, 2, 3, 4, 5, 6, 0],
      targetMode: 'all',
      targetSerials: devices.map(d => d.serial),
      wakeScreen: true,
      rotateAccounts: true
    });
    setShowModal(true);
  };

  const openEditModal = (sched) => {
    setEditingSchedule(sched);
    setFormData({
      name: sched.name,
      flowId: sched.flowId || 'sample',
      flowName: sched.flowName,
      type: sched.type || 'daily',
      time: sched.time || '08:00',
      intervalMinutes: sched.intervalMinutes || 60,
      daysOfWeek: sched.daysOfWeek || [1, 2, 3, 4, 5, 6, 0],
      targetMode: sched.targetMode || 'all',
      targetSerials: sched.targetSerials || [],
      wakeScreen: sched.wakeScreen !== false,
      rotateAccounts: sched.rotateAccounts !== false
    });
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    const payload = {
      ...formData,
      id: editingSchedule ? editingSchedule.id : undefined
    };

    try {
      await fetch('/api/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      setShowModal(false);
      await fetchSchedules();
    } catch (err) {
      alert('Lỗi lưu lịch hẹn: ' + err.message);
    }
  };

  const dayLabels = [
    { id: 1, label: 'T2' },
    { id: 2, label: 'T3' },
    { id: 3, label: 'T4' },
    { id: 4, label: 'T5' },
    { id: 5, label: 'T6' },
    { id: 6, label: 'T7' },
    { id: 0, label: 'CN' }
  ];

  const activeCount = schedules.filter(s => s.enabled).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', height: '100%', padding: '1rem 1.25rem' }}>
      {/* Top Header */}
      <div className="glass" style={{ padding: '0.85rem 1.25rem', borderRadius: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.85rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <CalendarClock size={20} color="#10b981" />
            <span className="font-display" style={{ fontWeight: 700, fontSize: '1.1rem', color: '#f8fafc' }}>
              Bộ lập lịch tự động (Scheduler)
            </span>
          </div>
          <span className="badge badge-emerald">{activeCount} lịch đang kích hoạt</span>
          <span className="badge badge-cyan" style={{ fontSize: '0.68rem' }}>Background Runner Active</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button className="btn btn-primary" onClick={openCreateModal} style={{ background: 'linear-gradient(135deg, #10b981 0%, #06b6d4 100%)' }}>
            <Plus size={15} /> Tạo lịch chạy mới
          </button>
          <button className="btn btn-secondary" onClick={fetchSchedules} title="Làm mới">
            <RefreshCw size={15} />
          </button>
        </div>
      </div>

      {/* Schedules List */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.85rem', paddingRight: '0.25rem' }}>
        {schedules.length === 0 ? (
          <div className="glass" style={{ padding: '3rem', textAlign: 'center', borderRadius: '0.85rem', color: '#64748b' }}>
            <CalendarClock size={48} style={{ margin: '0 auto 1rem', opacity: 0.3 }} />
            <p style={{ fontSize: '0.95rem', color: '#cbd5e1', marginBottom: '0.5rem' }}>Chưa có lịch hẹn giờ nào.</p>
            <p style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '1.25rem' }}>Tạo lịch tự động để máy tự bật màn hình, nạp tài khoản và nuôi nick hàng ngày theo giờ cố định.</p>
            <button className="btn btn-primary" onClick={openCreateModal}>
              <Plus size={15} /> Tạo lịch chạy đầu tiên
            </button>
          </div>
        ) : (
          schedules.map((sched) => {
            const isRunning = runningIds.has(sched.id) || sched.status === 'running';
            const isEnabled = sched.enabled;

            return (
              <div 
                key={sched.id}
                className="glass"
                style={{
                  borderRadius: '0.85rem',
                  padding: '1.1rem 1.25rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '1rem',
                  border: isRunning ? '1px solid #10b981' : isEnabled ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(255,255,255,0.04)',
                  background: isRunning ? 'rgba(16, 185, 129, 0.06)' : isEnabled ? 'rgba(19, 27, 44, 0.7)' : 'rgba(19, 27, 44, 0.35)',
                  boxShadow: isRunning ? '0 0 20px -3px rgba(16, 185, 129, 0.3)' : 'none',
                  transition: 'all 0.2s'
                }}
              >
                {/* Left Info */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', minWidth: 260 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                    <span style={{ fontWeight: 700, fontSize: '1.05rem', color: isEnabled ? '#f8fafc' : '#64748b' }}>
                      {sched.name}
                    </span>
                    {isRunning && (
                      <span className="badge badge-emerald spin-slow" style={{ fontSize: '0.68rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                        <RefreshCw size={11} className="spin" /> Đang chạy...
                      </span>
                    )}
                  </div>

                  {/* Flow & Timing */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', fontSize: '0.78rem' }}>
                    <span style={{ 
                      padding: '0.15rem 0.5rem', 
                      borderRadius: '0.35rem', 
                      background: 'rgba(6, 182, 212, 0.15)', 
                      color: '#22d3ee',
                      border: '1px solid rgba(6, 182, 212, 0.3)'
                    }}>
                      Kịch bản: {sched.flowName || 'Nuôi Facebook tối ưu'}
                    </span>

                    <span style={{ color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      <Clock size={13} color="#f59e0b" />
                      {sched.type === 'daily' 
                        ? `Mỗi ngày lúc ${sched.time}`
                        : `Mỗi ${sched.intervalMinutes} phút`}
                    </span>

                    {sched.rotateAccounts && (
                      <span style={{ 
                        padding: '0.12rem 0.45rem', 
                        borderRadius: '0.35rem', 
                        background: 'rgba(16, 185, 129, 0.15)', 
                        color: '#34d399',
                        fontSize: '0.72rem'
                      }}>
                        Xoay vòng Multi-Account
                      </span>
                    )}
                  </div>

                  {/* Target & Last run */}
                  <div style={{ fontSize: '0.73rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span>
                      Áp dụng: <b style={{ color: '#cbd5e1' }}>{sched.targetMode === 'all' ? 'Tất cả máy online' : `${sched.targetSerials?.length || 0} máy chỉ định`}</b>
                    </span>
                    <span>•</span>
                    <span>
                      Lần chạy cuối: <b style={{ color: sched.lastStatus === 'Thất bại' ? '#f43f5e' : '#cbd5e1' }}>{sched.lastRun ? new Date(sched.lastRun).toLocaleTimeString() : 'Chưa chạy'}</b>
                    </span>
                  </div>
                </div>

                {/* Right Controls */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                  {/* ON/OFF Switch */}
                  <button 
                    onClick={() => handleToggle(sched.id, isEnabled)}
                    className={`btn ${isEnabled ? 'btn-primary' : 'btn-secondary'}`}
                    style={{
                      padding: '0.35rem 0.75rem',
                      fontSize: '0.78rem',
                      borderRadius: '0.45rem',
                      background: isEnabled ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255,255,255,0.05)',
                      color: isEnabled ? '#34d399' : '#64748b',
                      border: `1px solid ${isEnabled ? '#10b981' : 'var(--border)'}`
                    }}
                  >
                    {isEnabled ? <Check size={14} /> : <Pause size={14} />}
                    <span>{isEnabled ? 'ĐANG BẬT' : 'ĐÃ TẮT'}</span>
                  </button>

                  {/* Run Now Button */}
                  <button 
                    onClick={() => handleRunNow(sched.id)}
                    disabled={isRunning}
                    className="btn btn-secondary"
                    title="Kích hoạt chạy ngay lập tức"
                    style={{ padding: '0.35rem 0.65rem', fontSize: '0.78rem' }}
                  >
                    <Play size={13} color="#10b981" />
                    <span>Chạy ngay</span>
                  </button>

                  {/* Edit */}
                  <button 
                    onClick={() => openEditModal(sched)}
                    className="btn btn-secondary"
                    title="Chỉnh sửa lịch"
                    style={{ padding: '0.35rem 0.55rem' }}
                  >
                    <Edit3 size={14} />
                  </button>

                  {/* Delete */}
                  <button 
                    onClick={() => handleDelete(sched.id)}
                    className="btn btn-danger"
                    title="Xóa lịch"
                    style={{ padding: '0.35rem 0.55rem' }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* CREATE / EDIT MODAL */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="glass" style={{ width: 560, maxHeight: '90vh', overflowY: 'auto', borderRadius: '1rem', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <CalendarClock size={20} color="#10b981" />
                <span className="font-display" style={{ fontWeight: 700, fontSize: '1.15rem' }}>
                  {editingSchedule ? 'Chỉnh sửa lịch hẹn' : 'Tạo lịch hẹn giờ tự động mới'}
                </span>
              </div>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '1.2rem' }}>✕</button>
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', fontSize: '0.85rem' }}>
              {/* Schedule Name */}
              <div>
                <label style={{ display: 'block', color: '#94a3b8', marginBottom: 4 }}>Tên gợi nhớ của lịch *</label>
                <input 
                  type="text" 
                  required
                  placeholder="VD: Nuôi Facebook sáng 8h, Lướt TikTok trưa 12h..."
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  style={{ width: '100%', padding: '0.45rem', borderRadius: 6, background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border)', color: '#fff' }}
                />
              </div>

              {/* Select Flow */}
              <div>
                <label style={{ display: 'block', color: '#94a3b8', marginBottom: 4 }}>Kịch bản cần chạy *</label>
                <select
                  value={formData.flowId}
                  onChange={e => {
                    const sel = flows.find(f => f.id === e.target.value);
                    setFormData({ ...formData, flowId: e.target.value, flowName: sel?.name || 'Nuôi Facebook tối ưu' });
                  }}
                  style={{ width: '100%', padding: '0.45rem', borderRadius: 6, background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border)', color: '#fff' }}
                >
                  {flows.map(f => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
              </div>

              {/* Timing Type */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', color: '#94a3b8', marginBottom: 4 }}>Kiểu hẹn giờ:</label>
                  <select
                    value={formData.type}
                    onChange={e => setFormData({ ...formData, type: e.target.value })}
                    style={{ width: '100%', padding: '0.45rem', borderRadius: 6, background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border)', color: '#fff' }}
                  >
                    <option value="daily">⏰ Hàng ngày theo giờ cố định</option>
                    <option value="interval">🔄 Lặp lại theo chu kỳ phút</option>
                  </select>
                </div>

                {formData.type === 'daily' ? (
                  <div>
                    <label style={{ display: 'block', color: '#94a3b8', marginBottom: 4 }}>Giờ chạy (HH:mm):</label>
                    <input 
                      type="time" 
                      required
                      value={formData.time}
                      onChange={e => setFormData({ ...formData, time: e.target.value })}
                      style={{ width: '100%', padding: '0.45rem', borderRadius: 6, background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border)', color: '#fff' }}
                    />
                  </div>
                ) : (
                  <div>
                    <label style={{ display: 'block', color: '#94a3b8', marginBottom: 4 }}>Chu kỳ lặp lại:</label>
                    <select
                      value={formData.intervalMinutes}
                      onChange={e => setFormData({ ...formData, intervalMinutes: Number(e.target.value) })}
                      style={{ width: '100%', padding: '0.45rem', borderRadius: 6, background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border)', color: '#fff' }}
                    >
                      <option value={15}>Mỗi 15 phút</option>
                      <option value={30}>Mỗi 30 phút</option>
                      <option value={45}>Mỗi 45 phút</option>
                      <option value={60}>Mỗi 1 tiếng</option>
                      <option value={120}>Mỗi 2 tiếng</option>
                      <option value={240}>Mỗi 4 tiếng</option>
                    </select>
                  </div>
                )}
              </div>

              {/* Days of week selector if daily */}
              {formData.type === 'daily' && (
                <div>
                  <label style={{ display: 'block', color: '#94a3b8', marginBottom: 4 }}>Ngày trong tuần:</label>
                  <div style={{ display: 'flex', gap: '0.35rem' }}>
                    {dayLabels.map(d => {
                      const isSel = formData.daysOfWeek.includes(d.id);
                      return (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => {
                            const next = isSel 
                              ? formData.daysOfWeek.filter(x => x !== d.id) 
                              : [...formData.daysOfWeek, d.id];
                            setFormData({ ...formData, daysOfWeek: next });
                          }}
                          style={{
                            flex: 1,
                            padding: '0.35rem 0',
                            borderRadius: '0.35rem',
                            border: `1px solid ${isSel ? '#10b981' : 'var(--border)'}`,
                            background: isSel ? 'rgba(16, 185, 129, 0.2)' : 'rgba(0,0,0,0.3)',
                            color: isSel ? '#34d399' : '#64748b',
                            fontWeight: isSel ? 700 : 500,
                            cursor: 'pointer'
                          }}
                        >
                          {d.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Target Devices */}
              <div>
                <label style={{ display: 'block', color: '#94a3b8', marginBottom: 4 }}>Thiết bị thực hiện:</label>
                <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.5rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer' }}>
                    <input 
                      type="radio" 
                      name="targetMode" 
                      checked={formData.targetMode === 'all'} 
                      onChange={() => setFormData({ ...formData, targetMode: 'all' })} 
                    />
                    <span>Tất cả các máy Online ({devices.length} máy)</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer' }}>
                    <input 
                      type="radio" 
                      name="targetMode" 
                      checked={formData.targetMode === 'selected'} 
                      onChange={() => setFormData({ ...formData, targetMode: 'selected' })} 
                    />
                    <span>Chỉ định máy</span>
                  </label>
                </div>

                {formData.targetMode === 'selected' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem', background: 'rgba(0,0,0,0.3)', padding: '0.5rem', borderRadius: 6, border: '1px solid var(--border)' }}>
                    {devices.map(d => {
                      const checked = formData.targetSerials.includes(d.serial);
                      return (
                        <label key={d.serial} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.78rem' }}>
                          <input 
                            type="checkbox"
                            checked={checked}
                            onChange={e => {
                              const next = e.target.checked 
                                ? [...formData.targetSerials, d.serial]
                                : formData.targetSerials.filter(s => s !== d.serial);
                              setFormData({ ...formData, targetSerials: next });
                            }}
                          />
                          <span>{d.model} ({d.serial.slice(0, 8)})</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Advanced Options */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', background: 'rgba(16, 185, 129, 0.06)', border: '1px solid rgba(16, 185, 129, 0.2)', padding: '0.75rem', borderRadius: 6 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                  <input 
                    type="checkbox"
                    checked={formData.rotateAccounts}
                    onChange={e => setFormData({ ...formData, rotateAccounts: e.target.checked })}
                  />
                  <span><b>Tự động xoay vòng tài khoản (Multi-Account):</b> Chạy tuần tự từng tài khoản được gán trên máy</span>
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                  <input 
                    type="checkbox"
                    checked={formData.wakeScreen}
                    onChange={e => setFormData({ ...formData, wakeScreen: e.target.checked })}
                  />
                  <span><b>Tự động đánh thức:</b> Bật sáng màn hình điện thoại trước khi bắt đầu kịch bản</span>
                </label>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Hủy</button>
                <button type="submit" className="btn btn-primary">
                  {editingSchedule ? 'Cập nhật lịch' : 'Lưu và kích hoạt lịch'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

