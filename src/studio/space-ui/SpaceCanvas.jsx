/* UI fork: source Canvas.jsx from the user-supplied localhost:5173 space. */
import React, { useEffect, useRef, useState } from 'react';
import {
  Plus,
  Search,
  History,
  MousePointer2,
  Hand,
  PenLine,
  Frame,
  Image,
  Video,
  AudioLines,
  Type,
  UserRound,
  Trees,
  LayoutGrid,
  ChevronDown,
  Settings2,
  Map,
  Minus,
  Maximize,
  Copy,
  Trash2,
  Download,
  X,
  Check,
  RotateCcw,
  Undo2,
  Wand2,
  Box,
  Clapperboard,
  Sparkles,
  Upload,
} from 'lucide-react';
import './canvas.css';
import { RADAR_WORKFLOWS } from '../../../shared/radar';

const NODE_TYPES = [['note', '研究笔记', Type], ['frame', '分组框', Frame]];
const typeIcon = (type) => NODE_TYPES.find(([id]) => id === type)?.[2] || Image;
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const isEditing = (target) => target?.closest?.('input,textarea,[contenteditable="true"],select');

function IconButton({ title, children, className = '', ...props }) {
  return (
    <button type="button" className={`cv-icon ${className}`} title={title} aria-label={title} {...props}>
      {children}
    </button>
  );
}

