// ============================================================
// Main App — APG Price Scan
// ============================================================

const { useState: useStateA, useEffect: useEffectA, useMemo: useMemoA } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "light",
  "density": "comfortable",
  "accent": "navy",
  "navOpen": true
}/*EDITMODE-END*/;

function App() {
  // Routing — simple internal nav
  const [view, setView] = useStateA('dashboard'); // 'dashboard' | 'detail'
  const [selectedJobId, setSelectedJobId] = useStateA(null);
  const [jobs, setJobs] = useStateA(JOBS);
  const [feed] = useStateA(FEED);
  const [mobileNav, setMobileNav] = useStateA('dashboard');

  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);

  // Apply tweaks to HTML root
  useEffectA(() => {
    const html = document.documentElement;
    if (t.theme === 'dark') html.setAttribute('data-apg-theme', 'dark');
    else html.removeAttribute('data-apg-theme');
    html.setAttribute('data-density', t.density);
    html.setAttribute('data-accent', t.accent);
  }, [t.theme, t.density, t.accent]);

  const selectedJob = useMemoA(() => jobs.find(j => j.id === selectedJobId), [jobs, selectedJobId]);

  const openJob = (id) => {
    setSelectedJobId(id);
    setView('detail');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const goBack = () => setView('dashboard');

  const updateJob = (patch) => {
    setJobs(prev => prev.map(j => j.id === selectedJobId
      ? { ...j, ...patch, query: patch.query ? { ...j.query, ...patch.query } : j.query, notify: patch.notify ? { ...j.notify, ...patch.notify } : j.notify }
      : j));
  };

  const deleteJob = () => {
    if (!confirm('Xóa job này?')) return;
    setJobs(prev => prev.filter(j => j.id !== selectedJobId));
    goBack();
  };

  const runNow = () => {
    // Visual ping — mock
    setJobs(prev => prev.map(j => j.id === selectedJobId ? { ...j, lastStatus: 'success' } : j));
  };

  return (
    <div className="app">
      <Sidebar
        view={view}
        jobs={jobs}
        onNav={(v) => { setView(v); setSelectedJobId(null); }}
        onCreate={() => alert('Hộp thoại tạo job sẽ mở ở đây')}
      />
      <main className="main">
        <TopBar t={t} setTweak={setTweak}/>

        {view === 'dashboard' && (
          <Dashboard
            jobs={jobs}
            feed={feed}
            onOpenJob={openJob}
            onCreate={() => alert('Hộp thoại tạo job sẽ mở ở đây')}/>
        )}

        {view === 'detail' && selectedJob && (
          <JobDetail
            job={selectedJob}
            onBack={goBack}
            onUpdate={updateJob}
            onDelete={deleteJob}
            onRunNow={runNow}/>
        )}
      </main>

      {/* Mobile bottom tab bar */}
      <nav className="mobile-tabbar">
        <button className={`tab ${view === 'dashboard' ? 'active' : ''}`} onClick={() => setView('dashboard')}>
          <span className="ico"><Icon name="dashboard" size={18}/></span>
          <span>Dashboard</span>
        </button>
        <button className={`tab ${view === 'detail' && selectedJob ? 'active' : ''}`}>
          <span className="ico"><Icon name="jobs" size={18}/></span>
          <span>Jobs</span>
        </button>
        <button className="tab">
          <span className="ico"><Icon name="history" size={18}/></span>
          <span>History</span>
        </button>
        <button className="tab">
          <span className="ico"><Icon name="settings" size={18}/></span>
          <span>Settings</span>
        </button>
      </nav>

      <TweaksPanel title="Tweaks">
        <TweakSection label="Chủ đề">
          <TweakRadio
            label="Theme"
            value={t.theme}
            options={[
              { label: 'Sáng', value: 'light' },
              { label: 'Tối', value: 'dark' },
            ]}
            onChange={(v) => setTweak('theme', v)}/>
          <TweakSelect
            label="Accent color"
            value={t.accent}
            options={[
              { label: 'Navy (mặc định)', value: 'navy' },
              { label: 'Emerald', value: 'emerald' },
              { label: 'Copper', value: 'copper' },
              { label: 'Violet', value: 'violet' },
            ]}
            onChange={(v) => setTweak('accent', v)}/>
        </TweakSection>
        <TweakSection label="Mật độ thông tin">
          <TweakRadio
            label="Density"
            value={t.density}
            options={[
              { label: 'Thoáng', value: 'comfortable' },
              { label: 'Đặc', value: 'compact' },
            ]}
            onChange={(v) => setTweak('density', v)}/>
        </TweakSection>
      </TweaksPanel>
    </div>
  );
}

