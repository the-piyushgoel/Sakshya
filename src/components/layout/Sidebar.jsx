import React from "react";
import { NavLink, useLocation } from "react-router-dom";
import { LayoutDashboard, FileSpreadsheet, Building2, ShieldCheck, RefreshCw } from "lucide-react";
import { SakshyaLogo } from "../common/SakshyaLogo";
import { useAuth } from "../../context/AuthContext";
import { useFDR } from "../../context/FDRContext";
import { INSTITUTION_CONFIG } from "../../config/institutionConfig";

export const Sidebar = ({ isMobileOpen, onCloseMobile }) => {
  const { user, isCollege, isAicte } = useAuth();
  const { stats, resetDemoData } = useFDR();
  const location = useLocation();

  // Primary navigation items
  const navItems = [
    {
      name: "Dashboard",
      path: "/dashboard",
      icon: LayoutDashboard,
      badge: null
    },
    {
      name: "FDR Register",
      path: "/fdr-register",
      icon: FileSpreadsheet,
      badge: isCollege ? stats.totalFDRs : stats.totalFDRs
    },
    {
      name: "Bank Confirmations",
      path: "/bank-confirmations",
      icon: Building2,
      badge: stats.pendingVerification > 0 ? "Reconcile" : null
    }
  ];

  const handleReset = () => {
    if (window.confirm("Reset all FDR demo records and bank confirmations to initial defaults?")) {
      resetDemoData();
      window.location.reload();
    }
  };

  return (
    <>
      {/* Mobile backdrop */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/80 backdrop-blur-sm lg:hidden"
          onClick={onCloseMobile}
        />
      )}

      {/* Sidebar container */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-72 flex flex-col bg-sakshya-grid border-r border-slate-800 transition-transform duration-300 ease-in-out lg:translate-x-0 ${
          isMobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Brand Header */}
        <div className="p-5 border-b border-slate-800/80 flex items-center justify-between">
          <SakshyaLogo size="default" />
        </div>

        {/* Section Header */}
        <div className="px-6 pt-6 pb-2">
          <p className="text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
            {isCollege ? "संस्थान • INSTITUTE" : "नियामक • AICTE REGULATOR"}
          </p>
        </div>

        {/* Navigation Menu */}
        <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              location.pathname === item.path ||
              (item.path === "/fdr-register" &&
                (location.pathname === "/fdr-register/new" || location.pathname.startsWith("/fdr-review")));

            return (
              <NavLink
                key={item.name}
                to={item.path}
                onClick={onCloseMobile}
                className={({ isActive: linkActive }) => {
                  const active = isActive || linkActive;
                  return `group flex items-center justify-between px-3.5 py-3 text-sm font-medium rounded-r-md transition-all ${
                    active
                      ? "bg-[#071324] text-white border-l-4 border-amber-500 shadow-sm font-semibold"
                      : "text-slate-300 hover:text-white hover:bg-slate-800/60 border-l-4 border-transparent"
                  }`;
                }}
              >
                <div className="flex items-center gap-3">
                  <Icon
                    className={`w-5 h-5 transition-colors ${
                      isActive ? "text-amber-400" : "text-slate-400 group-hover:text-slate-200"
                    }`}
                  />
                  <span>{item.name}</span>
                </div>

                {item.badge !== null && item.badge !== undefined && (
                  <span
                    className={`px-2 py-0.5 text-xs font-semibold rounded-full ${
                      item.badge === "Reconcile"
                        ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                        : isActive
                        ? "bg-amber-400/20 text-amber-300"
                        : "bg-slate-800 text-slate-300"
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* Institutional Identity Card */}
        <div className="p-4 m-3 rounded-lg bg-slate-900/90 border border-slate-800/80 text-xs">
          <div className="flex items-start gap-2.5">
            <div className="p-2 rounded bg-amber-500/10 text-amber-400 shrink-0 mt-0.5">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-slate-200 truncate">
                {isCollege ? INSTITUTION_CONFIG.institutionName : "AICTE Regulatory Cell"}
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5 truncate">
                ID: {isCollege ? INSTITUTION_CONFIG.aictePermanentId : "APPROVAL-BUREAU-HQ"}
              </div>
              <div className="mt-2 flex items-center justify-between text-[10px] text-slate-400 border-t border-slate-800 pt-2">
                <span className="flex items-center gap-1 text-emerald-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  Lien Gateway Active
                </span>
                <button
                  type="button"
                  onClick={handleReset}
                  title="Reset demo data"
                  className="hover:text-amber-300 flex items-center gap-1 transition-colors"
                >
                  <RefreshCw className="w-3 h-3" />
                  Reset
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Clean Footer note - No SIH mention */}
        <div className="px-5 py-3 border-t border-slate-800/80 text-[10px] text-slate-400 flex items-center justify-between">
          <span>AICTE Security Deposit Portal</span>
          {/* <span className="text-amber-400/80 font-mono">v2.0-STABLE</span> */}
        </div>
      </aside>
    </>
  );
};
