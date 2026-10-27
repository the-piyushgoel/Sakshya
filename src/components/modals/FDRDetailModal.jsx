import React, { useState } from "react";
import {
  X,
  Building2,
  Calendar,
  CreditCard,
  FileText,
  UserCheck,
  Shield,
  Printer,
  FileCheck2,
  AlertCircle,
  Eye,
  RefreshCw,
  Clock,
  History,
  ShieldCheck,
  Unlock,
  CheckCircle2,
  Link as LinkIcon,
  HelpCircle
} from "lucide-react";
import { StatusBadge } from "../common/StatusBadge";
import {
  formatINR,
  formatDate,
  numberToWordsINR,
  getDaysRemaining,
  getLifecycleStatus
} from "../../utils/formatters";
import { DocumentPreviewModal } from "./DocumentPreviewModal";
import { RenewalModal } from "./RenewalModal";
import { ReleaseRequestModal } from "./ReleaseRequestModal";
import { ReleaseReviewModal } from "./ReleaseReviewModal";

export const FDRDetailModal = ({
  isOpen,
  onClose,
  fdr,
  onEditDraft,
  onResubmit,
  onOpenReview,
  isCollegeUser
}) => {
  const [showDocPreview, setShowDocPreview] = useState(false);
  const [showRenewalModal, setShowRenewalModal] = useState(false);
  const [showReleaseModal, setShowReleaseModal] = useState(false);
  const [showReleaseReviewModal, setShowReleaseReviewModal] = useState(false);

  if (!isOpen || !fdr) return null;

  const daysLeft = getDaysRemaining(fdr.maturityDate);
  const lifecycle = getLifecycleStatus(fdr);
  const isDraft = fdr.status === "Draft";
  const isQueryRaised = fdr.status === "Query Raised" || fdr.status === "Rejected / Query Raised";
  const isRejected = fdr.status === "Rejected";
  const isApproved = fdr.status === "Approved";
  const isReleased = fdr.status === "Released" || lifecycle === "Released";
  const isSuperceded = fdr.status === "Superceded" || lifecycle === "Superceded";

  const handlePrint = () => {
    window.print();
  };

  return (
    <>
      <div className="fixed inset-0 z-45 overflow-y-auto bg-slate-900/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6">
        <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          {/* Modal Header */}
          <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-bold text-base sm:text-lg text-white font-mono tracking-tight">
                    {fdr.id}
                  </h3>
                  <StatusBadge status={fdr.status} size="sm" />
                  <StatusBadge status={lifecycle} size="sm" />
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Ref No: <span className="text-amber-300 font-mono">{fdr.fdrNumber}</span> •
                  Bank: {fdr.issuingBank}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handlePrint}
                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-md transition-colors"
                title="Print FDR Record"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print Record</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="text-slate-400 hover:text-white p-1 rounded-md hover:bg-slate-800 transition-colors"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Modal Body */}
          <div className="flex-1 p-6 overflow-y-auto space-y-6">
            {/* Replacement / Rollover Link Banners */}
            {fdr.replacesFdrId && (
              <div className="p-3.5 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-900 flex items-center gap-2.5 shadow-2xs">
                <LinkIcon className="w-4 h-4 text-blue-700 shrink-0" />
                <div>
                  <span className="font-bold">Renewal Replacement Instrument:</span> This FDR was
                  submitted as a replacement for original deposit{" "}
                  <strong className="font-mono text-blue-800">{fdr.replacesFdrNumber || fdr.replacesFdrId}</strong> (
                  {fdr.replacesFdrId}).
                </div>
              </div>
            )}

            {fdr.replacedByFdrId && (
              <div className="p-3.5 rounded-lg bg-purple-50 border border-purple-200 text-xs text-purple-900 flex items-center gap-2.5 shadow-2xs">
                <RefreshCw className="w-4 h-4 text-purple-700 shrink-0" />
                <div>
                  <span className="font-bold">Instrument Rolled Over / Replaced:</span> A replacement FDR has
                  been submitted under reference{" "}
                  <strong className="font-mono text-purple-800">
                    {fdr.replacedByFdrNumber || fdr.replacedByFdrId}
                  </strong>{" "}
                  ({fdr.replacedByFdrId}).
                </div>
              </div>
            )}

            {/* Active Release Request Dossier */}
            {fdr.releaseRequest && (
              <div className="p-4 rounded-lg bg-amber-50/70 border border-amber-300 text-xs space-y-2.5 shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-amber-900 flex items-center gap-1.5 text-xs uppercase tracking-wider">
                    <Unlock className="w-4 h-4 text-amber-700" />
                    Formal Release / Refund Request Dossier
                  </span>
                  <StatusBadge status={fdr.releaseRequest.status} size="sm" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-amber-950">
                  <div>
                    <span className="text-amber-700 font-semibold block">Regulatory Reason:</span>
                    <span>{fdr.releaseRequest.reason}</span>
                  </div>
                  <div>
                    <span className="text-amber-700 font-semibold block">Requested By / Date:</span>
                    <span>
                      {fdr.releaseRequest.requestedBy} •{" "}
                      {new Date(fdr.releaseRequest.requestedDate).toLocaleDateString("en-IN")}
                    </span>
                  </div>
                </div>
                {fdr.releaseRequest.remarks && (
                  <div className="text-xs text-amber-900 bg-amber-100/70 p-2 rounded">
                    <strong>Institution Remarks:</strong> {fdr.releaseRequest.remarks}
                  </div>
                )}
                {fdr.releaseRequest.approvalRemarks && (
                  <div className="text-xs text-emerald-900 bg-emerald-100/70 p-2 rounded border border-emerald-200">
                    <strong>AICTE Approval Note:</strong> {fdr.releaseRequest.approvalRemarks} (by{" "}
                    {fdr.releaseRequest.approvedBy})
                  </div>
                )}
                {fdr.releaseRequest.rejectionReason && (
                  <div className="text-xs text-rose-900 bg-rose-100/70 p-2 rounded border border-rose-200">
                    <strong>AICTE Rejection Reason:</strong> {fdr.releaseRequest.rejectionReason} (by{" "}
                    {fdr.releaseRequest.rejectedBy})
                  </div>
                )}
              </div>
            )}

            {/* Amount Banner */}
            <div className="p-4 rounded-lg bg-gradient-to-r from-slate-900 to-slate-800 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4 border border-slate-700">
              <div>
                <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider block">
                  Deposit Principal Amount
                </span>
                <div className="text-3xl font-extrabold text-white mt-1">
                  {formatINR(fdr.amount)}
                </div>
                <div className="text-xs text-slate-300 mt-0.5 italic">
                  {numberToWordsINR(fdr.amount)}
                </div>
              </div>

              <div className="sm:text-right border-t sm:border-t-0 sm:border-l border-slate-700 pt-3 sm:pt-0 sm:pl-6">
                <span className="text-xs text-slate-400 block">Maturity Status</span>
                <div className="text-sm font-semibold text-white mt-0.5">
                  {formatDate(fdr.maturityDate)}
                </div>
                <div className="text-xs text-amber-300 font-medium mt-0.5">
                  {daysLeft !== null && daysLeft >= 0
                    ? `${daysLeft} Days to Maturity`
                    : daysLeft !== null
                    ? `Matured ${Math.abs(daysLeft)} days ago`
                    : "Open Ended"}
                </div>
              </div>
            </div>

            {/* Institution Details */}
            <div className="border border-slate-200 rounded-lg p-4 bg-slate-50/50">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5 mb-3">
                <Building2 className="w-4 h-4 text-slate-500" />
                Institution Information
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-slate-500 block">Institution Name:</span>
                  <span className="font-semibold text-slate-800">{fdr.institutionName}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">AICTE Permanent ID:</span>
                  <span className="font-mono font-semibold text-slate-800">{fdr.institutionId}</span>
                </div>
              </div>
            </div>

            {/* Deposit & Banking Details */}
            <div className="border border-slate-200 rounded-lg p-4 bg-white">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5 mb-3">
                <CreditCard className="w-4 h-4 text-slate-500" />
                FDR Banking & Instrument Details
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                <div>
                  <span className="text-slate-500 block">FDR Reference Number:</span>
                  <span className="font-mono font-bold text-slate-900">{fdr.fdrNumber}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Instrument Type:</span>
                  <span className="font-medium text-slate-800">{fdr.instrumentType}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Issuing Bank:</span>
                  <span className="font-bold text-slate-800">{fdr.issuingBank}</span>
                </div>
                <div className="sm:col-span-3">
                  <span className="text-slate-500 block">Bank Branch & IFSC:</span>
                  <span className="font-medium text-slate-800">{fdr.bankBranch}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Issue Date:</span>
                  <span className="font-medium text-slate-800">{formatDate(fdr.issueDate)}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Maturity Date:</span>
                  <span className="font-medium text-slate-800">{formatDate(fdr.maturityDate)}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">Submission Date:</span>
                  <span className="font-medium text-slate-800">
                    {fdr.submissionDate ? formatDate(fdr.submissionDate) : "Not yet submitted"}
                  </span>
                </div>
                <div className="sm:col-span-3">
                  <span className="text-slate-500 block">Beneficiary / Favouring Authority:</span>
                  <span className="font-semibold text-slate-800">{fdr.beneficiary}</span>
                </div>
                <div className="sm:col-span-3">
                  <span className="text-slate-500 block">Purpose of Deposit:</span>
                  <span className="font-medium text-slate-800 bg-slate-50 p-2 rounded block border border-slate-200">
                    {fdr.purpose}
                  </span>
                </div>
              </div>
            </div>

            {/* Document Attachment */}
            <div className="border border-slate-200 rounded-lg p-4 bg-white">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center justify-between mb-3">
                <span className="flex items-center gap-1.5">
                  <FileCheck2 className="w-4 h-4 text-slate-500" />
                  Attached Certificate Document
                </span>
                {fdr.document && (
                  <span className="text-[11px] text-emerald-600 font-medium">Verified File</span>
                )}
              </h4>

              {fdr.document ? (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-200 gap-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-red-100 text-red-700 rounded-lg shrink-0">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-slate-800">
                        {fdr.document.name}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {fdr.document.size || "1.2 MB"} • {fdr.document.type || "PDF Document"}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowDocPreview(true)}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-md border border-blue-200 transition-colors"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    Preview Document
                  </button>
                </div>
              ) : (
                <div className="p-4 text-center rounded-lg bg-amber-50/60 border border-amber-200 text-xs text-amber-800">
                  No scanned certificate document attached yet.
                </div>
              )}
            </div>

            {/* AICTE Scrutiny & Remarks Trail */}
            <div className="border border-slate-200 rounded-lg p-4 bg-slate-50/70">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5 mb-3">
                <Shield className="w-4 h-4 text-slate-500" />
                AICTE Scrutiny Audit Trail & Remarks
              </h4>

              {Array.isArray(fdr.remarksHistory) && fdr.remarksHistory.length > 0 ? (
                <div className="space-y-3">
                  {fdr.remarksHistory.map((item, idx) => (
                    <div
                      key={item.id || idx}
                      className="p-3 bg-white rounded-md border border-slate-200 text-xs space-y-1 shadow-2xs"
                    >
                      <div className="flex items-center justify-between text-slate-600">
                        <span className="font-semibold text-slate-900">{item.author}</span>
                        <span className="text-[10px] text-slate-400">
                          {new Date(item.timestamp).toLocaleString("en-IN")}
                        </span>
                      </div>
                      <p className="text-slate-700 leading-relaxed pt-0.5">{item.text}</p>
                    </div>
                  ))}
                </div>
              ) : fdr.remarks ? (
                <div className="p-3 bg-white rounded-md border border-slate-200 text-xs">
                  <p className="text-slate-700 leading-relaxed">{fdr.remarks}</p>
                </div>
              ) : (
                <div className="text-xs text-slate-500 italic">
                  No remarks entered. Record is currently in initial lifecycle state.
                </div>
              )}
            </div>

            {/* Full Lifecycle Timeline */}
            {Array.isArray(fdr.timeline) && fdr.timeline.length > 0 && (
              <div className="border border-slate-200 rounded-lg p-4 bg-white">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5 mb-3">
                  <History className="w-4 h-4 text-slate-500" />
                  Lifecycle History Timeline
                </h4>
                <div className="space-y-2">
                  {fdr.timeline.map((ev, i) => (
                    <div
                      key={ev.id || i}
                      className="p-2.5 rounded bg-slate-50 border border-slate-100 text-xs flex items-start justify-between"
                    >
                      <div>
                        <span className="font-semibold text-slate-900">{ev.action}</span>
                        <span className="text-slate-500 text-[11px] ml-2">by {ev.actor}</span>
                        {ev.remarks && <p className="text-slate-600 text-[11px] mt-0.5">{ev.remarks}</p>}
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono whitespace-nowrap ml-2">
                        {new Date(ev.timestamp).toLocaleDateString("en-IN")}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Modal Footer */}
          <div className="px-6 py-3.5 bg-slate-100 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-slate-500">
              Last updated: {new Date(fdr.lastUpdated).toLocaleString("en-IN")}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* College Actions: Renewal & Release */}
              {isCollegeUser && isApproved && !isReleased && !isSuperceded && (
                <>
                  <button
                    type="button"
                    onClick={() => setShowRenewalModal(true)}
                    className="px-3.5 py-2 text-xs font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-lg border border-purple-200 transition-colors flex items-center gap-1.5"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Renew / Replace</span>
                  </button>

                  {(!fdr.releaseRequest || fdr.releaseRequest.status === "Rejected") && (
                    <button
                      type="button"
                      onClick={() => setShowReleaseModal(true)}
                      className="px-3.5 py-2 text-xs font-semibold text-amber-800 bg-amber-50 hover:bg-amber-100 rounded-lg border border-amber-300 transition-colors flex items-center gap-1.5"
                    >
                      <Unlock className="w-3.5 h-3.5 text-amber-700" />
                      <span>Request Release / Refund</span>
                    </button>
                  )}
                </>
              )}

              {/* AICTE Administrator: Review Release */}
              {!isCollegeUser && fdr.releaseRequest && fdr.releaseRequest.status === "Pending Approval" && (
                <button
                  type="button"
                  onClick={() => setShowReleaseReviewModal(true)}
                  className="px-3.5 py-2 text-xs font-semibold text-white bg-indigo-700 hover:bg-indigo-800 rounded-lg shadow-2xs transition-colors flex items-center gap-1.5"
                >
                  <Unlock className="w-3.5 h-3.5" />
                  <span>Review Release Request</span>
                </button>
              )}

              {/* AICTE Administrator: Review & Decide pending verification */}
              {!isCollegeUser && onOpenReview && fdr.status === "Pending Verification" && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenReview(fdr);
                  }}
                  className="px-4 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-md transition-colors flex items-center gap-1.5"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Review & Decide
                </button>
              )}

              {/* College Actions: Edit Draft */}
              {isDraft && isCollegeUser && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onEditDraft(fdr);
                  }}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 rounded-md border border-slate-300 transition-colors"
                >
                  Edit Draft
                </button>
              )}

              {/* College Actions: Resubmit */}
              {(isQueryRaised || isRejected) && isCollegeUser && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onResubmit(fdr);
                  }}
                  className="px-4 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-md transition-colors flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Address Deficiency & Resubmit
                </button>
              )}

              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 rounded-md border border-slate-300 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Embedded Document Preview Modal */}
      {showDocPreview && (
        <DocumentPreviewModal
          isOpen={showDocPreview}
          onClose={() => setShowDocPreview(false)}
          document={fdr.document}
          fdrNumber={fdr.fdrNumber}
        />
      )}

      {/* Renewal / Replacement Modal */}
      {showRenewalModal && (
        <RenewalModal
          isOpen={showRenewalModal}
          onClose={() => {
            setShowRenewalModal(false);
            onClose();
          }}
          fdr={fdr}
        />
      )}

      {/* Release / Refund Request Modal */}
      {showReleaseModal && (
        <ReleaseRequestModal
          isOpen={showReleaseModal}
          onClose={() => {
            setShowReleaseModal(false);
            onClose();
          }}
          fdr={fdr}
        />
      )}

      {/* Release Review Modal for AICTE */}
      {showReleaseReviewModal && (
        <ReleaseReviewModal
          isOpen={showReleaseReviewModal}
          onClose={() => {
            setShowReleaseReviewModal(false);
            onClose();
          }}
          fdr={fdr}
        />
      )}
    </>
  );
};
