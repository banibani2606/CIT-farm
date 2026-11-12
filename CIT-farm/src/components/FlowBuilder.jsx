import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ReactFlow,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Handle,
  Position,
  MiniMap
} from '@xyflow/react';
import { 
  Play, Square, Upload, Download, Plus, Save, Trash2, 
  Settings2, Smartphone, Terminal, CheckCircle2, AlertTriangle, FileCode
} from 'lucide-react';

// Custom GenFarmer Node Component
function GenFarmerCustomNode({ data, id, selected }) {
  const action = data.action || 'Action';
  const label = data.label || action;
  const options = data.options || {};

  // Color mapping matching GenFarmer
  const colors = {
    Start: { bg: '#059669', border: '#10b981', badge: 'Start' },
    Touch: { bg: '#0284c7', border: '#38bdf8', badge: 'Touch' },
    Swipe: { bg: '#7c3aed', border: '#a78bfa', badge: 'Swipe' },
    TypeText: { bg: '#d97706', border: '#fbbf24', badge: 'Type' },
    StartApp: { bg: '#2563eb', border: '#60a5fa', badge: 'App' },
    StopApp: { bg: '#dc2626', border: '#f87171', badge: 'App' },
    ElementExists: { bg: '#ca8a04', border: '#facc15', badge: 'Check' },
    If: { bg: '#b45309', border: '#f59e0b', badge: 'If' },
    Loop: { bg: '#4f46e5', border: '#818cf8', badge: 'Loop' },
    LoopV2: { bg: '#4f46e5', border: '#818cf8', badge: 'Loop' },
    Adb: { bg: '#be123c', border: '#fb7185', badge: 'Adb' },
    Random: { bg: '#0d9488', border: '#2dd4bf', badge: 'Random' },
    ContextMenu: { bg: '#0369a1', border: '#38bdf8', badge: 'Menu' },
    Pause: { bg: '#475569', border: '#94a3b8', badge: 'Wait' },
    Variables: { bg: '#b45309', border: '#f59e0b', badge: 'Var' },
    Break: { bg: '#e11d48', border: '#fb7185', badge: 'Break' },
    EnsureFeed: { bg: '#0891b2', border: '#22d3ee', badge: 'Shield' },
    AutoRecovery: { bg: '#0891b2', border: '#22d3ee', badge: 'Shield' },
    Wake: { bg: '#059669', border: '#10b981', badge: 'Wake' },
    WakeUp: { bg: '#059669', border: '#10b981', badge: 'Wake' },
    ExtractPostContent: { bg: '#8b5cf6', border: '#c084fc', badge: 'AI Scan' },
    ExtractThreadsPost: { bg: '#8b5cf6', border: '#c084fc', badge: 'AI Scan' },
    AiGenerateComment: { bg: '#ec4899', border: '#f472b6', badge: 'AI Comment' },
    AiGeneratePost: { bg: '#9333ea', border: '#c084fc', badge: 'AI Post' },
    AiGenerateThreadsPost: { bg: '#9333ea', border: '#c084fc', badge: 'AI Post' },
    SelectKeyword: { bg: '#0284c7', border: '#38bdf8', badge: 'Keyword' },
    SelectSearchKeyword: { bg: '#0284c7', border: '#38bdf8', badge: 'Keyword' },
    ThreadsFeedInteract: { bg: '#e11d48', border: '#fb7185', badge: 'Tương tác Feed' },
    RandomInteractFeed: { bg: '#e11d48', border: '#fb7185', badge: 'Tương tác Feed' },
    FbReelsInteract: { bg: '#e11d48', border: '#fb7185', badge: 'Tương tác Reels' },
    FbFeedInteract: { bg: '#2563eb', border: '#60a5fa', badge: 'Tương tác FB' },
    TikTokFeedInteract: { bg: '#0f172a', border: '#38bdf8', badge: 'Tương tác TikTok' }
  };

  const scheme = colors[action] || { bg: '#1e293b', border: '#64748b', badge: action };

  return (
    <div
      style={{
        padding: '0.65rem 0.85rem',
        borderRadius: action === 'Start' ? '50%' : '0.5rem',
        width: action === 'Start' ? 75 : 180,
        height: action === 'Start' ? 75 : 'auto',
        display: 'flex',
        flexDirection: 'column',
        alignItems: action === 'Start' ? 'center' : 'flex-start',
        justifyContent: 'center',
        background: scheme.bg,
        border: `2px solid ${selected ? '#fff' : scheme.border}`,
        boxShadow: selected ? `0 0 15px ${scheme.border}` : '0 4px 10px rgba(0,0,0,0.4)',
        color: '#fff',
        fontSize: '0.75rem',
        position: 'relative'
      }}
    >
      <Handle type="target" position={Position.Left} style={{ background: '#38bdf8' }} />
      
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginBottom: action === 'Start' ? 0 : 4 }}>
        <span style={{ fontWeight: 700, fontSize: action === 'Start' ? '0.85rem' : '0.8rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {label}
        </span>
      </div>

      {action !== 'Start' && (
        <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.68rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }}>
          {action === 'ThreadsFeedInteract' || action === 'RandomInteractFeed' || action === 'FbReelsInteract' || action === 'FbFeedInteract' || action === 'TikTokFeedInteract'
            ? `Like: ${Math.round((parseFloat(options.likeRate ?? 0.3)) * 100)}%`
            : (options.packageName || options.xpath || options.command || options.text || options.swipeDirection || action)}
        </div>
      )}

      {/* Success Handle (Right) */}
      <Handle type="source" position={Position.Right} id="successNode" style={{ background: '#10b981', top: '35%' }} />
      {/* Fail Handle (Bottom or Right-lower) */}
      <Handle type="source" position={Position.Right} id="failNode" style={{ background: '#f43f5e', top: '65%' }} />
    </div>
  );
}

