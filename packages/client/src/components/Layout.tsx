import { NavLink, Outlet } from 'react-router-dom';

const navItems = [
  { to: '/', label: 'Dashboard' },
  { to: '/inventory', label: 'Inventory' },
  { to: '/activity', label: 'Activity' },
];

export function Layout() {
  return (
    <div className="min-h-screen bg-navy">
      <nav className="bg-navy-light border-b border-border px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <span className="text-accent-green font-bold text-lg tracking-wider">FIFOFLOW</span>
          <div className="flex gap-1">
            {navItems.map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `px-3 py-1.5 rounded text-sm transition-colors ${
                    isActive
                      ? 'bg-navy-lighter text-accent-green'
                      : 'text-text-secondary hover:text-text-primary'
                  }`
                }
                end={to === '/'}
              >
                {label}
              </NavLink>
            ))}
          </div>
        </div>
      </nav>
      <main className="max-w-7xl mx-auto px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
