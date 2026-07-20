import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import ApiKeyInput from './components/ApiKeyInput';
import SearchPage from './pages/SearchPage';
import HighlightsPage from './pages/HighlightsPage';
import DocsPage from './pages/DocsPage';
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
        </div>
        <div className="navbar-links">
          <NavLink to="/" end className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            Search
          </NavLink>
          <NavLink to="/highlights" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
            Highlights
          </NavLink>
          <NavLink to="/docs" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
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
          <Route path="/docs" element={<DocsPage />} />
        </Routes>
      </main>
    </BrowserRouter>
  );
}
