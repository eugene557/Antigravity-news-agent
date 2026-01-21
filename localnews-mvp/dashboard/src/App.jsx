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

// In production, use relative URLs (same origin). In dev, use localhost:3001
const API_URL = import.meta.env.PROD ? '/api' : 'http://localhost:3001/api';

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
  const [viewSource, setViewSource] = useState('town-meeting'); // Default to Town Hall News Agent
  const [townHallView, setTownHallView] = useState('meetings'); // 'meetings', 'articles', 'upcoming', or 'settings'
  const [townHallExpanded, setTownHallExpanded] = useState(true); // Dropdown expanded state
  const [crimeWatchExpanded, setCrimeWatchExpanded] = useState(false); // Crime Watch dropdown
  const [crimeWatchView, setCrimeWatchView] = useState('incidents'); // 'incidents', 'articles', or 'settings'
  const [crimeIncidents, setCrimeIncidents] = useState([]);
  const [crimeSettings, setCrimeSettings] = useState(null);
  const [selectedMeeting, setSelectedMeeting] = useState(null);
  const [selectedIncident, setSelectedIncident] = useState(null);
  const [filterStatus, setFilterStatus] = useState('draft');
  const [sortBy, setSortBy] = useState('newest');

  const [agentStatus, setAgentStatus] = useState({
    crimeWatch: { lastRun: null, running: false, error: null, lastResult: null },
    townMeeting: { lastRun: null, running: false, error: null, lastResult: null }
  });

  // Toast notifications
  const [toasts, setToasts] = useState([]);

  // Centered result modal (replaces toast for agent results)
  const [resultModal, setResultModal] = useState(null);

  // Confirmation modal for delete actions
  const [confirmModal, setConfirmModal] = useState(null);

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
      fetchCrimeIncidents();
      fetchCrimeSettings();
      const interval = setInterval(() => {
        fetchAgentStatus();
        fetchIdeas();
        fetchMeetings();
        fetchUpcomingMeetings();
        fetchCrimeIncidents();
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

  async function fetchCrimeIncidents() {
    try {
      const res = await fetch(`${API_URL}/agents/crime-watch/incidents`);
      const data = await res.json();
      setCrimeIncidents(data.incidents || []);
    } catch (err) {
      console.error('Failed to fetch crime incidents:', err);
    }
  }

  async function fetchCrimeSettings() {
    try {
      const res = await fetch(`${API_URL}/settings/crime-watch`);
      if (res.ok) {
        const data = await res.json();
        setCrimeSettings(data);
      }
    } catch (err) {
      console.error('Failed to fetch crime settings:', err);
    }
  }

  async function saveCrimeSettings(newSettings) {
    try {
      await fetch(`${API_URL}/settings/crime-watch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSettings)
      });
      setCrimeSettings(newSettings);
      addToast('success', 'Settings', 'Crime Watch settings saved successfully');
    } catch (err) {
      addToast('error', 'Settings', 'Failed to save settings');
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

  function handleDeleteUpcoming(meetingId) {
    setConfirmModal({
      title: 'Delete Meeting',
      message: 'Are you sure you want to delete this upcoming meeting? This action cannot be undone.',
      onConfirm: async () => {
        setConfirmModal(null);
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
      },
      onCancel: () => setConfirmModal(null)
    });
  }

  async function generateArticleFromIdea(ideaId, angleName, videoId) {
    try {
      addToast('info', 'Generation', 'Starting article generation...');
      const departmentId = selectedDeptId;

      await fetch(`${API_URL}/agents/town-meeting/generate-article`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ideaId, angleName, departmentId, videoId })
      });

      setAgentStatus(prev => ({
        ...prev,
        townMeeting: { ...prev.townMeeting, running: true }
      }));
    } catch (err) {
      addToast('error', 'Generation', 'Failed to start generation');
    }
  }

  async function generateArticleFromIncident(incident) {
    try {
      addToast('info', 'Generation', 'Generating crime brief...');

      const res = await fetch(`${API_URL}/agents/crime-watch/generate-article`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ incident })
      });

      if (!res.ok) {
        throw new Error('Failed to generate article');
      }

      const result = await res.json();
      addToast('success', 'Generation', 'Crime brief generated successfully');
      fetchArticles();
      setSelectedIncident(null);
    } catch (err) {
      addToast('error', 'Generation', 'Failed to generate crime brief');
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

      // 2. Filter by Status (discarded articles go to trash, not shown here)
      if (a.status === 'discarded') return false;
      return a.status === filterStatus;
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
          <p>Loading...</p>
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
            <button
              className={`nav-item nav-parent ${townHallExpanded ? 'expanded' : ''}`}
              onClick={() => setTownHallExpanded(!townHallExpanded)}
            >
              <span className="nav-parent-text">Town Hall News Agent</span>
              <span className={`nav-arrow ${townHallExpanded ? 'expanded' : ''}`}>▶</span>
            </button>
            {townHallExpanded && (
              <div className="nav-children">
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
            )}
          </div>

          <div className="nav-section">
            <button
              className={`nav-item nav-parent ${crimeWatchExpanded ? 'expanded' : ''}`}
              onClick={() => setCrimeWatchExpanded(!crimeWatchExpanded)}
            >
              <span className="nav-parent-text">Crime Watch Agent</span>
              <span className={`nav-arrow ${crimeWatchExpanded ? 'expanded' : ''}`}>▶</span>
            </button>
            {crimeWatchExpanded && (
              <div className="nav-children">
                <button
                  className={`nav-item nav-sub ${viewSource === 'crime-watch' && crimeWatchView === 'incidents' ? 'active' : ''}`}
                  onClick={() => {
                    setViewSource('crime-watch');
                    setCrimeWatchView('incidents');
                    setShowSettings(false);
                    setSelectedMeeting(null);
                    setSelectedIncident(null);
                    setSelectedIdea(null);
                    setSelectedArticle(null);
                  }}
                >
                  Incidents
                </button>
                <button
                  className={`nav-item nav-sub ${viewSource === 'crime-watch' && crimeWatchView === 'articles' ? 'active' : ''}`}
                  onClick={() => {
                    setViewSource('crime-watch');
                    setCrimeWatchView('articles');
                    setShowSettings(false);
                    setSelectedMeeting(null);
                    setSelectedIncident(null);
                    setSelectedIdea(null);
                    setSelectedArticle(null);
                  }}
                >
                  Articles <span className="badge">{getCount('crime-watch')}</span>
                </button>
                <button
                  className={`nav-item nav-sub ${viewSource === 'crime-watch' && crimeWatchView === 'settings' ? 'active' : ''}`}
                  onClick={() => {
                    setViewSource('crime-watch');
                    setCrimeWatchView('settings');
                    setSelectedMeeting(null);
                    setSelectedIncident(null);
                    setSelectedIdea(null);
                    setSelectedArticle(null);
                  }}
                >
                  Settings
                </button>
              </div>
            )}
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
          <div className="sidebar-footer-actions">
            <button className="btn-refresh" onClick={() => { fetchArticles(); fetchAgentStatus(); fetchIdeas(); fetchMeetings(); fetchUpcomingMeetings(); }}>
              Refresh
            </button>
            <button className="btn-logout" onClick={handleLogout}>
              Logout
            </button>
          </div>
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
        {viewSource === 'trash' ? (
          <TrashView
            discardedArticles={articles.filter(a => a.status === 'discarded')}
            onRestoreArticle={(id) => updateStatus(id, 'draft')}
            onDeleteArticle={(id) => updateStatus(id, 'deleted')}
            onBack={() => setViewSource('town-meeting')}
          />
        ) : showSettings ? (
          <SettingsView
            settings={settings}
            user={user}
            onSave={saveSettings}
            onClose={() => setShowSettings(false)}
            discardedArticles={articles.filter(a => a.status === 'discarded' && a.agentSource === 'town-meeting')}
            onRestoreArticle={(id) => updateStatus(id, 'draft')}
            onDeleteArticle={(id) => updateStatus(id, 'deleted')}
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
        ) : viewSource === 'crime-watch' && crimeWatchView === 'settings' ? (
          <CrimeWatchSettingsView
            settings={crimeSettings}
            onSave={saveCrimeSettings}
            discardedArticles={articles.filter(a => a.status === 'discarded' && a.agentSource === 'crime-watch')}
            onRestoreArticle={(id) => updateStatus(id, 'draft')}
            onDeleteArticle={(id) => updateStatus(id, 'deleted')}
          />
        ) : selectedIncident ? (
          <CrimeIncidentDetailView
            incident={selectedIncident}
            onBack={() => setSelectedIncident(null)}
            onGenerateArticle={generateArticleFromIncident}
          />
        ) : viewSource === 'crime-watch' && crimeWatchView === 'incidents' ? (
          <>
            <header className="feed-header">
              <div className="feed-title-row">
                <div className="feed-title-block">
                  <h2>Crime Incidents</h2>
                </div>
                <div className="feed-actions">
                  <AgentControl
                    name="Crime Agent"
                    status={agentStatus.crimeWatch}
                    onRun={() => runAgent('crime-watch')}
                  />
                </div>
              </div>
            </header>
            <div className="feed-content">
              <CrimeIncidentListView
                incidents={crimeIncidents}
                onSelectIncident={setSelectedIncident}
              />
            </div>
          </>
        ) : !selectedArticle ? (
          <>
            <header className="feed-header">
              <div className="feed-title-row">
                <div className="feed-title-block">
                  <h2>
                    {viewSource === 'town-meeting' && townHallView === 'meetings' && 'Meetings'}
                    {viewSource === 'town-meeting' && townHallView === 'articles' && 'Town Hall Articles'}
                    {viewSource === 'crime-watch' && crimeWatchView === 'articles' && 'Crime Watch Articles'}
                  </h2>
                </div>
                <div className="feed-actions">
                  {viewSource === 'town-meeting' && (
                    <AgentControl
                      name="Meeting Agent"
                      status={agentStatus.townMeeting}
                      onRun={() => runAgent('town-meeting')}
                    />
                  )}
                  {viewSource === 'crime-watch' && (
                    <AgentControl
                      name="Crime Agent"
                      status={agentStatus.crimeWatch}
                      onRun={() => runAgent('crime-watch')}
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
                  upcomingMeetings={upcomingMeetings}
                  departments={settings?.departments}
                  onSelectMeeting={setSelectedMeeting}
                  onAddMeeting={() => setShowAddMeetingModal(true)}
                />
              ) : (
                <>
                  <div className="hero-metrics">
                    <MetricCard label="Total Items" value={filteredArticles.length} />
                    <MetricCard label="Drafts Pending" value={articles.filter(a => a.agentSource === viewSource && a.status === 'draft').length} highlight={true} />
                    <MetricCard label="Ready to Publish" value={articles.filter(a => a.agentSource === viewSource && a.status === 'approved').length} type="success" />
                    <MetricCard label="This Week" value={articles.filter(a => a.agentSource === viewSource && isThisWeek(a.date)).length} highlight={true} labelSmall="New" />
                  </div>

                  <div className="filter-bar">
                    <div className="filter-tabs">
                      <button className={`tab ${filterStatus === 'draft' ? 'active' : ''}`} onClick={() => setFilterStatus('draft')}>
                        Drafts <span className="tab-count draft">{articles.filter(a => a.agentSource === viewSource && a.status === 'draft').length}</span>
                      </button>
                      <button className={`tab ${filterStatus === 'approved' ? 'active' : ''}`} onClick={() => setFilterStatus('approved')}>
                        Approved <span className="tab-count approved">{articles.filter(a => a.agentSource === viewSource && a.status === 'approved').length}</span>
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

      {confirmModal && (
        <ConfirmModal
          title={confirmModal.title}
          message={confirmModal.message}
          onConfirm={confirmModal.onConfirm}
          onCancel={confirmModal.onCancel}
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

function ConfirmModal({ title, message, onConfirm, onCancel }) {
  return (
    <div className="confirm-modal-overlay" onClick={onCancel}>
      <div className="confirm-modal" onClick={e => e.stopPropagation()}>
        <div className="confirm-modal-icon">⚠</div>
        <h2 className="confirm-modal-title">{title}</h2>
        <p className="confirm-modal-message">{message}</p>
        <div className="confirm-modal-actions">
          <button className="confirm-modal-cancel" onClick={onCancel}>Cancel</button>
          <button className="confirm-modal-confirm" onClick={onConfirm}>Delete</button>
        </div>
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

  // Source meeting info from article data
  const sourceMeeting = article.meetingType ? {
    name: article.meetingType,
    date: article.meetingDate ? new Date(article.meetingDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''
  } : null;

  // Get display name for the source pill
  const getSourceLabel = () => {
    if (article.departmentName) return article.departmentName;
    if (article.agentSource === 'town-meeting') return 'Town Council';
    if (article.agentSource === 'crime-watch') return 'Crime Watch';
    return article.agentSource || 'Unknown';
  };

  return (
    <div className={`article-card ${article.status}`} onClick={onClick}>
      <div className="card-top">
        <div className="card-top-left">
          <span className={`source-pill ${article.departmentId || article.agentSource}`}>
            {getSourceLabel()}
          </span>
          {isNew && <span className="new-badge">New</span>}
        </div>
        <span className="date">Generated {formatRelativeTime(article.createdAt)}</span>
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
            {form.departmentName || (form.agentSource === 'town-meeting' ? 'Town Council' : 'Crime Watch')}
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
    // For older items, show "on Jan 2, 10:30 AM" format
    return `on ${formatDate(dateStr)}`;
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

function SettingsView({ settings, user, onSave, onClose, discardedArticles, onRestoreArticle, onDeleteArticle }) {
  const [localSettings, setLocalSettings] = useState(settings);
  const [selectedDept, setSelectedDept] = useState(0);
  const [activeSection, setActiveSection] = useState('board');

  const trashCount = discardedArticles?.length || 0;

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
            <button
              className={`settings-nav-item ${activeSection === 'discarded' ? 'active' : ''}`}
              onClick={() => setActiveSection('discarded')}
            >
              <span className="nav-icon">🗑</span>
              Discarded {trashCount > 0 && <span className="nav-badge">{trashCount}</span>}
            </button>
          </div>
        </nav>

        <div className="settings-main">
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

          {activeSection === 'discarded' && (
            <div className="settings-page">
              <div className="settings-page-title">
                <h1>Discarded Articles</h1>
                <p>Town Meeting articles that have been discarded</p>
              </div>

              <div className="settings-card">
                <div className="settings-card-title">
                  <h2>Trash</h2>
                  <span className="member-count-badge">{trashCount}</span>
                </div>
                <div className="settings-card-body no-padding">
                  {trashCount === 0 ? (
                    <div className="empty-trash-section">
                      <span className="trash-icon-large">🗑</span>
                      <h3>No discarded articles</h3>
                      <p>Discarded Town Meeting articles will appear here</p>
                    </div>
                  ) : (
                    <div className="discarded-articles-list">
                      {discardedArticles.map((article) => (
                        <div key={article.id} className="discarded-article-row">
                          <div className="discarded-article-info">
                            <h4>{article.headline || 'Untitled Article'}</h4>
                            <p>{article.summary || article.body?.substring(0, 100) || 'No content'}</p>
                            <span className="discarded-meta">
                              Discarded {formatRelativeTime(article.updatedAt || article.createdAt)}
                            </span>
                          </div>
                          <div className="discarded-article-actions">
                            <button
                              className="btn-restore"
                              onClick={() => onRestoreArticle(article.id)}
                              title="Restore to drafts"
                            >
                              ↩ Restore
                            </button>
                            <button
                              className="btn-delete-permanent"
                              onClick={() => onDeleteArticle(article.id)}
                              title="Delete permanently"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

// Crime Watch Settings View
function CrimeWatchSettingsView({ settings, onSave, discardedArticles, onRestoreArticle, onDeleteArticle }) {
  const [localSettings, setLocalSettings] = useState(settings || {
    daysToFetch: 30,
    newsworthyCrimes: ['Assault', 'Robbery', 'Burglary', 'Motor Vehicle Theft', 'Arson', 'Homicide'],
    skipCrimes: ['Vandalism', 'Trespassing', 'Disturbing the Peace'],
    autoRun: false
  });
  const [activeSection, setActiveSection] = useState('config');

  const trashCount = discardedArticles?.length || 0;

  const handleSave = () => {
    onSave(localSettings);
  };

  return (
    <div className="settings-layout">
      <header className="settings-page-header">
        <div className="settings-header-left">
          <h1>Crime Watch Settings</h1>
        </div>
        <div className="settings-header-right">
          <button className="btn-save-settings" onClick={handleSave}>Save Changes</button>
        </div>
      </header>

      <div className="settings-body">
        <nav className="settings-nav">
          <div className="settings-nav-section">
            <span className="settings-nav-label">Configuration</span>
            <button
              className={`settings-nav-item ${activeSection === 'config' ? 'active' : ''}`}
              onClick={() => setActiveSection('config')}
            >
              <span className="nav-icon">◉</span>
              Data Source
            </button>
            <button
              className={`settings-nav-item ${activeSection === 'discarded' ? 'active' : ''}`}
              onClick={() => setActiveSection('discarded')}
            >
              <span className="nav-icon">🗑</span>
              Discarded {trashCount > 0 && <span className="nav-badge">{trashCount}</span>}
            </button>
          </div>
        </nav>

        <div className="settings-main">
          {activeSection === 'config' && (
            <div className="settings-page">
              <div className="settings-page-title">
                <h1>Data Source</h1>
                <p>Configure how crime data is fetched from LexisNexis Community Crime Map</p>
              </div>

              <div className="settings-card">
                <div className="settings-card-title">
                  <h2>Fetch Settings</h2>
                </div>
                <div className="settings-card-body">
                  <div className="settings-row">
                    <label>Days to fetch</label>
                    <input
                      type="number"
                      value={localSettings.daysToFetch}
                      onChange={(e) => setLocalSettings({ ...localSettings, daysToFetch: parseInt(e.target.value) || 30 })}
                      min="1"
                      max="90"
                      style={{ width: '100px' }}
                    />
                    <span className="settings-hint">How many days of incident history to fetch (1-90)</span>
                  </div>
                </div>
              </div>

              <div className="settings-card">
                <div className="settings-card-title">
                  <h2>Location</h2>
                </div>
                <div className="settings-card-body">
                  <div className="settings-info-row">
                    <span className="settings-label">Coverage Area</span>
                    <span className="settings-value">Jupiter, FL (26.9342, -80.0942)</span>
                  </div>
                  <div className="settings-info-row">
                    <span className="settings-label">Data Source</span>
                    <a
                      href="https://communitycrimemap.com/?address=Jupiter,FL"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="settings-link"
                    >
                      LexisNexis Community Crime Map ↗
                    </a>
                  </div>
                </div>
              </div>

              <div className="settings-card">
                <div className="settings-card-title">
                  <h2>Newsworthy Crime Types</h2>
                </div>
                <div className="settings-card-body">
                  <p className="settings-description">These crime types will be flagged for article generation:</p>
                  <div className="crime-types-grid">
                    {['Assault', 'Aggravated Assault', 'Robbery', 'Burglary', 'Motor Vehicle Theft', 'Arson', 'Homicide', 'Kidnapping', 'Weapons Violation', 'Sexual Assault'].map(crime => (
                      <label key={crime} className="crime-type-checkbox">
                        <input
                          type="checkbox"
                          checked={localSettings.newsworthyCrimes?.includes(crime) ?? true}
                          onChange={(e) => {
                            const crimes = localSettings.newsworthyCrimes || [];
                            if (e.target.checked) {
                              setLocalSettings({ ...localSettings, newsworthyCrimes: [...crimes, crime] });
                            } else {
                              setLocalSettings({ ...localSettings, newsworthyCrimes: crimes.filter(c => c !== crime) });
                            }
                          }}
                        />
                        {crime}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeSection === 'discarded' && (
            <div className="settings-page">
              <div className="settings-page-title">
                <h1>Discarded Articles</h1>
                <p>Crime Watch articles that have been discarded</p>
              </div>

              <div className="settings-card">
                <div className="settings-card-title">
                  <h2>Trash</h2>
                  <span className="member-count-badge">{trashCount}</span>
                </div>
                <div className="settings-card-body no-padding">
                  {trashCount === 0 ? (
                    <div className="empty-trash-section">
                      <span className="trash-icon-large">🗑</span>
                      <h3>No discarded articles</h3>
                      <p>Discarded Crime Watch articles will appear here</p>
                    </div>
                  ) : (
                    <div className="discarded-articles-list">
                      {discardedArticles.map((article) => (
                        <div key={article.id} className="discarded-article-row">
                          <div className="discarded-article-info">
                            <h4>{article.headline || 'Untitled Article'}</h4>
                            <p>{article.summary || article.body?.substring(0, 100) || 'No content'}</p>
                            <span className="discarded-meta">
                              Discarded {formatRelativeTime(article.updatedAt || article.createdAt)}
                            </span>
                          </div>
                          <div className="discarded-article-actions">
                            <button
                              className="btn-restore"
                              onClick={() => onRestoreArticle(article.id)}
                              title="Restore to drafts"
                            >
                              ↩ Restore
                            </button>
                            <button
                              className="btn-delete-permanent"
                              onClick={() => onDeleteArticle(article.id)}
                              title="Delete permanently"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Crime Incident List View
function CrimeIncidentListView({ incidents, onSelectIncident }) {
  // Format date for display
  const formatDate = (dateStr) => {
    if (!dateStr) return { month: '---', day: '--' };
    const date = new Date(dateStr);
    const month = date.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
    const day = date.getDate();
    return { month, day };
  };

  if (!incidents || incidents.length === 0) {
    return (
      <div className="empty-state">
        <h3>No crime incidents</h3>
        <p>Click "Run Agent" to fetch recent crime data from Jupiter, FL</p>
      </div>
    );
  }

  // Sort incidents by date (newest first)
  const sortedIncidents = [...incidents].sort((a, b) =>
    new Date(b.dateTime) - new Date(a.dateTime)
  );

  return (
    <div className="incidents-section">
      <div className="meetings-tabs">
        <button className="meetings-tab active">
          Recent Incidents
          <span className="tab-count">{incidents.length}</span>
        </button>
      </div>

      <div className="incidents-list-view">
        {sortedIncidents.map((incident) => {
          const dateFormatted = formatDate(incident.dateTime);
          const severity = getSeverityClass(incident.crimeClass);
          const timeStr = new Date(incident.dateTime).toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
          });

          return (
            <div
              key={incident.id || incident.referenceId}
              className="incident-row clickable"
              onClick={() => onSelectIncident?.(incident)}
            >
              <div className="incident-row-main">
                <div className="incident-row-left">
                  <div className={`incident-date-block severity-${severity}`}>
                    <span className="date-month">{dateFormatted.month}</span>
                    <span className="date-day">{dateFormatted.day}</span>
                  </div>
                  <div className="incident-row-info">
                    <h4>{incident.crime || 'Unknown Crime'}</h4>
                    <div className="incident-meta">
                      <span className={`incident-badge severity-${severity}`}>
                        {incident.crimeClass || 'Unknown'}
                      </span>
                      <span className="incident-time-badge">{timeStr}</span>
                      {incident.locationType && (
                        <span className="incident-location-badge">{incident.locationType}</span>
                      )}
                    </div>
                    <div className="incident-address">
                      {incident.address || 'Location unknown'}
                    </div>
                  </div>
                </div>
                <span className="view-arrow">→</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function getSeverityClass(crimeClass) {
  const high = ['Assault', 'Robbery', 'Homicide', 'Kidnapping', 'Sexual Assault', 'Arson', 'Aggravated'];
  const medium = ['Burglary', 'Motor Vehicle Theft', 'Weapons Violation', 'Theft'];
  if (high.some(c => crimeClass?.includes(c))) return 'high';
  if (medium.some(c => crimeClass?.includes(c))) return 'medium';
  return 'low';
}

// Crime Incident Detail View - similar to MeetingDetailView
function CrimeIncidentDetailView({ incident, onBack, onGenerateArticle }) {
  const [generating, setGenerating] = useState(false);

  const formatDateTime = (dateStr) => {
    const date = new Date(dateStr);
    return {
      date: date.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric'
      }),
      time: date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      })
    };
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      await onGenerateArticle(incident);
    } finally {
      setGenerating(false);
    }
  };

  const dateTime = formatDateTime(incident.dateTime);
  const severity = getSeverityClass(incident.crimeClass);

  return (
    <div className="incident-detail-view">
      <header className="cms-header">
        <div className="cms-left">
          <button className="btn-back" onClick={onBack}>← Back to Incidents</button>
        </div>
      </header>

      <div className="incident-detail-content">
        <div className="incident-detail-header">
          <div className={`incident-date-large severity-${severity}`}>
            <span className="date-month-lg">
              {new Date(incident.dateTime).toLocaleDateString('en-US', { month: 'short' }).toUpperCase()}
            </span>
            <span className="date-day-lg">
              {new Date(incident.dateTime).getDate()}
            </span>
          </div>
          <div className="incident-title-block">
            <h1>{incident.crime || 'Unknown Crime'}</h1>
            <p>{dateTime.date} at {dateTime.time}</p>
          </div>
        </div>

        <div className="incident-detail-body">
          <div className="incident-info-grid">
            <div className="incident-info-item">
              <label>Crime Type</label>
              <span className={`incident-badge-lg severity-${severity}`}>
                {incident.crimeClass || 'Unknown'}
              </span>
            </div>
            <div className="incident-info-item">
              <label>Location Type</label>
              <span>{incident.locationType || 'Not specified'}</span>
            </div>
            <div className="incident-info-item full-width">
              <label>Address</label>
              <span>{incident.address || 'Address not available'}</span>
            </div>
            <div className="incident-info-item">
              <label>Agency</label>
              <span>{incident.agency || 'Jupiter Police'}</span>
            </div>
            <div className="incident-info-item">
              <label>Reference ID</label>
              <span className="reference-id">{incident.referenceId || 'N/A'}</span>
            </div>
          </div>

          <div className="incident-actions-panel">
            <h3>Generate Article</h3>
            <p>Create a news brief from this incident for publication.</p>
            <button
              className="btn-primary-lg"
              onClick={handleGenerate}
              disabled={generating}
            >
              {generating ? 'Generating...' : 'Generate Crime Brief'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function TrashView({ discardedArticles, onRestoreArticle, onDeleteArticle, onBack }) {
  return (
    <div className="trash-view">
      <header className="trash-header">
        <div className="trash-header-left">
          <button className="btn-back" onClick={onBack}>← Back</button>
          <h1>Trash</h1>
        </div>
        <span className="trash-count-header">{discardedArticles.length} item{discardedArticles.length !== 1 ? 's' : ''}</span>
      </header>

      <div className="trash-content">
        {discardedArticles.length === 0 ? (
          <div className="empty-trash-view">
            <h2>Trash is empty</h2>
            <p>Discarded articles will appear here</p>
          </div>
        ) : (
          <div className="trash-articles-list">
            {discardedArticles.map((article) => (
              <div key={article.id} className="trash-article-card">
                <div className="trash-article-info">
                  <h3>{article.headline || 'Untitled Article'}</h3>
                  <p className="trash-article-summary">{article.summary || article.body?.substring(0, 100) || 'No content'}</p>
                  <span className="trash-article-meta">
                    {article.agentSource === 'town-meeting' ? 'Town Meeting' : 'Crime Watch'} •
                    Discarded {formatRelativeTime(article.updatedAt || article.createdAt)}
                  </span>
                </div>
                <div className="trash-article-actions">
                  <button
                    className="btn-restore-lg"
                    onClick={() => onRestoreArticle(article.id)}
                  >
                    ↩ Restore
                  </button>
                  <button
                    className="btn-delete-lg"
                    onClick={() => onDeleteArticle(article.id)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
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

  // Fallback departments if none provided (should match town_meeting_settings.json)
  const fallbackDepartments = [
    { id: 'town-council', name: 'Town Council' },
    { id: 'planning-zoning', name: 'Planning & Zoning' },
    { id: 'art-board', name: 'Art Committee' }
  ];

  const deptList = departments && departments.length > 0 ? departments : fallbackDepartments;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!date) return;
    setLoading(true);
    const dept = deptList.find(d => d.id === departmentId);
    await onAdd({ date, type: dept?.name || departmentId, departmentId, description: description.trim() || null });
    setLoading(false);
    onClose();
  };
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
                <div className="calendar-month-dots">
                  {Array.from({ length: 12 }, (_, i) => {
                    const month = i + 1;
                    const year = 2026;
                    const isActive = currentMonth.year === year && currentMonth.month === month;
                    const hasEvents = meetingMonths.includes(`${year}-${month}`);
                    return (
                      <button
                        key={`${year}-${month}`}
                        className={`calendar-month-dot ${isActive ? 'active' : ''} ${hasEvents ? 'has-events' : ''}`}
                        onClick={() => setCurrentMonth({ year, month })}
                        title={getMonthName(year, month)}
                      >
                        {new Date(year, month - 1).toLocaleDateString('en-US', { month: 'short' })}
                      </button>
                    );
                  })}
                </div>
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

function MeetingListView({ department, ideas, meetings, upcomingMeetings, departments, onSelectMeeting, onAddMeeting }) {
  // Calendar state for upcoming section
  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState({
    year: today.getFullYear(),
    month: today.getMonth() + 1
  });

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
    const meetingIdeas = ideas.filter(() => meeting.ideasCount > 0);
    const dateToUse = meeting.date || meeting.processedAt;
    const dateForName = dateToUse
      ? new Date(dateToUse + (meeting.date ? 'T12:00:00' : '')).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : `Video ${meeting.videoId}`;

    return {
      ...meeting,
      name: `${meeting.type || department?.name || 'Meeting'} - ${dateForName}`,
      date: formatDate(dateToUse + (meeting.date ? 'T12:00:00' : '')),
      rawDate: dateToUse,
      dateStr: dateForName,
      ideas: meeting.ideasCount > 0 ? ideas : []
    };
  });

  // Sort meetings chronologically - latest first
  const sortedMeetings = [...enrichedMeetings].sort((a, b) => {
    const dateA = a.rawDate ? new Date(a.rawDate) : new Date(0);
    const dateB = b.rawDate ? new Date(b.rawDate) : new Date(0);
    return dateB - dateA;
  });

  // Calendar helpers for upcoming section
  const getDeptName = (deptId) => {
    const dept = departments?.find(d => d.id === deptId);
    return dept?.name || deptId || 'Meeting';
  };

  const enrichedUpcoming = (upcomingMeetings || []).map(meeting => ({
    ...meeting,
    name: getDeptName(meeting.departmentId)
  }));

  const goToPrevMonth = () => {
    setCurrentMonth(prev => prev.month === 1 ? { year: prev.year - 1, month: 12 } : { ...prev, month: prev.month - 1 });
  };

  const goToNextMonth = () => {
    setCurrentMonth(prev => prev.month === 12 ? { year: prev.year + 1, month: 1 } : { ...prev, month: prev.month + 1 });
  };

  const goToToday = () => {
    setCurrentMonth({ year: today.getFullYear(), month: today.getMonth() + 1 });
  };

  const generateCalendarDays = (year, month) => {
    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);
    const daysInMonth = lastDay.getDate();
    const startPadding = firstDay.getDay();
    const endPadding = (7 - ((startPadding + daysInMonth) % 7)) % 7;
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    const days = [];
    for (let i = 0; i < startPadding; i++) {
      days.push({ day: null, meetings: [], isOtherMonth: true });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dayMeetings = enrichedUpcoming.filter(m => m.date === dateStr);
      days.push({ day: d, meetings: dayMeetings, date: dateStr, isToday: dateStr === todayStr });
    }
    for (let i = 0; i < endPadding; i++) {
      days.push({ day: null, meetings: [], isOtherMonth: true });
    }
    return days;
  };

  const getMonthName = (year, month) => {
    return new Date(year, month - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  return (
    <>
      {/* Processed Meetings Section */}
      <div className="meetings-section">
        <div className="meetings-tabs">
          <button className="meetings-tab active">
            Processed Meetings
            <span className="tab-count">{sortedMeetings.length}</span>
          </button>
        </div>

        <div className="meetings-list">
          {sortedMeetings.length === 0 ? (
            <div className="empty-state">
              <h3>No meetings processed yet</h3>
              <p>Run the Meeting Agent to process videos.</p>
            </div>
          ) : (
            sortedMeetings.map(meeting => (
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
      </div>

      {/* Upcoming Meetings Calendar Section */}
      <div className="upcoming-section">
        <div className="meetings-tabs">
          <button className="meetings-tab active">
            Upcoming Meetings
            <span className="tab-count">{enrichedUpcoming.length}</span>
          </button>
          <button className="btn-add-meeting-sm" onClick={onAddMeeting}>
            + Add
          </button>
        </div>

        <div className="upcoming-calendar-grid">
          <div className="calendar-container">
            <div className="calendar-nav">
              <div className="calendar-nav-left">
                <button className="calendar-nav-btn" onClick={goToPrevMonth}>‹</button>
                <h3 className="calendar-month-title">{getMonthName(currentMonth.year, currentMonth.month)}</h3>
                <button className="calendar-nav-btn" onClick={goToNextMonth}>›</button>
              </div>
              <button className="calendar-today-btn" onClick={goToToday}>Today</button>
            </div>

            <div className="calendar-table-grid">
              <div className="calendar-weekdays-grid">
                <span>SUN</span><span>MON</span><span>TUE</span><span>WED</span><span>THU</span><span>FRI</span><span>SAT</span>
              </div>
              <div className="calendar-days-grid">
                {generateCalendarDays(currentMonth.year, currentMonth.month).map((dayInfo, idx) => (
                  <div
                    key={idx}
                    className={`calendar-cell ${dayInfo.isOtherMonth ? 'other-month' : ''} ${dayInfo.meetings.length > 0 ? 'has-meeting' : ''} ${dayInfo.isToday ? 'is-today' : ''}`}
                  >
                    {dayInfo.day && (
                      <>
                        <span className="cell-day-num">{dayInfo.day}</span>
                        {dayInfo.meetings.length > 0 && (
                          <div className="cell-meetings">
                            {dayInfo.meetings.map(m => (
                              <div key={m.id} className="cell-meeting-item" title={`${m.name}${m.description ? ` - ${m.description}` : ''}`}>
                                {m.name}
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function MeetingDetailView({ meeting, onBack, onSelectIdea, onGenerateArticle }) {
  const [selectedIdeas, setSelectedIdeas] = useState([]);
  const [expandedIdea, setExpandedIdea] = useState(null);
  const [ideas, setIdeas] = useState([]);
  const [loadingIdeas, setLoadingIdeas] = useState(true);
  const [reprocessing, setReprocessing] = useState(false);

  // Fetch ideas specific to this meeting's videoId
  const fetchMeetingIdeas = async () => {
    setLoadingIdeas(true);
    try {
      const videoId = meeting.videoId || meeting.id;
      const res = await fetch(`${API_URL}/agents/town-meeting/ideas?videoId=${videoId}`);
      const data = await res.json();
      setIdeas(data.ideas || []);
    } catch (err) {
      console.error('Failed to fetch meeting ideas:', err);
      setIdeas([]);
    } finally {
      setLoadingIdeas(false);
    }
  };

  useEffect(() => {
    fetchMeetingIdeas();
  }, [meeting.videoId, meeting.id]);

  // Reprocess meeting to regenerate ideas
  const handleReprocess = async () => {
    setReprocessing(true);
    try {
      const videoId = meeting.videoId || meeting.id;
      const res = await fetch(`${API_URL}/agents/town-meeting/reprocess`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId })
      });
      if (res.ok) {
        // Poll for completion
        const checkInterval = setInterval(async () => {
          const statusRes = await fetch(`${API_URL}/agents/status`);
          const status = await statusRes.json();
          if (!status.townMeeting?.running) {
            clearInterval(checkInterval);
            setReprocessing(false);
            fetchMeetingIdeas(); // Refresh ideas
          }
        }, 3000);
      }
    } catch (err) {
      console.error('Failed to reprocess meeting:', err);
      setReprocessing(false);
    }
  };

  const toggleIdea = (ideaId) => {
    setSelectedIdeas(prev =>
      prev.includes(ideaId)
        ? prev.filter(id => id !== ideaId)
        : [...prev, ideaId]
    );
  };

  const handleGenerate = (idea, angleName) => {
    const videoId = meeting.videoId || meeting.id;
    onGenerateArticle(idea.id, angleName || 'Main', videoId);
    onBack();
  };

  const handleBatchGenerate = () => {
    const videoId = meeting.videoId || meeting.id;
    selectedIdeas.forEach(ideaId => {
      const idea = ideas.find(i => i.id === ideaId);
      if (idea) {
        onGenerateArticle(idea.id, idea.angles?.[0]?.name || 'Main', videoId);
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
            <p className="idea-full-meta">From: {meeting.name} • {meeting.dateStr || 'Unknown date'}</p>
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
            <span className="date-month-lg">{meeting.date?.month || 'N/A'}</span>
            <span className="date-day-lg">{meeting.date?.day || ''}</span>
          </div>
          <div className="meeting-title-block">
            <h1>{meeting.name || `Video ${meeting.videoId}`}</h1>
            <p>{loadingIdeas ? 'Loading ideas...' : `${ideas.length} article ideas available`}</p>
          </div>
        </div>

        <div className="ideas-list">
          {loadingIdeas ? (
            <div className="empty-ideas-full">
              <h3>Loading Ideas...</h3>
              <p>Fetching article ideas for this meeting.</p>
            </div>
          ) : ideas.length === 0 ? (
            <div className="empty-ideas-full">
              <h3>No Article Ideas</h3>
              <p>Ideas may have been lost during a deployment. Click below to reprocess this meeting and regenerate ideas.</p>
              <button
                className="btn-primary-lg"
                onClick={handleReprocess}
                disabled={reprocessing}
                style={{ marginTop: '16px' }}
              >
                {reprocessing ? 'Reprocessing...' : 'Reprocess Meeting'}
              </button>
              {reprocessing && (
                <p style={{ marginTop: '12px', fontSize: '13px', color: 'var(--gray-500)' }}>
                  This may take a few minutes. The meeting video will be re-downloaded, transcribed, and analyzed.
                </p>
              )}
            </div>
          ) : (
            ideas.map(idea => (
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
