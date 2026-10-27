import React, { useState, useMemo } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  Search,
  Filter,
  FilePlus,
  ArrowUpDown,
  Eye,
  Edit3,
  MessageSquare,
  RefreshCw,
  FileSpreadsheet,
  Download,
  Building2,
  Calendar,
  IndianRupee,
  ChevronRight,
  ShieldAlert,
  Trash2,
  ShieldCheck
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useFDR } from "../context/FDRContext";
import { useToast } from "../context/ToastContext";
import { formatINR, formatDate } from "../utils/formatters";
import { StatusBadge } from "../components/common/StatusBadge";
import { FDRDetailModal } from "../components/modals/FDRDetailModal";
import { RemarksModal } from "../components/modals/RemarksModal";
import { ResubmitModal } from "../components/modals/ResubmitModal";
import { FDRReviewModal } from "../components/modals/FDRReviewModal";

export const FDRRegister = () => {
  const { user, isCollege, isAicte } = useAuth();
  const { records, deleteDraft } = useFDR();
  const { addToast } = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Search, filter, sorting states
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState(searchParams.get("filter") || "All");
  const [bankFilter, setBankFilter] = useState("All");
  const [sortBy, setSortBy] = useState("submissionDate");
  const [sortOrder, setSortOrder] = useState("desc");

  // Modals state
  const [selectedFdr, setSelectedFdr] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showRemarksModal, setShowRemarksModal] = useState(false);
  const [showResubmitModal, setShowResubmitModal] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);

  // Scoped records: College sees only their own institution's records; AICTE sees all
  const scopedRecords = useMemo(() => {
    if (isCollege && user?.institutionId) {
      return records.filter((r) => r.institutionId === user.institutionId);
    }
    return records;
  }, [records, isCollege, user]);

  // Extract unique banks for bank filter dropdown
  const uniqueBanks = useMemo(() => {
    const set = new Set(scopedRecords.map((r) => r.issuingBank).filter(Boolean));
    return ["All", ...Array.from(set)];
  }, [scopedRecords]);

  // Filter and sort records
  const filteredRecords = useMemo(() => {
    return scopedRecords
      .filter((rec) => {
        // Search filter
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matches =
            rec.fdrNumber?.toLowerCase().includes(q) ||
            rec.id?.toLowerCase().includes(q) ||
            rec.institutionName?.toLowerCase().includes(q) ||
            rec.issuingBank?.toLowerCase().includes(q) ||
            rec.purpose?.toLowerCase().includes(q) ||
            rec.bankBranch?.toLowerCase().includes(q);
          if (!matches) return false;
        }

        // Status filter
        if (statusFilter !== "All") {
          if (statusFilter === "Expiring Soon") {
            if (rec.status !== "Expiring Soon") return false;
          } else if (statusFilter === "Query Raised") {
            if (rec.status !== "Query Raised" && rec.status !== "Rejected / Query Raised") return false;
          } else if (rec.status !== statusFilter) {
            return false;
          }
        }

        // Bank filter
        if (bankFilter !== "All" && rec.issuingBank !== bankFilter) {
          return false;
        }

        return true;
      })
      .sort((a, b) => {
        let valA = a[sortBy];
        let valB = b[sortBy];

        if (sortBy === "amount") {
          valA = Number(valA || 0);
          valB = Number(valB || 0);
        } else if (
          sortBy === "issueDate" ||
          sortBy === "maturityDate" ||
          sortBy === "submissionDate" ||
          sortBy === "lastUpdated"
        ) {
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
  }, [scopedRecords, searchQuery, statusFilter, bankFilter, sortBy, sortOrder]);

  const handleSort = (field) => {
    if (sortBy === field) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortOrder("desc");
    }
  };

  const handleEditDraft = (fdr) => {
    navigate(`/fdr-register/new?editId=${fdr.id}`);
  };

  const handleDeleteDraft = (fdr) => {
    if (window.confirm(`Are you sure you want to delete draft '${fdr.fdrNumber}'?`)) {
      deleteDraft(fdr.id);
      addToast({
        title: "Draft Deleted",
        message: `Draft ${fdr.fdrNumber} was removed.`,
        type: "info"
      });
    }
  };

  const handleExportCSV = () => {
    const headers = [
      "FDR ID",
      "Institution Name",
      "FDR Number",
      "Issuing Bank",
      "Branch",
      "Amount (INR)",
      "Issue Date",
      "Maturity Date",
      "Status",
      "Beneficiary",
      "Purpose"
    ];

    const rows = filteredRecords.map((r) => [
      `"${r.id}"`,
      `"${r.institutionName || ""}"`,
      `"${r.fdrNumber}"`,
      `"${r.issuingBank}"`,
      `"${r.bankBranch}"`,
      r.amount,
      r.issueDate,
      r.maturityDate,
      `"${r.status}"`,
      `"${r.beneficiary}"`,
      `"${r.purpose?.replace(/"/g, '""')}"`
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `AICTE_FDR_Register_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Page Title & Top Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-200 gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            {/* <span className="text-xs font-semibold uppercase tracking-wider text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
              {isAicte ? "National AICTE Ledger" : "Institutional Ledger"}
            </span> */}
            <span className="text-xs text-slate-400">•</span>
            <span className="text-xs text-slate-500 font-mono">
              Records: {filteredRecords.length} of {scopedRecords.length}
            </span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">FDR Register</h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            {isAicte
              ? "Comprehensive national registry of security deposits across all approved institutions with administrative review actions."
              : "Complete repository of regulatory security deposits, joint fixed deposit receipts, and audit trail."}
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={handleExportCSV}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-2xs"
            title="Export filtered records to CSV"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span>Export CSV</span>
          </button>

          {/* Add New FDR button (Available ONLY for College user) */}
          {isCollege && (
            <Link
              to="/fdr-register/new"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-medium text-xs sm:text-sm shadow-sm transition-all hover:shadow active:scale-[0.98]"
            >
              <FilePlus className="w-4 h-4" />
              <span>Add New FDR</span>
            </Link>
          )}
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
          {/* Search Input */}
          <div className="sm:col-span-5 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by FDR No, Institution, Bank, or Purpose..."
              className="w-full pl-9 pr-3 py-2 text-xs text-slate-900 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white"
            />
          </div>

          {/* Status Filter */}
          <div className="sm:col-span-4 flex items-center gap-2">
            <span className="text-xs font-medium text-slate-500 whitespace-nowrap hidden md:inline">
              Status:
            </span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-3 py-2 text-xs text-slate-800 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              <option value="All">All Statuses</option>
              <option value="Pending Verification">Pending Verification</option>
              <option value="Approved">Approved</option>
              <option value="Query Raised">Query Raised</option>
              <option value="Rejected">Rejected</option>
              <option value="Expiring Soon">Expiring Soon</option>
              <option value="Draft">Draft</option>
            </select>
          </div>

          {/* Bank Filter */}
          <div className="sm:col-span-3 flex items-center gap-2">
            <select
              value={bankFilter}
              onChange={(e) => setBankFilter(e.target.value)}
              className="w-full px-3 py-2 text-xs text-slate-800 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              <option value="All">All Banks</option>
              {uniqueBanks.filter((b) => b !== "All").map((bank) => (
                <option key={bank} value={bank}>
                  {bank}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Quick Filter Pills */}
        <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100 text-xs">
          <span className="text-slate-400 text-[11px] font-medium mr-1">Quick view:</span>
          {["All", "Pending Verification", "Approved", "Query Raised", "Rejected", "Expiring Soon", "Draft"].map(
            (status) => (
              <button
                key={status}
                type="button"
                onClick={() => setStatusFilter(status)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                  statusFilter === status
                    ? "bg-slate-900 text-white font-semibold"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {status}
              </button>
            )
          )}
        </div>
      </div>

      {/* Main FDR Register Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 uppercase font-semibold text-[11px]">
              <tr>
                <th
                  onClick={() => handleSort("id")}
                  className="px-4 py-3.5 cursor-pointer hover:bg-slate-100 transition-colors"
                >
                  <div className="flex items-center gap-1">
                    <span>FDR ID</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                {isAicte && <th className="px-4 py-3.5">Institution</th>}
                <th
                  onClick={() => handleSort("fdrNumber")}
                  className="px-4 py-3.5 cursor-pointer hover:bg-slate-100 transition-colors"
                >
                  <div className="flex items-center gap-1">
                    <span>FDR Number</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort("issuingBank")}
                  className="px-4 py-3.5 cursor-pointer hover:bg-slate-100 transition-colors"
                >
                  <div className="flex items-center gap-1">
                    <span>Bank & Branch</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort("amount")}
                  className="px-4 py-3.5 cursor-pointer hover:bg-slate-100 transition-colors text-right"
                >
                  <div className="flex items-center justify-end gap-1">
                    <span>Amount (₹)</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort("issueDate")}
                  className="px-4 py-3.5 cursor-pointer hover:bg-slate-100 transition-colors"
                >
                  <div className="flex items-center gap-1">
                    <span>Issue Date</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort("maturityDate")}
                  className="px-4 py-3.5 cursor-pointer hover:bg-slate-100 transition-colors"
                >
                  <div className="flex items-center gap-1">
                    <span>Maturity Date</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th
                  onClick={() => handleSort("submissionDate")}
                  className="px-4 py-3.5 cursor-pointer hover:bg-slate-100 transition-colors"
                >
                  <div className="flex items-center gap-1">
                    <span>Submission</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th className="px-4 py-3.5">Status</th>
                <th
                  onClick={() => handleSort("lastUpdated")}
                  className="px-4 py-3.5 cursor-pointer hover:bg-slate-100 transition-colors"
                >
                  <div className="flex items-center gap-1">
                    <span>Last Updated</span>
                    <ArrowUpDown className="w-3 h-3 text-slate-400" />
                  </div>
                </th>
                <th className="px-4 py-3.5 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={isAicte ? 11 : 10} className="py-12 text-center">
                    <div className="max-w-sm mx-auto flex flex-col items-center">
                      <div className="p-3 bg-slate-100 text-slate-400 rounded-full mb-3">
                        <FileSpreadsheet className="w-8 h-8" />
                      </div>
                      <h3 className="text-sm font-bold text-slate-800">No FDR records found</h3>
                      <p className="text-xs text-slate-500 mt-1">
                        {searchQuery || statusFilter !== "All" || bankFilter !== "All"
                          ? "Try adjusting your search criteria or clearing filters."
                          : "No records found in register."}
                      </p>
                      {isCollege && (
                        <Link
                          to="/fdr-register/new"
                          className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-lg shadow-sm transition-colors"
                        >
                          <FilePlus className="w-4 h-4" />
                          <span>Add New FDR</span>
                        </Link>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                filteredRecords.map((item) => {
                  const isDraft = item.status === "Draft";
                  const isQuery = item.status === "Query Raised" || item.status === "Rejected / Query Raised";
                  const isRejected = item.status === "Rejected";
                  const isActionableForCollege = (isQuery || isRejected) && isCollege;

                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-slate-50/80 transition-colors group"
                    >
                      {/* FDR ID */}
                      <td className="px-4 py-3.5 font-mono font-semibold text-slate-900 text-xs">
                        {item.id}
                      </td>

                      {/* Institution Name (for AICTE) */}
                      {isAicte && (
                        <td className="px-4 py-3.5 font-medium text-slate-900 max-w-[170px] truncate">
                          {item.institutionName}
                        </td>
                      )}

                      {/* FDR Number */}
                      <td className="px-4 py-3.5">
                        <div className="font-mono font-medium text-slate-900">{item.fdrNumber}</div>
                        <div className="text-[10px] text-slate-400 truncate max-w-[150px]">
                          {item.purpose}
                        </div>
                      </td>

                      {/* Bank & Branch */}
                      <td className="px-4 py-3.5">
                        <div className="font-medium text-slate-900">{item.issuingBank}</div>
                        <div className="text-[10px] text-slate-400 truncate max-w-[180px]">
                          {item.bankBranch}
                        </div>
                      </td>

                      {/* Amount */}
                      <td className="px-4 py-3.5 text-right font-mono font-bold text-slate-900">
                        {formatINR(item.amount)}
                      </td>

                      {/* Issue Date */}
                      <td className="px-4 py-3.5 whitespace-nowrap text-slate-600">
                        {formatDate(item.issueDate)}
                      </td>

                      {/* Maturity Date */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <span className="font-medium text-slate-800">
                          {formatDate(item.maturityDate)}
                        </span>
                      </td>

                      {/* Submission Date */}
                      <td className="px-4 py-3.5 whitespace-nowrap text-slate-500">
                        {item.submissionDate ? formatDate(item.submissionDate) : "Draft"}
                      </td>

                      {/* Status Badge */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        <StatusBadge status={item.status} size="sm" />
                      </td>

                      {/* Last Updated */}
                      <td className="px-4 py-3.5 whitespace-nowrap text-slate-400 text-[11px]">
                        {formatDate(item.lastUpdated)}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3.5 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* If AICTE: Show "Review & Decide" action */}
                          {isAicte && (
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedFdr(item);
                                setShowReviewModal(true);
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded transition-colors"
                              title="Scrutinize & Review Decision"
                            >
                              <ShieldCheck className="w-3.5 h-3.5" />
                              <span>Review</span>
                            </button>
                          )}

                          {/* View Details */}
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedFdr(item);
                              setShowDetailModal(true);
                            }}
                            className="p-1 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                            title="View Full Details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          {/* Edit Draft (College Only) */}
                          {isDraft && isCollege && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleEditDraft(item)}
                                className="p-1 text-slate-600 hover:text-amber-600 hover:bg-amber-50 rounded transition-colors"
                                title="Edit Draft"
                              >
                                <Edit3 className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteDraft(item)}
                                className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
                                title="Delete Draft"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
                          )}

                          {/* View Remarks */}
                          {(isQuery || isRejected || (item.remarksHistory && item.remarksHistory.length > 0)) && (
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedFdr(item);
                                setShowRemarksModal(true);
                              }}
                              className="p-1 text-slate-600 hover:text-amber-600 hover:bg-amber-50 rounded transition-colors relative"
                              title="View AICTE Remarks"
                            >
                              <MessageSquare className="w-4 h-4 text-amber-600" />
                            </button>
                          )}

                          {/* Resubmit (College only, when query raised or rejected) */}
                          {isActionableForCollege && (
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedFdr(item);
                                setShowResubmitModal(true);
                              }}
                              className="p-1 text-slate-600 hover:text-emerald-600 hover:bg-emerald-50 rounded transition-colors"
                              title="Address Query / Deficiency & Resubmit"
                            >
                              <RefreshCw className="w-4 h-4 text-emerald-600" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Table Footer */}
        <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 text-xs text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div>
            Showing <strong className="text-slate-800">{filteredRecords.length}</strong> records in
            current view.
          </div>
          <div className="text-[11px] text-slate-400">
            Click on column headers to sort by Amount, Dates, or Status.
          </div>
        </div>
      </div>

      {/* Review Modal for AICTE */}
      {showReviewModal && selectedFdr && (
        <FDRReviewModal
          isOpen={showReviewModal}
          onClose={() => setShowReviewModal(false)}
          fdr={selectedFdr}
        />
      )}

      {/* Detail Modal */}
      {showDetailModal && selectedFdr && (
        <FDRDetailModal
          isOpen={showDetailModal}
          onClose={() => setShowDetailModal(false)}
          fdr={selectedFdr}
          onEditDraft={handleEditDraft}
          onResubmit={() => {
            setShowDetailModal(false);
            setShowResubmitModal(true);
          }}
          isCollegeUser={isCollege}
        />
      )}

      {/* Remarks Modal */}
      {showRemarksModal && selectedFdr && (
        <RemarksModal
          isOpen={showRemarksModal}
          onClose={() => setShowRemarksModal(false)}
          fdr={selectedFdr}
          onResubmit={() => {
            setShowRemarksModal(false);
            setShowResubmitModal(true);
          }}
          isCollegeUser={isCollege}
        />
      )}

      {/* Resubmit Modal */}
      {showResubmitModal && selectedFdr && (
        <ResubmitModal
          isOpen={showResubmitModal}
          onClose={() => setShowResubmitModal(false)}
          fdr={selectedFdr}
        />
      )}
    </div>
  );
};
