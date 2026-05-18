// ============================================================
// Job Detail view — APG Price Scan
// ============================================================

const { useState: useStateJD, useMemo: useMemoJD } = React;

function JobDetail({ job, onBack, onUpdate, onDelete, onRunNow }) {
  const [range, setRange] = useStateJD('24h');
  const [tab, setTab] = useStateJD('settings');

  if (!job) return null;

  const runs = useMemoJD(() => buildRuns(job), [job.id]);
  const history = useMemoJD(() => {
    const cutoff = {
      '1h': now => now - 60 * 60 * 1000,
      '24h': now => now - 24 * 60 * 60 * 1000,
      '7d': now => now - 7 * 24 * 60 * 60 * 1000,
      'all': () => 0,
    }[range](Date.now());
    return job.history.filter(p => p.t >= cutoff);
  }, [job, range]);

  const minP = Math.min(...history.map(h => h.price));
  const maxP = Math.max(...history.map(h => h.price));
  const avgP = Math.round(history.reduce((s, h) => s + h.price, 0) / (history.length || 1));
  const lastP = history[history.length - 1]?.price ?? job.lastPrice;
  const firstP = history[0]?.price ?? job.lastPrice;
  const trendPct = firstP ? ((lastP - firstP) / firstP) * 100 : 0;

  return (
    <div className="page fade-in">
      <div className="page-header">
        <div className="page-title">
          <div className="crumb">
            <a onClick={onBack}><Icon name="arrowLeft" size={12}/> Dashboard</a>
            <span className="sep">/</span>
            <span>Job detail</span>
          </div>
          <h1>{job.name}</h1>
        </div>
        <div className="page-actions">
          <button className="btn btn-sm" onClick={onRunNow}>
            <Icon name="play" size={12}/> Run now
          </button>
          <button className="btn btn-ghost btn-sm">
            <Icon name="bell" size={14}/>
          </button>
          <button className="btn btn-ghost btn-sm" style={{ color: 'var(--apg-danger)' }} onClick={onDelete}>
            <Icon name="trash" size={14}/>
          </button>
        </div>
      </div>

      {/* Hero — route + meta + toggle */}
      <div className="detail-hero">
        <div className="hero-route">
          <div className="hero-airport">
            <span className="iata">{job.query.from}</span>
            <span className="city">{AIRPORTS[job.query.from] || ''}</span>
          </div>
          <div className="route-line">
            <span className="plane">✈</span>
          </div>
          <div className="hero-airport">
            <span className="iata">{job.query.to}</span>
            <span className="city">{AIRPORTS[job.query.to] || ''}</span>
          </div>
        </div>
        <div className="hero-meta">
          <div className="hero-meta-row">
            <div className="hero-meta-item">
              <span className="label">Chuyến</span>
              <span className="value">{job.query.flightNumber}</span>
            </div>
            <div className="hero-meta-item">
              <span className="label">Ngày bay</span>
              <span className="value">{fmtDate(job.query.date)}</span>
            </div>
            <div className="hero-meta-item">
              <span className="label">Khung giờ</span>
              <span className="value">{job.query.departureTimeStart}–{job.query.departureTimeEnd}</span>
            </div>
            <div className="hero-meta-item">
              <span className="label">Quét mỗi</span>
              <span className="value">{job.schedule.intervalValue}{job.schedule.intervalUnit === 'seconds' ? 's' : 'm'}</span>
            </div>
            <div
              className={`toggle-pill ${job.enabled ? '' : 'off'}`}
              onClick={() => onUpdate({ enabled: !job.enabled })}
              role="button">
              {job.enabled ? 'Active' : 'Paused'}
            </div>
          </div>
        </div>
      </div>

      {/* Two-column main */}
      <div className="detail-grid">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--gap-lg)' }}>
          {/* Chart panel */}
          <div className="panel chart-panel">
            <div className="panel-head">
              <h3>Giá vé · Số ghế</h3>
              <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                <PriceSummary minP={minP} maxP={maxP} avgP={avgP} lastP={lastP} trendPct={trendPct}/>
                <div className="tab-row">
                  {['1h','24h','7d','all'].map(r => (
                    <button key={r} className={`tab ${range === r ? 'active' : ''}`}
                      onClick={() => setRange(r)}>
                      {r}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <PriceChart history={history} height={280}/>
            <div className="chart-legend">
              <div className="item">
                <span className="swatch" style={{ background: 'var(--apg-aviation-navy)' }}/>
                Giá (VND)
              </div>
              <div className="item">
                <span className="swatch" style={{ background: 'var(--apg-brand-gold)', borderTop: '1px dashed var(--apg-brand-gold)' }}/>
                Số ghế khả dụng
              </div>
              <div className="item" style={{ marginLeft: 'auto' }}>
                <span className="muted">{history.length} điểm dữ liệu · cập nhật {fmtRel(history[history.length-1]?.t)}</span>
              </div>
            </div>
          </div>

          {/* Recent runs table */}
          <div className="panel">
            <div className="panel-head">
              <h3>Lịch sử lần quét</h3>
              <div className="panel-tools">
                <button className="btn btn-ghost btn-sm">
                  <Icon name="refresh" size={12}/>
                </button>
                <span className="eyebrow">retention: 3 ngày</span>
              </div>
            </div>
            <div className="runs-table">
              <div className="row head">
                <div>Thời gian</div>
                <div>Trạng thái</div>
                <div>Giá / chỗ</div>
                <div>Thay đổi · Notify</div>
              </div>
              {runs.slice(0, 8).map(run => (
                <div key={run.id} className="row">
                  <div className="when">{fmtTime(run.startedAt)} · {fmtRel(run.startedAt)}</div>
                  <div>
                    {run.status === 'success'
                      ? <span className="badge success">success</span>
                      : <span className="badge danger">error</span>}
                  </div>
                  <div>
                    {run.status === 'success' ? (
                      <>
                        <span className="price-cell-inline">{fmtVND(run.price)} ₫</span>
                        <span className="muted" style={{ marginLeft: 8 }}>{run.matchCount} chuyến · {run.seat} ghế</span>
                      </>
                    ) : (
                      <span style={{ color: 'var(--apg-danger)', fontSize: 12 }}>{run.error}</span>
                    )}
                  </div>
                  <div className="changes-cell">
                    {run.changes.map((ch, i) => <ChangePill key={i} ch={ch}/>)}
                    {run.changes.length === 0 && run.status === 'success' && <span className="muted">không đổi</span>}
                    <span className={`badge ${run.notification.status === 'sent' ? 'info' : run.notification.status === 'failed' ? 'danger' : ''}`} style={{ marginLeft: 'auto' }}>
                      {run.notification.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Settings sidebar */}
        <SettingsCard job={job} onUpdate={onUpdate}/>
      </div>
    </div>
  );
}

function PriceSummary({ minP, maxP, avgP, lastP, trendPct }) {
  return (
    <div style={{ display: 'flex', gap: 18, alignItems: 'center' }}>
      <SummaryItem label="Min" value={`${fmtVND(minP)}`} color="var(--apg-success)"/>
      <SummaryItem label="Avg" value={`${fmtVND(avgP)}`}/>
      <SummaryItem label="Max" value={`${fmtVND(maxP)}`} color="var(--apg-danger)"/>
      <SummaryItem
        label="Trend"
        value={`${trendPct >= 0 ? '+' : ''}${trendPct.toFixed(1)}%`}
        color={trendPct >= 0 ? 'var(--apg-danger)' : 'var(--apg-success)'}/>
    </div>
  );
}

function SummaryItem({ label, value, color }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <span className="eyebrow" style={{ fontSize: 9 }}>{label}</span>
      <span className="mono tabular" style={{ fontSize: 12, fontWeight: 700, color: color || 'var(--apg-text-primary)' }}>{value}</span>
    </div>
  );
}

// ─── Settings sidebar ────────────────────────────────────
function SettingsCard({ job, onUpdate }) {
  return (
    <div className="panel settings-card">
      <div className="panel-head">
        <h3>Cấu hình job</h3>
        <button className="btn btn-ghost btn-sm">
          <Icon name="edit" size={12}/> Edit
        </button>
      </div>

      {/* Schedule */}
      <div className="settings-section">
        <h4>Lịch quét</h4>
        <div className="field-row-2">
          <div className="field-row">
            <label>Mỗi</label>
            <input defaultValue={job.schedule.intervalValue} type="number" min="1"/>
          </div>
          <div className="field-row">
            <label>Đơn vị</label>
            <select defaultValue={job.schedule.intervalUnit}>
              <option value="minutes">Phút</option>
              <option value="seconds">Giây</option>
            </select>
          </div>
        </div>
        <div className="switch-row">
          <div className="label-block">
            <span className="name">Lập lịch tự động</span>
            <span className="desc">Khi tắt, job vẫn lưu nhưng không chạy</span>
          </div>
          <div className={`switch ${job.enabled ? 'on' : ''}`}
            onClick={() => onUpdate({ enabled: !job.enabled })}/>
        </div>
      </div>

      {/* Notify */}
      <div className="settings-section">
        <h4>Thông báo</h4>
        <div className="channel-selector">
          <button
            className={`channel-card telegram ${job.notify.channel === 'telegram' ? 'active' : ''}`}
            onClick={() => onUpdate({ notify: { ...job.notify, channel: 'telegram' } })}>
            <div className="ch-row">
              <div className="ch-logo"><Icon name="send" size={13}/></div>
              <span className="ch-name">Telegram</span>
            </div>
            <span className="ch-status ready">● ready</span>
          </button>
          <button
            className={`channel-card zalo ${job.notify.channel === 'zalo' ? 'active' : ''}`}
            onClick={() => onUpdate({ notify: { ...job.notify, channel: 'zalo' } })}>
            <div className="ch-row">
              <div className="ch-logo"><b style={{ fontSize: 12, fontFamily: 'Inter' }}>Z</b></div>
              <span className="ch-name">Zalo (n8n)</span>
            </div>
            <span className="ch-status ready">● ready</span>
          </button>
        </div>

        <div className="field-row">
          <label>Khi nào gửi</label>
          <div className="seg">
            <button
              className={job.notify.mode === 'every_run' ? 'active' : ''}
              onClick={() => onUpdate({ notify: { ...job.notify, mode: 'every_run' } })}>
              Mọi lần quét
            </button>
            <button
              className={job.notify.mode === 'on_change' ? 'active' : ''}
              onClick={() => onUpdate({ notify: { ...job.notify, mode: 'on_change' } })}>
              Chỉ khi đổi
            </button>
          </div>
        </div>

        <div className="switch-row">
          <div className="label-block">
            <span className="name">Mute</span>
            <span className="desc">Vẫn quét + lưu, không gửi báo</span>
          </div>
          <div className={`switch ${job.notify.muted ? 'on' : ''}`}
            onClick={() => onUpdate({ notify: { ...job.notify, muted: !job.notify.muted } })}/>
        </div>

        <button className="btn btn-sm" style={{ width: '100%', justifyContent: 'center' }}>
          <Icon name="send" size={12}/> Gửi thông báo test
        </button>
      </div>

      {/* Query */}
      <div className="settings-section">
        <h4>Truy vấn</h4>
        <div className="field-row-2">
          <div className="field-row">
            <label>From</label>
            <input defaultValue={job.query.from} maxLength="3"/>
          </div>
          <div className="field-row">
            <label>To</label>
            <input defaultValue={job.query.to} maxLength="3"/>
          </div>
        </div>
        <div className="field-row">
          <label>Số hiệu chuyến</label>
          <input defaultValue={job.query.flightNumber}/>
        </div>
        <div className="field-row-2">
          <div className="field-row">
            <label>Time from</label>
            <input defaultValue={job.query.departureTimeStart} type="time"/>
          </div>
          <div className="field-row">
            <label>Time to</label>
            <input defaultValue={job.query.departureTimeEnd} type="time"/>
          </div>
        </div>
        <div className="switch-row">
          <div className="label-block">
            <span className="name">Chỉ chuyến thẳng</span>
            <span className="desc">Loại bỏ multi-leg</span>
          </div>
          <div className={`switch ${job.query.directOnly ? 'on' : ''}`}
            onClick={() => onUpdate({ query: { ...job.query, directOnly: !job.query.directOnly } })}/>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { JobDetail });