const nodeTypes = {
  custom: GenFarmerCustomNode,
  input: GenFarmerCustomNode,
  helper: GenFarmerCustomNode,
  loop: GenFarmerCustomNode,
  'custom-context-menu': GenFarmerCustomNode,
  'custom-case': GenFarmerCustomNode
};

export default function FlowBuilder({ devices, activeSerial }) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [currentFlow, setCurrentFlow] = useState(null);
  const [savedFlows, setSavedFlows] = useState([]);
  const [selectedNode, setSelectedNode] = useState(null);
  const [isRunning, setIsRunning] = useState(false);
  const [activeStepNodeId, setActiveStepNodeId] = useState(null);
  const [runLogs, setRunLogs] = useState([]);
  const [targetSerial, setTargetSerial] = useState('ALL');
  const [selectedPlatform, setSelectedPlatform] = useState('all');

  const onConnect = useCallback(
    (params) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  // Delete flow from database
  const handleDeleteFlow = async (flowId) => {
    if (!flowId || flowId === '__sample_fb__') return;
    const flowToDelete = savedFlows.find(f => f.id === flowId);
    const confirmDelete = window.confirm(`Bạn có chắc chắn muốn xóa kịch bản "${flowToDelete?.name || flowId}" không?`);
    if (!confirmDelete) return;

    try {
      const res = await fetch(`/api/flows/${flowId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        const nextList = savedFlows.filter(f => f.id !== flowId);
        setSavedFlows(nextList);
        if (nextList.length > 0) {
          importFlowData(nextList[0]);
        } else {
          loadSampleFlow();
        }
      }
    } catch (err) {
      alert('Lỗi xóa kịch bản: ' + err.message);
    }
  };

  // Fetch saved flows from database or fallback to sample flow
  const fetchFlows = async () => {
    try {
      const res = await fetch('/api/flows');
      const data = await res.json();
      if (data.success && data.flows && data.flows.length > 0) {
        setSavedFlows(data.flows);
        // Load the primary / latest saved flow
        importFlowData(data.flows[0]);
      } else {
        loadSampleFlow();
      }
    } catch {
      loadSampleFlow();
    }
  };

  useEffect(() => {
    fetchFlows();
  }, []);

  // Listen to WebSocket for runner logs
  useEffect(() => {
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${wsProtocol}//${window.location.host}/ws`);

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'flow_log') {
          setRunLogs(prev => [msg, ...prev.slice(0, 80)]);
        }
        if (msg.type === 'flow_step') {
          setActiveStepNodeId(msg.nodeId);
        }
        if (msg.type === 'flow_finished' || msg.type === 'flow_error') {
          setIsRunning(false);
          setActiveStepNodeId(null);
        }
      } catch {}
    };

    return () => ws.close();
  }, []);

  const loadSampleFlow = async () => {
    try {
      const res = await fetch('/api/flows/sample');
      const data = await res.json();
      if (data.success && data.flow) {
        importFlowData(data.flow);
      }
    } catch (err) {
      console.error('Failed to load sample flow:', err);
    }
  };

  const importFlowData = (flowJson) => {
    const flowData = flowJson.script?.flow || flowJson.flow || flowJson;
    const rawNodes = flowData.nodes || [];
    const rawEdges = flowData.edges || [];

    // Map GenFarmer nodes to ReactFlow nodes
    const mappedNodes = rawNodes.map((n, i) => {
      // Calculate layout if position missing
      const posX = n.position?.x ?? (i % 8) * 220 + 50;
      const posY = n.position?.y ?? Math.floor(i / 8) * 140 + 50;

      return {
        id: n.id,
        type: nodeTypes[n.type] ? n.type : 'custom',
        position: { x: posX, y: posY },
        data: {
          action: n.data?.action || n.type || 'Custom',
          label: n.label || n.data?.label || n.data?.action || n.id,
          options: n.data?.options || {},
          successNode: n.data?.successNode,
          failNode: n.data?.failNode
        }
      };
    });

    // Map edges
    const mappedEdges = rawEdges.map((e, i) => ({
      id: e.id || `e_${i}`,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle || (e.data?.branch === 'fail' ? 'failNode' : 'successNode'),
      animated: true,
      style: { stroke: e.sourceHandle === 'failNode' ? '#f43f5e' : '#10b981' }
    }));

    setNodes(mappedNodes);
    setEdges(mappedEdges);

    const detectedPlatform = flowJson.platform || 
      (flowJson.id?.includes('thread') || flowJson.name?.toLowerCase().includes('thread') ? 'threads' :
       flowJson.id?.includes('tiktok') || flowJson.name?.toLowerCase().includes('tiktok') ? 'tiktok' : 'facebook');

    setCurrentFlow({
      id: flowJson.id || 'flow_custom',
      name: flowJson.name || flowJson.script?.name || 'Kịch bản tự động',
      version: flowJson.version || '1.1.0',
      description: flowJson.description || '',
      nodeCount: mappedNodes.length,
      edgeCount: mappedEdges.length,
      platform: detectedPlatform,
      category: flowJson.category,
      categoryLabel: flowJson.categoryLabel
    });
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const json = JSON.parse(evt.target.result);
        const res = await fetch('/api/flows/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(json)
        });
        const data = await res.json();
        if (data.success) {
          importFlowData(json);
        }
      } catch (err) {
        alert('Lỗi đọc file kịch bản: ' + err.message);
      }
    };
    reader.readAsText(file);
  };

  const runFlow = async () => {
    if (!targetSerial) {
      alert('Vui lòng chọn thiết bị trước khi chạy!');
      return;
    }
    setIsRunning(true);
    setRunLogs([]);

    const flowPayload = {
      id: currentFlow?.id,
      name: currentFlow?.name || 'Custom Flow',
      platform: currentFlow?.platform,
      flow: {
        nodes: nodes.map(n => ({ id: n.id, type: n.type, data: n.data })),
        edges
      }
    };

    try {
      let targetSerials = [];
      if (targetSerial === 'ALL') {
        targetSerials = devices.map(d => d.serial);
      } else if (targetSerial === 'EXCEPT_VSMART') {
        targetSerials = devices
          .filter(d => !d.model?.toLowerCase().includes('aris') && !d.model?.toLowerCase().includes('vsmart') && d.serial !== 'BDE00051677')
          .map(d => d.serial);
      } else if (targetSerial === 'ONLY_VSMART') {
        const vsmart = devices.find(d => d.model?.toLowerCase().includes('aris') || d.model?.toLowerCase().includes('vsmart') || d.serial === 'BDE00051677');
        targetSerials = vsmart ? [vsmart.serial] : ['BDE00051677'];
      } else {
        targetSerials = [targetSerial];
      }

      if (targetSerials.length > 1) {
        // Stagger execution across target devices to avoid simultaneous surge
        for (const serial of targetSerials) {
          fetch('/api/flows/run', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              flow: flowPayload,
              serial
            })
          }).catch(console.error);
          await new Promise(r => setTimeout(r, 1200));
        }
      } else if (targetSerials.length === 1) {
        await fetch('/api/flows/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            flow: flowPayload,
            serial: targetSerials[0]
          })
        });
      }
    } catch (err) {
      console.error(err);
      setIsRunning(false);
    }
  };

  const handleStopFlow = async () => {
    try {
      await fetch('/api/flows/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runId: 'ALL' })
      });
      setIsRunning(false);
      setActiveStepNodeId(null);
    } catch (err) {
      console.error(err);
    }
  };

  const onNodeClick = (_, node) => {
    setSelectedNode(node);
  };

  const platformCounts = useMemo(() => ({
    all: savedFlows.length,
    facebook: savedFlows.filter(f => f.platform === 'facebook').length,
    threads: savedFlows.filter(f => f.platform === 'threads').length,
    tiktok: savedFlows.filter(f => f.platform === 'tiktok').length,
  }), [savedFlows]);

  const allFbFlows = useMemo(() => savedFlows.filter(f => f.platform === 'facebook'), [savedFlows]);
  const allThreadsFlows = useMemo(() => savedFlows.filter(f => f.platform === 'threads'), [savedFlows]);
  const allTiktokFlows = useMemo(() => savedFlows.filter(f => f.platform === 'tiktok'), [savedFlows]);
  const allOtherFlows = useMemo(() => savedFlows.filter(f => !['facebook', 'threads', 'tiktok'].includes(f.platform)), [savedFlows]);

  const handlePlatformTabClick = (platformId) => {
    setSelectedPlatform(platformId);
    if (platformId !== 'all') {
      const targetFlow = savedFlows.find(f => f.platform === platformId);
      if (targetFlow && currentFlow?.id !== targetFlow.id) {
        importFlowData(targetFlow);
      }
    }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: selectedNode ? '1fr 340px' : '1fr', gap: '1.25rem', height: '100%' }}>
      {/* LEFT: Canvas & Top Action Bar */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', minHeight: 0 }}>
        {/* Platform Filter Tabs & Active Flow Badges */}
        <div className="glass" style={{ padding: '0.6rem 1rem', borderRadius: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#94a3b8', marginRight: '0.25rem' }}>Nền tảng:</span>
            {[
              { id: 'all', label: `Tất cả (${platformCounts.all})`, color: '#64748b' },
              { id: 'threads', label: `🟣 Threads (${platformCounts.threads})`, color: '#a855f7' },
              { id: 'facebook', label: `🔵 Facebook (${platformCounts.facebook})`, color: '#3b82f6' },
              { id: 'tiktok', label: `⚫ TikTok (${platformCounts.tiktok})`, color: '#06b6d4' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => handlePlatformTabClick(tab.id)}
                style={{
                  background: (currentFlow?.platform === tab.id || (tab.id === 'all' && selectedPlatform === 'all')) ? tab.color : 'rgba(255,255,255,0.05)',
                  color: (currentFlow?.platform === tab.id || (tab.id === 'all' && selectedPlatform === 'all')) ? '#fff' : '#cbd5e1',
                  border: (currentFlow?.platform === tab.id || (tab.id === 'all' && selectedPlatform === 'all')) ? `1px solid ${tab.color}` : '1px solid var(--border)',
                  padding: '0.25rem 0.65rem',
                  borderRadius: '2rem',
                  fontSize: '0.75rem',
                  fontWeight: (currentFlow?.platform === tab.id || (tab.id === 'all' && selectedPlatform === 'all')) ? 700 : 500,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Current Flow Badges */}
          {currentFlow && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem' }}>
              {currentFlow.platform && (
                <span style={{
                  padding: '0.2rem 0.55rem',
                  borderRadius: '1rem',
                  fontWeight: 700,
                  fontSize: '0.7rem',
                  background: currentFlow.platform === 'threads' ? 'rgba(168, 85, 247, 0.2)' : currentFlow.platform === 'facebook' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(6, 182, 212, 0.2)',
                  color: currentFlow.platform === 'threads' ? '#c084fc' : currentFlow.platform === 'facebook' ? '#60a5fa' : '#22d3ee',
                  border: `1px solid ${currentFlow.platform === 'threads' ? 'rgba(168, 85, 247, 0.4)' : currentFlow.platform === 'facebook' ? 'rgba(59, 130, 246, 0.4)' : 'rgba(6, 182, 212, 0.4)'}`
                }}>
                  {currentFlow.platform === 'threads' ? '🟣 Threads' : currentFlow.platform === 'facebook' ? '🔵 Facebook' : '⚫ TikTok'}
                </span>
              )}
              {currentFlow.categoryLabel && (
                <span style={{
                  padding: '0.2rem 0.55rem',
                  borderRadius: '1rem',
                  fontWeight: 600,
                  fontSize: '0.7rem',
                  background: 'rgba(255, 255, 255, 0.08)',
                  color: '#e2e8f0',
                  border: '1px solid rgba(255, 255, 255, 0.15)'
                }}>
                  🏷️ {currentFlow.categoryLabel}
                </span>
              )}
              {currentFlow.description && (
                <span style={{ color: '#94a3b8', fontStyle: 'italic', maxWidth: '360px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={currentFlow.description}>
                  • {currentFlow.description}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Top Controls Bar */}
        <div className="glass" style={{ padding: '0.75rem 1.25rem', borderRadius: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <FileCode size={20} color={currentFlow?.platform === 'threads' ? '#a855f7' : currentFlow?.platform === 'facebook' ? '#3b82f6' : '#10b981'} />
            
            {/* Flow Switcher Dropdown */}
            <select
              value={currentFlow?.id || ''}
              onChange={(e) => {
                const val = e.target.value;
                if (val === '__sample_fb__') {
                  loadSampleFlow();
                  setSelectedPlatform('facebook');
                } else {
                  const found = savedFlows.find(f => f.id === val);
                  if (found) {
                    importFlowData(found);
                    if (found.platform) setSelectedPlatform(found.platform);
                  }
                }
              }}
              style={{
                background: currentFlow?.platform === 'threads' ? 'rgba(168, 85, 247, 0.15)' : currentFlow?.platform === 'facebook' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                color: currentFlow?.platform === 'threads' ? '#c084fc' : currentFlow?.platform === 'facebook' ? '#60a5fa' : '#34d399',
                fontWeight: 700,
                border: `1px solid ${currentFlow?.platform === 'threads' ? 'rgba(168, 85, 247, 0.4)' : currentFlow?.platform === 'facebook' ? 'rgba(59, 130, 246, 0.4)' : 'rgba(16, 185, 129, 0.3)'}`,
                borderRadius: '0.5rem',
                padding: '0.45rem 0.85rem',
                fontSize: '0.85rem',
                cursor: 'pointer',
                maxWidth: '380px'
              }}
            >
              {allThreadsFlows.length > 0 && (
                <optgroup label="🟣 Threads Automation">
                  {allThreadsFlows.map(f => (
                    <option key={f.id} value={f.id} style={{ background: '#0f172a', color: '#fff' }}>
                      {f.name} ({f.flow?.nodes?.length || f.nodeCount || 0} nodes)
                    </option>
                  ))}
                </optgroup>
              )}

              {allFbFlows.length > 0 && (
                <optgroup label="🔵 Facebook Automation">
                  {allFbFlows.map(f => (
                    <option key={f.id} value={f.id} style={{ background: '#0f172a', color: '#fff' }}>
                      {f.name} ({f.flow?.nodes?.length || f.nodeCount || 0} nodes)
                    </option>
                  ))}
                </optgroup>
              )}

              {allTiktokFlows.length > 0 && (
                <optgroup label="⚫ TikTok Automation">
                  {allTiktokFlows.map(f => (
                    <option key={f.id} value={f.id} style={{ background: '#0f172a', color: '#fff' }}>
                      {f.name} ({f.flow?.nodes?.length || f.nodeCount || 0} nodes)
                    </option>
                  ))}
                </optgroup>
              )}

              {allOtherFlows.length > 0 && (
                <optgroup label="📁 Kịch bản khác">
                  {allOtherFlows.map(f => (
                    <option key={f.id} value={f.id} style={{ background: '#0f172a', color: '#fff' }}>
                      {f.name} ({f.flow?.nodes?.length || f.nodeCount || 0} nodes)
                    </option>
                  ))}
                </optgroup>
              )}

              <optgroup label="📘 GenFarmer Mẫu Gốc">
                <option value="__sample_fb__" style={{ background: '#0f172a', color: '#fff' }}>
                  Nuôi Facebook tối ưu (343 nodes)
                </option>
              </optgroup>
            </select>

            {/* Delete Flow Button */}
            {currentFlow && currentFlow.id !== '__sample_fb__' && (
              <button
                className="btn btn-secondary"
                onClick={() => handleDeleteFlow(currentFlow.id)}
                title="Xóa kịch bản này"
                style={{ padding: '0.45rem 0.6rem', color: '#f87171', border: '1px solid rgba(248, 113, 113, 0.3)' }}
              >
                <Trash2 size={15} />
              </button>
            )}

            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
              ({nodes.length} nodes, {edges.length} edges)
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            {/* Device Selector */}
            <select
              value={targetSerial}
              onChange={(e) => setTargetSerial(e.target.value)}
              style={{
                background: (targetSerial === 'ALL' || targetSerial === 'EXCEPT_VSMART' || targetSerial === 'ONLY_VSMART') ? 'rgba(56, 189, 248, 0.15)' : 'rgba(0,0,0,0.4)',
                color: (targetSerial === 'ALL' || targetSerial === 'EXCEPT_VSMART' || targetSerial === 'ONLY_VSMART') ? '#38bdf8' : '#f8fafc',
                border: `1px solid ${(targetSerial === 'ALL' || targetSerial === 'EXCEPT_VSMART' || targetSerial === 'ONLY_VSMART') ? 'rgba(56, 189, 248, 0.4)' : 'var(--border)'}`,
                borderRadius: '0.5rem',
                padding: '0.45rem 0.75rem',
                fontSize: '0.85rem',
                fontWeight: (targetSerial === 'ALL' || targetSerial === 'EXCEPT_VSMART' || targetSerial === 'ONLY_VSMART') ? 700 : 500
              }}
            >
              <option value="ALL">⚡ Tất cả {devices.length} thiết bị (Chạy cả 5 máy)</option>
              <option value="EXCEPT_VSMART">🚀 Chạy 4 máy (Ngoại trừ Vsmart)</option>
              <option value="ONLY_VSMART">📱 Chạy 1 máy (Vsmart Aris)</option>
              <optgroup label="── Từng máy riêng lẻ ──">
                {devices.map(d => {
                  const isVsmart = d.model?.toLowerCase().includes('aris') || d.model?.toLowerCase().includes('vsmart') || d.serial === 'BDE00051677';
                  return (
                    <option key={d.serial} value={d.serial}>
                      {d.model} ({d.serial}) {isVsmart ? '• [Vsmart]' : ''}
                    </option>
                  );
                })}
              </optgroup>
            </select>

            {/* Active Running Flow Badge Indicator */}
            {currentFlow && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.4rem 0.75rem',
                borderRadius: '0.5rem',
                fontSize: '0.8rem',
                fontWeight: 600,
                background: currentFlow.platform === 'threads' ? 'rgba(168, 85, 247, 0.15)' : currentFlow.platform === 'tiktok' ? 'rgba(6, 182, 212, 0.15)' : 'rgba(59, 130, 246, 0.15)',
                border: `1px solid ${currentFlow.platform === 'threads' ? 'rgba(168, 85, 247, 0.4)' : currentFlow.platform === 'tiktok' ? 'rgba(6, 182, 212, 0.4)' : 'rgba(59, 130, 246, 0.4)'}`,
                color: currentFlow.platform === 'threads' ? '#d8b4fe' : currentFlow.platform === 'tiktok' ? '#67e8f9' : '#93c5fd',
                maxWidth: '260px',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }} title={`Đang nạp: ${currentFlow.name}`}>
                <span style={{ opacity: 0.8, fontSize: '0.7rem' }}>Sẵn sàng:</span>
                <span style={{ fontWeight: 700, color: '#fff' }}>
                  {currentFlow.platform === 'threads' ? '🟣' : currentFlow.platform === 'tiktok' ? '⚫' : '🔵'} {currentFlow.name}
                </span>
              </div>
            )}

            {/* Run Button */}
            <button 
              className={`btn ${isRunning ? 'btn-danger' : 'btn-primary'}`}
              onClick={isRunning ? handleStopFlow : runFlow}
              style={{ minWidth: '145px' }}
            >
              {isRunning ? <Square size={15} /> : <Play size={15} fill="currentColor" />}
              {isRunning 
                ? 'Dừng Toàn Bộ' 
                : targetSerial === 'ALL' 
                  ? `Chạy Cả ${devices.length} Máy` 
                  : targetSerial === 'EXCEPT_VSMART' 
                    ? 'Chạy 4 Máy (Trừ Vsmart)' 
                    : targetSerial === 'ONLY_VSMART' 
                      ? 'Chạy 1 Máy (Vsmart)' 
                      : 'Chạy Kịch Bản'
              }
            </button>

            {/* Import Button */}
            <label className="btn btn-secondary" style={{ cursor: 'pointer' }}>
              <Upload size={15} color="#38bdf8" /> Import GenFarmer
              <input type="file" accept=".json,.genfarmer" onChange={handleFileUpload} style={{ display: 'none' }} />
            </label>

            {/* Reload Sample */}
            <button className="btn btn-secondary" onClick={loadSampleFlow} title="Nạp kịch bản Facebook 343 nodes">
              Mẫu FB gốc
            </button>
          </div>
        </div>

        {/* Visual Graph Canvas Area */}
        <div className="glass" style={{ flex: 1, borderRadius: '1rem', overflow: 'hidden', position: 'relative' }}>
          <ReactFlow
            nodes={nodes.map(n => ({
              ...n,
              selected: n.id === activeStepNodeId || n.id === selectedNode?.id
            }))}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            nodeTypes={nodeTypes}
            fitView
            minZoom={0.1}
            maxZoom={2}
          >
            <Background color="#1e293b" gap={20} size={1.5} />
            <Controls />
            <MiniMap 
              nodeColor={(n) => n.data?.action === 'Start' ? '#10b981' : '#3b82f6'} 
              style={{ background: 'rgba(15, 23, 42, 0.8)', borderRadius: 8, border: '1px solid var(--border)' }} 
            />
          </ReactFlow>

          {/* Running Step Indicator banner */}
          {isRunning && (
            <div style={{ position: 'absolute', bottom: 16, left: 16, zIndex: 100, background: 'rgba(15, 23, 42, 0.9)', padding: '0.6rem 1rem', borderRadius: '0.5rem', border: '1px solid #10b981', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#10b981' }} className="animate-ping" />
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#34d399' }}>
                Đang chạy Node: {activeStepNodeId || 'Khởi tạo...'}
              </span>
            </div>
          )}
        </div>

        {/* Bottom Console Log Drawer */}
        {runLogs.length > 0 && (
          <div className="glass" style={{ maxHeight: 150, overflowY: 'auto', padding: '0.75rem', borderRadius: '0.75rem', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, color: '#94a3b8', fontWeight: 600 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <Terminal size={14} /> Nhật ký thực thi (Execution Logs):
              </div>
              <button onClick={() => setRunLogs([])} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}>Xóa log</button>
            </div>
            {runLogs.map((l, i) => (
              <div key={i} style={{ color: l.level === 'ERROR' ? '#f87171' : l.level === 'WARN' ? '#fbbf24' : '#cbd5e1', lineHeight: '1.4' }}>
                <span style={{ color: '#64748b' }}>[{new Date(l.time).toLocaleTimeString()}]</span> [{l.level}] {l.msg}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* RIGHT: Node Inspector Drawer */}
      {selectedNode && (
        <div className="glass" style={{ borderRadius: '1rem', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem', overflowY: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '0.75rem', borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Settings2 size={18} color="#38bdf8" />
              <span className="font-display" style={{ fontWeight: 700, fontSize: '1.05rem' }}>Thuộc tính Node</span>
            </div>
            <button 
              className="btn btn-secondary" 
              style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}
              onClick={() => setSelectedNode(null)}
            >
              Đóng
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', fontSize: '0.85rem' }}>
            <div>
              <span style={{ color: '#94a3b8', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>Action Type:</span>
              <div style={{ padding: '0.45rem', borderRadius: '0.35rem', background: 'rgba(0,0,0,0.3)', color: '#38bdf8', fontWeight: 600 }}>
                {selectedNode.data?.action || selectedNode.type}
              </div>
            </div>

            <div>
              <span style={{ color: '#94a3b8', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>Nhãn hiển thị (Label):</span>
              <input 
                type="text" 
                value={selectedNode.data?.label || ''}
                onChange={(e) => {
                  const val = e.target.value;
                  setNodes(nds => nds.map(n => n.id === selectedNode.id ? { ...n, data: { ...n.data, label: val } } : n));
                  setSelectedNode(prev => ({ ...prev, data: { ...prev.data, label: val } }));
                }}
                style={{ width: '100%', padding: '0.45rem', borderRadius: '0.35rem', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border)', color: '#fff' }}
              />
            </div>

            {/* Special Category Dropdown for SelectKeyword */}
            {(selectedNode.data?.action === 'SelectKeyword' || selectedNode.data?.action === 'SelectSearchKeyword') && (
              <div>
                <span style={{ color: '#94a3b8', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>Chủ đề từ khóa (Category):</span>
                <select
                  value={selectedNode.data?.options?.category || 'persona'}
                  onChange={(e) => {
                    const val = e.target.value;
                    const newOptions = { ...selectedNode.data?.options, category: val };
                    setNodes(nds => nds.map(n => n.id === selectedNode.id ? { ...n, data: { ...n.data, options: newOptions } } : n));
                    setSelectedNode(prev => ({ ...prev, data: { ...prev.data, options: newOptions } }));
                  }}
                  style={{ width: '100%', padding: '0.45rem', borderRadius: '0.35rem', background: '#0f172a', border: '1px solid #38bdf8', color: '#fff', fontSize: '0.8rem' }}
                >
                  <option value="persona">⚡ Tự động theo Persona của từng máy (Khuyên dùng)</option>
                  <option value="speaking_reflex">🔥 Luyện phản xạ & Sợ nói / Lag não (Core Hanpeak)</option>
                  <option value="pinyin_pronunciation">🎯 Phát âm chuẩn & Pinyin 101 & Thanh điệu</option>
                  <option value="beginner_roadmap">🌱 Người mới bắt đầu & Lộ trình tự học</option>
                  <option value="vocab_chunks">📚 Nạp từ vựng theo cụm & Ghép câu</option>
                  <option value="workplace_situational">💼 Tiếng Trung đi làm & Công sở & Thực chiến</option>
                  <option value="tools_apps">🤖 App & Web luyện nói tiếng Trung với AI</option>
                </select>
              </div>
            )}

            {/* Special Config for ThreadsFeedInteract */}
            {(selectedNode.data?.action === 'ThreadsFeedInteract' || selectedNode.data?.action === 'RandomInteractFeed') && (
              <div style={{ background: 'rgba(225, 29, 72, 0.12)', padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid rgba(251, 113, 133, 0.3)', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                <span style={{ color: '#fb7185', fontWeight: 700, fontSize: '0.82rem' }}>❤️ Cấu hình Tương Tác Tự Nhiên:</span>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.2rem', fontSize: '0.75rem' }}>
                    <span style={{ color: '#cbd5e1' }}>Tỉ lệ Thả tim (Like):</span>
                    <span style={{ color: '#fb7185', fontWeight: 700 }}>{Math.round((parseFloat(selectedNode.data?.options?.likeRate ?? 0.35)) * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={parseFloat(selectedNode.data?.options?.likeRate ?? 0.35)}
                    onChange={(e) => {
                      const val = e.target.value;
                      const newOptions = { ...selectedNode.data?.options, likeRate: val };
                      setNodes(nds => nds.map(n => n.id === selectedNode.id ? { ...n, data: { ...n.data, options: newOptions } } : n));
                      setSelectedNode(prev => ({ ...prev, data: { ...prev.data, options: newOptions } }));
                    }}
                    style={{ width: '100%', accentColor: '#e11d48' }}
                  />
                </div>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.2rem', fontSize: '0.75rem' }}>
                    <span style={{ color: '#cbd5e1' }}>Tỉ lệ Xem chi tiết & cmt:</span>
                    <span style={{ color: '#38bdf8', fontWeight: 700 }}>{Math.round((parseFloat(selectedNode.data?.options?.detailRate ?? 0.15)) * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="0.5"
                    step="0.05"
                    value={parseFloat(selectedNode.data?.options?.detailRate ?? 0.15)}
                    onChange={(e) => {
                      const val = e.target.value;
                      const newOptions = { ...selectedNode.data?.options, detailRate: val };
                      setNodes(nds => nds.map(n => n.id === selectedNode.id ? { ...n, data: { ...n.data, options: newOptions } } : n));
                      setSelectedNode(prev => ({ ...prev, data: { ...prev.data, options: newOptions } }));
                    }}
                    style={{ width: '100%', accentColor: '#38bdf8' }}
                  />
                </div>
              </div>
            )}

            {/* Special Hint for TypeText */}
            {selectedNode.data?.action === 'TypeText' && (
              <div style={{ background: 'rgba(56, 189, 248, 0.1)', padding: '0.65rem', borderRadius: '0.4rem', border: '1px solid rgba(56, 189, 248, 0.25)', fontSize: '0.75rem', color: '#cbd5e1' }}>
                <span style={{ color: '#38bdf8', fontWeight: 700, display: 'block', marginBottom: '0.25rem' }}>💡 Biến nội dung AI:</span>
                Nhập <code style={{ color: '#34d399', fontWeight: 700 }}>{'${AiPostText}'}</code> để dán bài viết AI vừa tạo, hoặc <code style={{ color: '#fb7185', fontWeight: 700 }}>{'${AiComment}'}</code> cho bình luận.
              </div>
            )}

            {/* Options Details */}
            {selectedNode.data?.options && Object.entries(selectedNode.data.options).map(([k, v]) => (
              <div key={k}>
                <span style={{ color: '#94a3b8', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>{k}:</span>
                <input 
                  type="text" 
                  value={typeof v === 'object' ? JSON.stringify(v) : String(v)}
                  onChange={(e) => {
                    const val = e.target.value;
                    setNodes(nds => nds.map(n => n.id === selectedNode.id ? {
                      ...n,
                      data: { ...n.data, options: { ...n.data.options, [k]: val } }
                    } : n));
                  }}
                  style={{ width: '100%', padding: '0.45rem', borderRadius: '0.35rem', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border)', color: '#cbd5e1', fontSize: '0.8rem' }}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
