import React, { useState, useEffect } from 'react';
import { 
  Users, Plus, Upload, Download, Trash2, Shield, KeyRound, 
  Check, Copy, Clock, RefreshCw, Smartphone, Filter, Search,
  Share2, CheckCircle2, AlertTriangle, XCircle, Layers
} from 'lucide-react';

export default function AccountManager({ devices }) {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  
  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterPlatform, setFilterPlatform] = useState('ALL');
  const [filterDevice, setFilterDevice] = useState('ALL');
  const [filterStatus, setFilterStatus] = useState('ALL');

  // Single Add form
  const [newAcc, setNewAcc] = useState({
    platform: 'Facebook',
    uid: '',
    name: '',
    password: '',
    twoFactorSecret: '',
    email: '',
    assignedDevice: '',
    status: 'Live'
  });

  // Bulk import state
  const [bulkText, setBulkText] = useState('');
  const [bulkPlatform, setBulkPlatform] = useState('Facebook');
  const [bulkTargetMode, setBulkTargetMode] = useState('even'); // 'even', 'specific', 'unassigned'
  const [bulkSpecificDevice, setBulkSpecificDevice] = useState(devices[0]?.serial || '');
  const [bulkImporting, setBulkImporting] = useState(false);

  const fetchAccounts = async () => {
    try {
      const res = await fetch('/api/accounts');
      const data = await res.json();
      if (data.success) {
        setAccounts(data.accounts);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchAccounts();
    // Refresh TOTP codes every 5 seconds
    const timer = setInterval(fetchAccounts, 5000);
    return () => clearInterval(timer);
  }, []);

  const handleAddAccount = async (e) => {
    e.preventDefault();
    if (!newAcc.uid) return;
    const updated = [
      ...accounts,
      { ...newAcc, id: `acc_${Date.now()}`, updatedAt: new Date().toISOString() }
    ];
    await saveAccounts(updated);
    setShowAddModal(false);
    setNewAcc({ platform: 'Facebook', uid: '', name: '', password: '', twoFactorSecret: '', email: '', assignedDevice: '', status: 'Live' });
  };

  const handleBulkImport = async (e) => {
    e.preventDefault();
    if (!bulkText.trim()) return;
    setBulkImporting(true);
    try {
      const res = await fetch('/api/accounts/bulk-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rawText: bulkText,
          platform: bulkPlatform,
          targetMode: bulkTargetMode,
          assignedDevice: bulkSpecificDevice
        })
      });
      const data = await res.json();
      if (data.success) {
        alert(`Đã nhập thành công ${data.importedCount} tài khoản (Bỏ qua ${data.skippedCount} tài khoản trùng UID).`);
        setShowBulkModal(false);
        setBulkText('');
        await fetchAccounts();
      } else {
        alert('Lỗi nhập tài khoản: ' + data.error);
      }
    } catch (err) {
      alert('Lỗi kết nối máy chủ: ' + err.message);
    } finally {
      setBulkImporting(false);
    }
  };

  const saveAccounts = async (updatedList) => {
    setAccounts(updatedList);
    try {
      await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accounts: updatedList })
      });
    } catch (err) {
      console.error(err);
    }
  };

  const deleteAccount = async (id) => {
    const updated = accounts.filter(a => a.id !== id);
    await saveAccounts(updated);
    try {
      await fetch(`/api/accounts/${id}`, { method: 'DELETE' });
    } catch {}
  };

  const deleteSelected = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm(`Bạn có chắc muốn xóa ${selectedIds.length} tài khoản đã chọn?`)) return;
    const updated = accounts.filter(a => !selectedIds.includes(a.id));
    await saveAccounts(updated);
    setSelectedIds([]);
  };

  const reassignSelected = async (targetSerial) => {
    if (selectedIds.length === 0) return;
    const updated = accounts.map(a => selectedIds.includes(a.id) ? { ...a, assignedDevice: targetSerial } : a);
    await saveAccounts(updated);
  };

  const copyText = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(''), 1500);
  };

  const exportCSV = () => {
    const headers = ['Platform', 'UID', 'Name', 'Password', '2FA_Secret', 'Email', 'Assigned_Device', 'Status'];
    const rows = filteredAccounts.map(a => [
      a.platform || 'Facebook', a.uid, a.name || a.uid, a.password, a.twoFactorSecret, a.email, a.assignedDevice, a.status
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers, ...rows].map(e => e.join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `citfarm_accounts_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Filtered accounts list
  const filteredAccounts = accounts.filter(a => {
    if (filterPlatform !== 'ALL' && (a.platform || 'Facebook') !== filterPlatform) return false;
    if (filterDevice === 'UNASSIGNED' && a.assignedDevice) return false;
    if (filterDevice !== 'ALL' && filterDevice !== 'UNASSIGNED' && a.assignedDevice !== filterDevice) return false;
    if (filterStatus !== 'ALL' && a.status !== filterStatus) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchUid = (a.uid || '').toLowerCase().includes(q);
      const matchName = (a.name || '').toLowerCase().includes(q);
      const matchEmail = (a.email || '').toLowerCase().includes(q);
      if (!matchUid && !matchName && !matchEmail) return false;
    }
    return true;
  });

  const parsedBulkCount = bulkText.split('\n').filter(l => l.trim() && !l.trim().startsWith('#')).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', height: '100%', padding: '1rem 1.25rem' }}>
      {/* Top Header & Actions Bar */}
      <div className="glass" style={{ padding: '0.85rem 1.25rem', borderRadius: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.85rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Users size={20} color="#10b981" />
            <span className="font-display" style={{ fontWeight: 700, fontSize: '1.1rem', color: '#f8fafc' }}>
              Quản lý tài khoản Farm
            </span>
          </div>
          <span className="badge badge-emerald">{accounts.length} tài khoản</span>
          <span className="badge badge-cyan" style={{ fontSize: '0.68rem' }}>Live 2FA Auto-Refresh</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={() => setShowBulkModal(true)} style={{ background: 'linear-gradient(135deg, #10b981 0%, #06b6d4 100%)' }}>
            <Upload size={14} /> Nhập hàng loạt (Phôi UID|Pass)
          </button>
          <button className="btn btn-secondary" onClick={() => setShowAddModal(true)}>
            <Plus size={14} /> Thêm 1 nick
          </button>
          <button className="btn btn-secondary" onClick={exportCSV}>
            <Download size={14} /> Xuất CSV
          </button>
          <button className="btn btn-secondary" onClick={fetchAccounts} title="Làm mới danh sách">
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* Filter & Batch Actions Bar */}
      <div className="glass" style={{ padding: '0.65rem 1rem', borderRadius: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', fontSize: '0.8rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap', flex: 1 }}>
          {/* Search box */}
          <div style={{ position: 'relative', minWidth: 200 }}>
            <Search size={14} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
            <input 
              type="text"
              placeholder="Tìm UID, tên, email..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '0.35rem 0.5rem 0.35rem 1.8rem',
                borderRadius: '0.4rem',
                background: 'rgba(0,0,0,0.3)',
                border: '1px solid var(--border)',
                color: '#fff',
                fontSize: '0.8rem'
              }}
            />
          </div>

          {/* Platform filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <span style={{ color: '#64748b' }}>Nền tảng:</span>
            <select
              value={filterPlatform}
              onChange={e => setFilterPlatform(e.target.value)}
              style={{ background: 'rgba(0,0,0,0.3)', color: '#fff', border: '1px solid var(--border)', padding: '0.3rem 0.5rem', borderRadius: '0.4rem' }}
            >
              <option value="ALL">Tất cả</option>
              <option value="Facebook">Facebook</option>
              <option value="TikTok">TikTok</option>
              <option value="Google">Google / Gmail</option>
              <option value="Instagram">Instagram</option>
            </select>
          </div>

          {/* Device filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <span style={{ color: '#64748b' }}>Máy gán:</span>
            <select
              value={filterDevice}
              onChange={e => setFilterDevice(e.target.value)}
              style={{ background: 'rgba(0,0,0,0.3)', color: '#fff', border: '1px solid var(--border)', padding: '0.3rem 0.5rem', borderRadius: '0.4rem' }}
            >
              <option value="ALL">Tất cả máy</option>
              <option value="UNASSIGNED">Chưa gán máy</option>
              {devices.map(d => (
                <option key={d.serial} value={d.serial}>{d.model} ({d.serial.slice(0, 8)}...)</option>
              ))}
            </select>
          </div>

          {/* Status filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <span style={{ color: '#64748b' }}>Trạng thái:</span>
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              style={{ background: 'rgba(0,0,0,0.3)', color: '#fff', border: '1px solid var(--border)', padding: '0.3rem 0.5rem', borderRadius: '0.4rem' }}
            >
              <option value="ALL">Tất cả</option>
              <option value="Live">Live (Hoạt động)</option>
              <option value="Checkpoint">Checkpoint (Khóa)</option>
              <option value="Die">Die</option>
            </select>
          </div>
        </div>

        {/* Selected batch actions */}
        {selectedIds.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{ color: '#38bdf8', fontWeight: 600 }}>Đã chọn {selectedIds.length} nick:</span>
            <select
              onChange={(e) => {
                if (e.target.value) {
                  reassignSelected(e.target.value === 'NONE' ? '' : e.target.value);
                  e.target.value = '';
                }
              }}
              style={{ background: 'rgba(6, 182, 212, 0.15)', color: '#22d3ee', border: '1px solid rgba(6, 182, 212, 0.4)', padding: '0.3rem 0.5rem', borderRadius: '0.4rem' }}
            >
              <option value="">Gán nhanh vào máy...</option>
              <option value="NONE">Bỏ gán máy (Trống)</option>
              {devices.map(d => (
                <option key={d.serial} value={d.serial}>{d.model} ({d.serial.slice(0, 8)})</option>
              ))}
            </select>
            <button className="btn btn-danger" onClick={deleteSelected} style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}>
              <Trash2 size={13} /> Xóa
            </button>
          </div>
        )}
      </div>

      {/* Account Data Table */}
      <div className="glass" style={{ flex: 1, borderRadius: '0.85rem', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ overflowX: 'auto', flex: 1 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.82rem' }}>
            <thead>
              <tr style={{ background: 'rgba(0,0,0,0.4)', borderBottom: '1px solid var(--border)', color: '#94a3b8' }}>
                <th style={{ padding: '0.75rem 0.85rem', width: 35 }}>
                  <input 
                    type="checkbox"
                    checked={filteredAccounts.length > 0 && selectedIds.length === filteredAccounts.length}
                    onChange={(e) => {
                      if (e.target.checked) setSelectedIds(filteredAccounts.map(a => a.id));
                      else setSelectedIds([]);
                    }}
                  />
                </th>
                <th style={{ padding: '0.75rem 0.85rem' }}>Nền tảng</th>
                <th style={{ padding: '0.75rem 0.85rem' }}>UID / Tài khoản</th>
                <th style={{ padding: '0.75rem 0.85rem' }}>Mật khẩu</th>
                <th style={{ padding: '0.75rem 0.85rem' }}>Mã 2FA (Live OTP)</th>
                <th style={{ padding: '0.75rem 0.85rem' }}>Email liên kết</th>
                <th style={{ padding: '0.75rem 0.85rem' }}>Thiết bị gán</th>
                <th style={{ padding: '0.75rem 0.85rem' }}>Trạng thái</th>
                <th style={{ padding: '0.75rem 0.85rem', textAlign: 'right' }}>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {filteredAccounts.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>
                    Chưa có tài khoản nào phù hợp bộ lọc. Bấm "Nhập hàng loạt" hoặc "Thêm 1 nick" để bắt đầu!
                  </td>
                </tr>
              ) : (
                filteredAccounts.map((acc) => {
                  const isChecked = selectedIds.includes(acc.id);
                  const platformColor = acc.platform === 'TikTok' ? '#f43f5e' : acc.platform === 'Google' ? '#f59e0b' : acc.platform === 'Instagram' ? '#ec4899' : '#3b82f6';

                  return (
                    <tr 
                      key={acc.id} 
                      style={{ 
                        borderBottom: '1px solid var(--border)', 
                        background: isChecked ? 'rgba(16, 185, 129, 0.08)' : 'transparent',
                        transition: 'background 0.15s' 
                      }}
                    >
                      {/* Checkbox */}
                      <td style={{ padding: '0.75rem 0.85rem' }}>
                        <input 
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) setSelectedIds([...selectedIds, acc.id]);
                            else setSelectedIds(selectedIds.filter(id => id !== acc.id));
                          }}
                        />
                      </td>

                      {/* Platform */}
                      <td style={{ padding: '0.75rem 0.85rem' }}>
                        <span style={{ 
                          fontSize: '0.72rem', 
                          fontWeight: 700, 
                          padding: '0.15rem 0.45rem', 
                          borderRadius: '0.35rem',
                          background: `${platformColor}20`,
                          color: platformColor,
                          border: `1px solid ${platformColor}40`
                        }}>
                          {acc.platform || 'Facebook'}
                        </span>
                      </td>

                      {/* UID */}
                      <td style={{ padding: '0.75rem 0.85rem', fontWeight: 600, color: '#f8fafc', fontFamily: 'var(--font-mono)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                          <span>{acc.uid}</span>
                          <button 
                            className="btn btn-secondary" 
                            style={{ padding: '0.12rem 0.35rem', fontSize: '0.68rem' }}
                            title="Copy UID"
                            onClick={() => copyText(acc.uid, acc.id + '_uid')}
                          >
                            {copiedId === acc.id + '_uid' ? <Check size={11} color="#10b981" /> : <Copy size={11} />}
                          </button>
                        </div>
                      </td>

                      {/* Password */}
                      <td style={{ padding: '0.75rem 0.85rem', fontFamily: 'var(--font-mono)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                          <span>••••••••</span>
                          <button 
                            className="btn btn-secondary" 
                            style={{ padding: '0.12rem 0.35rem', fontSize: '0.68rem' }}
                            title="Copy mật khẩu"
                            onClick={() => copyText(acc.password, acc.id + '_pass')}
                          >
                            {copiedId === acc.id + '_pass' ? <Check size={11} color="#10b981" /> : <Copy size={11} />}
                          </button>
                        </div>
                      </td>

                      {/* Live 2FA TOTP */}
                      <td style={{ padding: '0.75rem 0.85rem' }}>
                        {acc.totpCode ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                            <span 
                              style={{
                                fontFamily: 'var(--font-mono)',
                                fontSize: '0.95rem',
                                fontWeight: 700,
                                letterSpacing: '0.08em',
                                color: '#34d399',
                                background: 'rgba(16, 185, 129, 0.15)',
                                padding: '0.15rem 0.45rem',
                                borderRadius: '0.35rem',
                                border: '1px solid rgba(16, 185, 129, 0.3)'
                              }}
                            >
                              {acc.totpCode}
                            </span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.15rem', color: '#94a3b8', fontSize: '0.72rem' }}>
                              <Clock size={11} />
                              <span>{acc.totpRemaining}s</span>
                            </div>
                            <button 
                              className="btn btn-secondary" 
                              style={{ padding: '0.12rem 0.35rem', fontSize: '0.68rem' }}
                              title="Copy mã OTP 6 số"
                              onClick={() => copyText(acc.totpCode, acc.id + '_totp')}
                            >
                              {copiedId === acc.id + '_totp' ? <Check size={11} color="#10b981" /> : <Copy size={11} />}
                            </button>
                          </div>
                        ) : (
                          <span style={{ color: '#64748b', fontSize: '0.72rem' }}>Không có 2FA</span>
                        )}
                      </td>

                      {/* Email */}
                      <td style={{ padding: '0.75rem 0.85rem', color: '#cbd5e1' }}>
                        {acc.email || '<Trống>'}
                      </td>

                      {/* Assigned Device */}
                      <td style={{ padding: '0.75rem 0.85rem' }}>
                        <select
                          value={acc.assignedDevice || ''}
                          onChange={(e) => {
                            const updated = accounts.map(a => a.id === acc.id ? { ...a, assignedDevice: e.target.value } : a);
                            saveAccounts(updated);
                          }}
                          style={{
                            background: acc.assignedDevice ? 'rgba(16, 185, 129, 0.12)' : 'rgba(0,0,0,0.3)',
                            color: acc.assignedDevice ? '#34d399' : '#94a3b8',
                            border: `1px solid ${acc.assignedDevice ? 'rgba(16, 185, 129, 0.3)' : 'var(--border)'}`,
                            borderRadius: '0.35rem',
                            padding: '0.2rem 0.45rem',
                            fontSize: '0.75rem',
                            fontFamily: 'var(--font-mono)'
                          }}
                        >
                          <option value="">Chưa gán máy</option>
                          {devices.map(d => (
                            <option key={d.serial} value={d.serial}>{d.model} ({d.serial.slice(0, 8)}...)</option>
                          ))}
                        </select>
                      </td>

                      {/* Status */}
                      <td style={{ padding: '0.75rem 0.85rem' }}>
                        <select
                          value={acc.status || 'Live'}
                          onChange={(e) => {
                            const updated = accounts.map(a => a.id === acc.id ? { ...a, status: e.target.value } : a);
                            saveAccounts(updated);
                          }}
                          style={{
                            background: acc.status === 'Live' ? 'rgba(16, 185, 129, 0.15)' : acc.status === 'Checkpoint' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(244, 63, 94, 0.15)',
                            color: acc.status === 'Live' ? '#10b981' : acc.status === 'Checkpoint' ? '#f59e0b' : '#f43f5e',
                            border: '1px solid var(--border)',
                            borderRadius: '0.35rem',
                            padding: '0.2rem 0.4rem',
                            fontSize: '0.72rem',
                            fontWeight: 600
                          }}
                        >
                          <option value="Live">🟢 Live</option>
                          <option value="Checkpoint">🟠 Checkpoint</option>
                          <option value="Die">🔴 Die</option>
                        </select>
                      </td>

                      {/* Actions */}
                      <td style={{ padding: '0.75rem 0.85rem', textAlign: 'right' }}>
                        <button 
                          className="btn btn-danger" 
                          style={{ padding: '0.2rem 0.45rem', fontSize: '0.72rem' }}
                          title="Xóa tài khoản"
                          onClick={() => deleteAccount(acc.id)}
                        >
                          <Trash2 size={12} />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL 1: Bulk Import Accounts (Nhập hàng loạt) */}
      {showBulkModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="glass" style={{ width: 620, maxHeight: '90vh', overflowY: 'auto', borderRadius: '1rem', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Upload size={18} color="#10b981" />
                <span className="font-display" style={{ fontWeight: 700, fontSize: '1.15rem' }}>Nhập tài khoản hàng loạt</span>
              </div>
              <button onClick={() => setShowBulkModal(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '1.2rem' }}>✕</button>
            </div>

            <form onSubmit={handleBulkImport} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', fontSize: '0.85rem' }}>
              {/* Platform and Target Mode */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', color: '#94a3b8', marginBottom: 4 }}>Nền tảng tài khoản:</label>
                  <select
                    value={bulkPlatform}
                    onChange={e => setBulkPlatform(e.target.value)}
                    style={{ width: '100%', padding: '0.45rem', borderRadius: 6, background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border)', color: '#fff' }}
                  >
                    <option value="Facebook">Facebook</option>
                    <option value="TikTok">TikTok</option>
                    <option value="Google">Google / Gmail</option>
                    <option value="Instagram">Instagram</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', color: '#94a3b8', marginBottom: 4 }}>Cơ chế gán máy:</label>
                  <select
                    value={bulkTargetMode}
                    onChange={e => setBulkTargetMode(e.target.value)}
                    style={{ width: '100%', padding: '0.45rem', borderRadius: 6, background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border)', color: '#fff' }}
                  >
                    <option value="even">⚖️ Chia đều cho các máy Online</option>
                    <option value="specific">📱 Gán cố định vào 1 máy</option>
                    <option value="unassigned">⏳ Chưa gán máy (Để trống)</option>
                  </select>
                </div>
              </div>

              {bulkTargetMode === 'specific' && (
                <div>
                  <label style={{ display: 'block', color: '#94a3b8', marginBottom: 4 }}>Chọn máy nhận toàn bộ tài khoản:</label>
                  <select
                    value={bulkSpecificDevice}
                    onChange={e => setBulkSpecificDevice(e.target.value)}
                    style={{ width: '100%', padding: '0.45rem', borderRadius: 6, background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border)', color: '#fff' }}
                  >
                    {devices.map(d => (
                      <option key={d.serial} value={d.serial}>{d.model} ({d.serial})</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Textarea */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <label style={{ color: '#94a3b8' }}>Dán danh sách nick (Mỗi dòng 1 nick):</label>
                  <span style={{ color: '#10b981', fontWeight: 600 }}>{parsedBulkCount} dòng nhận diện</span>
                </div>
                <textarea 
                  rows={8}
                  required
                  placeholder={`Định dạng phôi chuẩn:
UID|Mật khẩu|Mã_2FA_Secret|Email|PassMail
Hoặc:
100089123456789|MyPassword123|JBSWY3DPEHPK3PXP|user1@gmail.com|passMail123
100098765432100|MyPassword456|HXDMVJECJJWSRB3HWIZR4IFUGFTMXBOZ`}
                  value={bulkText}
                  onChange={e => setBulkText(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    borderRadius: 6,
                    background: 'rgba(0,0,0,0.4)',
                    border: '1px solid var(--border)',
                    color: '#fff',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.78rem',
                    lineHeight: 1.5
                  }}
                />
              </div>

              <div style={{ background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.25)', borderRadius: 6, padding: '0.65rem 0.85rem', fontSize: '0.76rem', color: '#cbd5e1' }}>
                💡 <b>Mẹo Phone Farm:</b> Hệ thống tự động phân tích dấu phân cách <code>|</code>, dấu phẩy <code>,</code> hoặc tab. Mã 2FA Secret Key sẽ tự động sinh mã OTP 6 số thời gian thực khi chạy kịch bản.
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowBulkModal(false)}>Hủy</button>
                <button type="submit" className="btn btn-primary" disabled={bulkImporting || parsedBulkCount === 0}>
                  {bulkImporting ? 'Đang nạp...' : `Bắt đầu nạp ${parsedBulkCount} tài khoản`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Add Single Account */}
      {showAddModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="glass" style={{ width: 480, borderRadius: '1rem', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="font-display" style={{ fontWeight: 700, fontSize: '1.15rem' }}>Thêm tài khoản thủ công</span>
              <button onClick={() => setShowAddModal(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '1.2rem' }}>✕</button>
            </div>

            <form onSubmit={handleAddAccount} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.85rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', color: '#94a3b8', marginBottom: 4 }}>Nền tảng:</label>
                  <select
                    value={newAcc.platform}
                    onChange={e => setNewAcc({ ...newAcc, platform: e.target.value })}
                    style={{ width: '100%', padding: '0.45rem', borderRadius: 4, background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border)', color: '#fff' }}
                  >
                    <option value="Facebook">Facebook</option>
                    <option value="TikTok">TikTok</option>
                    <option value="Google">Google / Gmail</option>
                    <option value="Instagram">Instagram</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', color: '#94a3b8', marginBottom: 4 }}>Tên gợi nhớ:</label>
                  <input 
                    type="text" 
                    placeholder="VD: Nick chính 1"
                    value={newAcc.name}
                    onChange={e => setNewAcc({ ...newAcc, name: e.target.value })}
                    style={{ width: '100%', padding: '0.45rem', borderRadius: 4, background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border)', color: '#fff' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', color: '#94a3b8', marginBottom: 4 }}>UID / Tên đăng nhập *</label>
                <input 
                  type="text" 
                  required
                  placeholder="1000xxxxxxxxx"
                  value={newAcc.uid}
                  onChange={e => setNewAcc({ ...newAcc, uid: e.target.value })}
                  style={{ width: '100%', padding: '0.45rem', borderRadius: 4, background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border)', color: '#fff', fontFamily: 'var(--font-mono)' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', color: '#94a3b8', marginBottom: 4 }}>Mật khẩu *</label>
                <input 
                  type="password" 
                  required
                  value={newAcc.password}
                  onChange={e => setNewAcc({ ...newAcc, password: e.target.value })}
                  style={{ width: '100%', padding: '0.45rem', borderRadius: 4, background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border)', color: '#fff' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', color: '#94a3b8', marginBottom: 4 }}>Mã 2FA Secret Key (Tự động sinh OTP 6 số)</label>
                <input 
                  type="text" 
                  placeholder="Ví dụ: JBSWY3DPEHPK3PXP"
                  value={newAcc.twoFactorSecret}
                  onChange={e => setNewAcc({ ...newAcc, twoFactorSecret: e.target.value })}
                  style={{ width: '100%', padding: '0.45rem', borderRadius: 4, background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border)', color: '#fff', fontFamily: 'var(--font-mono)' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', color: '#94a3b8', marginBottom: 4 }}>Email liên kết</label>
                <input 
                  type="email" 
                  value={newAcc.email}
                  onChange={e => setNewAcc({ ...newAcc, email: e.target.value })}
                  style={{ width: '100%', padding: '0.45rem', borderRadius: 4, background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border)', color: '#fff' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', color: '#94a3b8', marginBottom: 4 }}>Gán vào máy:</label>
                <select
                  value={newAcc.assignedDevice}
                  onChange={e => setNewAcc({ ...newAcc, assignedDevice: e.target.value })}
                  style={{ width: '100%', padding: '0.45rem', borderRadius: 4, background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border)', color: '#fff' }}
                >
                  <option value="">Chưa gán máy</option>
                  {devices.map(d => (
                    <option key={d.serial} value={d.serial}>{d.model} ({d.serial})</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowAddModal(false)}>Hủy</button>
                <button type="submit" className="btn btn-primary">Lưu tài khoản</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