export default function Canvas({
  nodes = [],
  setNodes,
  selectedNode,
  setSelectedNode,
  viewMode = 'canvas',
  setViewMode,
  onAction,
  settings = {},
  agent,
  collapsed = false,
  renderContent,
}) {
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [tool, setTool] = useState('select');
  const [menu, setMenu] = useState(null);
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [miniOpen, setMiniOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [paths, setPaths] = useState([]);
  const [history, setHistory] = useState([]);
  const [space, setSpace] = useState(false);
  const [moving, setMoving] = useState(false);
  const [dimensions, setDimensions] = useState({});
  const dragRef = useRef(null);
  const rootRef = useRef(null);
  const worldRef = useRef(null);
  const searchRef = useRef(null);
  const nodesRef = useRef(nodes);
  const zoomRef = useRef(zoom);
  const settingsRef = useRef(settings);
  const knownNodeIds = useRef(new Set(nodes.map((node) => node.id)));
  nodesRef.current = nodes;
  zoomRef.current = zoom;
  settingsRef.current = settings;

  const action = (name, payload) => onAction?.(name, payload);
  const updateNode = (id, changes) =>
    setNodes?.((all) => all.map((node) => (node.id === id ? { ...node, ...changes } : node)));
  const remember = (label) =>
    setHistory((all) =>
      [
        { id: Date.now(), label, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) },
        ...all,
      ].slice(0, 20),
    );
  const duplicate = (node) => {
    const 副本 = {
      ...node,
      id: crypto.randomUUID(),
      sourceId: node.sourceId || node.id,
      name: `${node.name || '未命名'} 副本`,
      x: (node.x || 0) + 40,
      y: (node.y || 0) + 40,
    };
    setNodes?.((all) => [...all, 副本]);
    setSelectedNode?.(copy.id);
    remember(`已复制 ${node.name || node.type}`);
  };
  const remove = (id) => {
    const node = nodesRef.current.find((item) => item.id === id);
    setNodes?.((all) => all.filter((item) => item.id !== id));
    setSelectedNode?.(null);
    if (node) remember(`已移除 ${node.name || node.type}`);
  };
  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setMenu(null);
  };
  const focusNode = (node) => {
    setSelectedNode?.(node.id);
    setViewMode?.('canvas');
    setPan({ x: 205 - (node.x || 0), y: 155 - (node.y || 0) });
    setZoom(1);
    setSearchOpen(false);
    setMiniOpen(false);
  };
  const selectNode = (node) => (settings.focusSelected ? focusNode(node) : setSelectedNode?.(node.id));
  const rememberDimensions = (id, width, height) => {
    if (!width || !height) return;
    setDimensions((all) =>
      all[id]?.width === width && all[id]?.height === height ? all : { ...all, [id]: { width, height } },
    );
  };
  const promptText = (text) =>
    settings.promptHighlight
      ? String(text)
          .split(/(【[^】]+】|\[[^\]]+\])/g)
          .map((part, index) =>
            /^(【[^】]+】|\[[^\]]+\])$/.test(part) ? (
              <span key={index} className="cv-prompt-highlight">
                {part}
              </span>
            ) : (
              part
            ),
          )
      : text;

  useEffect(() => {
    const added = nodes.filter((node) => !knownNodeIds.current.has(node.id));
    knownNodeIds.current = new Set(nodes.map((node) => node.id));
    if (settings.focusNew && added.length) focusNode(added.at(-1));
  }, [nodes, settings.focusNew]);

  useEffect(() => {
    const presetZoom = (event) => {
      let value = Number(event.detail?.zoom);
      if (!Number.isFinite(value) || value <= 0) return;
      if (value > 3) value /= 100;
      setZoom(clamp(value, 0.25, 2));
    };
    const presetTool = (event) => {
      if (['select', 'hand', 'draw'].includes(event.detail?.tool)) setTool(event.detail.tool);
    };
    window.addEventListener('radar-space:zoom', presetZoom);
    window.addEventListener('radar-space:tool', presetTool);
    return () => {
      window.removeEventListener('radar-space:zoom', presetZoom);
      window.removeEventListener('radar-space:tool', presetTool);
    };
  }, []);

  useEffect(() => {
    const onDown = (event) => {
      if (
        isEditing(event.target) ||
        event.target?.closest?.('[role="dialog"]') ||
        document.querySelector('[aria-modal="true"]')
      )
        return;
      if (event.code === 'Space') {
        event.preventDefault();
        setSpace(true);
      }
      if (event.key === 'Escape') {
        setMenu(null);
        setSearchOpen(false);
        setEditing(null);
        setSelectedNode?.(null);
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        if (selectedNode) {
          event.preventDefault();
          remove(typeof selectedNode === 'object' ? selectedNode.id : selectedNode);
        }
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'd' && selectedNode) {
        event.preventDefault();
        const node = nodesRef.current.find((item) => item.id === (selectedNode.id || selectedNode));
        if (node) duplicate(node);
      }
      if ((event.metaKey || event.ctrlKey) && (event.key === '+' || event.key === '=')) {
        event.preventDefault();
        setZoom((z) => clamp(z + 0.1, 0.25, 2));
      }
      if ((event.metaKey || event.ctrlKey) && event.key === '-') {
        event.preventDefault();
        setZoom((z) => clamp(z - 0.1, 0.25, 2));
      }
      if ((event.metaKey || event.ctrlKey) && event.key === '0') {
        event.preventDefault();
        resetView();
      }
    };
    const onUp = (event) => {
      if (event.code === 'Space') setSpace(false);
    };
    const onBlur = () => {
      setSpace(false);
      dragRef.current = null;
      setMoving(false);
    };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [selectedNode, setNodes, setSelectedNode]);

  useEffect(() => {
    const onMove = (event) => {
      const drag = dragRef.current;
      if (!drag) return;
      const dx = event.clientX - drag.startX,
        dy = event.clientY - drag.startY;
      if (drag.type === 'pan') setPan({ x: drag.panX + dx, y: drag.panY + dy });
      if (drag.type === 'node') {
        let x = drag.nodeX + dx / zoomRef.current,
          y = drag.nodeY + dy / zoomRef.current;
        if (settingsRef.current.snapToGrid) {
          x = Math.round(x / 20) * 20;
          y = Math.round(y / 20) * 20;
        }
        setNodes?.((all) => all.map((node) => (node.id === drag.id ? { ...node, x, y } : node)));
      }
      if (drag.type === 'draw') {
        const rect = worldRef.current?.getBoundingClientRect();
        if (!rect) return;
        const point = `${(event.clientX - rect.left) / zoomRef.current},${(event.clientY - rect.top) / zoomRef.current}`;
        setPaths((all) =>
          all.map((path) => (path.id === drag.id ? { ...path, points: `${path.points} ${point}` } : path)),
        );
      }
    };
    const onUp = () => {
      const drag = dragRef.current;
      if (drag?.type === 'node') remember('移动节点');
      if (drag?.type === 'draw') remember('绘制标记');
      dragRef.current = null;
      setMoving(false);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [setNodes]);

  useEffect(() => {
    const element = rootRef.current;
    const wheel = (event) => {
      if (viewMode !== 'canvas' || event.target.closest('button,input,textarea,.cv-menu,.cv-search,.cv-list,[data-native-scroll]')) return;
      event.preventDefault();
      if (event.ctrlKey || event.metaKey) setZoom((z) => clamp(z * Math.exp(-event.deltaY * 0.008), 0.25, 2));
      else setPan((p) => ({ x: p.x - event.deltaX, y: p.y - event.deltaY }));
    };
    element?.addEventListener('wheel', wheel, { passive: false });
    return () => element?.removeEventListener('wheel', wheel);
  }, [viewMode]);

  useEffect(() => {
    if (searchOpen) searchRef.current?.focus();
  }, [searchOpen]);
  useEffect(() => {
    const close = (event) => {
      if (!event.target.closest('.cv-toolgroup,.cv-controls,.cv-menu,.cv-node-actions')) setMenu(null);
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, []);

  const beginBackground = (event) => {
    if (event.target.closest('.cv-node,.cv-toolgroup,.cv-controls,.cv-search,.cv-minimap,.cv-list,.cv-menu')) return;
    if (event.button !== 0 && event.button !== 1) return;
    if (viewMode !== 'canvas') return;
    event.preventDefault();
    setMenu(null);
    setSelectedNode?.(null);
    if (tool === 'draw' && !space && event.button === 0) {
      const rect = worldRef.current.getBoundingClientRect(),
        id = crypto.randomUUID();
      setPaths((all) => [
        ...all,
        { id, points: `${(event.clientX - rect.left) / zoom},${(event.clientY - rect.top) / zoom}` },
      ]);
      dragRef.current = { type: 'draw', id };
      return;
    }
    dragRef.current = { type: 'pan', startX: event.clientX, startY: event.clientY, panX: pan.x, panY: pan.y };
    setMoving(true);
  };
  const beginNode = (event, node) => {
    if (event.button !== 0 || event.target.closest('button,input,textarea,a,video,audio,summary,details,[data-native-scroll],[contenteditable]')) return;
    if (space || tool === 'hand') {
      event.stopPropagation();
      dragRef.current = { type: 'pan', startX: event.clientX, startY: event.clientY, panX: pan.x, panY: pan.y };
      setMoving(true);
      return;
    }
    event.stopPropagation();
    setSelectedNode?.(node.id);
    dragRef.current = {
      type: 'node',
      id: node.id,
      startX: event.clientX,
      startY: event.clientY,
      nodeX: node.x || 0,
      nodeY: node.y || 0,
    };
  };
  const openMenu = (name) => setMenu((current) => (current === name ? null : name));
  const filteredNodes = nodes.filter((node) =>
    `${node.name} ${node.description} ${node.type}`.toLowerCase().includes(query.toLowerCase()),
  );
  const selectedId = typeof selectedNode === 'object' ? selectedNode?.id : selectedNode;
  const ToolIcon = tool === 'hand' ? Hand : tool === 'draw' ? PenLine : MousePointer2;

  const renderNode = (node, list = false) => {
    const Icon = typeIcon(node.type),
      selected = selectedId === node.id;
    return (
      <article
        key={node.id}
        className={`cv-node cv-node-${node.type} ${selected ? 'cv-node-selected' : ''} ${list ? 'cv-list-node' : ''}`}
        style={
          list
            ? undefined
            : { left: node.x || 0, top: node.y || 0, width: node.width || (node.type === 'note' ? 320 : 400) }
        }
        onPointerDown={(event) => !list && beginNode(event, node)}
        onClick={(event) => {
          event.stopPropagation();
          selectNode(node);
        }}
      >
        {selected && !list && (
          <div
            className="cv-node-actions"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            <IconButton title="复制展示节点" onClick={() => duplicate(node)}>
              <Copy size={15} />
            </IconButton>
            <IconButton title="从画布移除" onClick={() => remove(node.id)}>
              <Trash2 size={15} />
            </IconButton>
          </div>
        )}
        <div className="cv-node-heading">
          <Icon size={17} />
          <span onDoubleClick={() => ['note', 'frame'].includes(node.type) && setEditing(`${node.id}:name`)}>
            {editing === `${node.id}:name` ? (
              <input
                autoFocus
                defaultValue={node.name}
                aria-label="节点标题"
                onPointerDown={(e) => e.stopPropagation()}
                maxLength={500}
                onBlur={(e) => {
                  updateNode(node.id, { name: e.target.value.trim() || '未命名' });
                  setEditing(null);
                }}
                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
              />
            ) : (
              node.name || '未命名'
            )}
          </span>
          {list && (
            <IconButton title="定位到画布" onClick={() => focusNode(node)}>
              <Maximize size={15} />
            </IconButton>
          )}
        </div>
        <div className="cv-node-body" style={node.type === 'frame' ? { minHeight: node.height || 220 } : undefined}>
          {renderContent && !['note', 'frame'].includes(node.type) ? renderContent(node, list) : <>
          {editing === `${node.id}:description` ? (
            <textarea
              className="cv-node-editor"
              autoFocus
              defaultValue={node.description || ''}
              aria-label="研究笔记"
              maxLength={12000}
              onPointerDown={(e) => e.stopPropagation()}
              onBlur={(e) => {
                updateNode(node.id, { description: e.target.value });
                setEditing(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape' || ((e.ctrlKey || e.metaKey) && e.key === 'Enter')) e.currentTarget.blur();
              }}
            />
          ) : (
            (node.description || !node.src) && (
              <button
                className="cv-node-description"
                onClick={(event) => {
                  event.stopPropagation();
                  if (settings.openInput === false) selectNode(node);
                  else setEditing(`${node.id}:description`);
                }}
                onDoubleClick={() => ['note', 'frame'].includes(node.type) && setEditing(`${node.id}:description`)}
                title={settings.openInput === false ? '双击编辑笔记' : '编辑笔记'}
              >
                {promptText(node.description || (node.type === 'frame' ? 'Frame' : '点击添加研究笔记…'))}
              </button>
            )
          )}
                  </>}
        </div>
      </article>
    );
  };

  return (
    <section
      ref={rootRef}
      className={`oii-canvas ${collapsed ? 'cv-chat-collapsed' : ''} cv-tool-${tool} ${space || moving ? 'cv-grabbing' : ''} ${settings.showGrid === false ? 'cv-no-grid' : ''}`}
      aria-label="研究画布"
      onPointerDown={beginBackground}
      onContextMenu={(event) => event.preventDefault()}
      style={{ '--cv-grid-size': `${38 * zoom}px`, '--cv-grid-x': `${pan.x}px`, '--cv-grid-y': `${pan.y}px` }}
    >
      {viewMode === 'canvas' ? (
        <>
          <div
            ref={worldRef}
            className="cv-world"
            style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
          >
            {nodes.map((node) => renderNode(node))}
            {paths.length > 0 && (
              <svg className="cv-drawing-layer" aria-label="Canvas drawings">
                {paths.map((path) => (
                  <polyline
                    key={path.id}
                    points={path.points}
                    fill="none"
                    stroke="#ed35bb"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ))}
              </svg>
            )}
          </div>
          {!nodes.length && (
            <div className="cv-empty">
              <Frame size={38} />
              <h2>让值得研究的信号，出现在这里。</h2>
              <p>从左侧提问，或点击上方研究方式，让雷达 Agent 搜索并整理证据。</p>
              <button
                onClick={() => {
                  action('researchWorkflow', { workflow: 'top' });
                  remember('已请求热点研究');
                }}
              >
                <Plus size={16} /> 开始发现热点
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="cv-list">
          <div className="cv-list-header">
            <h2>
              研究结果 <span>{nodes.length}</span>
            </h2>
            <div className="cv-list-search">
              <Search size={16} />
              <input placeholder="搜索研究画布" value={query} onChange={(event) => setQuery(event.target.value)} />
            </div>
          </div>
          <div className="cv-list-grid">{filteredNodes.map((node) => renderNode(node, true))}</div>
          {!filteredNodes.length && <p className="cv-no-results">没有匹配的研究内容。</p>}
        </div>
      )}

      {searchOpen && (
        <div className="cv-search">
          <div className="cv-search-input">
            <Search size={17} />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索研究画布…"
              aria-label="搜索研究画布"
            />
            <IconButton title="关闭搜索" onClick={() => setSearchOpen(false)}>
              <X size={16} />
            </IconButton>
          </div>
          <div className="cv-search-results">
            {filteredNodes.length ? (
              filteredNodes.map((node) => {
                const Icon = typeIcon(node.type);
                return (
                  <button key={node.id} onClick={() => focusNode(node)}>
                    <Icon size={17} />
                    <span>{node.name}</span>
                    <span className="cv-result-type">{node.type}</span>
                  </button>
                );
              })
            ) : (
              <p>没有匹配的研究内容。</p>
            )}
          </div>
        </div>
      )}

      <div className="cv-toolgroup" role="toolbar" aria-label="画布工具" onPointerDown={(e) => e.stopPropagation()}>
        <div className="cv-menu-anchor">
          <IconButton
            className={`cv-add-button ${menu === 'add' ? 'cv-active' : ''}`}
            title="添加研究动作或笔记"
            aria-expanded={menu === 'add'}
            onClick={() => openMenu('add')}
          >
            <Plus size={20} />
          </IconButton>
          {menu === 'add' && (
            <div className="cv-menu cv-add-menu">
              {NODE_TYPES.map(([id, label, Icon]) => (
                <button
                  key={id}
                  onClick={() => {
                    action('addNode', { type: id });
                    remember(`Added ${label.toLowerCase()}`);
                    setMenu(null);
                  }}
                >
                  <Icon size={17} />
                  <span>{label}</span>
                  <span className="cv-shortcut">+</span>
                </button>
              ))}
              <div className="cv-menu-divider" />
              {[
                ...RADAR_WORKFLOWS.map(w => [w.name, Search]),
              ].map(([name, Icon]) => (
                <button
                  key={name}
                  onClick={() => {
                    action('researchWorkflow', { workflow: RADAR_WORKFLOWS.find(w => w.name === name)?.id || 'top' });
                    setMenu(null);
                  }}
                >
                  <Icon size={17} />
                  <span>{name}</span>
                  
                </button>
              ))}
              <div className="cv-menu-divider" />
              <button
                onClick={() => {
                  action('uploadReference');
                  setMenu(null);
                }}
              >
                <Upload size={17} />
                <span>上传参考图片</span>
              </button>
              <button
                onClick={() => {
                  action('openHistory');
                  setMenu(null);
                }}
              >
                <LayoutGrid size={17} />
                <span>研究记录</span>
              </button>
            </div>
          )}
        </div>
        <IconButton
          title="搜索研究画布"
          className={searchOpen ? 'cv-active' : ''}
          onClick={() => {
            setSearchOpen((s) => !s);
            setQuery('');
          }}
        >
          <Search size={19} />
        </IconButton>
        <div className="cv-menu-anchor">
          <IconButton
            title="画布操作记录"
            className={menu === 'history' ? 'cv-active' : ''}
            onClick={() => openMenu('history')}
          >
            <History size={19} />
          </IconButton>
          {menu === 'history' && (
            <div className="cv-menu cv-history">
              <h3>画布操作记录</h3>
              {history.length ? (
                history.map((entry) => (
                  <div key={entry.id}>
                    <History size={14} />
                    <span>{entry.label}</span>
                    <time>{entry.time}</time>
                  </div>
                ))
              ) : (
                <p>节点移动、复制与移除会显示在这里。</p>
              )}
            </div>
          )}
        </div>
        <div className="cv-menu-anchor">
          <button
            className={`cv-select-tool ${tool !== 'select' ? 'cv-active' : ''}`}
            aria-label="选择工具"
            aria-expanded={menu === 'tools'}
            title="选择工具"
            onClick={() => openMenu('tools')}
          >
            <ToolIcon size={19} />
            <ChevronDown size={11} />
          </button>
          {menu === 'tools' && (
            <div className="cv-menu cv-tools-menu">
              {[
                ['select', '选择', MousePointer2, 'V'],
                ['hand', '抓手', Hand, 'Space'],
                ['draw', '自由绘制', PenLine, ''],
              ].map(([id, label, Icon, key]) => (
                <button
                  key={id}
                  onClick={() => {
                    setTool(id);
                    setMenu(null);
                  }}
                >
                  <Icon size={17} />
                  <span>{label}</span>
                  {tool === id ? <Check size={14} /> : <span className="cv-shortcut">{key}</span>}
                </button>
              ))}
              {paths.length > 0 && (
                <>
                  <div className="cv-menu-divider" />
                  <button onClick={() => setPaths([])}>
                    <Trash2 size={17} />
                    <span>清除绘制</span>
                  </button>
                </>
              )}
            </div>
          )}
        </div>
        <span className="cv-toolbar-divider" />
        <div className="cv-view-toggle" role="group" aria-label="展示方式">
          <IconButton
            title="画布展示"
            className={viewMode === 'canvas' ? 'cv-view-active' : ''}
            aria-pressed={viewMode === 'canvas'}
            onClick={() => setViewMode?.('canvas')}
          >
            <Frame size={18} />
          </IconButton>
          <IconButton
            title="列表展示"
            className={viewMode === 'list' ? 'cv-view-active' : ''}
            aria-pressed={viewMode === 'list'}
            onClick={() => setViewMode?.('list')}
          >
            <LayoutGrid size={17} />
          </IconButton>
        </div>
      </div>

      <div
        className="cv-controls"
        role="toolbar"
        aria-label="画布设置与缩放"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="cv-menu-anchor">
          <IconButton
            title="画布设置"
            className={menu === 'settings' ? 'cv-active' : ''}
            onClick={() => openMenu('settings')}
          >
            <Settings2 size={17} />
          </IconButton>
          {menu === 'settings' && (
            <div className="cv-menu cv-settings-menu">
              <h3>画布设置</h3>
              <button onClick={() => action('updateSettings', { showGrid: settings.showGrid === false })}>
                <Frame size={16} />
                <span>显示网点</span>
                {settings.showGrid !== false && <Check size={15} />}
              </button>
              <button onClick={() => action('updateSettings', { snapToGrid: !settings.snapToGrid })}>
                <LayoutGrid size={16} />
                <span>吸附网格</span>
                {settings.snapToGrid && <Check size={15} />}
              </button>
              <div className="cv-menu-divider" />
              <button
                onClick={() => {
                  action('openSettings');
                  setMenu(null);
                }}
              >
                <Settings2 size={16} />
                <span>偏好设置</span>
              </button>
            </div>
          )}
        </div>
        <IconButton
          title="自由绘制"
          className={tool === 'draw' ? 'cv-active' : ''}
          onClick={() => setTool((t) => (t === 'draw' ? 'select' : 'draw'))}
        >
          <PenLine size={17} />
        </IconButton>
        <IconButton
          title="小地图"
          className={miniOpen ? 'cv-active' : ''}
          aria-expanded={miniOpen}
          onClick={() => setMiniOpen((s) => !s)}
        >
          <Map size={17} />
        </IconButton>
        <IconButton title="缩小" onClick={() => setZoom((z) => clamp(z - 0.1, 0.25, 2))}>
          <Minus size={17} />
        </IconButton>
        <div className="cv-menu-anchor">
          <button
            className="cv-zoom"
            title="Zoom options"
            aria-expanded={menu === 'zoom'}
            onClick={() => openMenu('zoom')}
          >
            {Math.round(zoom * 100)}%
          </button>
          {menu === 'zoom' && (
            <div className="cv-menu cv-zoom-menu">
              {[0.5, 0.75, 1, 1.25, 1.5, 2].map((value) => (
                <button
                  key={value}
                  onClick={() => {
                    setZoom(value);
                    setMenu(null);
                  }}
                >
                  <span>{value * 100}%</span>
                  {Math.abs(zoom - value) < 0.01 && <Check size={14} />}
                </button>
              ))}
              <div className="cv-menu-divider" />
              <button onClick={resetView}>
                <RotateCcw size={15} />
                <span>重置视图</span>
              </button>
            </div>
          )}
        </div>
        <IconButton title="放大" onClick={() => setZoom((z) => clamp(z + 0.1, 0.25, 2))}>
          <Plus size={18} />
        </IconButton>
      </div>
      {tool === 'draw' && paths.length > 0 && (
        <div className="cv-draw-tools">
          <IconButton title="Undo drawing" onClick={() => setPaths((p) => p.slice(0, -1))}>
            <Undo2 size={17} />
          </IconButton>
          <IconButton title="清除绘制" onClick={() => setPaths([])}>
            <Trash2 size={17} />
          </IconButton>
        </div>
      )}
      {miniOpen && (
        <div className="cv-minimap">
          <div>
            <span>Canvas overview</span>
            <IconButton title="Close minimap" onClick={() => setMiniOpen(false)}>
              <X size={14} />
            </IconButton>
          </div>
          <svg viewBox="0 0 240 132" aria-label="小地图 nodes">
            {nodes.map((node, i) => (
              <g
                key={node.id}
                role="button"
                tabIndex={0}
                aria-label={`Locate ${node.name}`}
                onClick={() => focusNode(node)}
                onKeyDown={(e) => e.key === 'Enter' && focusNode(node)}
              >
                <rect
                  x={clamp((node.x || 0) / 8 + 20, 4, 200)}
                  y={clamp((node.y || 0) / 8 + 12, 4, 100)}
                  width="40"
                  height="26"
                  rx="3"
                  fill={selectedId === node.id ? '#ed35bb' : '#4d4d4d'}
                />
                <text
                  x={clamp((node.x || 0) / 8 + 22, 6, 202)}
                  y={clamp((node.y || 0) / 8 + 29, 21, 117)}
                  fontSize="5"
                  fill="#ddd"
                >
                  {(node.name || node.type).slice(0, 12)}
                </text>
              </g>
            ))}
            <rect x="10" y="6" width="220" height="118" rx="3" fill="none" stroke="#aaa" strokeWidth=".5" />
          </svg>
        </div>
      )}
    </section>
  );
}
