// ============================================================
// Shared UI components for APG Price Scan
// ============================================================

const { useState, useEffect, useRef, useMemo } = React;

// ─── Inline SVG icons ────────────────────────────────────
function Icon({ name, size = 16, color = 'currentColor' }) {
  const stroke = color;
  const sw = 1.75;
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke, strokeWidth: sw, strokeLinecap: 'round', strokeLinejoin: 'round' };
  switch (name) {
    case 'dashboard': return (
      <svg {...common}>
        <rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/>
        <rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>
      </svg>);
    case 'jobs': return (
      <svg {...common}>
        <path d="M3 7h18M3 12h18M3 17h18"/>
        <circle cx="6" cy="7" r="1.2" fill={stroke}/>
        <circle cx="6" cy="12" r="1.2" fill={stroke}/>
        <circle cx="6" cy="17" r="1.2" fill={stroke}/>
      </svg>);
    case 'history': return (
      <svg {...common}>
        <circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>
      </svg>);
    case 'bell': return (
      <svg {...common}>
        <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>
      </svg>);
    case 'settings': return (
      <svg {...common}>
        <circle cx="12" cy="12" r="3"/>
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
      </svg>);
    case 'plane': return (
      <svg {...common}>
        <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.2.6-.6.5-1.1z"/>
      </svg>);
    case 'play': return <svg {...common}><polygon points="6 4 20 12 6 20 6 4" fill={stroke}/></svg>;
    case 'pause': return <svg {...common}><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>;
    case 'edit': return <svg {...common}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>;
    case 'trash': return <svg {...common}><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>;
    case 'plus': return <svg {...common}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>;
    case 'search': return <svg {...common}><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>;
    case 'arrowLeft': return <svg {...common}><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>;
    case 'arrowUp': return <svg {...common}><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>;
    case 'arrowDown': return <svg {...common}><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>;
    case 'refresh': return <svg {...common}><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>;
    case 'check': return <svg {...common}><polyline points="20 6 9 17 4 12"/></svg>;
    case 'x': return <svg {...common}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>;
    case 'sun': return <svg {...common}><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>;
    case 'moon': return <svg {...common}><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>;
    case 'menu': return <svg {...common}><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>;
    case 'eye': return <svg {...common}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>;
    case 'send': return <svg {...common}><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2" fill={stroke} fillOpacity="0.15"/></svg>;
    default: return <svg {...common}><circle cx="12" cy="12" r="3"/></svg>;
  }
}

