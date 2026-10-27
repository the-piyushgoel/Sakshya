import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff, ShieldCheck, ArrowRight, Building, Check } from "lucide-react";
import { SakshyaLogo } from "../components/common/SakshyaLogo";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { DEMO_ACCOUNTS } from "../config/authConfig";

export const Login = () => {
  const [username, setUsername] = useState("kiet");
  const [password, setPassword] = useState("kiet_123.edu");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  const { login } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();

  const handleSelectDemoAccount = (acc) => {
    setUsername(acc.username);
    setPassword(acc.password);
    setError("");
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setError("");

    const result = login(username, password);

    if (result.success) {
      addToast({
        title: "Authentication Successful",
        message: `Welcome, ${result.user.fullName} (${result.user.displayName}).`,
        type: "success"
      });
      navigate("/dashboard");
    } else {
      setError(result.error);
      addToast({
        title: "Login Failed",
        message: result.error,
        type: "error"
      });
    }
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-slate-50 font-sans">
      {/* Left Column - Deep Navy Brand Hero (matching Figma reference) */}
      <div className="relative md:w-5/12 lg:w-1/2 bg-sakshya-grid text-white p-8 lg:p-14 flex flex-col justify-between overflow-hidden">
        {/* Radial ambient glow */}
        <div className="absolute inset-0 bg-sakshya-radial pointer-events-none" />

        {/* Top Header of Left Pane */}
        <div className="relative z-10 flex items-center justify-between">
          <SakshyaLogo size="default" />
        </div>

        {/* Center Hero Branding matching screenshot */}
        <div className="relative z-10 my-16 md:my-auto max-w-lg">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white font-sans drop-shadow-sm">
            SAKSHYA
          </h1>
          <p className="text-lg sm:text-xl text-slate-200 mt-2 font-medium tracking-wide">
            सुरक्षा निधि एवं एफडीआर प्रबंधन
          </p>
          <div className="h-1 w-20 bg-amber-500 mt-6 rounded-full" />
          <p className="text-sm text-slate-300/90 mt-5 leading-relaxed">
            AICTE National Security Deposit & Fixed Deposit Receipt lifecycle automation,
            institutional verification, and inter-bank reconciliation portal.
          </p>
        </div>

        {/* Bottom Security Assurance */}
        <div className="relative z-10 pt-6 border-t border-slate-800/80 flex items-center gap-2 text-xs text-slate-400">
          <Building className="w-4 h-4 text-amber-400 shrink-0" />
          <span>All actions are role-scoped and recorded</span>
        </div>
      </div>

      {/* Right Column - Sign In Form (matching Figma reference) */}
      <div className="flex-1 flex flex-col justify-between p-6 sm:p-12 lg:p-16 bg-white max-w-2xl mx-auto w-full">
        <div className="hidden sm:block h-6"></div>

        {/* Main Sign In Form Content */}
        <div className="my-auto max-w-md w-full mx-auto py-8">
          {/* Header */}
          <div className="mb-6">
            <span className="text-xs font-bold tracking-widest text-amber-600 uppercase font-mono">
              WELCOME BACK
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 mt-1">
              Sign in to your workspace
            </h2>
            <p className="text-sm text-slate-500 mt-1.5">
              Use your assigned account credentials to continue securely.
            </p>
          </div>

          {/* Quick Demo Role Picker helper */}
          <div className="mb-6 p-3.5 bg-amber-50/80 border border-amber-200 rounded-lg text-xs text-amber-900">
            <div className="font-semibold flex items-center justify-between mb-2">
              <span className="flex items-center gap-1.5 text-amber-800">
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                Select Configured Account:
              </span>
              <span className="text-[10px] text-amber-700 font-mono">Click to autofill</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {DEMO_ACCOUNTS.map((acc) => {
                const isSelected = username === acc.username;
                return (
                  <button
                    key={acc.username}
                    type="button"
                    onClick={() => handleSelectDemoAccount(acc)}
                    className={`flex items-center justify-between p-2 rounded text-left border transition-all ${
                      isSelected
                        ? "bg-amber-100 border-amber-400 font-semibold text-amber-950 shadow-xs"
                        : "bg-white border-amber-200/80 text-amber-900 hover:bg-amber-50"
                    }`}
                  >
                    <div>
                      <div className="font-bold text-[11px] uppercase tracking-wide truncate max-w-[130px]">
                        {acc.role === "college" ? "🏛️ KIET University" : "🛡️ AICTE Admin"}
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono truncate max-w-[120px]">
                        {acc.username}
                      </div>
                    </div>
                    {isSelected && <Check className="w-3.5 h-3.5 text-amber-600 shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Error Alert */}
          {error && (
            <div className="mb-4 p-3 bg-rose-50 border border-rose-300 rounded-md text-xs text-rose-800">
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="username"
                className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5"
              >
                Username
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter username"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-md text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white transition-all font-mono"
                required
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="password"
                  className="block text-xs font-semibold text-slate-700 uppercase tracking-wider"
                >
                  Password
                </label>
              </div>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-md text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white transition-all pr-10 font-mono"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 hover:text-slate-600"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Submit Button (warm amber/gold matching Figma) */}
            <button
              type="submit"
              className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-[#D99E32] hover:bg-[#C58B24] text-white font-medium text-sm rounded-md shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 mt-6 active:scale-[0.99]"
            >
              <span>Sign in</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          {/* Footer Card matching Figma */}
          <div className="mt-8 p-3 rounded-md bg-slate-50 border border-slate-200 text-xs text-slate-500 flex items-start gap-2.5">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              Institutional session verified with role-based cryptographic access control.
            </p>
          </div>
        </div>

        {/* Bottom copyright */}
        <div className="text-center text-xs text-slate-400 pt-4 border-t border-slate-100">
          All India Council for Technical Education • Security Deposit & Fixed Deposit Receipt System
        </div>
      </div>
    </div>
  );
};
