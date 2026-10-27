import React, { useState, useMemo } from "react";
import {
  Building2,
  CheckCircle2,
  AlertCircle,
  Clock,
  Eye,
  ShieldCheck,
  Info,
  RefreshCw,
  Search,
  ExternalLink,
  CheckCheck,
  Download,
  Filter,
  AlertTriangle,
  FileCheck
} from "lucide-react";
import { useFDR } from "../context/FDRContext";
import { useAuth } from "../context/AuthContext";
import { formatINR, formatDate } from "../utils/formatters";
import { StatusBadge } from "../components/common/StatusBadge";
import { BankReconciliationModal } from "../components/modals/BankReconciliationModal";

export const BankConfirmations = () => {
  const { bankConfirmations, records } = useFDR();
  const { user } = useAuth();
  const isAicte = user?.role === "aicte";

  const [selectedConfirmation, setSelectedConfirmation] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");

  const filtered = useMemo(() => {
    return bankConfirmations.filter((item) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matches =
          item.fdrId?.toLowerCase().includes(q) ||
          item.fdrReference?.toLowerCase().includes(q) ||
          item.bank?.toLowerCase().includes(q) ||
          item.branch?.toLowerCase().includes(q) ||
          item.institutionName?.toLowerCase().includes(q) ||
          item.bankReferenceNumber?.toLowerCase().includes(q);
        if (!matches) return false;
      }
      if (statusFilter !== "All" && item.matchStatus !== statusFilter) {
        return false;
      }
      return true;
    });
  }, [bankConfirmations, searchQuery, statusFilter]);

  // Counts for filter pills
  const counts = useMemo(() => {
    return {
      all: bankConfirmations.length,
      match: bankConfirmations.filter((b) => b.matchStatus === "match").length,
      mismatch: bankConfirmations.filter((b) => b.matchStatus === "mismatch").length,
      pending: bankConfirmations.filter((b) => b.matchStatus === "pending").length,
      incomplete: bankConfirmations.filter((b) => b.matchStatus === "incomplete").length
    };
  }, [bankConfirmations]);

  // CSV Export handler
  const handleExportCSV = () => {
    const headers = [
      "FDR ID",
      "Institution",
      "FDR Number",
      "Issuing Bank",
      "Branch",
      "Submitted Amount",
      "Confirmed Amount",
      "Confirmation Status",
      "Match Status",
      "Last Checked",
      "Reference Hash"
    ];

    const rows = filtered.map((c) => [
      `"${c.fdrId || ""}"`,
      `"${c.institutionName || "KIET Deemed to be University"}"`,
      `"${c.fdrReference || ""}"`,
      `"${c.bank || ""}"`,
      `"${c.branch || ""}"`,
      c.submittedAmount || 0,
      c.verifiedAmount !== null ? c.verifiedAmount : "Pending",
      `"${c.confirmationStatus || ""}"`,
      `"${c.matchStatus || ""}"`,
      `"${c.lastChecked ? new Date(c.lastChecked).toLocaleString("en-IN") : ""}"`,
      `"${c.bankReferenceNumber || ""}"`
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `bank_confirmations_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-200 gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
              Inter-Bank Verification Gateway
            </span>
            <span className="text-xs text-slate-400">•</span>
            <span className="text-xs text-slate-500 font-mono">SFMS / Core Banking Reconciler</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Bank Confirmations
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Automated core banking reconciliation, lien status verification, and electronic bank advice scrutiny.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportCSV}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 rounded-lg border border-slate-300 shadow-2xs transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-slate-600" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Prominent Simulated Disclaimer Alert */}
      <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-3 shadow-2xs">
        <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="leading-relaxed">
          <span className="font-bold">SIMULATED BANK DATA:</span> All verification streams, CBS records,
          and SFMS messages displayed in this module are generated by the prototype electronic reconciliation engine.{" "}
          <strong>No real bank servers or live core banking APIs have been contacted.</strong> This module simulates
          AICTE's inter-bank gateway architecture with full manual reconciliation capabilities.
        </div>
      </div>

      {/* Demonstration Scenarios Overview Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="p-3 bg-white border border-emerald-200 rounded-lg flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs shrink-0">
            1
          </div>
          <div className="min-w-0">
            <span className="text-xs font-bold text-emerald-900 block truncate">Full Match (100%)</span>
            <span className="text-[11px] text-slate-500 block truncate">SBI / FDR-2024-001 (₹50L)</span>
          </div>
        </div>

        <div className="p-3 bg-white border border-rose-200 rounded-lg flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-full bg-rose-100 text-rose-700 flex items-center justify-center font-bold text-xs shrink-0">
            2
          </div>
          <div className="min-w-0">
            <span className="text-xs font-bold text-rose-900 block truncate">Amount/Date Mismatch</span>
            <span className="text-[11px] text-slate-500 block truncate">PNB / FDR-2026-002 (₹5L diff)</span>
          </div>
        </div>

        <div className="p-3 bg-white border border-amber-200 rounded-lg flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center font-bold text-xs shrink-0">
            3
          </div>
          <div className="min-w-0">
            <span className="text-xs font-bold text-amber-900 block truncate">Awaiting Response</span>
            <span className="text-[11px] text-slate-500 block truncate">Canara / FDR-2025-003 (₹15L)</span>
          </div>
        </div>

        <div className="p-3 bg-white border border-purple-200 rounded-lg flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center font-bold text-xs shrink-0">
            4
          </div>
          <div className="min-w-0">
            <span className="text-xs font-bold text-purple-900 block truncate">Missing / Incomplete</span>
            <span className="text-[11px] text-slate-500 block truncate">UBI / FDR-2025-006 (Lien missing)</span>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by FDR ID, FDR number, bank name, or institution..."
            className="w-full pl-9 pr-3 py-2 text-xs text-slate-900 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
        </div>

        {/* Status Filter Tabs */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setStatusFilter("All")}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              statusFilter === "All"
                ? "bg-slate-900 text-white"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            All ({counts.all})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("match")}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              statusFilter === "match"
                ? "bg-emerald-700 text-white"
                : "bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
            }`}
          >
            Match ({counts.match})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("mismatch")}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              statusFilter === "mismatch"
                ? "bg-rose-700 text-white"
                : "bg-rose-50 text-rose-800 hover:bg-rose-100"
            }`}
          >
            Discrepancies ({counts.mismatch})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("pending")}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              statusFilter === "pending"
                ? "bg-amber-600 text-white"
                : "bg-amber-50 text-amber-800 hover:bg-amber-100"
            }`}
          >
            Pending ({counts.pending})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("incomplete")}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              statusFilter === "incomplete"
                ? "bg-purple-700 text-white"
                : "bg-purple-50 text-purple-800 hover:bg-purple-100"
            }`}
          >
            Incomplete ({counts.incomplete})
          </button>
        </div>
      </div>

      {/* Bank Confirmations Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 uppercase font-semibold text-[11px]">
              <tr>
                <th className="px-3.5 py-3.5 whitespace-nowrap">FDR ID</th>
                <th className="px-3.5 py-3.5 min-w-[160px]">Institution</th>
                <th className="px-3.5 py-3.5 whitespace-nowrap">FDR Number</th>
                <th className="px-3.5 py-3.5 min-w-[150px]">Issuing Bank</th>
                <th className="px-3.5 py-3.5 text-right whitespace-nowrap">Submitted Amount</th>
                <th className="px-3.5 py-3.5 text-right whitespace-nowrap">Confirmed Amount</th>
                <th className="px-3.5 py-3.5 whitespace-nowrap">Confirmation Status</th>
                <th className="px-3.5 py-3.5 whitespace-nowrap">Last Checked</th>
                <th className="px-3.5 py-3.5 text-center whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-slate-500">
                    No bank confirmation records found matching your filters.
                  </td>
                </tr>
              ) : (
                filtered.map((item) => {
                  const isMatch = item.matchStatus === "match";
                  const isMismatch = item.matchStatus === "mismatch";
                  const isPending = item.matchStatus === "pending";
                  const isIncomplete = item.matchStatus === "incomplete";

                  return (
                    <tr
                      key={item.id}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        isMismatch ? "bg-rose-50/20" : ""
                      }`}
                    >
                      {/* FDR ID */}
                      <td className="px-3.5 py-3.5 font-mono font-bold text-slate-900 whitespace-nowrap">
                        <span className="bg-slate-100 px-2 py-0.5 rounded text-[11px] text-slate-700 border border-slate-200">
                          {item.fdrId || "—"}
                        </span>
                      </td>

                      {/* Institution */}
                      <td className="px-3.5 py-3.5">
                        <div className="font-semibold text-slate-900 truncate max-w-[180px]">
                          {item.institutionName || "KIET Deemed to be University"}
                        </div>
                      </td>

                      {/* FDR Number */}
                      <td className="px-3.5 py-3.5">
                        <div className="font-mono font-bold text-slate-900 whitespace-nowrap">
                          {item.fdrReference}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono truncate max-w-[130px]">
                          Ref: {item.bankReferenceNumber}
                        </div>
                      </td>

                      {/* Issuing Bank */}
                      <td className="px-3.5 py-3.5">
                        <div className="font-semibold text-slate-900 whitespace-nowrap">
                          {item.bank}
                        </div>
                        <div className="text-[10px] text-slate-400 truncate max-w-[170px]">
                          {item.branch}
                        </div>
                      </td>

                      {/* Submitted Amount */}
                      <td className="px-3.5 py-3.5 text-right font-mono font-semibold text-slate-900 whitespace-nowrap">
                        {formatINR(item.submittedAmount)}
                      </td>

                      {/* Confirmed Amount */}
                      <td className="px-3.5 py-3.5 text-right font-mono whitespace-nowrap">
                        {item.verifiedAmount !== null ? (
                          <span
                            className={`font-bold ${
                              isMismatch
                                ? "text-rose-600 underline font-extrabold"
                                : "text-emerald-700"
                            }`}
                          >
                            {formatINR(item.verifiedAmount)}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic text-[11px]">Pending Response</span>
                        )}
                      </td>

                      {/* Confirmation Status */}
                      <td className="px-3.5 py-3.5 whitespace-nowrap">
                        <div className="flex flex-col gap-0.5 items-start">
                          <StatusBadge status={item.confirmationStatus} size="sm" />
                          {item.manualReview && (
                            <span className="text-[10px] text-emerald-700 font-semibold flex items-center gap-0.5 mt-0.5">
                              <CheckCheck className="w-3 h-3" /> Reconciled
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Last Checked */}
                      <td className="px-3.5 py-3.5 text-slate-500 whitespace-nowrap text-[11px]">
                        {new Date(item.lastChecked).toLocaleString("en-IN")}
                      </td>

                      {/* Actions */}
                      <td className="px-3.5 py-3.5 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setSelectedConfirmation(item)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-md border border-blue-200 transition-colors"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>{isAicte && (isMismatch || isIncomplete) ? "Reconcile" : "Details"}</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 text-xs text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>
            Displaying <strong>{filtered.length}</strong> of <strong>{bankConfirmations.length}</strong> bank verification streams.
          </span>
          <span className="text-[11px] text-slate-400">
            Protocols: RBI SFMS-799 • Core Banking Direct Gateway • CBS Audit Traversal
          </span>
        </div>
      </div>

      {/* Bank Reconciliation Modal */}
      {selectedConfirmation && (
        <BankReconciliationModal
          confirmation={selectedConfirmation}
          isOpen={!!selectedConfirmation}
          onClose={() => setSelectedConfirmation(null)}
        />
      )}
    </div>
  );
};
