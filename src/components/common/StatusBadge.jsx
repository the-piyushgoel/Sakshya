import React from "react";
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  AlertCircle,
  FileText,
  CheckCheck,
  HelpCircle,
  Ban,
  RefreshCw,
  Unlock,
  ShieldAlert,
  ArrowRightCircle
} from "lucide-react";

export const StatusBadge = ({ status, size = "md", showIcon = true }) => {
  const isSmall = size === "sm";

  switch (status) {
    // Administrative Verification Statuses
    case "Approved":
      return (
        <span
          className={`inline-flex items-center gap-1.5 font-semibold rounded-full bg-emerald-50 text-emerald-800 border border-emerald-300 ${
            isSmall ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-xs"
          }`}
        >
          {showIcon && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />}
          <span>Approved</span>
        </span>
      );

    case "Pending Verification":
    case "Verification Pending":
      return (
        <span
          className={`inline-flex items-center gap-1.5 font-semibold rounded-full bg-amber-50 text-amber-800 border border-amber-300 ${
            isSmall ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-xs"
          }`}
        >
          {showIcon && <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0 animate-pulse" />}
          <span>Pending Verification</span>
        </span>
      );

    case "Query Raised":
    case "Rejected / Query Raised":
      return (
        <span
          className={`inline-flex items-center gap-1.5 font-semibold rounded-full bg-purple-50 text-purple-800 border border-purple-300 ${
            isSmall ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-xs"
          }`}
        >
          {showIcon && <HelpCircle className="w-3.5 h-3.5 text-purple-600 shrink-0" />}
          <span>Query Raised</span>
        </span>
      );

    case "Rejected":
      return (
        <span
          className={`inline-flex items-center gap-1.5 font-semibold rounded-full bg-rose-50 text-rose-800 border border-rose-300 ${
            isSmall ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-xs"
          }`}
        >
          {showIcon && <Ban className="w-3.5 h-3.5 text-rose-600 shrink-0" />}
          <span>Rejected</span>
        </span>
      );

    case "Draft":
      return (
        <span
          className={`inline-flex items-center gap-1.5 font-semibold rounded-full bg-slate-100 text-slate-700 border border-slate-300 ${
            isSmall ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-xs"
          }`}
        >
          {showIcon && <FileText className="w-3.5 h-3.5 text-slate-500 shrink-0" />}
          <span>Draft</span>
        </span>
      );

    // Lifecycle Statuses
    case "Active":
      return (
        <span
          className={`inline-flex items-center gap-1.5 font-semibold rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 ${
            isSmall ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-xs"
          }`}
        >
          {showIcon && <span className="w-2 h-2 rounded-full bg-emerald-500"></span>}
          <span>Active</span>
        </span>
      );

    case "Expiring Soon":
      return (
        <span
          className={`inline-flex items-center gap-1.5 font-semibold rounded-full bg-orange-50 text-orange-800 border border-orange-300 ${
            isSmall ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-xs"
          }`}
        >
          {showIcon && <AlertTriangle className="w-3.5 h-3.5 text-orange-600 shrink-0" />}
          <span>Expiring Soon</span>
        </span>
      );

    case "Matured":
      return (
        <span
          className={`inline-flex items-center gap-1.5 font-bold rounded-full bg-amber-100 text-amber-900 border border-amber-400 ${
            isSmall ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-xs"
          }`}
        >
          {showIcon && <Clock className="w-3.5 h-3.5 text-amber-700 shrink-0" />}
          <span>Matured (Unreleased)</span>
        </span>
      );

    case "Renewal Pending":
      return (
        <span
          className={`inline-flex items-center gap-1.5 font-semibold rounded-full bg-blue-50 text-blue-800 border border-blue-300 ${
            isSmall ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-xs"
          }`}
        >
          {showIcon && <RefreshCw className="w-3.5 h-3.5 text-blue-600 shrink-0 animate-spin" />}
          <span>Renewal Pending</span>
        </span>
      );

    case "Release Requested":
      return (
        <span
          className={`inline-flex items-center gap-1.5 font-semibold rounded-full bg-indigo-50 text-indigo-800 border border-indigo-300 ${
            isSmall ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-xs"
          }`}
        >
          {showIcon && <Unlock className="w-3.5 h-3.5 text-indigo-600 shrink-0" />}
          <span>Release Requested</span>
        </span>
      );

    case "Released":
      return (
        <span
          className={`inline-flex items-center gap-1.5 font-semibold rounded-full bg-slate-100 text-slate-800 border border-slate-300 ${
            isSmall ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-xs"
          }`}
        >
          {showIcon && <Unlock className="w-3.5 h-3.5 text-slate-600 shrink-0" />}
          <span>Released / Refunded</span>
        </span>
      );

    case "Superceded":
    case "Superceded / Replaced":
      return (
        <span
          className={`inline-flex items-center gap-1.5 font-medium rounded-full bg-slate-100 text-slate-500 border border-slate-200 ${
            isSmall ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-xs"
          }`}
        >
          {showIcon && <ArrowRightCircle className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
          <span>Rolled Over (Superceded)</span>
        </span>
      );

    // Bank Confirmation Statuses
    case "Confirmed by Bank (SFMS/API)":
    case "match":
      return (
        <span
          className={`inline-flex items-center gap-1.5 font-semibold rounded-full bg-emerald-50 text-emerald-800 border border-emerald-300 ${
            isSmall ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-xs"
          }`}
        >
          {showIcon && <CheckCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />}
          <span>Confirmed by Bank</span>
        </span>
      );

    case "Amount/Date Mismatch Detected":
    case "mismatch":
      return (
        <span
          className={`inline-flex items-center gap-1.5 font-bold rounded-full bg-rose-50 text-rose-800 border border-rose-300 ${
            isSmall ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-xs"
          }`}
        >
          {showIcon && <ShieldAlert className="w-3.5 h-3.5 text-rose-600 shrink-0" />}
          <span>Discrepancy Flagged</span>
        </span>
      );

    case "Awaiting Bank Response":
    case "pending":
      return (
        <span
          className={`inline-flex items-center gap-1.5 font-medium rounded-full bg-blue-50 text-blue-800 border border-blue-300 ${
            isSmall ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-xs"
          }`}
        >
          {showIcon && <Clock className="w-3.5 h-3.5 text-blue-600 shrink-0" />}
          <span>Awaiting Bank</span>
        </span>
      );

    case "Missing / Incomplete Data":
    case "incomplete":
      return (
        <span
          className={`inline-flex items-center gap-1.5 font-semibold rounded-full bg-amber-50 text-amber-800 border border-amber-300 ${
            isSmall ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-xs"
          }`}
        >
          {showIcon && <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />}
          <span>Incomplete Data</span>
        </span>
      );

    case "Manually Reconciled":
    case "manual":
      return (
        <span
          className={`inline-flex items-center gap-1.5 font-semibold rounded-full bg-purple-50 text-purple-800 border border-purple-300 ${
            isSmall ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-xs"
          }`}
        >
          {showIcon && <CheckCircle2 className="w-3.5 h-3.5 text-purple-600 shrink-0" />}
          <span>Manually Reconciled</span>
        </span>
      );

    default:
      return (
        <span
          className={`inline-flex items-center gap-1 rounded-full bg-slate-100 text-slate-700 border border-slate-300 ${
            isSmall ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-xs"
          }`}
        >
          <span>{status || "Unknown"}</span>
        </span>
      );
  }
};
