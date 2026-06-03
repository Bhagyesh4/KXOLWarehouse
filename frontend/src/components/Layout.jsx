import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
    Gauge,
    Package,
    ArrowDownToLine,
    ArrowUpFromLine,
    Boxes,
    BarChart3,
    LogOut,
    Warehouse,
    ShieldAlert,
} from "lucide-react";

const NAV = [
    { to: "/", label: "Dashboard", icon: Gauge, end: true, testid: "nav-dashboard" },
    { to: "/inventory", label: "Inventory Master", icon: Package, testid: "nav-inventory" },
    { to: "/inbound", label: "Inbound", icon: ArrowDownToLine, testid: "nav-inbound" },
    { to: "/outbound", label: "Outbound", icon: ArrowUpFromLine, testid: "nav-outbound" },
    { to: "/storage", label: "Warehouse Storage", icon: Boxes, testid: "nav-storage" },
    { to: "/reports", label: "Reports & Analytics", icon: BarChart3, testid: "nav-reports" },
];

const ADMIN_NAV = [
    { to: "/admin", label: "Admin Settings", icon: ShieldAlert, testid: "nav-admin" },
];

export default function Layout() {
    const { user, logout } = useAuth();
    const nav = useNavigate();

    const handleLogout = async () => {
        await logout();
        nav("/login");
    };

    return (
        <div className="min-h-screen flex bg-[#090a0c] text-gray-100">
            {/* Sidebar */}
            <aside className="hidden md:flex w-64 flex-col fixed h-screen bg-[#111317] border-r border-white/10 z-30">
                <div className="px-5 py-5 border-b border-white/10 flex items-center gap-3">
                    <div className="w-9 h-9 bg-amber-500 flex items-center justify-center text-black">
                        <Warehouse size={20} strokeWidth={2.5} />
                    </div>
                    <div>
                        <div className="text-[10px] tracking-[0.2em] text-gray-500 uppercase font-semibold">
                            FrostCore
                        </div>
                        <div className="text-sm font-bold tracking-tight">
                            CONTROL CENTER
                        </div>
                    </div>
                </div>

                <nav className="flex-1 py-4 px-2 space-y-0.5 overflow-y-auto">
                    {NAV.map((n) => (
                        <NavLink
                            key={n.to}
                            to={n.to}
                            end={n.end}
                            data-testid={n.testid}
                            className={({ isActive }) =>
                                `flex items-center gap-3 px-3 py-2.5 text-sm transition-colors duration-150 ${
                                    isActive
                                        ? "bg-amber-500/10 text-amber-400 border-l-2 border-amber-500"
                                        : "text-gray-400 hover:bg-white/5 hover:text-gray-100 border-l-2 border-transparent"
                                }`
                            }
                        >
                            <n.icon size={16} strokeWidth={2} />
                            <span className="tracking-wide">{n.label}</span>
                        </NavLink>
                    ))}

                    {user?.role === "admin" && (
                        <>
                            <div className="pt-3 pb-1 px-3">
                                <div className="text-[10px] uppercase tracking-[0.15em] text-gray-600 font-semibold">
                                    Administration
                                </div>
                            </div>
                            {ADMIN_NAV.map((n) => (
                                <NavLink
                                    key={n.to}
                                    to={n.to}
                                    data-testid={n.testid}
                                    className={({ isActive }) =>
                                        `flex items-center gap-3 px-3 py-2.5 text-sm transition-colors duration-150 ${
                                            isActive
                                                ? "bg-red-500/10 text-red-400 border-l-2 border-red-500"
                                                : "text-gray-500 hover:bg-white/5 hover:text-gray-100 border-l-2 border-transparent"
                                        }`
                                    }
                                >
                                    <n.icon size={16} strokeWidth={2} />
                                    <span className="tracking-wide">{n.label}</span>
                                </NavLink>
                            ))}
                        </>
                    )}
                </nav>

                <div className="border-t border-white/10 p-4">
                    {user && (
                        <div className="mb-3">
                            <div className="text-xs text-gray-500 uppercase tracking-wider">
                                Signed in as
                            </div>
                            <div className="text-sm font-medium truncate">{user.name}</div>
                            <div className="font-mono text-[10px] text-amber-400 uppercase tracking-widest">
                                {user.role}
                            </div>
                        </div>
                    )}
                    <button
                        onClick={handleLogout}
                        data-testid="logout-btn"
                        className="w-full flex items-center justify-center gap-2 px-3 py-2 border border-white/10 text-xs uppercase tracking-wider text-gray-400 hover:text-amber-400 hover:border-amber-500/40 transition-colors"
                    >
                        <LogOut size={14} /> Sign Out
                    </button>
                </div>
            </aside>

            {/* Main */}
            <main className="flex-1 md:ml-64 min-h-screen bg-grid">
                <header className="sticky top-0 z-20 bg-[#090a0c]/90 backdrop-blur-md border-b border-white/10 px-6 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="font-mono text-[10px] text-emerald-400 tracking-[0.2em]">
                            ● ONLINE
                        </div>
                        <div className="font-mono text-xs text-gray-500">
                            FrostCore · v1.0.0
                        </div>
                    </div>
                    <div className="font-mono text-xs text-gray-400 hidden md:block">
                        {new Date().toLocaleString()}
                    </div>
                </header>

                <div className="p-6 fade-in">
                    <Outlet />
                </div>
            </main>
        </div>
    );
}