// ─── Sparkline ───────────────────────────────────────────
function Sparkline({ data, width = 100, height = 28, color, fill = true }) {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const step = width / (data.length - 1);
  const points = data.map((v, i) => {
    const x = i * step;
    const y = height - ((v - min) / range) * height;
    return [x, y];
  });
  const path = 'M ' + points.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L ');
  const area = path + ` L ${width} ${height} L 0 ${height} Z`;
  const lineColor = color || 'currentColor';
  const id = useMemo(() => 'spark-' + Math.random().toString(36).slice(2, 8), []);
  return (
    <svg width={width} height={height} style={{ display: 'block', color: lineColor }}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.25"/>
          <stop offset="100%" stopColor="currentColor" stopOpacity="0"/>
        </linearGradient>
      </defs>
      {fill && <path d={area} fill={`url(#${id})`}/>}
      <path d={path} stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

// ─── Ring progress (success rate) ───────────────────────
function Ring({ percent, size = 44, stroke = 4 }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const off = c - (percent / 100) * c;
  const color = percent >= 95 ? 'var(--apg-success)' : percent >= 85 ? 'var(--apg-warning)' : 'var(--apg-danger)';
  return (
    <div className="stat-ring">
      <svg width={size} height={size}>
        <circle cx={size/2} cy={size/2} r={r} stroke="var(--apg-bg-surface-soft)" strokeWidth={stroke} fill="none"/>
        <circle cx={size/2} cy={size/2} r={r} stroke={color} strokeWidth={stroke} fill="none"
          strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}/>
      </svg>
      <div className="ring-text">{percent.toFixed(0)}%</div>
    </div>
  );
}

// ─── Route pill (FROM → TO) ─────────────────────────────
function RoutePill({ from, to, date }) {
  return (
    <div className="route-pill">
      <span className="from">{from}</span>
      <span className="line"/>
      <span className="to">{to}</span>
      {date && <span className="date">· {date}</span>}
    </div>
  );
}

// ─── Channel chip (icon-only) ───────────────────────────
function ChannelChip({ channel }) {
  return (
    <div className={`chan-chip ${channel}`} title={channel}>
      {channel === 'zalo' ? 'Z' : <Icon name="send" size={13}/>}
    </div>
  );
}

// ─── Price chart (full SVG, with crosshair) ─────────────
function PriceChart({ history, height = 260 }) {
  const containerRef = useRef(null);
  const [width, setWidth] = useState(800);
  const [hover, setHover] = useState(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) setWidth(e.contentRect.width);
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  if (!history || history.length < 2) return <div className="empty">Chưa đủ dữ liệu</div>;

  const padL = 56, padR = 56, padT = 20, padB = 30;
  const w = width;
  const h = height;
  const innerW = Math.max(100, w - padL - padR);
  const innerH = h - padT - padB;

  const prices = history.map(p => p.price);
  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  const rngP = (maxP - minP) || 1;
  const padding = rngP * 0.15;
  const yMin = minP - padding;
  const yMax = maxP + padding;

  const seats = history.map(p => p.seat);
  const maxSeat = Math.max(9, ...seats);

  const xStep = innerW / (history.length - 1);
  const points = history.map((p, i) => {
    const x = padL + i * xStep;
    const y = padT + (1 - (p.price - yMin) / (yMax - yMin)) * innerH;
    return { x, y, ...p, i };
  });
  const seatPoints = history.map((p, i) => {
    const x = padL + i * xStep;
    const y = padT + (1 - p.seat / maxSeat) * innerH;
    return { x, y, ...p, i };
  });

  const linePath = 'M ' + points.map(p => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' L ');
  const areaPath = linePath + ` L ${points[points.length-1].x} ${padT + innerH} L ${points[0].x} ${padT + innerH} Z`;
  const seatPath = 'M ' + seatPoints.map(p => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' L ');

  // grid lines
  const gridSteps = 4;
  const gridLines = [];
  for (let i = 0; i <= gridSteps; i++) {
    const y = padT + (i / gridSteps) * innerH;
    const v = yMax - (i / gridSteps) * (yMax - yMin);
    gridLines.push({ y, v });
  }

  // x ticks (every ~5 points)
  const xTicks = [];
  const tickEvery = Math.max(1, Math.ceil(history.length / 6));
  for (let i = 0; i < history.length; i += tickEvery) {
    xTicks.push(points[i]);
  }
  if (xTicks[xTicks.length - 1] !== points[points.length - 1]) xTicks.push(points[points.length - 1]);

  // mouse handler
  const onMove = (e) => {
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const idx = Math.round((x - padL) / xStep);
    const clamped = Math.max(0, Math.min(points.length - 1, idx));
    setHover(clamped);
  };

  const hoveredPoint = hover != null ? points[hover] : null;

  return (
    <div className="chart-container" ref={containerRef}>
      <svg width={w} height={h} className="chart-svg" onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        <defs>
          <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--apg-aviation-navy)" stopOpacity="0.22"/>
            <stop offset="100%" stopColor="var(--apg-aviation-navy)" stopOpacity="0"/>
          </linearGradient>
        </defs>

        {/* grid lines */}
        {gridLines.map((g, i) => (
          <g key={i}>
            <line x1={padL} y1={g.y} x2={padL + innerW} y2={g.y}
              stroke="var(--apg-border-soft)" strokeWidth="1" strokeDasharray="2 4"/>
            <text x={padL - 8} y={g.y + 4} fontSize="10" fill="var(--apg-text-muted)"
              fontFamily="JetBrains Mono, monospace" textAnchor="end">
              {Math.round(g.v / 1000)}k
            </text>
          </g>
        ))}

        {/* x ticks */}
        {xTicks.map((t, i) => (
          <text key={i} x={t.x} y={h - 10} fontSize="10" fill="var(--apg-text-muted)"
            fontFamily="JetBrains Mono, monospace" textAnchor="middle">
            {fmtTime(t.t)}
          </text>
        ))}

        {/* seat line (gold) */}
        <path d={seatPath} stroke="var(--apg-brand-gold)" strokeWidth="1.5" fill="none"
          strokeDasharray="3 3" opacity="0.7"/>
        {seatPoints.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="2" fill="var(--apg-brand-gold)" opacity="0.6"/>
        ))}

        {/* price area */}
        <path d={areaPath} fill="url(#priceGrad)"/>
        <path d={linePath} stroke="var(--apg-aviation-navy)" strokeWidth="2" fill="none"
          strokeLinecap="round" strokeLinejoin="round"/>

        {/* points */}
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={i === hover ? 5 : 2.5}
            fill="var(--apg-aviation-navy)" stroke="var(--apg-bg-surface)" strokeWidth={i === hover ? 2 : 0}/>
        ))}

        {/* hover crosshair */}
        {hoveredPoint && (
          <g>
            <line x1={hoveredPoint.x} y1={padT} x2={hoveredPoint.x} y2={padT + innerH}
              stroke="var(--apg-text-muted)" strokeWidth="1" strokeDasharray="3 3"/>
          </g>
        )}

        {/* right Y axis: seat */}
        <text x={padL + innerW + 8} y={padT + 4} fontSize="9" fill="var(--apg-brand-gold-hover)"
          fontFamily="Inter, sans-serif" fontWeight="700" letterSpacing="0.12em">
          GHẾ
        </text>
        {[maxSeat, 0].map((s, i) => (
          <text key={i} x={padL + innerW + 8} y={padT + (i === 0 ? 0 : innerH) + 4} fontSize="10"
            fill="var(--apg-brand-gold-hover)" fontFamily="JetBrains Mono, monospace">
            {s}
          </text>
        ))}
      </svg>

      {hoveredPoint && (
        <div className="chart-tooltip" style={{
          left: hoveredPoint.x,
          top: hoveredPoint.y - 4,
        }}>
          {fmtTime(hoveredPoint.t)} · {fmtVND(hoveredPoint.price)} ₫ · {hoveredPoint.seat} ghế
        </div>
      )}
    </div>
  );
}

