import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import type { CurrentUser } from '../../lib/types';

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
  const isHome = location.pathname === '/' || location.pathname === '/index.html';
  const isQuickCheck = location.pathname === '/quick-check' || location.pathname === '/deal-widget.html';
  const isAnalysis = location.pathname === '/add' || location.pathname === '/add.html';
  const isDashboard = location.pathname === '/dashboard' || location.pathname === '/deals.html';
  const subtitle = isHome
    ? 'Rental underwriting without a spreadsheet'
    : isQuickCheck
      ? '30-second rental screening'
      : isAnalysis
        ? 'Full analysis workspace'
        : 'Saved deal dashboard';
  const userLabel = user?.displayName || user?.email || 'Signed in';

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-line/80 bg-white/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl border border-line bg-green-soft text-sm font-black text-green">
              DA
            </div>
            <div className="min-w-0">
              <p className="truncate text-lg font-extrabold tracking-tight">Deal Analyzer</p>
              <p className="truncate text-sm text-muted">{subtitle}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <Link to="/" className={routeLinkClass(isHome)}>
              Home
            </Link>
            <Link to="/quick-check" className={routeLinkClass(isQuickCheck)}>
              Quick Check
            </Link>
            <Link to="/add" className={routeLinkClass(isAnalysis)}>
              Full Analysis
            </Link>
            <Link to="/dashboard" className={routeLinkClass(isDashboard)}>
              Saved Deals
            </Link>

            <div className="ml-1 rounded-full border border-line bg-page px-4 py-2 text-sm text-muted">
              {isAuthLoading ? 'Checking account...' : user ? userLabel : 'Guest mode'}
            </div>

            {user ? (
              <a
                href="/logout"
                className="rounded-full border border-line bg-white px-4 py-2 text-sm font-semibold text-ink hover:border-muted/40"
              >
                Log out
              </a>
            ) : (
              <a
                href="/auth/google"
                className="rounded-full border border-green bg-green px-4 py-2 text-sm font-semibold text-white hover:brightness-95"
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
