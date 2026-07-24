import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import ApiKeyInput from './components/ApiKeyInput';
import SearchPage from './pages/SearchPage';
import HighlightsPage from './pages/HighlightsPage';
import DocsPage from './pages/DocsPage';
import { IRC_MEMORY_LANE_VERSION, IRC_MEMORY_LANE_VERSION_SOURCE } from './version.generated';
import './App.css';

function detectRouterBase() {
  if (typeof window === 'undefined') {
    return '/';
  }
  const path = window.location.pathname || '/';
  if (path === '/irclogs-react' || path.startsWith('/irclogs-react/')) {
    return '/irclogs-react';
  }
  return '/';
}

export default function App() {
  const routerBase = detectRouterBase();

  return (
    <BrowserRouter basename={routerBase}>
      <nav className="navbar">
        <div className="navbar-brand">
          <span className="brand-icon">📻</span>
          <span className="brand-name">IRC Memory Lane</span>
          <span className="brand-version" title={IRC_MEMORY_LANE_VERSION_SOURCE === 'tag' ? 'Stable tag' : 'Current commit'}>
            {IRC_MEMORY_LANE_VERSION}
          </span>
        </div>
        <div className="navbar-links">
          <NavLink to="/" end className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            Search
          </NavLink>
          <NavLink to="/highlights" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            Highlights
          </NavLink>
          <NavLink to="/api-docs" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            API Docs
          </NavLink>
        </div>
        <div className="navbar-key">
          <ApiKeyInput />
        </div>
      </nav>
      <main className="main-content">
        <Routes>
          <Route path="/" element={<SearchPage />} />
          <Route path="/highlights" element={<HighlightsPage />} />
          <Route path="/api-docs" element={<DocsPage />} />
          <Route path="/docs" element={<Navigate to="/api-docs" replace />} />
        </Routes>
      </main>
    </BrowserRouter>
  );
}