// ─── Activity feed item ─────────────────────────────────
function FeedItem({ entry, onClick }) {
  const kindBadge = {
    sold:   <span className="delta-pill sold">SOLD</span>,
    down:   <span className="delta-pill down"><Icon name="arrowDown" size={10}/> giá</span>,
    up:     <span className="delta-pill up"><Icon name="arrowUp" size={10}/> giá</span>,
    seat:   <span className="delta-pill seat">ghế</span>,
    error:  <span className="badge danger">error</span>,
    scan:   <span className="badge success">scan</span>,
  }[entry.kind];

  return (
    <div className="feed-item" onClick={onClick} style={{ cursor: onClick ? 'pointer' : 'default' }}>
      <div className="feed-time">{fmtRel(entry.t)}</div>
      <div className="feed-body">
        <div className="feed-title">
          {kindBadge}
          <b>{entry.text}</b>
        </div>
        <div className="feed-desc">{entry.detail}</div>
      </div>
    </div>
  );
}

// ─── Change pill renderer ───────────────────────────────
function ChangePill({ ch }) {
  if (ch.type === 'price') {
    const isDown = ch.delta < 0;
    return (
      <span className={`delta-pill ${isDown ? 'down' : 'up'}`}>
        {isDown ? '↓' : '↑'} {Math.abs(ch.percent || 0)}%
      </span>
    );
  }
  if (ch.type === 'seat') {
    return <span className="delta-pill seat">ghế {ch.seatDelta > 0 ? '+' : ''}{ch.seatDelta}</span>;
  }
  if (ch.type === 'sold') return <span className="delta-pill sold">SOLD</span>;
  if (ch.type === 'new') return <span className="delta-pill new">NEW</span>;
  return <span className="delta-pill">{ch.type}</span>;
}

// Export
Object.assign(window, { Icon, Sparkline, Ring, RoutePill, ChannelChip, PriceChart, FeedItem, ChangePill });
