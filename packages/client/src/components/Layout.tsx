import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Package,
  ClipboardCheck,
  Activity,
  PanelLeftClose,
  PanelLeftOpen,
  Menu,
  X,
} from 'lucide-react';

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/inventory', label: 'Inventory', icon: Package },
  { to: '/counts', label: 'Counts', icon: ClipboardCheck },
  { to: '/activity', label: 'Activity', icon: Activity },
];

export function Layout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-bg-page">
      {/* Desktop sidebar */}
      <aside
        className={`hidden lg:flex lg:flex-col fixed left-0 top-0 h-full z-40 bg-sidebar transition-all duration-200 ${
          sidebarCollapsed ? 'w-16' : 'w-60'
        }`}
      >
        {/* Top section — wordmark */}
        <div className="py-6 px-4">
          {sidebarCollapsed ? (
            <span className="text-accent-indigo font-bold text-lg text-center block">FF</span>
          ) : (
            <span className="text-accent-indigo font-bold text-lg tracking-wider">FIFOFLOW</span>
          )}
        </div>

        {/* Nav section */}
        <nav className="mt-6 flex flex-col gap-1 px-2">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                  isActive
                    ? 'bg-sidebar-active text-white border-l-[3px] border-accent-indigo'
                    : 'text-text-muted hover:bg-sidebar-hover hover:text-white'
                }`
              }
            >
              <Icon size={20} />
              <span className="text-sm overflow-hidden whitespace-nowrap">{label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Bottom section — collapse toggle */}
        <div className="absolute bottom-0 w-full p-4">
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="w-full flex items-center justify-center text-text-muted hover:text-white transition-colors"
          >
            {sidebarCollapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="lg:hidden fixed top-0 w-full h-14 z-50 bg-sidebar flex items-center justify-between px-4">
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="text-white"
        >
          {mobileOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
        <span className="text-accent-indigo font-bold">FIFOFLOW</span>
        {/* Spacer for centering */}
        <div className="w-6" />
      </div>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-40 lg:hidden"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="fixed left-0 top-0 h-full w-60 z-50 bg-sidebar flex flex-col lg:hidden">
            {/* Top section with padding for mobile top bar */}
            <div className="pt-16 py-6 px-4">
              <span className="text-accent-indigo font-bold text-lg tracking-wider">FIFOFLOW</span>
            </div>

            {/* Nav section */}
            <nav className="mt-6 flex flex-col gap-1 px-2">
              {navItems.map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={to === '/'}
                  onClick={() => setMobileOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                      isActive
                        ? 'bg-sidebar-active text-white border-l-[3px] border-accent-indigo'
                        : 'text-text-muted hover:bg-sidebar-hover hover:text-white'
                    }`
                  }
                >
                  <Icon size={20} />
                  <span className="text-sm overflow-hidden whitespace-nowrap">{label}</span>
                </NavLink>
              ))}
            </nav>

            {/* Bottom section — collapse toggle (not needed on mobile, but keeps consistent structure) */}
            <div className="absolute bottom-0 w-full p-4">
              <button
                onClick={() => setMobileOpen(false)}
                className="w-full flex items-center justify-center text-text-muted hover:text-white transition-colors"
              >
                <PanelLeftClose size={20} />
              </button>
            </div>
          </aside>
        </>
      )}

      {/* Content area */}
      <main
        className={`pt-14 lg:pt-0 min-h-screen bg-bg-page transition-all duration-200 ${
          sidebarCollapsed ? 'lg:ml-16' : 'lg:ml-60'
        }`}
      >
        <div className="p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
