import { NavLink, useNavigate } from 'react-router-dom';
import { Home, List, Sparkles, Settings, LogOut, Menu, X, BarChart3, Calendar, Shuffle, Award, Radar, Search } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useState, useEffect } from 'react';

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [quickSearch, setQuickSearch] = useState('');
  const [scrolled, setScrolled] = useState(false);

  // PC Feature 1: Sticky navbar with scroll-aware styling
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // PC Feature 2: Keyboard shortcuts indicator
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === '/') {
        e.preventDefault();
        setSearchOpen(prev => !prev);
      }
      if (e.key === 'Escape') {
        setSearchOpen(false);
        setMobileOpen(false);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  // Close mobile nav on route changes via link clicks
  // Also prevent body scroll when mobile nav is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [mobileOpen]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const allLinks = [
    { to: '/', label: 'Home', icon: <Home size={16} />, mobileIcon: <Home size={20} />, desc: 'Trending & Search' },
    { to: '/my-list', label: 'My List', icon: <List size={16} />, mobileIcon: <List size={20} />, desc: 'Your anime collection' },
    { to: '/recommendations', label: 'AI Recs', icon: <Sparkles size={16} />, mobileIcon: <Sparkles size={20} />, desc: 'AI-powered suggestions' },
    { to: '/stats', label: 'Stats', icon: <BarChart3 size={16} />, mobileIcon: <BarChart3 size={20} />, desc: 'Your watching statistics' },
    { to: '/seasonal', label: 'Seasonal', icon: <Calendar size={16} />, mobileIcon: <Calendar size={20} />, desc: 'Browse by season' },
    { to: '/random', label: 'Random', icon: <Shuffle size={16} />, mobileIcon: <Shuffle size={20} />, desc: 'Random anime picker' },
    { to: '/achievements', label: 'Badges', icon: <Award size={16} />, mobileIcon: <Award size={20} />, desc: 'Your achievements' },
    { to: '/taste', label: 'Taste', icon: <Radar size={16} />, mobileIcon: <Radar size={20} />, desc: 'Your taste profile' },
    { to: '/settings', label: 'Settings', icon: <Settings size={16} />, mobileIcon: <Settings size={20} />, desc: 'Configure app' },
  ];

  // Bottom tab bar uses 4 most important links + More
  const bottomTabLinks = [
    allLinks[0], // Home
    allLinks[1], // My List
    allLinks[2], // AI Recs
    allLinks[3], // Stats
  ];

  return (
    <>
      <nav className={`navbar ${scrolled ? 'navbar-scrolled' : ''}`}>
        <NavLink to="/" className="navbar-brand">
          <span className="navbar-logo">⚡ AniRec AI</span>
        </NavLink>

        {/* PC Feature 3: Quick search in navbar */}
        <div className="navbar-center">
          <div className="navbar-links">
            {allLinks.map(link => (
              <NavLink key={link.to} to={link.to} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                {link.icon}
                <span className="nav-label">{link.label}</span>
              </NavLink>
            ))}
          </div>
        </div>

        <div className="navbar-user">
          {/* PC Feature 4: Search trigger in navbar */}
          <button className="btn btn-ghost btn-icon desktop-search-btn" onClick={() => setSearchOpen(!searchOpen)} title="Search (Ctrl+/)">
            <Search size={16} />
          </button>
          {user && (
            <div className="user-avatar" title={user.displayName}>
              {user.displayName?.charAt(0)?.toUpperCase()}
            </div>
          )}
          <button className="btn btn-ghost btn-icon desktop-logout" onClick={handleLogout} title="Sign out">
            <LogOut size={16} />
          </button>
          <button className="btn btn-ghost btn-icon mobile-menu-btn" onClick={() => setMobileOpen(!mobileOpen)}>
            {mobileOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </nav>

      {/* PC Feature 5: Command palette / quick search overlay */}
      {searchOpen && (
        <div className="search-palette-overlay" onClick={() => setSearchOpen(false)}>
          <div className="search-palette" onClick={e => e.stopPropagation()}>
            <div className="search-palette-input-wrap">
              <Search size={18} />
              <input
                autoFocus
                className="search-palette-input"
                placeholder="Search pages, features..."
                value={quickSearch}
                onChange={e => setQuickSearch(e.target.value)}
              />
              <kbd className="search-palette-kbd">ESC</kbd>
            </div>
            <div className="search-palette-results">
              {allLinks.filter(l =>
                !quickSearch || l.label.toLowerCase().includes(quickSearch.toLowerCase()) ||
                l.desc.toLowerCase().includes(quickSearch.toLowerCase())
              ).map(link => (
                <NavLink key={link.to} to={link.to} className="search-palette-item"
                  onClick={() => { setSearchOpen(false); setQuickSearch(''); }}>
                  {link.icon}
                  <div className="search-palette-item-info">
                    <span className="search-palette-item-name">{link.label}</span>
                    <span className="search-palette-item-desc">{link.desc}</span>
                  </div>
                </NavLink>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Mobile Bottom Tab Bar */}
      <div className="bottom-tab-bar">
        {bottomTabLinks.map(link => (
          <NavLink
            key={link.to}
            to={link.to}
            className={({ isActive }) => `bottom-tab ${isActive ? 'active' : ''}`}
            onClick={() => setMobileOpen(false)}
          >
            <span className="bottom-tab-icon">{link.mobileIcon || link.icon}</span>
            <span className="bottom-tab-label">{link.label}</span>
          </NavLink>
        ))}
        <button
          className={`bottom-tab ${mobileOpen ? 'active' : ''}`}
          onClick={() => setMobileOpen(!mobileOpen)}
        >
          <span className="bottom-tab-icon">{mobileOpen ? <X size={20} /> : <Menu size={20} />}</span>
          <span className="bottom-tab-label">{mobileOpen ? 'Close' : 'More'}</span>
        </button>
      </div>

      {/* Mobile Full-Screen Nav Overlay - Fixed to cover entire screen */}
      {mobileOpen && (
        <div className="mobile-nav-overlay" onClick={() => setMobileOpen(false)}>
          <div className="mobile-nav-sheet" onClick={e => e.stopPropagation()}>
            {/* Mobile Feature 1: User profile section at top of mobile nav */}
            {user && (
              <div className="mobile-nav-profile">
                <div className="user-avatar mobile-nav-avatar" title={user.displayName}>
                  {user.displayName?.charAt(0)?.toUpperCase()}
                </div>
                <div className="mobile-nav-profile-info">
                  <span className="mobile-nav-profile-name">{user.displayName}</span>
                  <span className="mobile-nav-profile-email">@{user.username}</span>
                </div>
              </div>
            )}

            <div className="mobile-nav-links">
              {allLinks.map(link => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  className={({ isActive }) => `mobile-nav-link ${isActive ? 'active' : ''}`}
                  onClick={() => setMobileOpen(false)}
                >
                  <span className="mobile-nav-link-icon">{link.mobileIcon || link.icon}</span>
                  <div className="mobile-nav-link-text">
                    <span className="mobile-nav-link-label">{link.label}</span>
                    <span className="mobile-nav-link-desc">{link.desc}</span>
                  </div>
                </NavLink>
              ))}
            </div>

            <div className="mobile-nav-footer">
              <button className="mobile-nav-link logout-link" onClick={() => { setMobileOpen(false); handleLogout(); }}>
                <span className="mobile-nav-link-icon"><LogOut size={20} /></span>
                <span className="mobile-nav-link-label">Sign Out</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .mobile-menu-btn { display: none; }
        .desktop-logout { display: flex; }
        .desktop-search-btn { display: flex; }
        .nav-label { white-space: nowrap; }
        .bottom-tab-bar { display: none; }
        .mobile-nav-overlay { display: none; }

        /* PC Feature 6: Navbar scroll effect */
        .navbar-scrolled {
          box-shadow: 0 4px 20px rgba(0,0,0,0.3);
          border-bottom-color: rgba(124,92,252,0.2) !important;
        }

        .navbar-center {
          display: flex;
          align-items: center;
          flex: 1;
          justify-content: center;
        }

        .logout-link {
          color: var(--error) !important;
        }

        /* PC Feature 7: Command Palette */
        .search-palette-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.6);
          backdrop-filter: blur(4px);
          z-index: 9999;
          display: flex;
          align-items: flex-start;
          justify-content: center;
          padding-top: 15vh;
          animation: fadeIn 0.15s ease;
        }
        .search-palette {
          width: 100%;
          max-width: 540px;
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-xl);
          box-shadow: 0 20px 60px rgba(0,0,0,0.5);
          overflow: hidden;
          animation: paletteSlide 0.2s ease;
        }
        @keyframes paletteSlide {
          from { opacity: 0; transform: translateY(-10px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .search-palette-input-wrap {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 14px 18px;
          border-bottom: 1px solid var(--border-color);
          color: var(--text-secondary);
        }
        .search-palette-input {
          flex: 1;
          background: none;
          border: none;
          outline: none;
          font-size: 1rem;
          color: var(--text-primary);
          font-family: var(--font-sans);
        }
        .search-palette-kbd {
          font-size: 0.65rem;
          padding: 2px 6px;
          border: 1px solid var(--border-color);
          border-radius: 4px;
          color: var(--text-tertiary);
          font-family: var(--font-mono, monospace);
        }
        .search-palette-results {
          max-height: 340px;
          overflow-y: auto;
          padding: 6px;
        }
        .search-palette-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 14px;
          border-radius: var(--radius-md);
          text-decoration: none;
          color: var(--text-secondary);
          transition: all 0.12s;
          cursor: pointer;
        }
        .search-palette-item:hover {
          background: rgba(124,92,252,0.1);
          color: var(--accent-primary);
        }
        .search-palette-item-info {
          display: flex;
          flex-direction: column;
          gap: 1px;
        }
        .search-palette-item-name {
          font-weight: 600;
          font-size: 0.88rem;
        }
        .search-palette-item-desc {
          font-size: 0.72rem;
          color: var(--text-tertiary);
        }

        @media (max-width: 1024px) {
          .nav-label { display: none; }
        }

        @media (max-width: 768px) {
          .navbar-links { display: none; }
          .navbar-center { display: none; }
          .mobile-menu-btn { display: flex; }
          .desktop-logout { display: none; }
          .desktop-search-btn { display: none; }

          /* Bottom Tab Bar */
          .bottom-tab-bar {
            display: flex;
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            background: rgba(10, 10, 26, 0.97);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            border-top: 1px solid var(--border-color);
            z-index: 9990;
            padding: 6px 0 max(6px, env(safe-area-inset-bottom));
            justify-content: space-around;
          }
          .bottom-tab {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 3px;
            padding: 4px 0;
            flex: 1;
            text-decoration: none;
            color: var(--text-tertiary);
            transition: color 0.2s;
            background: none;
            border: none;
            cursor: pointer;
            font-family: var(--font-sans);
            -webkit-tap-highlight-color: transparent;
          }
          .bottom-tab.active {
            color: var(--accent-primary);
          }
          .bottom-tab-icon {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 32px;
            height: 32px;
            border-radius: 10px;
            transition: background 0.2s;
          }
          .bottom-tab.active .bottom-tab-icon {
            background: rgba(124, 92, 252, 0.15);
          }
          .bottom-tab-label {
            font-size: 0.6rem;
            font-weight: 600;
            letter-spacing: 0.3px;
          }

          /* Add space at bottom for tab bar */
          .page {
            padding-bottom: 90px !important;
          }

          /* MOBILE FULL-SCREEN NAV OVERLAY - completely covers screen */
          .mobile-nav-overlay {
            display: flex;
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.5);
            backdrop-filter: blur(4px);
            -webkit-backdrop-filter: blur(4px);
            z-index: 9995;
            animation: fadeIn 0.15s ease;
          }
          .mobile-nav-sheet {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: var(--bg-primary);
            display: flex;
            flex-direction: column;
            z-index: 9996;
            animation: slideInRight 0.25s ease;
            overflow-y: auto;
            -webkit-overflow-scrolling: touch;
            padding-top: 60px;
            padding-bottom: max(20px, env(safe-area-inset-bottom));
          }
          @keyframes slideInRight {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
          }
          @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }

          /* Mobile Feature 2: User profile in mobile nav */
          .mobile-nav-profile {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 16px 20px 20px;
            border-bottom: 1px solid var(--border-color);
            margin-bottom: 8px;
          }
          .mobile-nav-avatar {
            width: 44px !important;
            height: 44px !important;
            font-size: 1.2rem !important;
          }
          .mobile-nav-profile-info {
            display: flex;
            flex-direction: column;
          }
          .mobile-nav-profile-name {
            font-weight: 700;
            font-size: 1rem;
            color: var(--text-primary);
          }
          .mobile-nav-profile-email {
            font-size: 0.78rem;
            color: var(--text-tertiary);
          }

          .mobile-nav-links {
            flex: 1;
            padding: 4px 12px;
            display: flex;
            flex-direction: column;
            gap: 2px;
          }
          .mobile-nav-link {
            display: flex;
            align-items: center;
            gap: 14px;
            padding: 14px 16px;
            border-radius: var(--radius-lg);
            text-decoration: none;
            color: var(--text-secondary);
            transition: all 0.15s;
            background: none;
            border: none;
            cursor: pointer;
            font-family: var(--font-sans);
            width: 100%;
            min-height: 48px;
            -webkit-tap-highlight-color: transparent;
          }
          .mobile-nav-link:active {
            background: rgba(124,92,252,0.15);
            transform: scale(0.98);
          }
          .mobile-nav-link.active {
            background: rgba(124,92,252,0.12);
            color: var(--accent-primary);
          }
          .mobile-nav-link-icon {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 36px;
            height: 36px;
            border-radius: var(--radius-md);
            background: var(--bg-secondary);
            flex-shrink: 0;
          }
          .mobile-nav-link.active .mobile-nav-link-icon {
            background: rgba(124,92,252,0.2);
            color: var(--accent-primary);
          }
          .mobile-nav-link-text {
            display: flex;
            flex-direction: column;
            gap: 2px;
          }
          .mobile-nav-link-label {
            font-weight: 600;
            font-size: 0.95rem;
          }
          .mobile-nav-link-desc {
            font-size: 0.72rem;
            color: var(--text-tertiary);
          }

          .mobile-nav-footer {
            border-top: 1px solid var(--border-color);
            padding: 8px 12px;
            margin-top: 8px;
          }
        }

        /* Desktop mobile nav fallback (hamburger on medium screens) */
        @media (min-width: 769px) {
          .mobile-nav-overlay {
            display: none;
          }
        }
      `}</style>
    </>
  );
}
