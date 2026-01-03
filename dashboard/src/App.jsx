import { useState, useEffect, useRef } from 'react';
import './App.css';

// Custom Dropdown Component (Blocky Style)
function CustomDropdown({ options, value, onChange, placeholder }) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedOption = options?.find(opt => opt.value === value);

  return (
    <div className="custom-dropdown" ref={dropdownRef}>
      <button
        className={`custom-dropdown-trigger ${isOpen ? 'open' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        type="button"
      >
        <span>{selectedOption?.label || placeholder || 'Select...'}</span>
        <span className="dropdown-arrow">▼</span>
      </button>
      {isOpen && (
        <div className="custom-dropdown-menu">
          {options?.map(opt => (
            <div
              key={opt.value}
              className={`custom-dropdown-item ${value === opt.value ? 'selected' : ''}`}
              onClick={() => {
                onChange(opt.value);
                setIsOpen(false);
              }}
            >
              {opt.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const API_URL = 'http://localhost:3001/api';

// Login Screen Component
function LoginScreen({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    // Simulate login (placeholder for future implementation)
    setTimeout(() => {
      if (email && password) {
        onLogin({ email, name: email.split('@')[0] });
      } else {
        setError('Please enter email and password');
      }
      setLoading(false);
    }, 800);
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <h1>NEWS<span className="highlight">SCRAPER</span></h1>
          <p className="login-subtitle">Jupiter, FL News Dashboard</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="login-field">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="editor@localnews.com"
              autoComplete="email"
            />
          </div>

          <div className="login-field">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
            />
          </div>

          {error && <div className="login-error">{error}</div>}

          <button type="submit" className="login-button" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div className="login-footer">
          <a href="#forgot" onClick={(e) => e.preventDefault()}>Forgot password?</a>
          <span className="login-divider">•</span>
          <a href="#help" onClick={(e) => e.preventDefault()}>Need help?</a>
        </div>
      </div>

      <div className="login-branding">
        <span>Powered by LocalNews AI Agents</span>
      </div>
    </div>
  );
}

// Settings Panel Component
function SettingsPanel({ user, onClose, onLogout }) {
  return (
    <div className="settings-panel">
      <header className="settings-header">
        <h2>Settings</h2>
        <button className="btn-close" onClick={onClose}>×</button>
      </header>

      <div className="settings-content">
        <section className="settings-section">
          <h3>Account</h3>
          <div className="settings-item">
            <div className="settings-avatar">
              {user?.name?.charAt(0).toUpperCase() || 'U'}
            </div>
            <div className="settings-user-info">
              <span className="settings-user-name">{user?.name || 'User'}</span>
              <span className="settings-user-email">{user?.email || 'user@example.com'}</span>
            </div>
          </div>
          <button className="settings-link-btn">Edit Profile</button>
          <button className="settings-link-btn">Change Password</button>
        </section>

        <section className="settings-section">
          <h3>Notifications</h3>
          <div className="settings-toggle-row">
            <span>Email notifications</span>
            <label className="toggle">
              <input type="checkbox" defaultChecked />
              <span className="toggle-slider"></span>
            </label>
          </div>
          <div className="settings-toggle-row">
            <span>New article alerts</span>
            <label className="toggle">
              <input type="checkbox" defaultChecked />
              <span className="toggle-slider"></span>
            </label>
          </div>
          <div className="settings-toggle-row">
            <span>Agent run notifications</span>
            <label className="toggle">
              <input type="checkbox" />
              <span className="toggle-slider"></span>
            </label>
          </div>
        </section>

        <section className="settings-section">
          <h3>Integrations</h3>
          <div className="settings-integration">
            <div className="integration-icon google">G</div>
            <div className="integration-info">
              <span className="integration-name">Google Sheets</span>
              <span className="integration-status connected">Connected</span>
            </div>
            <button className="settings-link-btn">Configure</button>
          </div>
          <div className="settings-integration">
            <div className="integration-icon openai">AI</div>
            <div className="integration-info">
              <span className="integration-name">OpenAI API</span>
              <span className="integration-status connected">Connected</span>
            </div>
            <button className="settings-link-btn">Configure</button>
          </div>
        </section>

        <section className="settings-section">
          <h3>Appearance</h3>
          <div className="settings-toggle-row">
            <span>Dark mode</span>
            <label className="toggle">
              <input type="checkbox" />
              <span className="toggle-slider"></span>
            </label>
          </div>
          <div className="settings-toggle-row">
            <span>Compact view</span>
            <label className="toggle">
              <input type="checkbox" />
              <span className="toggle-slider"></span>
            </label>
          </div>
        </section>

        <section className="settings-section">
          <h3>Session</h3>
          <button className="settings-signout-btn" onClick={onLogout}>
            Sign Out
          </button>
        </section>
      </div>
    </div>
  );
}

function App() {
  // Auth state
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return localStorage.getItem('ns_auth') === 'true';
  });
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('ns_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [showSettings, setShowSettings] = useState(false);

  const [articles, setArticles] = useState([]);
  const [selectedArticle, setSelectedArticle] = useState(null);
  const [selectedIdea, setSelectedIdea] = useState(null);
  const [settings, setSettings] = useState(null);
  const [selectedDeptId, setSelectedDeptId] = useState('town-council');
  const [ideas, setIdeas] = useState({ ideas: [] });
  const [meetings, setMeetings] = useState([]);
  const [upcomingMeetings, setUpcomingMeetings] = useState([]);
  const [showAddMeetingModal, setShowAddMeetingModal] = useState(false);
  const [upcomingViewMode, setUpcomingViewMode] = useState('list'); // 'list' or 'calendar'
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Navigation State
  const [viewSource, setViewSource] = useState('town-meeting'); // Default to Town Hall MVP
  const [townHallView, setTownHallView] = useState('meetings'); // 'meetings', 'articles', or 'upcoming'
  const [selectedMeeting, setSelectedMeeting] = useState(null);
  const [filterStatus, setFilterStatus] = useState('all');
  const [sortBy, setSortBy] = useState('newest');

  const [agentStatus, setAgentStatus] = useState({
    crimeWatch: { lastRun: null, running: false, error: null, lastResult: null },
    townMeeting: { lastRun: null, running: false, error: null, lastResult: null }
  });

  // Toast notifications
  const [toasts, setToasts] = useState([]);

  // Centered result modal (replaces toast for agent results)
  const [resultModal, setResultModal] = useState(null);

  // Track previous running state to detect completion
  const [prevRunning, setPrevRunning] = useState({
    crimeWatch: false,
    townMeeting: false
  });

  // Handle login
  const handleLogin = (userData) => {
    setUser(userData);
    setIsAuthenticated(true);
    localStorage.setItem('ns_auth', 'true');
    localStorage.setItem('ns_user', JSON.stringify(userData));
  };

  // Handle logout
  const handleLogout = () => {
    setUser(null);
    setIsAuthenticated(false);
    setShowSettings(false);
    localStorage.removeItem('ns_auth');
    localStorage.removeItem('ns_user');
  };

  // Helper to switch view and close editor
  const handleNavClick = (source) => {
    setViewSource(source);
    setSelectedArticle(null); // Return to feed
  };

  // Derived Metrics
  const metrics = {
    total: articles.length,
    drafts: articles.filter(a => a.status === 'draft').length,
    ready: articles.filter(a => a.status === 'approved').length,
    discarded: articles.filter(a => a.status === 'discarded').length,
    weekCount: articles.filter(a => new Date(a.createdAt) > new Date(Date.now() - 7 * 86400000)).length
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchArticles();
      fetchAgentStatus();
      fetchSettings();
      fetchIdeas();
      fetchMeetings();
      fetchUpcomingMeetings();
      const interval = setInterval(() => {
        fetchAgentStatus();
        fetchIdeas();
        fetchMeetings();
        fetchUpcomingMeetings();
      }, 5000);
      return () => clearInterval(interval);
    } else {
      setLoading(false);
    }
  }, [isAuthenticated]);

  // Detect when agents complete and show modal
  useEffect(() => {
    // Crime Watch completed
    if (prevRunning.crimeWatch && !agentStatus.crimeWatch.running) {
      if (agentStatus.crimeWatch.error) {
        setResultModal({ type: 'error', title: 'Crime Watch Failed', message: agentStatus.crimeWatch.error });
      } else if (agentStatus.crimeWatch.lastResult) {
        const result = agentStatus.crimeWatch.lastResult;
        setResultModal({ type: result.type, title: 'Crime Watch Complete', message: result.message, count: result.count });
        if (result.count > 0) fetchArticles();
      } else {
        setResultModal({ type: 'success', title: 'Crime Watch Complete', message: 'Agent completed successfully' });
      }
    }

    // Town Meeting completed
    if (prevRunning.townMeeting && !agentStatus.townMeeting.running) {
      if (agentStatus.townMeeting.error) {
        setResultModal({ type: 'error', title: 'Meeting Agent Failed', message: agentStatus.townMeeting.error });
      } else if (agentStatus.townMeeting.lastResult) {
        const result = agentStatus.townMeeting.lastResult;
        const message = result.count > 0
          ? `Meeting processed: ${result.count} ideas found`
          : result.message || 'No new meetings to process';
        setResultModal({ type: result.type, title: 'Meeting Agent Complete', message, count: result.count });
        if (result.count > 0) {
          fetchArticles();
          fetchMeetings();
          fetchIdeas();
        }
      } else {
        setResultModal({ type: 'success', title: 'Meeting Agent Complete', message: 'Agent completed successfully' });
      }
    }

    // Update previous running state
    setPrevRunning({
      crimeWatch: agentStatus.crimeWatch.running,
      townMeeting: agentStatus.townMeeting.running
    });
  }, [agentStatus.crimeWatch.running, agentStatus.townMeeting.running]);

  function addToast(type, title, message) {
    const id = Date.now();
    setToasts(prev => [...prev, { id, type, title, message }]);
    // Auto-remove after 5 seconds
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 5000);
  }

  function removeToast(id) {
    setToasts(prev => prev.filter(t => t.id !== id));
  }

  async function fetchArticles() {
    try {
      const res = await fetch(`${API_URL}/articles`);
      const data = await res.json();
      setArticles(data);
    } catch (err) {
      console.error('Failed to fetch articles:', err);
    } finally {
      setLoading(false);
    }
  }

  async function fetchAgentStatus() {
    try {
      const res = await fetch(`${API_URL}/agents/status`);
      const data = await res.json();
      setAgentStatus(data);
    } catch (err) {
      console.error('Failed to fetch agent status:', err);
    }
  }

  async function fetchSettings() {
    try {
      const res = await fetch(`${API_URL}/settings/town-meeting`);
      const data = await res.json();
      setSettings(data);
    } catch (err) {
      console.error('Failed to fetch settings:', err);
    }
  }

  async function saveSettings(newSettings) {
    try {
      await fetch(`${API_URL}/settings/town-meeting`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSettings)
      });
      setSettings(newSettings);
      addToast('success', 'Settings', 'Settings saved successfully');
    } catch (err) {
      addToast('error', 'Settings', 'Failed to save settings');
    }
  }

  async function fetchIdeas() {
    try {
      const res = await fetch(`${API_URL}/agents/town-meeting/ideas`);
      const data = await res.json();
      setIdeas(data);
    } catch (err) {
      console.error('Failed to fetch ideas:', err);
    }
  }

  async function fetchMeetings() {
    try {
      const res = await fetch(`${API_URL}/agents/town-meeting/meetings`);
      const data = await res.json();
      setMeetings(data.meetings || []);
    } catch (err) {
      console.error('Failed to fetch meetings:', err);
    }
  }

  async function fetchUpcomingMeetings() {
    try {
      const res = await fetch(`${API_URL}/agents/town-meeting/upcoming`);
      const data = await res.json();
      setUpcomingMeetings(data.upcoming || []);
    } catch (err) {
      console.error('Failed to fetch upcoming meetings:', err);
    }
  }

  async function handleAddMeeting(meetingData) {
    try {
      const res = await fetch(`${API_URL}/agents/town-meeting/meetings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(meetingData)
      });
      if (!res.ok) throw new Error('Failed to create meeting');

      addToast('success', 'Meeting Added', 'Upcoming meeting created successfully');
      fetchMeetings();
      fetchUpcomingMeetings();
    } catch (err) {
      console.error(err);
      addToast('error', 'Error', 'Failed to add meeting');
    }
  }

  async function handleDeleteUpcoming(meetingId) {
    try {
      const res = await fetch(`${API_URL}/agents/town-meeting/upcoming/${meetingId}`, {
        method: 'DELETE'
      });
      if (!res.ok) throw new Error('Failed to delete meeting');

      addToast('success', 'Meeting Deleted', 'Upcoming meeting removed');
      fetchUpcomingMeetings();
    } catch (err) {
      console.error(err);
      addToast('error', 'Error', 'Failed to delete meeting');
    }
  }

  async function generateArticleFromIdea(ideaId, angleName) {
    try {
      addToast('info', 'Generation', 'Starting article generation...');
      const departmentId = selectedDeptId;

      await fetch(`${API_URL}/agents/town-meeting/generate-article`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ideaId, angleName, departmentId })
      });

      setAgentStatus(prev => ({
        ...prev,
        townMeeting: { ...prev.townMeeting, running: true }
      }));
    } catch (err) {
      addToast('error', 'Generation', 'Failed to start generation');
    }
  }

  async function runAgent(agent) {
    try {
      const body = {};
      if (agent === 'town-meeting') {
        body.departmentId = selectedDeptId;
      }

      await fetch(`${API_URL}/agents/${agent}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      addToast('info', 'Agent', `Running ${agent === 'town-meeting' ? 'Town Hall' : 'Crime Watch'} agent...`);
      setAgentStatus(prev => ({
        ...prev,
        [agent === 'crime-watch' ? 'crimeWatch' : 'townMeeting']: { ...prev[agent === 'crime-watch' ? 'crimeWatch' : 'townMeeting'], running: true }
      }));
    } catch (err) {
      addToast('error', 'Agent', `Failed to start ${agent} agent`);
    }
  }

  async function updateStatus(id, status) {
    try {
      await fetch(`${API_URL}/articles/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      setArticles(articles.map(a =>
        a.id === id ? { ...a, status } : a
      ));
      if (selectedArticle?.id === id) {
        setSelectedArticle({ ...selectedArticle, status });
      }
    } catch (err) {
      console.error('Failed to update status:', err);
    }
  }

  async function saveArticle(article) {
    setSaving(true);
    try {
      await fetch(`${API_URL}/articles/${article.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(article)
      });
      setArticles(articles.map(a =>
        a.id === article.id ? article : a
      ));
    } catch (err) {
      console.error('Failed to save article:', err);
    } finally {
      setSaving(false);
    }
  }

  // Filtering & Sorting Logic
  const filteredArticles = articles
    .filter(a => {
      // 1. Filter by Source
      if (viewSource !== 'all') {
        if (viewSource === 'town-meeting' && a.agentSource !== 'town-meeting') return false;
        if (viewSource === 'crime-watch' && a.agentSource !== 'crime-watch') return false;
      }

      // 2. Filter by Status
      if (filterStatus !== 'all') {
        return a.status === filterStatus;
      }

      return true;
    })
    // Sort based on selected option
    .sort((a, b) => {
      switch (sortBy) {
        case 'oldest':
          return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
        case 'headline-az':
          return (a.headline || '').localeCompare(b.headline || '');
        case 'headline-za':
          return (b.headline || '').localeCompare(a.headline || '');
        case 'newest':
        default:
          return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
      }
    });

  // Count helper for sidebar (by source)
  const getCount = (source) => {
    if (source === 'all') return articles.length;
    return articles.filter(a => a.agentSource === source).length;
  };

  // Count helper for filter tabs (by status, respects current source view)
  const getStatusCount = (status) => {
    return articles.filter(a => {
      // Respect current source filter
      if (viewSource !== 'all' && a.agentSource !== viewSource) return false;
      // Then filter by status
      if (status === 'all') return true;
      return a.status === status;
    }).length;
  };

  // Show login screen if not authenticated
  if (!isAuthenticated) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  // Show loading screen
  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-content">
          <div className="loading-spinner"></div>
          <h1>NEWS<span className="highlight">SCRAPER</span></h1>
          <p>Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <ToastContainer toasts={toasts} onRemove={removeToast} />
      <aside className="sidebar">
        <div className="brand">
          <h1>NEWS<span className="highlight">SCRAPER</span></h1>
          <span className="location">Jupiter, FL</span>
        </div>

        <nav className="nav-menu">
          <div className="nav-section">
            <h3 className="nav-section-label">Town Hall MVP</h3>
            <button
              className={`nav-item nav-sub ${!showSettings && viewSource === 'town-meeting' && townHallView === 'meetings' ? 'active' : ''}`}
              onClick={() => {
                setViewSource('town-meeting');
                setTownHallView('meetings');
                setShowSettings(false);
                setSelectedMeeting(null);
                setSelectedIdea(null);
                setSelectedArticle(null);
              }}
            >
              Meetings
            </button>
            <button
              className={`nav-item nav-sub ${!showSettings && viewSource === 'town-meeting' && townHallView === 'upcoming' ? 'active' : ''}`}
              onClick={() => {
                setViewSource('town-meeting');
                setTownHallView('upcoming');
                setShowSettings(false);
                setSelectedMeeting(null);
                setSelectedIdea(null);
                setSelectedArticle(null);
              }}
            >
              Upcoming {upcomingMeetings.length > 0 && <span className="badge">{upcomingMeetings.length}</span>}
            </button>
            <button
              className={`nav-item nav-sub ${!showSettings && viewSource === 'town-meeting' && townHallView === 'articles' ? 'active' : ''}`}
              onClick={() => {
                setViewSource('town-meeting');
                setTownHallView('articles');
                setShowSettings(false);
                setSelectedMeeting(null);
                setSelectedIdea(null);
                setSelectedArticle(null);
              }}
            >
              Articles <span className="badge">{getCount('town-meeting')}</span>
            </button>
            <button
              className={`nav-item nav-sub ${showSettings ? 'active' : ''}`}
              onClick={() => {
                setShowSettings(true);
                setSelectedMeeting(null);
                setSelectedIdea(null);
                setSelectedArticle(null);
              }}
            >
              Settings
            </button>
          </div>
        </nav>

        <div className="sidebar-footer">
          <div className="user-info">
            <div className="user-avatar">{user?.name?.charAt(0).toUpperCase() || 'U'}</div>
            <div className="user-details">
              <span className="user-name">{user?.name || 'User'}</span>
              <span className="user-email">{user?.email || ''}</span>
            </div>
          </div>
          <button className="btn-refresh" onClick={() => { fetchArticles(); fetchAgentStatus(); fetchIdeas(); fetchMeetings(); fetchUpcomingMeetings(); }}>
            Refresh Data
          </button>
        </div>
      </aside>

      {/* Settings Slide Panel - REMOVED for new SettingsView
      <div className={`settings-slide-panel ${showSettings ? 'open' : ''}`}>
        <SettingsPanel
          user={user}
          onClose={() => setShowSettings(false)}
          onLogout={handleLogout}
        />
      </div>
      {showSettings && <div className="settings-backdrop" onClick={() => setShowSettings(false)} />}
      */}

      <main className="main-content">
        {showSettings ? (
          <SettingsView
            settings={settings}
            user={user}
            onSave={saveSettings}
            onClose={() => setShowSettings(false)}
            onLogout={handleLogout}
          />
        ) : selectedMeeting ? (
          <MeetingDetailView
            meeting={selectedMeeting}
            onBack={() => setSelectedMeeting(null)}
            onSelectIdea={setSelectedIdea}
            onGenerateArticle={generateArticleFromIdea}
          />
        ) : selectedIdea ? (
          <IdeaReview
            idea={selectedIdea}
            onGenerate={generateArticleFromIdea}
            onClose={() => setSelectedIdea(null)}
          />
        ) : !selectedArticle ? (
          <>
            <header className="feed-header">
              <div className="feed-title-row">
                <div className="feed-title-block">
                  <h2>
                    {townHallView === 'meetings' && 'Meetings'}
                    {townHallView === 'upcoming' && 'Upcoming Meetings'}
                    {townHallView === 'articles' && 'Articles'}
                  </h2>
                </div>
                <div className="feed-actions">
                  {townHallView !== 'upcoming' && (
                    <CustomDropdown
                      options={settings?.departments.map(dept => ({
                        value: dept.id,
                        label: dept.name
                      })) || []}
                      value={selectedDeptId}
                      onChange={setSelectedDeptId}
                      placeholder="Select Department"
                    />
                  )}
                  {townHallView !== 'upcoming' && (
                    <AgentControl
                      name="Meeting Agent"
                      status={agentStatus.townMeeting}
                      onRun={() => runAgent('town-meeting')}
                    />
                  )}
                </div>
              </div>
            </header>

            <div className="feed-content">
              {viewSource === 'town-meeting' && townHallView === 'meetings' ? (
                <MeetingListView
                  department={settings?.departments.find(d => d.id === selectedDeptId)}
                  ideas={ideas.ideas}
                  meetings={meetings}
                  onSelectMeeting={setSelectedMeeting}
                  onAddMeeting={() => setShowAddMeetingModal(true)}
                />
              ) : viewSource === 'town-meeting' && townHallView === 'upcoming' ? (
                <UpcomingMeetingsView
                  meetings={upcomingMeetings}
                  departments={settings?.departments}
                  viewMode={upcomingViewMode}
                  onViewModeChange={setUpcomingViewMode}
                  onAddMeeting={() => setShowAddMeetingModal(true)}
                  onDeleteMeeting={handleDeleteUpcoming}
                />
              ) : (
                <>
                  <div className="hero-metrics">
                    <MetricCard label="Total Items" value={metrics.total} />
                    <MetricCard label="Drafts Pending" value={metrics.drafts} highlight={metrics.drafts > 0} />
                    <MetricCard label="Ready to Publish" value={metrics.ready} type="success" />
                    <MetricCard label="This Week" value={articles.filter(a => isThisWeek(a.date)).length} highlight={true} labelSmall="New" />
                  </div>

                  <div className="filter-bar">
                    <div className="filter-tabs">
                      <button className={`tab ${filterStatus === 'all' ? 'active' : ''}`} onClick={() => setFilterStatus('all')}>
                        All <span className="tab-count">{metrics.total}</span>
                      </button>
                      <button className={`tab ${filterStatus === 'draft' ? 'active' : ''}`} onClick={() => setFilterStatus('draft')}>
                        Drafts <span className="tab-count draft">{metrics.drafts}</span>
                      </button>
                      <button className={`tab ${filterStatus === 'approved' ? 'active' : ''}`} onClick={() => setFilterStatus('approved')}>
                        Approved <span className="tab-count approved">{metrics.ready}</span>
                      </button>
                      <button className={`tab ${filterStatus === 'discarded' ? 'active' : ''}`} onClick={() => setFilterStatus('discarded')}>
                        Discarded <span className="tab-count discarded">{metrics.discarded}</span>
                      </button>
                    </div>
                  </div>

                  <div className="article-list">
                    {filteredArticles.length === 0 ? (
                      <div className="empty-state">
                        <span className="empty-icon">📰</span>
                        <h3>No articles found</h3>
                        <p>Try changing your filters or running the agent to fetch new data.</p>
                      </div>
                    ) : (
                      filteredArticles.map(article => (
                        <ArticleCard
                          key={article.id}
                          article={article}
                          onClick={() => setSelectedArticle(article)}
                          onStatusChange={updateStatus}
                        />
                      ))
                    )}
                  </div>
                </>
              )}
            </div>
          </>
        ) : (
          <ArticleEditor
            article={selectedArticle}
            onSave={saveArticle}
            onClose={() => setSelectedArticle(null)}
            onStatusChange={updateStatus}
            saving={saving}
          />
        )}
      </main>

      {showAddMeetingModal && (
        <AddMeetingModal
          onClose={() => setShowAddMeetingModal(false)}
          onAdd={handleAddMeeting}
          departments={settings?.departments}
        />
      )}

      {/* Result Modal */}
      {resultModal && (
        <ResultModal
          result={resultModal}
          onClose={() => setResultModal(null)}
        />
      )}
    </div>
  );
}

function Toast({ toast, onClose }) {
  return (
    <div className={`toast toast-${toast.type}`}>
      <div className="toast-icon">
        {toast.type === 'success' && '✓'}
        {toast.type === 'info' && 'ℹ'}
        {toast.type === 'error' && '✕'}
      </div>
      <div className="toast-content">
        <span className="toast-title">{toast.title}</span>
        <span className="toast-message">{toast.message}</span>
      </div>
      <button className="toast-close" onClick={onClose}>×</button>
    </div>
  );
}

function ToastContainer({ toasts, onRemove }) {
  if (toasts.length === 0) return null;

  return (
    <div className="toast-container">
      {toasts.map(toast => (
        <Toast key={toast.id} toast={toast} onClose={() => onRemove(toast.id)} />
      ))}
    </div>
  );
}

function ResultModal({ result, onClose }) {
  useEffect(() => {
    // Auto-close after 5 seconds
    const timer = setTimeout(onClose, 5000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className="result-modal-overlay" onClick={onClose}>
      <div className={`result-modal result-modal-${result.type}`} onClick={e => e.stopPropagation()}>
        <div className="result-modal-icon">
          {result.type === 'success' && '✓'}
          {result.type === 'info' && 'ℹ'}
          {result.type === 'error' && '✕'}
        </div>
        <h2 className="result-modal-title">{result.title}</h2>
        <p className="result-modal-message">{result.message}</p>
        <button className="result-modal-close" onClick={onClose}>Got it</button>
      </div>
    </div>
  );
}

function AgentControl({ name, status, onRun }) {
  return (
    <div className="agent-control">
      <div className="agent-status-text">
        {status.running ? (
          <span className="running-indicator">● Processing...</span>
        ) : (
          <span className="last-run">Last run: {formatRelativeTime(status.lastRun)}</span>
        )}
      </div>
      <button
        className="btn-run-agent"
        onClick={onRun}
        disabled={status.running}
      >
        {status.running ? 'Running...' : `Run ${name}`}
      </button>
      {status.running && (
        <div className="agent-progress-overlay">
          <div className="agent-progress-bar" />
          <span className="agent-progress-text">This may take 10-15 min for new meetings</span>
        </div>
      )}
      {status.error && <div className="agent-error-tooltip">{status.error}</div>}
    </div>
  );
}

function MetricCard({ label, value, labelSmall, highlight, type }) {
  return (
    <div className={`metric-card ${highlight ? 'highlight' : ''} ${type || ''}`}>
      <span className="metric-value">{value}</span>
      <span className="metric-label">
        {label} {labelSmall && <small>{labelSmall}</small>}
      </span>
    </div>
  );
}

function ArticleCard({ article, onClick, onStatusChange }) {
  const handleQuickAction = (e, newStatus) => {
    e.stopPropagation();
    onStatusChange(article.id, newStatus);
  };

  // Check if article is less than 24 hours old
  const isNew = article.createdAt && (Date.now() - new Date(article.createdAt)) < 24 * 60 * 60 * 1000;

  // Source meeting info (mock - would come from article data)
  const sourceMeeting = article.sourceMeeting || (article.agentSource === 'town-meeting' ? {
    name: 'Town Council Regular Meeting',
    date: 'Jan 1, 2026'
  } : null);

  return (
    <div className={`article-card ${article.status}`} onClick={onClick}>
      <div className="card-top">
        <div className="card-top-left">
          <span className={`source-pill ${article.agentSource}`}>
            {article.agentSource === 'town-meeting' ? 'Town Hall' : 'Crime Watch'}
          </span>
          {isNew && <span className="new-badge">New</span>}
        </div>
        <span className="date">{formatRelativeTime(article.createdAt)}</span>
      </div>

      <div className="card-main">
        <h3>{article.headline || 'Untitled Draft'}</h3>
        <p className="summary-preview">
          {article.summary || (article.body && article.body.substring(0, 140) + '...') || 'No content...'}
        </p>
      </div>

      {sourceMeeting && (
        <div className="article-source-link">
          <span className="source-icon">◉</span>
          <span className="source-text">From: {sourceMeeting.name} ({sourceMeeting.date})</span>
        </div>
      )}

      <div className="card-footer">
        <span className={`status-text ${article.status}`}>
          <span className="status-dot"></span> {article.status}
        </span>

        <div className="hover-actions">
          {article.status === 'draft' && (
            <>
              <button className="btn-icon check" title="Approve" onClick={(e) => handleQuickAction(e, 'approved')}>✓</button>
              <button className="btn-icon cross" title="Discard" onClick={(e) => handleQuickAction(e, 'discarded')}>✕</button>
            </>
          )}
          <span className="edit-hint">Open ↗</span>
        </div>
      </div>
    </div>
  );
}

function ArticleEditor({ article, onSave, onClose, onStatusChange, saving }) {
  const [form, setForm] = useState({ ...article });

  function handleChange(field, value) {
    setForm({ ...form, [field]: value });
  }

  return (
    <div className="cms-editor">
      {/* Top Bar: Navigation & Primary Actions */}
      <header className="cms-header">
        <div className="cms-left">
          <button className="btn-back" onClick={onClose}>
            <span className="icon">←</span> Back
          </button>
          <div className="cms-meta-tag">
            <span className={`source-dot ${form.agentSource}`}></span>
            {form.agentSource === 'town-meeting' ? 'Town Hall' : 'Crime Watch'}
            <span className="divider">/</span>
            {formatDate(form.createdAt)}
          </div>
        </div>
        <div className="cms-actions">
          <span className={`status-badge ${form.status}`}>{form.status}</span>
          <button className="btn-primary" onClick={() => onSave(form)} disabled={saving}>
            {saving ? 'Saving...' : 'Update Article'}
          </button>
        </div>
      </header>

      <div className="cms-body">
        {/* Main Content Column */}
        <div className="cms-content">
          <div className="input-group">
            <label>Headline</label>
            <input
              className="input-title"
              value={form.headline}
              onChange={(e) => handleChange('headline', e.target.value)}
              placeholder="Enter headline..."
            />
          </div>

          <div className="input-group">
            <label>Summary / Lede</label>
            <textarea
              className="input-summary"
              value={form.summary}
              onChange={(e) => handleChange('summary', e.target.value)}
              placeholder="Brief summary..."
              rows={3}
            />
          </div>

          <div className="input-group">
            <label>Article Body</label>
            <textarea
              className="input-body"
              value={form.body}
              onChange={(e) => handleChange('body', e.target.value)}
              placeholder="Write the full story here..."
              rows={20}
            />
          </div>
        </div>

        {/* Sidebar Column: Meta & Workflow */}
        <div className="cms-sidebar">
          <div className="sidebar-section">
            <h4>Workflow</h4>
            <div className="workflow-actions">
              {form.status === 'draft' ? (
                <>
                  <button className="btn-workflow approve" onClick={() => onStatusChange(form.id, 'approved')}>
                    <span className="icon">✓</span> Approve
                  </button>
                  <button className="btn-workflow discard" onClick={() => onStatusChange(form.id, 'discarded')}>
                    <span className="icon">✕</span> Discard
                  </button>
                </>
              ) : (
                <button className="btn-workflow reset" onClick={() => onStatusChange(form.id, 'draft')}>
                  Return to Draft
                </button>
              )}
            </div>
          </div>

          <div className="sidebar-section">
            <h4>Social Media Captions</h4>

            <div className="field-group">
              <label>Twitter ({form.twitter?.length || 0}/280)</label>
              <textarea
                value={form.twitter}
                onChange={(e) => handleChange('twitter', e.target.value)}
                rows={4}
              />
            </div>

            <div className="field-group">
              <label>Facebook</label>
              <textarea
                value={form.facebook}
                onChange={(e) => handleChange('facebook', e.target.value)}
                rows={4}
              />
            </div>
          </div>

          <div className="sidebar-section">
            <h4>Source Data</h4>
            <div className="field-group">
              <label>Original Link/Ref</label>
              <input
                type="text"
                value={form.sourceUrl}
                onChange={(e) => handleChange('sourceUrl', e.target.value)}
                className="input-sm"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  try {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  } catch { return dateStr; }
}

function formatRelativeTime(dateStr) {
  if (!dateStr) return 'Never';
  try {
    const diff = new Date() - new Date(dateStr);
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return formatDate(dateStr);
  } catch { return dateStr; }
}

function isThisWeek(dateStr) {
  if (!dateStr) return false;
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay()));
    startOfWeek.setHours(0, 0, 0, 0);
    return d >= startOfWeek;
  } catch { return false; }
}

function SettingsView({ settings, user, onSave, onClose, onLogout }) {
  const [localSettings, setLocalSettings] = useState(settings);
  const [selectedDept, setSelectedDept] = useState(0);
  const [activeSection, setActiveSection] = useState('account');

  if (!localSettings) return <div className="settings-loading">Loading settings...</div>;

  const currentDept = localSettings.departments[selectedDept];

  const handleAddMember = () => {
    const newSettings = { ...localSettings };
    newSettings.departments[selectedDept].boardMembers.push({ name: '', role: '' });
    setLocalSettings(newSettings);
  };

  const handleMemberChange = (memberIndex, field, value) => {
    const newSettings = { ...localSettings };
    newSettings.departments[selectedDept].boardMembers[memberIndex][field] = value;
    setLocalSettings(newSettings);
  };

  const handleRemoveMember = (memberIndex) => {
    const newSettings = { ...localSettings };
    newSettings.departments[selectedDept].boardMembers.splice(memberIndex, 1);
    setLocalSettings(newSettings);
  };

  return (
    <div className="settings-layout">
      <header className="settings-page-header">
        <div className="settings-header-left">
          <button className="btn-back" onClick={onClose}>← Back</button>
        </div>
        <div className="settings-header-right">
          <button className="btn-save-settings" onClick={() => onSave(localSettings)}>Save Changes</button>
        </div>
      </header>

      <div className="settings-body">
        <nav className="settings-nav">
          <div className="settings-nav-section">
            <span className="settings-nav-label">General</span>
            <button
              className={`settings-nav-item ${activeSection === 'account' ? 'active' : ''}`}
              onClick={() => setActiveSection('account')}
            >
              <span className="nav-icon">◉</span>
              Account
            </button>
          </div>
          <div className="settings-nav-section">
            <span className="settings-nav-label">Configuration</span>
            <button
              className={`settings-nav-item ${activeSection === 'board' ? 'active' : ''}`}
              onClick={() => setActiveSection('board')}
            >
              <span className="nav-icon">◉</span>
              Board Members
            </button>
            <button
              className={`settings-nav-item ${activeSection === 'departments' ? 'active' : ''}`}
              onClick={() => setActiveSection('departments')}
            >
              <span className="nav-icon">◉</span>
              Departments
            </button>
          </div>
        </nav>

        <div className="settings-main">
          {activeSection === 'account' && (
            <div className="settings-page">
              <div className="settings-page-title">
                <h1>Account</h1>
                <p>Manage your profile and authentication settings</p>
              </div>

              <div className="settings-card">
                <div className="settings-card-title">
                  <h2>Profile</h2>
                </div>
                <div className="settings-card-body">
                  <div className="profile-row">
                    <div className="profile-avatar-lg">{user?.name?.charAt(0).toUpperCase() || 'U'}</div>
                    <div className="profile-info">
                      <h3>{user?.name || 'User'}</h3>
                      <span>{user?.email || 'user@example.com'}</span>
                    </div>
                    <button className="btn-edit-profile">Edit Profile</button>
                  </div>
                </div>
              </div>

              <div className="settings-card settings-card-danger">
                <div className="settings-card-title">
                  <h2>Session</h2>
                </div>
                <div className="settings-card-body">
                  <div className="danger-zone">
                    <div className="danger-info">
                      <h4>Sign out of your account</h4>
                      <p>You will need to sign in again to access the dashboard</p>
                    </div>
                    <button className="btn-signout" onClick={onLogout}>Sign Out</button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeSection === 'board' && (
            <div className="settings-page">
              <div className="settings-page-title">
                <h1>Board Members</h1>
                <p>Configure board member names for accurate article generation</p>
              </div>

              <div className="settings-card">
                <div className="settings-card-title">
                  <h2>Select Department</h2>
                </div>
                <div className="settings-card-body">
                  <div className="dept-selector-grid">
                    {localSettings.departments.map((dept, idx) => (
                      <button
                        key={dept.id}
                        className={`dept-selector-btn ${selectedDept === idx ? 'active' : ''}`}
                        onClick={() => setSelectedDept(idx)}
                      >
                        <span className="dept-selector-name">{dept.name}</span>
                        <span className="dept-selector-count">{dept.boardMembers.length} members</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="settings-card">
                <div className="settings-card-title">
                  <h2>{currentDept.name} - Members</h2>
                  <span className="member-count-badge">{currentDept.boardMembers.length}</span>
                </div>
                <div className="settings-card-body no-padding">
                  <div className="members-table">
                    <div className="members-table-head">
                      <span>Full Name</span>
                      <span>Role / Title</span>
                      <span></span>
                    </div>
                    {currentDept.boardMembers.map((member, idx) => (
                      <div key={idx} className="members-table-row">
                        <input
                          placeholder="e.g. John Smith"
                          value={member.name}
                          onChange={(e) => handleMemberChange(idx, 'name', e.target.value)}
                        />
                        <input
                          placeholder="e.g. Council Member"
                          value={member.role}
                          onChange={(e) => handleMemberChange(idx, 'role', e.target.value)}
                        />
                        <button className="btn-remove-member" onClick={() => handleRemoveMember(idx)}>×</button>
                      </div>
                    ))}
                    {currentDept.boardMembers.length === 0 && (
                      <div className="members-table-empty">No board members configured for this department</div>
                    )}
                  </div>
                  <div className="table-footer">
                    <button className="btn-add-member" onClick={handleAddMember}>+ Add Member</button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeSection === 'departments' && (
            <div className="settings-page">
              <div className="settings-page-title">
                <h1>Departments</h1>
                <p>Government departments currently being monitored</p>
              </div>

              <div className="settings-card">
                <div className="settings-card-title">
                  <h2>Active Departments</h2>
                  <span className="member-count-badge">{localSettings.departments.length}</span>
                </div>
                <div className="settings-card-body no-padding">
                  <div className="departments-list">
                    {localSettings.departments.map((dept) => (
                      <div key={dept.id} className="department-row">
                        <div className="department-icon">◉</div>
                        <div className="department-details">
                          <h4>{dept.name}</h4>
                          <span>{dept.boardMembers.length} board members configured</span>
                        </div>
                        <div className="department-status">
                          <span className="status-badge-active">Active</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function IdeaReview({ idea, onGenerate, onClose }) {
  return (
    <div className="idea-review">
      <header className="cms-header">
        <div className="cms-left">
          <button className="btn-back" onClick={onClose}>← Back to Feed</button>
          <h2>Article Idea: {idea.title}</h2>
        </div>
      </header>

      <div className="idea-detail-container">
        <div className="idea-info-panel">
          <h3>The Event</h3>
          <p>{idea.event}</p>
          <h3>Summary</h3>
          <p>{idea.summary}</p>
        </div>

        <div className="angles-panel">
          <h3>Coverage Angles</h3>
          <div className="angles-grid">
            {idea.angles.map((angle, idx) => (
              <div key={idx} className="angle-card">
                <h4>{angle.name}</h4>
                <p>{angle.description}</p>
                <button
                  className="btn-primary btn-sm"
                  onClick={() => {
                    onGenerate(idea.id, angle.name);
                    onClose();
                  }}
                >
                  Generate Article
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function AddMeetingModal({ onClose, onAdd, departments }) {
  const [date, setDate] = useState('');
  const [departmentId, setDepartmentId] = useState('town-council');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);

  const handleDepartmentChange = (newDeptId) => {
    setDepartmentId(newDeptId);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!date) return;
    setLoading(true);
    const dept = departments?.find(d => d.id === departmentId);
    await onAdd({ date, type: dept?.name || departmentId, departmentId, description: description.trim() || null });
    setLoading(false);
    onClose();
  };

  // Fallback departments if none provided
  const fallbackDepartments = [
    { id: 'town-council', name: 'Town Council' },
    { id: 'planning-board', name: 'Planning Board' },
    { id: 'commissioners', name: 'Commissioners Meetings' }
  ];

  const deptList = departments && departments.length > 0 ? departments : fallbackDepartments;
  const departmentOptions = deptList.map(dept => ({
    value: dept.id,
    label: dept.name
  }));

  return (
    <div className="modal-overlay">
      <div className="modal-card">
        <div className="modal-header">
          <h2>Add Upcoming Meeting</h2>
          <button className="btn-close" onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit} className="modal-form">
          <div className="form-group">
            <label>Date</label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label>Department</label>
            <CustomDropdown
              options={departmentOptions}
              value={departmentId}
              onChange={handleDepartmentChange}
              placeholder="Select Department"
            />
          </div>
          <div className="form-group">
            <label>Description (optional)</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="e.g., Budget hearing, Zoning vote, Special session..."
              rows={2}
            />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Adding...' : 'Add Meeting'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function UpcomingMeetingsView({ meetings, departments, viewMode, onViewModeChange, onAddMeeting, onDeleteMeeting }) {
  // Calendar navigation state - start with current month
  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState({
    year: today.getFullYear(),
    month: today.getMonth() + 1 // 1-indexed
  });

  // Format date for display
  const formatDate = (dateStr) => {
    if (!dateStr) return { month: '---', day: '--', weekday: '', full: '' };
    const date = new Date(dateStr + 'T12:00:00'); // Add time to avoid timezone issues
    const month = date.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
    const day = date.getDate();
    const weekday = date.toLocaleDateString('en-US', { weekday: 'short' });
    const full = date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    return { month, day, weekday, full };
  };

  // Get department name from ID
  const getDeptName = (deptId) => {
    const dept = departments?.find(d => d.id === deptId);
    return dept?.name || deptId || 'Meeting';
  };

  // Enrich meetings with formatted data
  const enrichedMeetings = meetings.map(meeting => ({
    ...meeting,
    name: getDeptName(meeting.departmentId),
    dateFormatted: formatDate(meeting.date)
  }));

  // Navigate months
  const goToPrevMonth = () => {
    setCurrentMonth(prev => {
      if (prev.month === 1) {
        return { year: prev.year - 1, month: 12 };
      }
      return { ...prev, month: prev.month - 1 };
    });
  };

  const goToNextMonth = () => {
    setCurrentMonth(prev => {
      if (prev.month === 12) {
        return { year: prev.year + 1, month: 1 };
      }
      return { ...prev, month: prev.month + 1 };
    });
  };

  const goToToday = () => {
    const now = new Date();
    setCurrentMonth({ year: now.getFullYear(), month: now.getMonth() + 1 });
  };

  // Generate calendar days for a month
  const generateCalendarDays = (year, month) => {
    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);
    const daysInMonth = lastDay.getDate();
    const startPadding = firstDay.getDay(); // 0 = Sunday
    const endPadding = (7 - ((startPadding + daysInMonth) % 7)) % 7; // Days to complete last row

    const days = [];
    // Add padding for days before the 1st
    for (let i = 0; i < startPadding; i++) {
      days.push({ day: null, meetings: [], isOtherMonth: true });
    }
    // Add actual days
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dayMeetings = enrichedMeetings.filter(m => m.date === dateStr);
      days.push({
        day: d,
        meetings: dayMeetings,
        date: dateStr,
        isToday: dateStr === todayStr
      });
    }
    // Add padding for days after the last day
    for (let i = 0; i < endPadding; i++) {
      days.push({ day: null, meetings: [], isOtherMonth: true });
    }
    return days;
  };

  const getMonthName = (year, month) => {
    const date = new Date(year, month - 1, 1);
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  // Check if a month has any meetings
  const monthHasMeetings = (year, month) => {
    const monthKey = `${year}-${String(month).padStart(2, '0')}`;
    return enrichedMeetings.some(m => m.date?.startsWith(monthKey));
  };

  // Get months that have meetings for quick navigation
  const meetingMonths = [...new Set(enrichedMeetings.map(m => m.date?.substring(0, 7)))].filter(Boolean).sort();

  return (
    <>
      <div className="upcoming-header">
        <div className="upcoming-tabs">
          <button className="upcoming-tab active">
            Upcoming
            <span className="tab-count">{enrichedMeetings.length}</span>
          </button>
        </div>
        <div className="upcoming-controls">
          <div className="view-toggle">
            <button
              className={`view-toggle-btn ${viewMode === 'list' ? 'active' : ''}`}
              onClick={() => onViewModeChange('list')}
              title="List View"
            >
              ☰
            </button>
            <button
              className={`view-toggle-btn ${viewMode === 'calendar' ? 'active' : ''}`}
              onClick={() => onViewModeChange('calendar')}
              title="Calendar View"
            >
              ▦
            </button>
          </div>
          <button className="btn-add-meeting-sm" onClick={onAddMeeting}>
            + Add
          </button>
        </div>
      </div>

      {viewMode === 'list' ? (
        <div className="upcoming-list">
          {enrichedMeetings.length === 0 ? (
            <div className="empty-state">
              <h3>No upcoming meetings</h3>
              <p>Add meetings to track when they're scheduled.</p>
            </div>
          ) : (
            enrichedMeetings.map(meeting => (
              <div key={meeting.id} className="upcoming-row">
                <div className="upcoming-row-left">
                  <div className="upcoming-date-block">
                    <span className="date-weekday">{meeting.dateFormatted.weekday}</span>
                    <span className="date-day">{meeting.dateFormatted.day}</span>
                    <span className="date-month">{meeting.dateFormatted.month}</span>
                  </div>
                  <div className="upcoming-row-info">
                    <h4>{meeting.name}</h4>
                    <span className="upcoming-date-full">{meeting.dateFormatted.full}</span>
                    {meeting.description && <p className="upcoming-description">{meeting.description}</p>}
                  </div>
                </div>
                <div className="upcoming-row-actions">
                  <span className="upcoming-status">Scheduled</span>
                  <button
                    className="btn-delete-meeting"
                    onClick={() => onDeleteMeeting(meeting.id)}
                    title="Remove"
                  >
                    ×
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="upcoming-calendar">
          <div className="calendar-container">
            {/* Calendar Navigation */}
            <div className="calendar-nav">
              <div className="calendar-nav-left">
                <button className="calendar-nav-btn" onClick={goToPrevMonth} title="Previous Month">
                  ‹
                </button>
                <h3 className="calendar-month-title">{getMonthName(currentMonth.year, currentMonth.month)}</h3>
                <button className="calendar-nav-btn" onClick={goToNextMonth} title="Next Month">
                  ›
                </button>
              </div>
              <div className="calendar-nav-right">
                <button className="calendar-today-btn" onClick={goToToday}>Today</button>
                {meetingMonths.length > 0 && (
                  <div className="calendar-month-dots">
                    {meetingMonths.slice(0, 5).map(monthKey => {
                      const [y, m] = monthKey.split('-').map(Number);
                      const isActive = currentMonth.year === y && currentMonth.month === m;
                      return (
                        <button
                          key={monthKey}
                          className={`calendar-month-dot ${isActive ? 'active' : ''}`}
                          onClick={() => setCurrentMonth({ year: y, month: m })}
                          title={getMonthName(y, m)}
                        >
                          {new Date(y, m - 1).toLocaleDateString('en-US', { month: 'short' })}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Calendar Grid */}
            <div className="calendar-table">
              <div className="calendar-weekdays">
                <span>SUN</span>
                <span>MON</span>
                <span>TUE</span>
                <span>WED</span>
                <span>THU</span>
                <span>FRI</span>
                <span>SAT</span>
              </div>
              <div className="calendar-grid">
                {generateCalendarDays(currentMonth.year, currentMonth.month).map((dayInfo, idx) => (
                  <div
                    key={idx}
                    className={`calendar-day ${dayInfo.isOtherMonth ? 'empty' : ''} ${dayInfo.meetings.length > 0 ? 'has-meeting' : ''} ${dayInfo.isToday ? 'is-today' : ''}`}
                  >
                    {dayInfo.day && (
                      <>
                        <span className="calendar-day-num">{dayInfo.day}</span>
                        <div className="calendar-day-meetings">
                          {dayInfo.meetings.map(m => (
                            <div key={m.id} className="calendar-meeting-chip" title={`${m.name}${m.description ? ` - ${m.description}` : ''}`}>
                              <span className="chip-dot"></span>
                              <span className="chip-text">{m.name}</span>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Meeting indicator */}
            {monthHasMeetings(currentMonth.year, currentMonth.month) && (
              <div className="calendar-legend">
                <span className="legend-item">
                  <span className="legend-dot"></span>
                  Scheduled Meeting
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function MeetingListView({ department, ideas, meetings, onSelectMeeting, onAddMeeting }) {
  // Format date for display
  const formatDate = (dateStr) => {
    if (!dateStr) return { month: '---', day: '--' };
    const date = new Date(dateStr);
    const month = date.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
    const day = date.getDate();
    return { month, day };
  };

  // Enrich meetings with ideas data
  const enrichedMeetings = meetings.map(meeting => {
    // Check if current ideas belong to this meeting
    const meetingIdeas = ideas.filter(() => {
      // For now, ideas are associated with the most recent meeting
      return meeting.ideasCount > 0;
    });

    // Format date for display in name
    const dateForName = meeting.processedAt
      ? new Date(meeting.processedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : `Video ${meeting.videoId}`;

    return {
      ...meeting,
      name: `${department?.name || 'Meeting'} - ${dateForName}`,
      date: formatDate(meeting.processedAt),
      ideas: meeting.ideasCount > 0 ? ideas : []
    };
  });

  return (
    <>
      <div className="meetings-tabs">
        <button className="meetings-tab active">
          Meetings
          <span className="tab-count">{enrichedMeetings.length}</span>
        </button>
        <button className="btn-add-meeting-sm" onClick={onAddMeeting}>
          + Add Meeting
        </button>
      </div>

      <div className="meetings-list">
        {enrichedMeetings.length === 0 ? (
          <div className="empty-state">
            <h3>No meetings processed yet</h3>
            <p>Select a department and run the Meeting Agent to process videos.</p>
          </div>
        ) : (
          enrichedMeetings.map(meeting => (
            <div
              key={meeting.id}
              className={`meeting-row clickable ${meeting.status}`}
              onClick={() => onSelectMeeting(meeting)}
            >
              <div className="meeting-row-main">
                <div className="meeting-row-left">
                  <div className="meeting-date-block">
                    <span className="date-month">{meeting.date.month}</span>
                    <span className="date-day">{meeting.date.day}</span>
                  </div>
                  <div className="meeting-row-info">
                    <h4>{meeting.name}</h4>
                    <div className="meeting-stats">
                      {meeting.ideasCount > 0 && (
                        <span className="stat-item ideas">{meeting.ideasCount} ideas</span>
                      )}
                      {meeting.articlesGenerated > 0 && (
                        <span className="stat-item articles">{meeting.articlesGenerated} articles</span>
                      )}
                      <span className={`stat-item status-${meeting.status}`}>
                        {meeting.status === 'processed' ? 'Ready' :
                          meeting.status === 'analyzed' ? 'Analyzed' :
                            meeting.status === 'transcribed' ? 'Transcribed' : 'Downloading'}
                      </span>
                    </div>
                  </div>
                </div>
                <span className="view-arrow">→</span>
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}

function MeetingDetailView({ meeting, onBack, onSelectIdea, onGenerateArticle }) {
  const [selectedIdeas, setSelectedIdeas] = useState([]);
  const [expandedIdea, setExpandedIdea] = useState(null);

  const toggleIdea = (ideaId) => {
    setSelectedIdeas(prev =>
      prev.includes(ideaId)
        ? prev.filter(id => id !== ideaId)
        : [...prev, ideaId]
    );
  };

  const handleGenerate = (idea, angleName) => {
    onGenerateArticle(idea.id, angleName || 'Main');
    onBack();
  };

  const handleBatchGenerate = () => {
    selectedIdeas.forEach(ideaId => {
      const idea = meeting.ideas.find(i => i.id === ideaId);
      if (idea) {
        onGenerateArticle(idea.id, idea.angles?.[0]?.name || 'Main');
      }
    });
    onBack();
  };

  // If viewing a specific idea in detail
  if (expandedIdea) {
    return (
      <div className="idea-full-view">
        <header className="cms-header">
          <div className="cms-left">
            <button className="btn-back" onClick={() => setExpandedIdea(null)}>← Back to Ideas</button>
          </div>
        </header>

        <div className="idea-full-content">
          <div className="idea-full-header">
            <h1>{expandedIdea.title}</h1>
            <p className="idea-full-meta">From: {meeting.name} • {meeting.date}</p>
          </div>

          <div className="idea-full-body">
            <div className="idea-section">
              <h3>Summary</h3>
              <p>{expandedIdea.summary || expandedIdea.event || 'No summary available.'}</p>
            </div>

            {expandedIdea.angles && expandedIdea.angles.length > 0 && (
              <div className="idea-section">
                <h3>Coverage Angles</h3>
                <div className="angles-list">
                  {expandedIdea.angles.map((angle, i) => (
                    <div key={i} className="angle-item">
                      <div className="angle-info">
                        <h4>{angle.name}</h4>
                        <p>{angle.description || 'No description'}</p>
                      </div>
                      <button
                        className="btn-generate-angle"
                        onClick={() => handleGenerate(expandedIdea, angle.name)}
                      >
                        Generate
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="idea-full-actions">
            <button className="btn-primary-lg" onClick={() => handleGenerate(expandedIdea, expandedIdea.angles?.[0]?.name)}>
              Generate Article
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="meeting-full-view">
      <header className="cms-header">
        <div className="cms-left">
          <button className="btn-back" onClick={onBack}>← Back to Meetings</button>
        </div>
      </header>

      <div className="meeting-full-content">
        <div className="meeting-full-header">
          <div className="meeting-date-large">
            <span className="date-month-lg">{meeting.date ? meeting.date.split(' ')[0]?.toUpperCase() : 'N/A'}</span>
            <span className="date-day-lg">{meeting.date ? meeting.date.split(' ')[1]?.replace(',', '') : ''}</span>
          </div>
          <div className="meeting-title-block">
            <h1>{meeting.name || `Video ${meeting.videoId}`}</h1>
            <p>{(meeting.ideas?.length || 0)} article ideas available</p>
          </div>
        </div>

        <div className="ideas-list">
          {(!meeting.ideas || meeting.ideas.length === 0) ? (
            <div className="empty-ideas-full">
              <h3>No Article Ideas</h3>
              <p>Run the agent to generate article ideas from this meeting.</p>
            </div>
          ) : (
            meeting.ideas.map(idea => (
              <div key={idea.id} className="idea-list-item">
                <div className="idea-list-select">
                  <input
                    type="checkbox"
                    checked={selectedIdeas.includes(idea.id)}
                    onChange={() => toggleIdea(idea.id)}
                  />
                </div>
                <div className="idea-list-content">
                  <h3>{idea.title}</h3>
                  <p>{idea.summary || idea.event}</p>
                  {idea.angles && idea.angles.length > 0 && (
                    <div className="idea-list-angles">
                      {idea.angles.slice(0, 3).map((angle, i) => (
                        <span key={i} className="angle-chip">{angle.name}</span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="idea-list-actions">
                  <button className="btn-generate" onClick={() => handleGenerate(idea, idea.angles?.[0]?.name)}>
                    Generate Article
                  </button>
                  <button className="btn-details" onClick={() => setExpandedIdea(idea)}>
                    View Details
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {selectedIdeas.length > 0 && (
        <div className="batch-bar">
          <span>{selectedIdeas.length} idea{selectedIdeas.length > 1 ? 's' : ''} selected</span>
          <button className="btn-batch" onClick={handleBatchGenerate}>
            Generate {selectedIdeas.length} Article{selectedIdeas.length > 1 ? 's' : ''}
          </button>
        </div>
      )}
    </div>
  );
}

export default App;
