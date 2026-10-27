import React, { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bell,
  LogOut,
  User,
  Shield,
  Menu,
  ChevronDown,
  Building,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  CheckCheck
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useFDR } from "../../context/FDRContext";

export const Header = ({ onOpenMobile }) => {
  const { user, logout, isCollege } = useAuth();
  const { notifications, markNotificationAsRead, markAllNotificationsAsRead } = useFDR();
  const navigate = useNavigate();

  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  const notifRef = useRef(null);
  const profileRef = useRef(null);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (notifRef.current && !notifRef.current.contains(event.target)) {
        setShowNotifications(false);
      }
      if (profileRef.current && !profileRef.current.contains(event.target)) {
        setShowProfileMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  // Filter notifications for current active role
  const roleNotifications = notifications.filter(
    (n) => n.recipientRole === "all" || n.recipientRole === user?.role
  );
  const unreadCount = roleNotifications.filter((n) => !n.read).length;

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between h-16 px-4 sm:px-6 bg-white border-b border-slate-200 shadow-xs">
      {/* Left side: Mobile menu toggle + Portal Title */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onOpenMobile}
          className="p-2 -ml-2 text-slate-600 rounded-md lg:hidden hover:text-slate-900 hover:bg-slate-100"
          aria-label="Open sidebar"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm sm:text-base text-slate-900">
              {isCollege ? "College FDR Management Portal" : "AICTE Central FDR Scrutiny & Regulatory Desk"}
            </span>
            <span className="hidden sm:inline-flex items-center px-2 py-0.5 text-[11px] font-medium rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
              Active Portal
            </span>
          </div>
          <span className="text-[11px] text-slate-500 hidden md:block">
            All India Council for Technical Education • Security Deposit Regulatory Gateway
          </span>
        </div>
      </div>

      {/* Right side: Notifications + User Identity (Language & Demo Switcher removed as instructed) */}
      <div className="flex items-center gap-2 sm:gap-4">
        {/* Notifications Dropdown */}
        <div className="relative" ref={notifRef}>
          <button
            type="button"
            onClick={() => setShowNotifications((prev) => !prev)}
            className="relative p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-full transition-colors"
            aria-label="Notifications"
          >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 flex items-center justify-center w-4 h-4 text-[10px] font-bold text-white bg-rose-500 rounded-full">
                {unreadCount}
              </span>
            )}
          </button>

          {showNotifications && (
            <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-lg shadow-xl border border-slate-200 py-2 z-50 animate-in fade-in zoom-in-95 duration-150">
              <div className="px-4 py-2 border-b border-slate-100 flex items-center justify-between">
                <span className="font-semibold text-sm text-slate-800">Regulatory Notifications</span>
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={() => markAllNotificationsAsRead(user?.role)}
                    className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
                  >
                    <CheckCheck className="w-3.5 h-3.5" />
                    Mark all read
                  </button>
                )}
              </div>

              <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">
                {roleNotifications.length === 0 ? (
                  <div className="p-4 text-center text-xs text-slate-500">
                    No new notifications for your role.
                  </div>
                ) : (
                  roleNotifications.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => {
                        markNotificationAsRead(item.id);
                        setShowNotifications(false);
                        navigate("/fdr-register");
                      }}
                      className={`p-3 hover:bg-slate-50 cursor-pointer transition-colors ${
                        !item.read ? "bg-amber-50/40" : ""
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <AlertCircle
                          className={`w-4 h-4 shrink-0 mt-0.5 ${
                            item.type === "success"
                              ? "text-emerald-500"
                              : item.type === "error"
                              ? "text-rose-500"
                              : item.type === "warning"
                              ? "text-amber-500"
                              : "text-blue-500"
                          }`}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-semibold text-slate-800 flex items-center justify-between">
                            <span>{item.title}</span>
                            <span className="text-[10px] text-slate-400 font-normal">
                              {new Date(item.timestamp).toLocaleDateString("en-IN")}
                            </span>
                          </div>
                          <p className="text-xs text-slate-600 line-clamp-2 mt-0.5">
                            {item.message}
                          </p>
                          {item.fdrNumber && (
                            <div className="text-[10px] font-mono text-slate-400 mt-1">
                              Ref: {item.fdrNumber}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="px-4 py-2 border-t border-slate-100 bg-slate-50 text-center">
                <button
                  type="button"
                  onClick={() => {
                    setShowNotifications(false);
                    navigate("/fdr-register");
                  }}
                  className="text-xs font-medium text-blue-600 hover:text-blue-800"
                >
                  View All Records in FDR Register →
                </button>
              </div>
            </div>
          )}
        </div>

        {/* User Identity Profile Dropdown (DEMO ROLE SWITCHER REMOVED FOR PROPER AUTHORIZATION) */}
        <div className="relative" ref={profileRef}>
          <button
            type="button"
            onClick={() => setShowProfileMenu((prev) => !prev)}
            className="flex items-center gap-2.5 p-1.5 sm:px-3 rounded-lg hover:bg-slate-100 border border-transparent hover:border-slate-200 transition-all text-left"
          >
            <div className="w-8 h-8 rounded-full bg-slate-900 text-amber-400 flex items-center justify-center font-bold text-xs shadow-xs">
              {user?.fullName ? user.fullName.charAt(0) : "U"}
            </div>
            <div className="hidden sm:flex flex-col">
              <span className="text-xs font-semibold text-slate-900 truncate max-w-[170px]">
                {user?.fullName || "Authenticated User"}
              </span>
              <span className="text-[10px] font-medium text-slate-500 flex items-center gap-1">
                <span className={`w-1.5 h-1.5 rounded-full ${isCollege ? "bg-blue-500" : "bg-purple-600"}`}></span>
                {user?.role === "college" ? "College Admin" : "AICTE Admin"}
              </span>
            </div>
            <ChevronDown className="w-4 h-4 text-slate-400 hidden sm:block" />
          </button>

          {showProfileMenu && (
            <div className="absolute right-0 mt-2 w-72 bg-white rounded-lg shadow-xl border border-slate-200 py-2 z-50 animate-in fade-in zoom-in-95 duration-150">
              <div className="px-4 py-3 border-b border-slate-100">
                <div className="text-xs font-semibold text-slate-900">{user?.fullName}</div>
                <div className="text-[11px] text-slate-500 mt-0.5">{user?.displayName}</div>
                <div className="text-[10px] text-slate-400 mt-0.5">{user?.email}</div>
                <div className="mt-2 inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded bg-slate-100 text-slate-700">
                  <Shield className="w-3 h-3 text-amber-600" />
                  Role: {user?.role === "college" ? "College Administrator" : "AICTE Administrator"}
                </div>
              </div>

              {/* Logout Action */}
              <div className="p-1">
                <button
                  type="button"
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-rose-600 hover:bg-rose-50 rounded-md transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Log Out of Workspace</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