// ─── Sidebar ─────────────────────────────────────────────
function Sidebar({ view, jobs, onNav, onCreate }) {
  const enabledCount = jobs.filter(j => j.enabled).length;
  const errorCount = jobs.filter(j => j.lastStatus === 'error').length;

  return (
    <aside className="sidebar desktop-only">
      <div className="sidebar-brand">
        <div className="plane-mark">✈</div>
        <div className="brand-text">
          <span className="top">TAN PHU APG</span>
          <span className="bot">Price Scan</span>
        </div>
      </div>

      <nav className="sidebar-nav">
        <div className="nav-section">Operations</div>
        <button className={`nav-item ${view === 'dashboard' ? 'active' : ''}`} onClick={() => onNav('dashboard')}>
          <span className="ico"><Icon name="dashboard" size={16}/></span>
          Dashboard
        </button>
        <button className={`nav-item ${view === 'jobs' ? 'active' : ''}`} onClick={() => onNav('dashboard')}>
          <span className="ico"><Icon name="jobs" size={16}/></span>
          Jobs
          <span className="nav-count">{enabledCount}/{jobs.length}</span>
        </button>
        <button className="nav-item">
          <span className="ico"><Icon name="history" size={16}/></span>
          History
        </button>
        <button className="nav-item">
          <span className="ico"><Icon name="bell" size={16}/></span>
          Notifications
          {errorCount > 0 && <span className="nav-count" style={{ color: '#e88', background: 'rgba(232,76,58,0.18)' }}>{errorCount}</span>}
        </button>

        <div className="nav-section">Tài khoản Nam Thanh</div>
        <button className="nav-item">
          <span className="ico"><Icon name="plane" size={16}/></span>
          Session
        </button>
        <button className="nav-item">
          <span className="ico"><Icon name="settings" size={16}/></span>
          Settings
        </button>
      </nav>

      <div className="sidebar-footer">
        <div className="avatar">TA</div>
        <div className="who">
          <span className="name">tanphuapg</span>
          <span>localhost:3100</span>
        </div>
      </div>
    </aside>
  );
}

// ─── Top bar ─────────────────────────────────────────────
function TopBar({ t, setTweak }) {
  const [q, setQ] = useStateA('');
  return (
    <div className="topbar">
      <div className="topbar-search">
        <Icon name="search" size={14} color="var(--apg-text-muted)"/>
        <input
          placeholder="Tìm job theo tên, chuyến (VD: VJ125), tuyến (HAN-SGN)..."
          value={q}
          onChange={(e) => setQ(e.target.value)}/>
        <span className="kbd">⌘K</span>
      </div>
      <div className="topbar-status">
        <span className="eyebrow desktop-only">Backend</span>
        <span className="health-chip">
          <span className="dot"/>
          Online · localhost:3100
        </span>
        <button className="icon-btn" onClick={() => setTweak('theme', t.theme === 'dark' ? 'light' : 'dark')} title="Đổi sáng/tối">
          <Icon name={t.theme === 'dark' ? 'sun' : 'moon'} size={15}/>
        </button>
        <button className="icon-btn" title="Bật/tắt Tweaks">
          <Icon name="settings" size={15}/>
        </button>
      </div>
    </div>
  );
}

// ─── Mount ───────────────────────────────────────────────
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App/>);
