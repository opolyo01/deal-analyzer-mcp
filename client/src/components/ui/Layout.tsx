import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import type { CurrentUser } from '../../lib/types';

function useTheme() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  useEffect(() => {
    const stored = (localStorage.getItem('theme') ?? 'light') as 'dark' | 'light';
    setTheme(stored);
    document.documentElement.dataset.theme = stored === 'dark' ? 'dark' : '';
  }, []);

  function toggle() {
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next === 'dark' ? 'dark' : '';
      localStorage.setItem('theme', next);
      return next;
    });
  }

  return { theme, toggle };
}

function routeLinkClass(isActive: boolean) {
  return `topbar-link${isActive ? ' topbar-link-active' : ''}`;
}

interface LayoutProps {
  user: CurrentUser | null;
  isAuthLoading: boolean;
  children: ReactNode;
}

export function Layout({ user, isAuthLoading, children }: LayoutProps) {
  const location = useLocation();
  const { theme, toggle } = useTheme();

  const isHome      = location.pathname === '/' || location.pathname === '/index.html';
  const isQuickCheck = location.pathname === '/quick-check' || location.pathname === '/deal-widget.html';
  const isAnalysis  = location.pathname === '/add' || location.pathname === '/add.html';
  const isDashboard = location.pathname === '/dashboard' || location.pathname === '/deals.html';
  const userLabel   = user?.displayName || user?.email || 'Signed in';

  return (
    <div className="min-h-screen">
      {/* Accent bar — gold in dark, subtle in light */}
      <div className="h-px w-full bg-gradient-to-r from-transparent via-gold/50 to-transparent" />

      <header className="sticky top-0 z-20 border-b border-line/60 bg-page/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-5 py-3">

          {/* Logo */}
          <Link to="/" className="group flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-gold/40 bg-gold/10 font-display text-xs font-bold tracking-tight text-gold transition group-hover:bg-gold/20">
              DA
            </div>
            <span className="font-display text-sm font-bold tracking-tight text-ink">Deal Analyzer</span>
          </Link>

          {/* Nav */}
          <nav className="flex items-center gap-1">
            <Link to="/"          className={routeLinkClass(isHome)}>Home</Link>
            <Link to="/quick-check" className={routeLinkClass(isQuickCheck)}>Quick Check</Link>
            <Link to="/add"       className={routeLinkClass(isAnalysis)}>Full Analysis</Link>
            <Link to="/dashboard" className={routeLinkClass(isDashboard)}>Saved Deals</Link>
          </nav>

          {/* Right side */}
          <div className="flex items-center gap-2">
            {/* Theme toggle */}
            <button
              type="button"
              onClick={toggle}
              title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
              className="rounded-lg border border-line/60 px-3 py-1.5 font-mono text-xs text-muted/70 transition hover:border-line hover:text-ink"
            >
              {theme === 'dark' ? '☀︎' : '☾'}
            </button>

            {/* User */}
            <span className="font-mono text-xs text-muted/60">
              {isAuthLoading ? '···' : user ? userLabel : 'guest'}
            </span>

            {user ? (
              <a
                href="/logout"
                className="rounded-lg border border-line/60 px-3 py-1.5 text-xs font-medium text-muted hover:border-line hover:text-ink"
              >
                Sign out
              </a>
            ) : (
              <a
                href="/auth/google"
                className="rounded-lg border border-gold/40 bg-gold/10 px-4 py-1.5 text-xs font-medium text-gold transition hover:bg-gold/20 hover:border-gold/60"
              >
                Sign in
              </a>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-5 py-8">{children}</main>
    </div>
  );
}
