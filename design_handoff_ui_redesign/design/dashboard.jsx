// ============================================================
// Dashboard view — APG Price Scan
// ============================================================

const { useState: useStateD, useMemo: useMemoD } = React;

function Dashboard({ jobs, feed, onOpenJob, onCreate }) {
  const stats = useMemoD(() => computeStats(jobs), [jobs]);
  const [filter, setFilter] = useStateD('all');

  // Build sparkline data
  const scansSparkData = useMemoD(() => {
    const arr = [];
    for (let i = 0; i < 24; i++) {
      arr.push(5 + Math.round(Math.sin(i * 0.5) * 3 + Math.cos(i * 0.3) * 2.5 + Math.random() * 2 + 8));
    }
    return arr;
  }, []);

  const filteredJobs = useMemoD(() => {
    if (filter === 'enabled') return jobs.filter(j => j.enabled);
    if (filter === 'paused') return jobs.filter(j => !j.enabled);
    if (filter === 'low') return jobs.filter(j => j.seat <= 4);
    return jobs;
  }, [jobs, filter]);

  // For total card: enabled vs paused split
  const enabledPct = stats.total ? Math.round((stats.enabled / stats.total) * 100) : 0;

  return (
    <div className="page fade-in">
      {/* Header */}
      <div className="page-header">
        <div className="page-title">
          <div className="crumb">
            <span className="eyebrow">Operations</span>
            <span className="sep">·</span>
            <span>Real-time scan dashboard</span>
          </div>
          <h1>Tổng quan quét giá</h1>
        </div>
        <div className="page-actions">
          <button className="btn btn-ghost btn-sm">
            <Icon name="refresh" size={14}/> Auto-refresh 30s
          </button>
          <button className="btn btn-sm">
            <Icon name="bell" size={14}/> Test notify
          </button>
          <button className="btn btn-primary" onClick={onCreate}>
            <Icon name="plus" size={14}/> Job mới
          </button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="stats-grid">
        {/* TOTAL JOBS */}
        <div className="stat-card" style={{ '--accent': 'var(--apg-aviation-navy)', '--accent-soft': 'var(--apg-aviation-navy-soft)' }}>
          <div className="stat-head">
            <span className="stat-label">Tổng job</span>
            <span className="stat-icon"><Icon name="jobs" size={13}/></span>
          </div>
          <div className="stat-value">
            <span className="stat-num">{stats.total}</span>
            <span className="stat-unit">job</span>
          </div>
          <div className="stat-bar">
            <span style={{ width: `${enabledPct}%` }}/>
          </div>
          <div className="stat-foot">
            <span className="stat-sub">
              <b style={{ color: 'var(--apg-success)' }}>{stats.enabled} active</b> · {stats.paused} paused
            </span>
          </div>
        </div>

        {/* SCANS 24H */}
        <div className="stat-card" style={{ '--accent': 'var(--apg-success)', '--accent-soft': 'var(--apg-success-soft)' }}>
          <div className="stat-head">
            <span className="stat-label">Lượt quét / 24h</span>
            <span className="stat-icon"><Icon name="refresh" size={13}/></span>
          </div>
          <div className="stat-value">
            <span className="stat-num">{stats.totalScans}</span>
            <span className="stat-delta down">↓ 3.2%</span>
          </div>
          <div className="stat-foot">
            <span className="stat-sub">Trung bình 12/giờ</span>
            <div className="stat-spark" style={{ color: 'var(--apg-success)' }}>
              <Sparkline data={scansSparkData} width={86} height={26}/>
            </div>
          </div>
        </div>

        {/* NEXT RUN */}
        <div className="stat-card" style={{ '--accent': 'var(--apg-brand-gold)', '--accent-soft': 'var(--apg-brand-gold-soft)' }}>
          <div className="stat-head">
            <span className="stat-label">Quét kế tiếp</span>
            <span className="stat-icon"><Icon name="history" size={13}/></span>
          </div>
          <div className="stat-value">
            <span className="stat-num mono">{stats.next ? fmtRel(stats.next.nextRunAt) : '—'}</span>
          </div>
          <div className="stat-foot">
            <span className="stat-sub">
              {stats.next ? (
                <>
                  <b>{stats.next.query.flightNumber}</b> · {stats.next.query.from}→{stats.next.query.to}
                </>
              ) : 'không có job active'}
            </span>
          </div>
        </div>

        {/* NOTIFY HEALTH */}
        <div className="stat-card" style={{ '--accent': 'var(--apg-info)', '--accent-soft': 'var(--apg-info-soft)' }}>
          <div className="stat-head">
            <span className="stat-label">Notify health</span>
            <span className="stat-icon"><Icon name="bell" size={13}/></span>
          </div>
          <div className="stat-value">
            <span className="stat-num">{stats.successRate}<span style={{ fontSize: 18, fontWeight: 500 }}>%</span></span>
          </div>
          <div className="stat-foot">
            <span className="stat-sub">
              <b style={{ color: 'var(--apg-danger)' }}>{stats.fails24} fail</b> trong 24h · 2 retry OK
            </span>
            <Ring percent={stats.successRate}/>
          </div>
        </div>
      </div>

      {/* Routes board + Activity feed */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 360px', gap: 'var(--gap-lg)', alignItems: 'start' }} className="dashboard-cols">
        <RoutesBoard jobs={filteredJobs} filter={filter} setFilter={setFilter} onOpenJob={onOpenJob}/>
        <ActivityFeed feed={feed} onOpenJob={onOpenJob}/>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @media (max-width: 980px) {
          .dashboard-cols { grid-template-columns: 1fr !important; }
        }
      `}}/>
    </div>
  );
}

function RoutesBoard({ jobs, filter, setFilter, onOpenJob }) {
  return (
    <div className="panel">
      <div className="panel-head">
        <h3>
          <span className="live-dot"/>
          Active routes board
        </h3>
        <div className="tab-row">
          <button className={`tab ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>Tất cả</button>
          <button className={`tab ${filter === 'enabled' ? 'active' : ''}`} onClick={() => setFilter('enabled')}>Active</button>
          <button className={`tab ${filter === 'low' ? 'active' : ''}`} onClick={() => setFilter('low')}>Sắp hết ghế</button>
          <button className={`tab ${filter === 'paused' ? 'active' : ''}`} onClick={() => setFilter('paused')}>Paused</button>
        </div>
      </div>
      <div className="routes-board">
        <div className="board-head desktop-only">
          <div>Job · Flight</div>
          <div>Tuyến · Ngày bay</div>
          <div style={{ textAlign: 'right' }}>Giá hiện tại</div>
          <div>Số ghế</div>
          <div>Quét kế tiếp</div>
          <div style={{ textAlign: 'right' }}>Kênh</div>
        </div>
        {jobs.length === 0 && (
          <div className="empty">Không có job nào khớp filter này.</div>
        )}
        {jobs.map(job => <RouteRow key={job.id} job={job} onOpen={() => onOpenJob(job.id)}/>)}
      </div>
    </div>
  );
}

function RouteRow({ job, onOpen }) {
  const priceDelta = job.lastPrice - job.prevPrice;
  const pricePct = job.prevPrice ? ((priceDelta / job.prevPrice) * 100) : 0;
  const seat = job.seat;
  const seatPct = (seat / 9) * 100;
  const seatClass = seat === 0 ? 'sold' : seat <= 3 ? 'low' : '';
  const rowClass = !job.enabled ? 'paused' : (job.lastStatus === 'error' ? 'error' : '');
  const nextMs = job.nextRunAt ? Date.parse(job.nextRunAt) - Date.now() : null;
  const imminent = nextMs != null && nextMs > 0 && nextMs < 5 * 60 * 1000;

  return (
    <div className={`route-row ${rowClass}`} onClick={onOpen}>
      <div className="col-name">
        <span className="status-dot"/>
        <div className="nm">
          <div className="nm-job">{job.name}</div>
          <div className="nm-flight">
            {job.query.flightNumber} · {job.schedule.intervalValue}{job.schedule.intervalUnit === 'seconds' ? 's' : 'm'} · {job.notify.mode === 'on_change' ? 'on change' : 'every run'}
          </div>
        </div>
      </div>

      <div>
        <RoutePill from={job.query.from} to={job.query.to} date={fmtDate(job.query.date)}/>
      </div>

      <div className="price-cell">
        <div className="price">{fmtVND(job.lastPrice)} ₫</div>
        <div className={`price-delta ${priceDelta > 0 ? 'up' : priceDelta < 0 ? 'down' : 'flat'}`}>
          {priceDelta > 0 ? '↑' : priceDelta < 0 ? '↓' : '·'} {Math.abs(pricePct).toFixed(1)}%
        </div>
      </div>

      <div className="seat-cell">
        <div className={`seat-num ${seatClass}`}>
          {seat === 0 ? 'SOLD OUT' : `${seat} ghế`}
        </div>
        <div className="seat-bar">
          <span className={seatClass} style={{ width: `${Math.max(2, seatPct)}%` }}/>
        </div>
      </div>

      <div className={`next-cell ${imminent ? 'imminent' : ''}`}>
        {!job.enabled ? (
          <>
            <span className="next-time" style={{ color: 'var(--apg-text-muted)' }}>—</span>
            <span className="next-rel">paused</span>
          </>
        ) : (
          <>
            <span className="next-time">{fmtTime(job.nextRunAt)}</span>
            <span className="next-rel">{fmtRel(job.nextRunAt)}</span>
          </>
        )}
      </div>

      <div className="chan-cell">
        <ChannelChip channel={job.notify.channel}/>
        {job.notify.muted && <span className="badge warn">muted</span>}
        {job.lastStatus === 'error' && <span className="badge danger">err</span>}
      </div>
    </div>
  );
}

function ActivityFeed({ feed, onOpenJob }) {
  return (
    <div className="panel">
      <div className="panel-head">
        <h3>
          <span className="live-dot"/>
          Live activity
        </h3>
        <div className="panel-tools">
          <span className="eyebrow">last 1h</span>
        </div>
      </div>
      <div className="scroll-area">
        <div className="feed">
          {feed.map((entry, i) => (
            <FeedItem key={i} entry={entry} onClick={() => onOpenJob && onOpenJob(entry.jobId)}/>
          ))}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Dashboard });
