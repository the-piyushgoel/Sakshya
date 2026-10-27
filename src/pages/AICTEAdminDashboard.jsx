import React, { useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ShieldCheck,
  Building2,
  Clock,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  FileSpreadsheet,
  Search,
  Filter,
  ArrowUpDown,
  Eye,
  FileCheck2,
  Calendar,
  IndianRupee,
  ShieldAlert,
  ArrowRight,
  ExternalLink,
  MessageSquare,
  Unlock,
  RefreshCw,
  Download
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useFDR } from "../context/FDRContext";
import { formatINR, formatDate, getDaysRemaining } from "../utils/formatters";
import { StatusBadge } from "../components/common/StatusBadge";
import { ReleaseReviewModal } from "../components/modals/ReleaseReviewModal";

export const AICTEAdminDashboard = ({ onOpenReview }) => {
  const { user } = useAuth();
  const {
    records,
    stats,
    pendingVerificationQueue,
    pendingReleaseQueue,
    pendingRenewalQueue,
    statusDistribution,
    upcomingMaturityWatchlist,
    recentRemarksFeed
  } = useFDR();
  const navigate = useNavigate();

  // Active view tab: 'verification' | 'releases' | 'renewals'
  const [activeTab, setActiveTab] = useState("verification");

  // Search and filter inside the Pending Queue
  const [searchQuery, setSearchQuery] = useState("");
  const [bankFilter, setBankFilter] = useState("All");
  const [discrepancyFilter, setDiscrepancyFilter] = useState("All");
  const [sortBy, setSortBy] = useState("submissionDate");
  const [sortOrder, setSortOrder] = useState("desc");

  // Release review modal state
  const [selectedReleaseFdr, setSelectedReleaseFdr] = useState(null);

  // Unique banks for filter
  const uniqueBanks = useMemo(() => {
    const set = new Set(pendingVerificationQueue.map((r) => r.issuingBank).filter(Boolean));
    return ["All", ...Array.from(set)];
  }, [pendingVerificationQueue]);

  // Filtered queue
  const filteredQueue = useMemo(() => {
    return pendingVerificationQueue
      .filter((rec) => {
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const match =
            rec.fdrNumber?.toLowerCase().includes(q) ||
            rec.id?.toLowerCase().includes(q) ||
            rec.institutionName?.toLowerCase().includes(q) ||
            rec.issuingBank?.toLowerCase().includes(q);
          if (!match) return false;
        }

        if (bankFilter !== "All" && rec.issuingBank !== bankFilter) {
          return false;
        }

        if (discrepancyFilter !== "All") {
          if (discrepancyFilter === "Discrepancy" && rec.discrepancyStatus !== "Discrepancy") return false;
          if (discrepancyFilter === "Clean" && rec.discrepancyStatus !== "Matched") return false;
          if (discrepancyFilter === "Pending" && !rec.discrepancyStatus.startsWith("Pending")) return false;
        }

        return true;
      })
      .sort((a, b) => {
        let valA = a[sortBy];
        let valB = b[sortBy];

        if (sortBy === "amount") {
          valA = Number(valA || 0);
          valB = Number(valB || 0);
        } else if (sortBy === "submissionDate" || sortBy === "lastUpdated") {
          valA = new Date(valA || 0).getTime();
          valB = new Date(valB || 0).getTime();
        } else {
          valA = String(valA || "").toLowerCase();
          valB = String(valB || "").toLowerCase();
        }

        if (sortOrder === "asc") {
          return valA > valB ? 1 : -1;
        } else {
          return valA < valB ? 1 : -1;
        }
      });
  }, [pendingVerificationQueue, searchQuery, bankFilter, discrepancyFilter, sortBy, sortOrder]);

  const handleSort = (field) => {
    if (sortBy === field) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortOrder("desc");
    }
  };

  const handleExportQueueCSV = () => {
    const headers = [
      "FDR ID",
      "Institution",
      "FDR Number",
      "Bank",
      "Amount",
      "Submitted Date",
      "Document Status",
      "Discrepancy Status",
      "Is Replacement"
    ];

    const rows = filteredQueue.map((item) => [
      `"${item.id}"`,
      `"${item.institutionName}"`,
      `"${item.fdrNumber}"`,
      `"${item.issuingBank}"`,
      item.amount,
      `"${item.submissionDate || item.lastUpdated || ""}"`,
      `"${item.document ? "PDF Attached" : "Missing"}"`,
      `"${item.discrepancyStatus}"`,
      item.isReplacement ? "Yes" : "No"
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `aicte_verification_queue_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* AICTE Bureau Header Banner */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 sm:p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded bg-blue-100 text-blue-800 border border-blue-300">
              AICTE Regulatory Scrutiny Bureau
            </span>
            <span className="text-xs text-slate-400">•</span>
            <span className="text-xs text-slate-500 font-mono">Desk: REGULATORY-CELL-DELHI</span>
          </div>

          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            Security Deposit Verification & Compliance Portal
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-2xl">
            National regulatory oversight for technical institutes, inter-bank SFMS reconciliation,
            and joint lien endorsement scrutiny.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <Link
            to="/fdr-register"
            className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-medium text-xs shadow-sm transition-all"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>National Register</span>
          </Link>
          <Link
            to="/bank-confirmations"
            className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 font-medium text-xs transition-all"
          >
            <Building2 className="w-4 h-4" />
            <span>Bank Gateway</span>
            {stats.unresolvedDiscrepancies > 0 && (
              <span className="bg-rose-600 text-white text-[10px] font-bold px-1.5 py-0.2 rounded-full">
                {stats.unresolvedDiscrepancies}
              </span>
            )}
          </Link>
        </div>
      </div>

      {/* Calculated KPI Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-4 gap-4">
        {/* Total Institutions */}
        <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Institutions
            </span>
            <Building2 className="w-3.5 h-3.5 text-blue-600" />
          </div>
          <div className="text-xl sm:text-2xl font-extrabold text-slate-900 font-mono">
            {stats.totalInstitutions}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5 truncate">Monitored</div>
        </div>

        {/* Total FDRs */}
        <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Total FDRs
            </span>
            <FileSpreadsheet className="w-3.5 h-3.5 text-slate-600" />
          </div>
          <div className="text-xl sm:text-2xl font-extrabold text-slate-900 font-mono">
            {stats.totalFDRs}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5 truncate">Total Repository</div>
        </div>

        {/* Pending Verification */}
        <div
          onClick={() => setActiveTab("verification")}
          className={`cursor-pointer transition-colors p-3.5 rounded-lg border ${
            activeTab === "verification"
              ? "bg-blue-50 border-blue-300 ring-2 ring-blue-200"
              : "bg-gray-50 border-gray-200 hover:bg-gray-100"
          }`}
        >
          <div className="flex items-center justify-between text-blue-600 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-900">
              Pending Scrutiny
            </span>
            <Clock className="w-3.5 h-3.5 text-amber-600 animate-pulse" />
          </div>
          <div className="text-xl sm:text-2xl font-extrabold text-amber-700 font-mono">
            {stats.pendingVerification}
          </div>
          <div className="text-[10px] font-semibold text-amber-800 mt-0.5 truncate">
            Queue Action
          </div>
        </div>

        {/* Pending Release Requests */}
        <div
          onClick={() => setActiveTab("releases")}
          className={`cursor-pointer transition-colors p-3.5 rounded-lg border ${
            activeTab === "releases"
              ? "bg-blue-50 border-blue-300 ring-2 ring-blue-200"
              : "bg-gray-50 border-gray-200 hover:bg-gray-100"
          }`}
        >
          <div className="flex items-center justify-between text-indigo-600 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Release Req.
            </span>
            <Unlock className="w-3.5 h-3.5 text-indigo-600" />
          </div>
          <div className="text-xl sm:text-2xl font-extrabold text-indigo-700 font-mono">
            {stats.pendingReleaseRequests}
          </div>
          <div className="text-[10px] text-indigo-700 font-medium mt-0.5 truncate">
            Awaiting Approval
          </div>
        </div>

        {/* Approved FDRs */}
        <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
          <div className="flex items-center justify-between text-emerald-600 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Approved
            </span>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
          </div>
          <div className="text-xl sm:text-2xl font-extrabold text-emerald-700 font-mono">
            {stats.approvedFDRs}
          </div>
          <div className="text-[10px] text-emerald-700 mt-0.5 truncate">Active Lien</div>
        </div>

        {/* Discrepancies */}
        <div
          onClick={() => navigate("/bank-confirmations")}
          className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm cursor-pointer hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center justify-between text-rose-600 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Bank Discrepancy
            </span>
            <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />
          </div>
          <div className="text-xl sm:text-2xl font-extrabold text-rose-700 font-mono">
            {stats.unresolvedDiscrepancies}
          </div>
          <div className="text-[10px] text-rose-700 mt-0.5 truncate">SFMS/CBS Flags</div>
        </div>

        {/* Matured Instruments */}
        <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
          <div className="flex items-center justify-between text-blue-600 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Matured
            </span>
            <Calendar className="w-3.5 h-3.5 text-amber-600" />
          </div>
          <div className="text-xl sm:text-2xl font-extrabold text-amber-800 font-mono">
            {stats.maturedFDRs}
          </div>
          <div className="text-[10px] text-amber-800 mt-0.5 truncate">Unreleased</div>
        </div>

        {/* Total Value */}
        <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Total Value
            </span>
            <IndianRupee className="w-3.5 h-3.5 text-slate-700" />
          </div>
          <div className="text-base sm:text-lg font-extrabold text-slate-900 font-mono truncate">
            {formatINR(stats.totalDepositAmount)}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5 truncate">Under Lien</div>
        </div>
      </div>

      {/* Tabs Row for Verification vs Release vs Renewal Queues */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          type="button"
          onClick={() => setActiveTab("verification")}
          className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors flex items-center gap-2 ${
            activeTab === "verification"
              ? "bg-slate-900 text-white"
              : "bg-slate-100 text-slate-700 hover:bg-slate-200"
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          <span>Pending Verification Queue ({pendingVerificationQueue.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("releases")}
          className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors flex items-center gap-2 ${
            activeTab === "releases"
              ? "bg-indigo-700 text-white"
              : "bg-indigo-50 text-indigo-800 hover:bg-indigo-100"
          }`}
        >
          <Unlock className="w-3.5 h-3.5" />
          <span>Release / Refund Requests ({pendingReleaseQueue.length})</span>
        </button>
      </div>

      {/* Primary Section 1: Verification Queue Tab */}
      {activeTab === "verification" && (
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
          {/* Queue Header */}
          <div className="p-4 sm:p-5 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50/60">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-ping"></span>
                <h2 className="text-base font-bold text-slate-900 uppercase tracking-wide">
                  Pending Verification Queue
                </h2>
                <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-amber-100 text-amber-800 border border-amber-300 font-mono">
                  {pendingVerificationQueue.length} Pending
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Submissions requiring scrutiny officer review, certificate validation, and bank SFMS confirmation check.
              </p>
            </div>

            {/* Quick Filter Inputs & CSV Export */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-full sm:w-52">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search institution / FDR..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs text-slate-900 bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <select
                value={discrepancyFilter}
                onChange={(e) => setDiscrepancyFilter(e.target.value)}
                className="px-2.5 py-1.5 text-xs text-slate-800 bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                <option value="All">All Flags</option>
                <option value="Discrepancy">Discrepancy Detected</option>
                <option value="Clean">Clean / Matched</option>
                <option value="Pending">Awaiting Bank</option>
              </select>

              <select
                value={bankFilter}
                onChange={(e) => setBankFilter(e.target.value)}
                className="px-2.5 py-1.5 text-xs text-slate-800 bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                <option value="All">All Banks</option>
                {uniqueBanks.filter((b) => b !== "All").map((bank) => (
                  <option key={bank} value={bank}>
                    {bank}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={handleExportQueueCSV}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-md shadow-2xs"
                title="Export queue to CSV"
              >
                <Download className="w-3.5 h-3.5 text-slate-500" />
                <span>CSV</span>
              </button>
            </div>
          </div>

          {/* Queue Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-100 text-slate-700 border-b border-slate-200 uppercase font-semibold text-[11px]">
                <tr>
                  <th
                    onClick={() => handleSort("id")}
                    className="px-3.5 py-3 cursor-pointer hover:bg-slate-200/80 transition-colors whitespace-nowrap"
                  >
                    <div className="flex items-center gap-1">
                      <span>FDR ID</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                  <th className="px-3.5 py-3 min-w-[150px]">Institution Name</th>
                  <th className="px-3.5 py-3 whitespace-nowrap">FDR Number</th>
                  <th className="px-3.5 py-3 min-w-[140px]">Issuing Bank</th>
                  <th
                    onClick={() => handleSort("amount")}
                    className="px-3.5 py-3 cursor-pointer hover:bg-slate-200/80 transition-colors text-right whitespace-nowrap"
                  >
                    <div className="flex items-center justify-end gap-1">
                      <span>Deposit Amount</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                  <th
                    onClick={() => handleSort("submissionDate")}
                    className="px-3.5 py-3 cursor-pointer hover:bg-slate-200/80 transition-colors whitespace-nowrap"
                  >
                    <div className="flex items-center gap-1">
                      <span>Submitted On</span>
                      <ArrowUpDown className="w-3 h-3 text-slate-400" />
                    </div>
                  </th>
                  <th className="px-3.5 py-3 whitespace-nowrap">Document Status</th>
                  <th className="px-3.5 py-3 whitespace-nowrap">Discrepancy Indicator</th>
                  <th className="px-3.5 py-3 text-center whitespace-nowrap">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredQueue.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-slate-500">
                      <div className="max-w-sm mx-auto flex flex-col items-center">
                        <div className="p-3 bg-emerald-50 text-emerald-600 rounded-full mb-2">
                          <CheckCircle2 className="w-8 h-8" />
                        </div>
                        <h3 className="text-sm font-bold text-slate-800">Verification Queue Clear</h3>
                        <p className="text-xs text-slate-500 mt-1">
                          {searchQuery || bankFilter !== "All" || discrepancyFilter !== "All"
                            ? "No records matched your filter criteria."
                            : "All submitted institutional FDRs have been scrutinized. New submissions by colleges will appear here automatically."}
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredQueue.map((item) => {
                    const hasDiscrepancy = item.discrepancyStatus === "Discrepancy";
                    const isClean = item.discrepancyStatus === "Matched";
                    const isPendingCheck = item.discrepancyStatus.startsWith("Pending");

                    return (
                      <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                        {/* FDR ID */}
                        <td className="px-3.5 py-3.5 font-mono font-bold text-slate-900 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <span>{item.id}</span>
                            {item.isReplacement && (
                              <span className="text-[10px] font-bold text-purple-700 bg-blue-100 px-1.5 py-0.2 rounded border border-purple-200">
                                Rollover
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Institution Name */}
                        <td className="px-3.5 py-3.5">
                          <div className="font-semibold text-slate-900 max-w-[190px] truncate">
                            {item.institutionName}
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono">
                            PID: {item.institutionId}
                          </div>
                        </td>

                        {/* FDR Number */}
                        <td className="px-3.5 py-3.5 whitespace-nowrap">
                          <span className="font-mono font-medium text-slate-900 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                            {item.fdrNumber}
                          </span>
                        </td>

                        {/* Issuing Bank */}
                        <td className="px-3.5 py-3.5">
                          <div className="font-medium text-slate-900 whitespace-nowrap">{item.issuingBank}</div>
                          <div className="text-[10px] text-slate-400 truncate max-w-[150px]">
                            {item.bankBranch}
                          </div>
                        </td>

                        {/* Deposit Amount */}
                        <td className="px-3.5 py-3.5 text-right font-mono font-bold text-slate-900 whitespace-nowrap">
                          {formatINR(item.amount)}
                        </td>

                        {/* Submission Date */}
                        <td className="px-3.5 py-3.5 whitespace-nowrap text-slate-600 text-[11px]">
                          {formatDate(item.submissionDate || item.lastUpdated)}
                        </td>

                        {/* Document Status */}
                        <td className="px-3.5 py-3.5 whitespace-nowrap">
                          {item.document ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                              <FileCheck2 className="w-3.5 h-3.5 text-emerald-600" />
                              <span>PDF Attached</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                              <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
                              <span>Missing Scan</span>
                            </span>
                          )}
                        </td>

                        {/* Discrepancy Indicator */}
                        <td className="px-3.5 py-3.5 whitespace-nowrap">
                          {hasDiscrepancy ? (
                            <span
                              className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-300"
                              title={item.discrepancyText}
                            >
                              <ShieldAlert className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                              <span>Mismatch Flag</span>
                            </span>
                          ) : isClean ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                              <span>Bank Matched</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-300">
                              <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                              <span>Awaiting Bank</span>
                            </span>
                          )}
                        </td>

                        {/* Action: Open Review Modal */}
                        <td className="px-3.5 py-3.5 text-center whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => onOpenReview(item)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-md shadow-2xs transition-colors"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Review & Decide</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Queue Footer */}
          <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 text-xs text-slate-500 flex items-center justify-between">
            <span>
              Queue updates in real time when any institution registers or resubmits an FDR.
            </span>
            <span className="text-[11px] font-mono text-slate-400">
              Total In Queue: {filteredQueue.length}
            </span>
          </div>
        </div>
      )}

      {/* Primary Section 2: Release / Refund Requests Tab */}
      {activeTab === "releases" && (
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
          <div className="p-4 sm:p-5 border-b border-slate-200 bg-indigo-50/50 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Unlock className="w-4 h-4 text-indigo-700" />
                <h2 className="text-base font-bold text-slate-900 uppercase tracking-wide">
                  Pending Security Deposit Release & Refund Requests
                </h2>
              </div>
              <p className="text-xs text-slate-600 mt-0.5">
                Matured deposits requested for lien revocation by technical institutions. Scrutiny required prior to releasing funds.
              </p>
            </div>
            <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-indigo-100 text-indigo-800 border border-indigo-300 font-mono">
              {pendingReleaseQueue.length} Requests Pending
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-100 text-slate-700 border-b border-slate-200 uppercase font-semibold text-[11px]">
                <tr>
                  <th className="px-4 py-3">FDR ID</th>
                  <th className="px-4 py-3">Institution</th>
                  <th className="px-4 py-3">FDR Number</th>
                  <th className="px-4 py-3">Issuing Bank</th>
                  <th className="px-4 py-3 text-right">Deposit Amount</th>
                  <th className="px-4 py-3">Regulatory Release Reason</th>
                  <th className="px-4 py-3">Requested Date</th>
                  <th className="px-4 py-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {pendingReleaseQueue.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-500">
                      <div className="max-w-sm mx-auto flex flex-col items-center">
                        <CheckCircle2 className="w-8 h-8 text-emerald-600 mb-2" />
                        <h3 className="text-sm font-bold text-slate-800">No Pending Release Requests</h3>
                        <p className="text-xs text-slate-500 mt-1">
                          No institutions have requested deposit release at this time.
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  pendingReleaseQueue.map((item) => (
                    <tr key={item.id} className="hover:bg-indigo-50/30 transition-colors">
                      <td className="px-4 py-3.5 font-mono font-bold text-slate-900">
                        {item.id}
                      </td>
                      <td className="px-4 py-3.5 font-semibold text-slate-900">
                        {item.institutionName}
                      </td>
                      <td className="px-4 py-3.5 font-mono font-medium text-slate-800">
                        {item.fdrNumber}
                      </td>
                      <td className="px-4 py-3.5 text-slate-800">
                        {item.issuingBank}
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono font-bold text-slate-900">
                        {formatINR(item.amount)}
                      </td>
                      <td className="px-4 py-3.5 text-slate-700 max-w-[240px]">
                        <span className="font-medium text-indigo-950 block">
                          {item.releaseRequest?.reason}
                        </span>
                        {item.releaseRequest?.remarks && (
                          <span className="text-[11px] text-slate-500 truncate block">
                            Note: {item.releaseRequest.remarks}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-slate-600 text-[11px] whitespace-nowrap">
                        {item.releaseRequest?.requestedDate
                          ? new Date(item.releaseRequest.requestedDate).toLocaleDateString("en-IN")
                          : "—"}
                      </td>
                      <td className="px-4 py-3.5 text-center whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => setSelectedReleaseFdr(item)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-indigo-700 hover:bg-indigo-800 rounded-md shadow-2xs transition-colors"
                        >
                          <Unlock className="w-3.5 h-3.5" />
                          <span>Review Release</span>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Secondary Row: Recent Scrutiny Audit & Upcoming Maturity Watchlist */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Scrutiny Activity Feed (2 cols) */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs lg:col-span-2 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800">
                  Recent Scrutiny Audit Log
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Timeline of approvals, query issuances, and regulatory actions
                </p>
              </div>
              <Link
                to="/fdr-register"
                className="text-xs font-semibold text-amber-600 hover:text-amber-700 flex items-center gap-1"
              >
                <span>National Ledger</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="space-y-3">
              {recentRemarksFeed.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-400">
                  No scrutiny actions logged yet.
                </div>
              ) : (
                recentRemarksFeed.map((item) => (
                  <div
                    key={item.id}
                    className="p-3 rounded-lg border border-slate-200 bg-slate-50/80 text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 font-mono">{item.fdrNumber}</span>
                        <span className="text-slate-400">•</span>
                        <span className="text-slate-600 font-medium">{item.bank}</span>
                      </div>
                      <span className="text-[10px] text-slate-400">
                        {new Date(item.timestamp).toLocaleString("en-IN")}
                      </span>
                    </div>
                    <p className="text-slate-700 text-xs leading-relaxed font-sans">{item.text}</p>
                    <div className="pt-1 flex items-center justify-between text-[10px] text-slate-500">
                      <span>Officer: {item.author}</span>
                      <button
                        type="button"
                        onClick={() => {
                          const matched = records.find((r) => r.id === item.fdrId);
                          if (matched) onOpenReview(matched);
                        }}
                        className="text-amber-600 hover:text-amber-800 font-medium"
                      >
                        Inspect Record →
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Upcoming Regulatory Maturity Watchlist (1 col) */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-orange-600" />
                Maturity Watchlist
              </h3>
              <span className="text-[11px] font-semibold text-orange-700 bg-orange-100 px-2 py-0.5 rounded-full">
                {upcomingMaturityWatchlist.length} Tracked
              </span>
            </div>

            <div className="space-y-3">
              {upcomingMaturityWatchlist.map((rec) => {
                const days = getDaysRemaining(rec.maturityDate);
                const isUrgent = days !== null && days <= 30;

                return (
                  <div
                    key={rec.id}
                    onClick={() => onOpenReview(rec)}
                    className="p-3 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100/70 cursor-pointer transition-all text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between font-semibold">
                      <span className="text-slate-900 font-mono">{rec.fdrNumber}</span>
                      <span className={isUrgent ? "text-rose-700 font-bold" : "text-slate-600"}>
                        {days !== null ? `${days} Days Left` : "Matured"}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 truncate">
                      {rec.institutionName}
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-slate-400 pt-0.5">
                      <span>{formatINR(rec.amount)}</span>
                      <span>Maturity: {formatDate(rec.maturityDate)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 mt-4 text-center">
            <Link
              to="/bank-confirmations"
              className="text-xs font-medium text-blue-600 hover:text-blue-800"
            >
              Verify Core Banking API Integrations →
            </Link>
          </div>
        </div>
      </div>

      {/* Release Review Modal for AICTE */}
      {selectedReleaseFdr && (
        <ReleaseReviewModal
          isOpen={!!selectedReleaseFdr}
          onClose={() => setSelectedReleaseFdr(null)}
          fdr={selectedReleaseFdr}
        />
      )}
    </div>
  );
};
