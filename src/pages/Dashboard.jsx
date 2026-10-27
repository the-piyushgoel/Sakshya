import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  FilePlus,
  ShieldCheck,
  Clock,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Building2,
  Calendar,
  IndianRupee,
  ArrowRight,
  ExternalLink,
  MessageSquare,
  FileSpreadsheet
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useFDR } from "../context/FDRContext";
import { formatINR, formatDate, getDaysRemaining } from "../utils/formatters";
import { StatusBadge } from "../components/common/StatusBadge";
import { INSTITUTION_CONFIG } from "../config/institutionConfig";
import { FDRDetailModal } from "../components/modals/FDRDetailModal";
import { RemarksModal } from "../components/modals/RemarksModal";
import { ResubmitModal } from "../components/modals/ResubmitModal";
import { FDRReviewModal } from "../components/modals/FDRReviewModal";
import { AICTEAdminDashboard } from "./AICTEAdminDashboard";

export const Dashboard = () => {
  const { user, isCollege, isAicte } = useAuth();
  const {
    records,
    stats,
    statusDistribution,
    recentSubmissions,
    upcomingMaturityWatchlist,
    recentRemarksFeed
  } = useFDR();
  const navigate = useNavigate();

  // Modal states
  const [selectedFdr, setSelectedFdr] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showRemarksModal, setShowRemarksModal] = useState(false);
  const [showResubmitModal, setShowResubmitModal] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);

  const handleOpenDetail = (fdr) => {
    setSelectedFdr(fdr);
    setShowDetailModal(true);
  };

  const handleOpenRemarks = (fdr) => {
    setSelectedFdr(fdr);
    setShowRemarksModal(true);
  };

  const handleOpenResubmit = (fdr) => {
    setSelectedFdr(fdr);
    setShowResubmitModal(true);
  };

  const handleOpenReview = (fdr) => {
    setSelectedFdr(fdr);
    setShowReviewModal(true);
  };

  const handleEditDraft = (fdr) => {
    navigate(`/fdr-register/new?editId=${fdr.id}`);
  };

  // If AICTE user, display AICTE Administrative Dashboard
  if (isAicte) {
    return (
      <>
        <AICTEAdminDashboard onOpenReview={handleOpenReview} />
        {showReviewModal && selectedFdr && (
          <FDRReviewModal
            isOpen={showReviewModal}
            onClose={() => setShowReviewModal(false)}
            fdr={selectedFdr}
          />
        )}
      </>
    );
  }

  // Otherwise, render College Dashboard
  return (
    <div className="space-y-6">
      {/* Institutional Banner / Welcome Header */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded bg-amber-100 text-amber-800 border border-amber-300">
              Institution Workspace
            </span>
            <span className="text-xs text-slate-400">•</span>
            <span className="text-xs text-slate-500 font-mono">
              PID: {INSTITUTION_CONFIG.aictePermanentId}
            </span>
          </div>

          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            {INSTITUTION_CONFIG.institutionName}
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-2xl">
            Manage regulatory security deposits, joint fixed deposit receipts, renewal cycles, and inter-bank verification status.
          </p>
        </div>

        {/* Prominent Action Button: Add New FDR (For College) */}
        <div className="flex items-center gap-3 shrink-0">
          <Link
            to="/fdr-register/new"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-medium text-sm shadow-sm transition-all hover:shadow active:scale-[0.98]"
          >
            <FilePlus className="w-4 h-4" />
            <span>Add New FDR</span>
          </Link>
        </div>
      </div>

      {/* KPI Cards Grid - Directly calculated from shared state store */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
        {/* Total FDRs */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-600">
              Total FDRs
            </span>
            <div className="p-2 rounded-lg bg-blue-50 text-blue-600">
              <Building2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 font-mono">
            {stats.totalFDRs}
          </div>
          <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
            <span>Locked Value:</span>
            <span className="font-semibold text-slate-700">{formatINR(stats.totalDepositedValue)}</span>
          </div>
        </div>

        {/* Pending Verification */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-amber-700">
              Pending Verification
            </span>
            <div className="p-2 rounded-lg bg-amber-50 text-amber-600">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-amber-600 font-mono">
            {stats.pendingVerification}
          </div>
          <div className="text-[11px] text-amber-800/80 mt-1">
            {stats.pendingVerification > 0 ? "Under AICTE scrutiny" : "All records processed"}
          </div>
        </div>

        {/* Approved FDRs */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
              Approved FDRs
            </span>
            <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-emerald-600 font-mono">
            {stats.approvedFDRs}
          </div>
          <div className="text-[11px] text-emerald-700 mt-1">
            Lien confirmed & active
          </div>
        </div>

        {/* Rejected / Query Raised */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-rose-700">
              Action Required
            </span>
            <div className="p-2 rounded-lg bg-rose-50 text-rose-600">
              <AlertCircle className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-rose-600 font-mono">
            {stats.rejectedQueryRaised}
          </div>
          <div className="text-[11px] text-rose-700 mt-1">
            {stats.rejectedQueryRaised > 0 ? `${stats.queryRaised} Query, ${stats.rejectedFDRs} Rejected` : "No pending queries"}
          </div>
        </div>

        {/* Expiring Soon */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-orange-700">
              Expiring Soon
            </span>
            <div className="p-2 rounded-lg bg-orange-50 text-orange-600">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-orange-600 font-mono">
            {stats.expiringSoon}
          </div>
          <div className="text-[11px] text-orange-700 mt-1">
            Maturity within 90 days
          </div>
        </div>
      </div>

      {/* Middle Row: Status Distribution & Upcoming Maturity Watchlist */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Status Distribution Card */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-800">
                FDR Lifecycle Status Distribution
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Breakdown of {stats.totalFDRs} total repository instruments
              </p>
            </div>
            <Link
              to="/fdr-register"
              className="text-xs font-semibold text-amber-600 hover:text-amber-700 flex items-center gap-1"
            >
              <span>View All</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {/* Stacked Progress Bar */}
          <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden flex shadow-inner mb-5">
            {statusDistribution.map((item) => (
              item.percentage > 0 && (
                <div
                  key={item.label}
                  style={{ width: `${item.percentage}%` }}
                  className={`${item.color} h-full transition-all duration-300`}
                  title={`${item.label}: ${item.count} (${item.percentage}%)`}
                />
              )
            ))}
          </div>

          {/* Breakdown Pills */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {statusDistribution.map((item) => (
              <div
                key={item.label}
                className={`p-3 rounded-lg border border-slate-200 ${item.lightBg} flex items-center justify-between`}
              >
                <div>
                  <span className="text-[11px] font-medium text-slate-600 block truncate">
                    {item.label}
                  </span>
                  <span className={`text-base font-bold font-mono ${item.textColor}`}>
                    {item.count}
                  </span>
                </div>
                <span className="text-xs font-semibold text-slate-500 bg-white/70 px-1.5 py-0.5 rounded border border-slate-200/50">
                  {item.percentage}%
                </span>
              </div>
            ))}
          </div>

          {/* Regulatory Guidance Note */}
          <div className="mt-5 p-3 rounded-lg bg-blue-50/70 border border-blue-200 text-xs text-blue-900 flex items-start gap-2.5">
            <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              <strong>Mandatory AICTE Compliance:</strong> In accordance with AICTE Approval Process
              Handbook guidelines, security deposits must remain in joint lien until formal AICTE
              NOC is granted. Early encashment without Council approval is strictly prohibited.
            </p>
          </div>
        </div>

        {/* Upcoming Maturity Watchlist */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-orange-600" />
                Maturity Watchlist
              </h2>
              <span className="text-[11px] font-semibold text-orange-700 bg-orange-100 px-2 py-0.5 rounded-full">
                {upcomingMaturityWatchlist.length} Monitored
              </span>
            </div>

            <div className="space-y-3">
              {upcomingMaturityWatchlist.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-400">
                  No upcoming maturities recorded.
                </div>
              ) : (
                upcomingMaturityWatchlist.map((rec) => {
                  const days = getDaysRemaining(rec.maturityDate);
                  const isUrgent = days !== null && days <= 90;

                  return (
                    <div
                      key={rec.id}
                      onClick={() => handleOpenDetail(rec)}
                      className={`p-3 rounded-lg border cursor-pointer transition-all hover:shadow-xs ${
                        isUrgent
                          ? "bg-orange-50/60 border-orange-200 hover:border-orange-300"
                          : "bg-slate-50 border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs font-semibold">
                        <span className="text-slate-900 font-mono">{rec.fdrNumber}</span>
                        <span className={`text-[11px] font-medium ${isUrgent ? "text-orange-700" : "text-slate-600"}`}>
                          {days !== null ? `${days} Days Left` : "Matured"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-slate-500 mt-1">
                        <span>{rec.issuingBank}</span>
                        <span className="font-semibold text-slate-800">{formatINR(rec.amount)}</span>
                      </div>
                      <div className="text-[10px] text-slate-400 mt-1 flex items-center justify-between">
                        <span>Maturity: {formatDate(rec.maturityDate)}</span>
                        <StatusBadge status={rec.status} size="sm" showIcon={false} />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 mt-4 text-center">
            <Link
              to="/fdr-register?filter=Expiring+Soon"
              className="text-xs font-medium text-blue-600 hover:text-blue-800"
            >
              Review Expiring FDRs & Renewal Guidelines →
            </Link>
          </div>
        </div>
      </div>

      {/* Bottom Row: Recent FDR Submissions & Recent AICTE Remarks Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Submissions Table (2 cols) */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-800">
                Recent FDR Submissions
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Latest deposited instruments and status movements
              </p>
            </div>
            <Link
              to="/fdr-register"
              className="text-xs font-semibold text-amber-600 hover:text-amber-700 flex items-center gap-1"
            >
              <span>View Register</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-lg">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 uppercase font-semibold">
                <tr>
                  <th className="px-3 py-2.5">FDR Number</th>
                  <th className="px-3 py-2.5">Issuing Bank</th>
                  <th className="px-3 py-2.5 text-right">Amount</th>
                  <th className="px-3 py-2.5">Maturity</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {recentSubmissions.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-3 py-3 font-mono font-medium text-slate-900">
                      {item.fdrNumber}
                    </td>
                    <td className="px-3 py-3 font-medium">{item.issuingBank}</td>
                    <td className="px-3 py-3 text-right font-mono font-semibold text-slate-900">
                      {formatINR(item.amount)}
                    </td>
                    <td className="px-3 py-3 text-slate-600">{formatDate(item.maturityDate)}</td>
                    <td className="px-3 py-3">
                      <StatusBadge status={item.status} size="sm" />
                    </td>
                    <td className="px-3 py-3 text-center">
                      <button
                        type="button"
                        onClick={() => handleOpenDetail(item)}
                        className="text-blue-600 hover:text-blue-800 font-medium hover:underline text-[11px]"
                      >
                        Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recent AICTE Remarks Feed (1 col) */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                <MessageSquare className="w-4 h-4 text-amber-600" />
                Recent AICTE Remarks
              </h2>
              <span className="text-[11px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">
                Audit Trail
              </span>
            </div>

            <div className="space-y-3">
              {recentRemarksFeed.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-400">
                  No scrutiny remarks received yet.
                </div>
              ) : (
                recentRemarksFeed.map((item) => (
                  <div
                    key={item.id}
                    className="p-3 rounded-lg border border-slate-200 bg-slate-50 text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-900">{item.fdrNumber}</span>
                      <span className="text-[10px] text-slate-400">
                        {new Date(item.timestamp).toLocaleDateString("en-IN")}
                      </span>
                    </div>
                    <p className="text-slate-600 text-[11px] line-clamp-3 leading-relaxed">
                      "{item.text}"
                    </p>
                    <div className="pt-1 flex items-center justify-between text-[10px] text-slate-500">
                      <span>By: {item.author}</span>
                      <button
                        type="button"
                        onClick={() => {
                          const matched = records.find((r) => r.id === item.fdrId);
                          if (matched) handleOpenDetail(matched);
                        }}
                        className="text-amber-600 hover:text-amber-800 font-medium"
                      >
                        View Record →
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 mt-4 text-center">
            <Link
              to="/bank-confirmations"
              className="text-xs font-medium text-slate-600 hover:text-slate-900"
            >
              Check Bank Confirmations Gateway →
            </Link>
          </div>
        </div>
      </div>

      {/* Detail Modal */}
      {showDetailModal && selectedFdr && (
        <FDRDetailModal
          isOpen={showDetailModal}
          onClose={() => setShowDetailModal(false)}
          fdr={selectedFdr}
          onEditDraft={handleEditDraft}
          onResubmit={handleOpenResubmit}
          isCollegeUser={isCollege}
        />
      )}

      {/* Remarks Modal */}
      {showRemarksModal && selectedFdr && (
        <RemarksModal
          isOpen={showRemarksModal}
          onClose={() => setShowRemarksModal(false)}
          fdr={selectedFdr}
          onResubmit={handleOpenResubmit}
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
