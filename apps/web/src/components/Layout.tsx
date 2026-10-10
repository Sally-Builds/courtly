import { NavLink, Outlet } from 'react-router';
import { useAuth } from '../auth/AuthContext';
import { Badge, Button, cx } from './ui';

const linkClass = ({ isActive }: { isActive: boolean }) =>
  cx(
    'rounded-lg px-3 py-2 text-sm font-medium',
    isActive ? 'bg-emerald-50 text-emerald-700' : 'text-slate-600 hover:bg-slate-100',
  );

export function Layout() {
  const { user, logout } = useAuth();
  const isAdmin = user?.role === 'admin';

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <NavLink to={isAdmin ? '/admin/day' : '/'} className="flex items-center gap-2 text-lg font-semibold">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-emerald-600 text-sm text-white">C</span>
            Courtly
          </NavLink>
          <nav className="flex flex-1 flex-wrap gap-1">
            {isAdmin ? (
              <>
                <NavLink to="/admin/day" className={linkClass}>
                  Day view
                </NavLink>
                <NavLink to="/admin/courts" className={linkClass}>
                  Manage courts
                </NavLink>
              </>
            ) : (
              <>
                <NavLink to="/" end className={linkClass}>
                  Book a court
                </NavLink>
                <NavLink to="/bookings" className={linkClass}>
                  My bookings
                </NavLink>
              </>
            )}
          </nav>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-slate-600">{user?.name}</span>
            {isAdmin && <Badge tone="blue">Admin</Badge>}
            <Button variant="ghost" onClick={logout}>
              Log out
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
