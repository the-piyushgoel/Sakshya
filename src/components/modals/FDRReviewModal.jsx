import React, { useState } from "react";
import {
  X,
  Building2,
  Calendar,
  CreditCard,
  FileText,
  ShieldCheck,
  ShieldAlert,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Eye,
  Send,
  Check,
  Ban,
  HelpCircle,
  FileCheck2,
  Clock,
  Printer,
  History
} from "lucide-react";
import { formatINR, formatDate, numberToWordsINR, getDaysRemaining } from "../../utils/formatters";
import { StatusBadge } from "../common/StatusBadge";
import { useFDR } from "../../context/FDRContext";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { DocumentPreviewModal } from "./DocumentPreviewModal";

export const FDRReviewModal = ({ isOpen, onClose, fdr }) => {
  const { user } = useAuth();
  const { bankConfirmations, approveFDR, rejectFDR, raiseQueryFDR } = useFDR();
  const { addToast } = useToast();

  const [activeTab, setActiveTab] = useState("comparison"); // 'comparison' | 'details' | 'timeline'
  const [showDocPreview, setShowDocPreview] = useState(false);

  // Decision Modal States
  const [decisionType, setDecisionType] = useState(null); // 'approve' | 'reject' | 'query'
  const [remarksInput, setRemarksInput] = useState("");
  const [acknowledgeDiscrepancy, setAcknowledgeDiscrepancy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  if (!isOpen || !fdr) return null;

  // Find linked simulated bank confirmation
  const bankConf = bankConfirmations.find(
    (bc) =>
      bc.fdrReference?.toLowerCase() === fdr.fdrNumber?.toLowerCase() ||
      bc.fdrId === fdr.id
  );

  const hasMismatch = bankConf?.matchStatus === "mismatch";
  const isMatch = bankConf?.matchStatus === "match";
  const isPendingBank = !bankConf || bankConf?.matchStatus === "pending";

  // Field validation summary
  const validationSummary = [];
  if (!fdr.fdrNumber) validationSummary.push({ field: "FDR Number", valid: false, msg: "FDR reference number is missing." });
  else validationSummary.push({ field: "FDR Number", valid: true, msg: "Valid format." });

  if (!fdr.amount || Number(fdr.amount) <= 0) validationSummary.push({ field: "Deposit Amount", valid: false, msg: "Invalid or zero principal amount." });
  else validationSummary.push({ field: "Deposit Amount", valid: true, msg: `Valid principal: ${formatINR(fdr.amount)}` });

  if (!fdr.document) validationSummary.push({ field: "Scanned Certificate", valid: false, msg: "Document attachment is missing." });
  else validationSummary.push({ field: "Scanned Certificate", valid: true, msg: `Attached: ${fdr.document.name} (${fdr.document.size})` });

  if (fdr.issueDate && fdr.maturityDate) {
    const isOrderValid = new Date(fdr.maturityDate) > new Date(fdr.issueDate);
    validationSummary.push({
      field: "Tenure / Maturity",
      valid: isOrderValid,
      msg: isOrderValid ? `Valid tenure up to ${formatDate(fdr.maturityDate)}` : "Maturity date is earlier than issue date!"
    });
  }

  // Handle decisions
  const handleConfirmDecision = () => {
    setActionError("");

    if (decisionType === "approve") {
      if (hasMismatch && !acknowledgeDiscrepancy) {
        setActionError("Please acknowledge the bank discrepancy before granting approval.");
        return;
      }

      setIsProcessing(true);
      try {
        approveFDR(fdr.id, remarksInput, user?.fullName || "Er. V. K. Verma");
        addToast({
          title: "FDR Approved Successfully",
          message: `${fdr.fdrNumber} has been approved and regulatory lien recorded.`,
          type: "success"
        });
        setDecisionType(null);
        onClose();
      } catch (e) {
        setActionError(e.message);
      } finally {
        setIsProcessing(false);
      }
    } else if (decisionType === "reject") {
      if (!remarksInput.trim()) {
        setActionError("A specific reason for rejection is mandatory.");
        return;
      }

      setIsProcessing(true);
      try {
        rejectFDR(fdr.id, remarksInput, user?.fullName || "Er. V. K. Verma");
        addToast({
          title: "FDR Rejected",
          message: `${fdr.fdrNumber} was marked Rejected. Notification dispatched to college.`,
          type: "error"
        });
        setDecisionType(null);
        onClose();
      } catch (e) {
        setActionError(e.message);
      } finally {
        setIsProcessing(false);
      }
    } else if (decisionType === "query") {
      if (!remarksInput.trim()) {
        setActionError("Please specify the clarification query details.");
        return;
      }

      setIsProcessing(true);
      try {
        raiseQueryFDR(fdr.id, remarksInput, user?.fullName || "Er. V. K. Verma");
        addToast({
          title: "Clarification Query Raised",
          message: `Query sent to ${fdr.institutionName}. Status updated to 'Query Raised'.`,
          type: "warning"
        });
        setDecisionType(null);
        onClose();
      } catch (e) {
        setActionError(e.message);
      } finally {
        setIsProcessing(false);
      }
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-45 overflow-y-auto bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5">
        <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-5xl w-full max-h-[94vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          {/* Header */}
          <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-base sm:text-lg text-white font-mono">
                    Scrutiny Review: {fdr.fdrNumber}
                  </h3>
                  <StatusBadge status={fdr.status} size="sm" />
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Institution: <span className="text-slate-200 font-semibold">{fdr.institutionName}</span> •
                  FDR ID: <span className="font-mono text-amber-300">{fdr.id}</span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-md transition-colors"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print Dossier</span>
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

          {/* Navigation Tabs */}
          <div className="px-6 bg-slate-100 border-b border-slate-200 flex items-center justify-between">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setActiveTab("comparison")}
                className={`py-2.5 px-4 text-xs font-semibold border-b-2 transition-all flex items-center gap-1.5 ${
                  activeTab === "comparison"
                    ? "border-amber-600 text-amber-900 bg-white"
                    : "border-transparent text-slate-600 hover:text-slate-900"
                }`}
              >
                <CreditCard className="w-4 h-4" />
                <span>Bank SFMS Comparison</span>
                {hasMismatch && (
                  <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping"></span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("details")}
                className={`py-2.5 px-4 text-xs font-semibold border-b-2 transition-all flex items-center gap-1.5 ${
                  activeTab === "details"
                    ? "border-amber-600 text-amber-900 bg-white"
                    : "border-transparent text-slate-600 hover:text-slate-900"
                }`}
              >
                <FileText className="w-4 h-4" />
                <span>Submitted Details & Document</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("timeline")}
                className={`py-2.5 px-4 text-xs font-semibold border-b-2 transition-all flex items-center gap-1.5 ${
                  activeTab === "timeline"
                    ? "border-amber-600 text-amber-900 bg-white"
                    : "border-transparent text-slate-600 hover:text-slate-900"
                }`}
              >
                <History className="w-4 h-4" />
                <span>Audit Timeline ({fdr.timeline?.length || 0})</span>
              </button>
            </div>

            {/* Document Quick View Button */}
            {fdr.document && (
              <button
                type="button"
                onClick={() => setShowDocPreview(true)}
                className="hidden sm:inline-flex items-center gap-1.5 text-xs text-blue-700 bg-blue-50 hover:bg-blue-100 px-3 py-1 rounded border border-blue-200"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Inspect Uploaded Certificate</span>
              </button>
            )}
          </div>

          {/* Modal Content Body */}
          <div className="flex-1 p-6 overflow-y-auto space-y-6">
            {/* TAB 1: BANK RECONCILIATION & COMPARISON */}
            {activeTab === "comparison" && (
              <div className="space-y-6">
                {/* Notice Alert */}
                <div className="p-3.5 rounded-lg bg-blue-50/70 border border-blue-200 text-xs text-blue-900 flex items-start gap-2.5">
                  <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Automated SFMS Reconciliation Check:</span> Below is
                    the comparison between the college-submitted data and simulated core banking records.
                    {/* <span className="block font-mono text-[11px] text-amber-800 font-bold mt-0.5">
                      SIMULATED BANK DATA — NOT A REAL BANK VERIFICATION
                    </span> */}
                  </div>
                </div>

                {/* Discrepancy Banner if present */}
                {hasMismatch && (
                  <div className="p-4 rounded-lg bg-rose-50 border border-rose-300 text-xs text-rose-900 flex items-start gap-3">
                    <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-bold text-sm text-rose-800">
                        CRITICAL DISCREPANCY DETECTED BETWEEN COLLEGE & BANK CBS
                      </div>
                      <p className="mt-1 leading-relaxed">
                        {bankConf.officerRemarks ||
                          "Submitted deposit amount or maturity date does not align with the bank core banking record."}
                      </p>
                      <div className="mt-2 text-[11px] font-semibold text-rose-700">
                        Recommendation: Issue a deficiency query or request the institution to submit an amended FDR.
                      </div>
                    </div>
                  </div>
                )}

                {/* Comparison Grid */}
                <div className="border border-slate-200 rounded-lg overflow-hidden text-xs">
                  <div className="grid grid-cols-3 bg-slate-100 p-3 font-bold uppercase tracking-wider text-slate-700 border-b border-slate-200">
                    <div>Verification Parameter</div>
                    <div>College Submitted Data</div>
                    <div>Bank Core Banking (SFMS)</div>
                  </div>

                  {/* Reference Number */}
                  <div className="grid grid-cols-3 p-3 border-b border-slate-100 items-center">
                    <span className="font-semibold text-slate-800">FDR Reference Number:</span>
                    <span className="font-mono font-bold text-slate-900">{fdr.fdrNumber}</span>
                    <span className="font-mono font-medium text-slate-700">
                      {bankConf?.fdrReference || "Not yet transmitted"}
                    </span>
                  </div>

                  {/* Issuing Bank */}
                  <div className="grid grid-cols-3 p-3 border-b border-slate-100 items-center">
                    <span className="font-semibold text-slate-800">Bank Name & Branch:</span>
                    <span className="text-slate-800">{fdr.issuingBank} ({fdr.bankBranch})</span>
                    <span className="text-slate-700">
                      {bankConf?.bank ? `${bankConf.bank} (${bankConf.branch})` : "Pending Nodal Query"}
                    </span>
                  </div>

                  {/* Deposit Amount Comparison */}
                  <div className="grid grid-cols-3 p-3 border-b border-slate-100 items-center bg-slate-50/40">
                    <span className="font-semibold text-slate-800">Deposit Principal Amount:</span>
                    <span className="font-mono font-bold text-slate-900">{formatINR(fdr.amount)}</span>
                    <div>
                      {bankConf?.verifiedAmount !== null && bankConf?.verifiedAmount !== undefined ? (
                        <div className="flex items-center gap-2">
                          <span
                            className={`font-mono font-bold ${
                              bankConf.verifiedAmount === fdr.amount
                                ? "text-emerald-700"
                                : "text-rose-600 bg-rose-50 px-2 py-0.5 rounded border border-rose-300 font-extrabold"
                            }`}
                          >
                            {formatINR(bankConf.verifiedAmount)}
                          </span>
                          {bankConf.verifiedAmount !== fdr.amount && (
                            <span className="text-[10px] text-rose-600 font-semibold">
                              (Difference: {formatINR(Math.abs(fdr.amount - bankConf.verifiedAmount))})
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-400 italic">Confirmation Pending</span>
                      )}
                    </div>
                  </div>

                  {/* Maturity Date Comparison */}
                  <div className="grid grid-cols-3 p-3 border-b border-slate-100 items-center">
                    <span className="font-semibold text-slate-800">Maturity Date:</span>
                    <span className="text-slate-800 font-medium">{formatDate(fdr.maturityDate)}</span>
                    <div>
                      {bankConf?.verifiedMaturityDate ? (
                        <span
                          className={`font-medium ${
                            bankConf.verifiedMaturityDate === fdr.maturityDate
                              ? "text-emerald-700"
                              : "text-rose-600 bg-rose-50 px-2 py-0.5 rounded border border-rose-300"
                          }`}
                        >
                          {formatDate(bankConf.verifiedMaturityDate)}
                        </span>
                      ) : (
                        <span className="text-slate-400 italic">Confirmation Pending</span>
                      )}
                    </div>
                  </div>

                  {/* AICTE Lien Clause Endorsement */}
                  <div className="grid grid-cols-3 p-3 border-b border-slate-100 items-center">
                    <span className="font-semibold text-slate-800">Lien Marked in Favor of AICTE:</span>
                    <span className="text-slate-700">Claimed: {fdr.beneficiary}</span>
                    <div>
                      {bankConf?.lienMarked === null || bankConf?.lienMarked === undefined ? (
                        <span className="text-slate-400 italic">Pending Bank Response</span>
                      ) : bankConf.lienMarked ? (
                        <span className="text-emerald-700 font-bold flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          Lien Confirmed on CBS
                        </span>
                      ) : (
                        <span className="text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-300 font-bold flex items-center gap-1">
                          <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
                          Not Endorsed on CBS Terminal
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Channel / Audit Reference */}
                  <div className="grid grid-cols-3 p-3 bg-slate-100/70 items-center text-[11px]">
                    <span className="font-semibold text-slate-700">Verification Dispatch Channel:</span>
                    <span className="text-slate-600 col-span-2 font-mono">
                      {bankConf?.verificationMethod || "Inter-Bank Reconciliation Queue"} (Ref:{" "}
                      {bankConf?.bankReferenceNumber || "PENDING-DISPATCH"})
                    </span>
                  </div>
                </div>

                {/* Field Validation Summary Box */}
                <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
                    Regulatory Field Validation Check
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    {validationSummary.map((val, idx) => (
                      <div
                        key={idx}
                        className={`p-2 rounded flex items-center gap-2 border ${
                          val.valid
                            ? "bg-emerald-50/60 border-emerald-200 text-emerald-800"
                            : "bg-rose-50/60 border-rose-200 text-rose-800"
                        }`}
                      >
                        {val.valid ? (
                          <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                        )}
                        <div>
                          <span className="font-semibold">{val.field}:</span>{" "}
                          <span className="text-[11px]">{val.msg}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: DETAILED SUBMISSION DATA & DOCUMENT */}
            {activeTab === "details" && (
              <div className="space-y-6">
                {/* Amount Banner */}
                <div className="p-4 rounded-lg bg-slate-900 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider block">
                      Submitted Principal Deposit
                    </span>
                    <div className="text-3xl font-extrabold text-white mt-1">
                      {formatINR(fdr.amount)}
                    </div>
                    <div className="text-xs text-slate-300 mt-0.5 italic">
                      {numberToWordsINR(fdr.amount)}
                    </div>
                  </div>

                  <div className="sm:text-right border-t sm:border-t-0 sm:border-l border-slate-700 pt-3 sm:pt-0 sm:pl-6 text-xs">
                    <span className="text-slate-400 block">Submitted On:</span>
                    <span className="font-semibold text-white">
                      {fdr.submissionDate ? new Date(fdr.submissionDate).toLocaleString("en-IN") : "Draft"}
                    </span>
                  </div>
                </div>

                {/* Institution Details */}
                <div className="border border-slate-200 rounded-lg p-4 bg-slate-50/50">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5 mb-3">
                    <Building2 className="w-4 h-4 text-slate-500" />
                    Submitting Institution Information
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className="text-slate-500 block">Institution Name:</span>
                      <span className="font-semibold text-slate-900">{fdr.institutionName}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">AICTE Permanent ID:</span>
                      <span className="font-mono font-semibold text-slate-900">{fdr.institutionId}</span>
                    </div>
                    <div className="sm:col-span-2">
                      <span className="text-slate-500 block">Purpose of Deposit:</span>
                      <span className="font-medium text-slate-800 bg-white p-2 rounded border border-slate-200 block mt-0.5">
                        {fdr.purpose}
                      </span>
                    </div>
                  </div>
                </div>

                {/* FDR Instrument Details */}
                <div className="border border-slate-200 rounded-lg p-4 bg-white">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5 mb-3">
                    <CreditCard className="w-4 h-4 text-slate-500" />
                    Instrument Specifications
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
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
                      <span className="font-bold text-slate-900">{fdr.issuingBank}</span>
                    </div>
                    <div className="sm:col-span-3">
                      <span className="text-slate-500 block">Branch & Location:</span>
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
                      <span className="text-slate-500 block">Days to Maturity:</span>
                      <span className="font-medium text-amber-700">
                        {getDaysRemaining(fdr.maturityDate) || "N/A"} Days
                      </span>
                    </div>
                    <div className="sm:col-span-3">
                      <span className="text-slate-500 block">Beneficiary / Favouring Authority:</span>
                      <span className="font-semibold text-slate-900">{fdr.beneficiary}</span>
                    </div>
                  </div>
                </div>

                {/* Attached Document Card */}
                <div className="border border-slate-200 rounded-lg p-4 bg-white">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center justify-between mb-3">
                    <span className="flex items-center gap-1.5">
                      <FileCheck2 className="w-4 h-4 text-slate-500" />
                      Uploaded Scanned FDR Certificate
                    </span>
                  </h4>

                  {fdr.document ? (
                    <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-red-100 text-red-700 rounded-lg">
                          <FileText className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="font-semibold text-slate-900">{fdr.document.name}</div>
                          <div className="text-[11px] text-slate-500">
                            Size: {fdr.document.size} • Type: {fdr.document.type}
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => setShowDocPreview(true)}
                        className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-800 hover:bg-slate-900 rounded-md transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Inspect Document Scan</span>
                      </button>
                    </div>
                  ) : (
                    <div className="p-4 text-center rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800 font-semibold">
                      No scanned certificate document was attached by the institution!
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 3: AUDIT TIMELINE */}
            {activeTab === "timeline" && (
              <div className="space-y-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                  <History className="w-4 h-4 text-amber-600" />
                  Full Lifecycle Audit Timeline
                </h4>

                {Array.isArray(fdr.timeline) && fdr.timeline.length > 0 ? (
                  <div className="relative pl-6 border-l-2 border-slate-200 space-y-6 my-4">
                    {fdr.timeline.map((event, idx) => (
                      <div key={event.id || idx} className="relative group">
                        {/* Dot */}
                        <div className="absolute -left-[31px] top-0.5 w-4 h-4 rounded-full bg-white border-2 border-amber-500 group-hover:scale-125 transition-transform"></div>
                        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-900">{event.action}</span>
                            <span className="text-[10px] text-slate-400">
                              {new Date(event.timestamp).toLocaleString("en-IN")}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 font-medium">
                            By: {event.actor} ({event.role})
                          </div>
                          {event.remarks && (
                            <p className="text-slate-700 pt-1 leading-relaxed bg-white p-2 rounded border border-slate-200/60 font-sans">
                              {event.remarks}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-xs text-slate-400">
                    No timeline events recorded yet.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer Decision Bar (Three Distinct Actions: Approve, Reject, Raise Query) */}
          <div className="px-6 py-4 bg-slate-100 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="text-xs text-slate-600">
              Scrutiny Officer: <strong className="text-slate-900">{user?.fullName || "Er. V. K. Verma"}</strong>
            </div>

            {/* Decision Action Buttons */}
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 rounded-lg border border-slate-300 transition-colors"
              >
                Close
              </button>

              {/* Action C: Raise Query */}
              <button
                type="button"
                onClick={() => {
                  setDecisionType("query");
                  setRemarksInput("");
                  setActionError("");
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-lg border border-purple-200 transition-colors"
              >
                <HelpCircle className="w-3.5 h-3.5" />
                <span>Raise Query</span>
              </button>

              {/* Action B: Reject */}
              <button
                type="button"
                onClick={() => {
                  setDecisionType("reject");
                  setRemarksInput("");
                  setActionError("");
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg border border-rose-200 transition-colors"
              >
                <Ban className="w-3.5 h-3.5" />
                <span>Reject FDR</span>
              </button>

              {/* Action A: Approve */}
              <button
                type="button"
                onClick={() => {
                  setDecisionType("approve");
                  setRemarksInput("FDR verified and approved as compliant with AICTE APH regulations.");
                  setAcknowledgeDiscrepancy(false);
                  setActionError("");
                }}
                className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-xs transition-colors"
              >
                <Check className="w-4 h-4" />
                <span>Approve FDR</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Decision Confirmation Sub-Modal */}
      {decisionType && (
        <div className="fixed inset-0 z-55 overflow-y-auto bg-slate-900/85 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-lg w-full flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Title */}
            <div
              className={`px-6 py-4 text-white flex items-center justify-between ${
                decisionType === "approve"
                  ? "bg-emerald-800"
                  : decisionType === "reject"
                  ? "bg-rose-800"
                  : "bg-purple-800"
              }`}
            >
              <div className="flex items-center gap-2">
                {decisionType === "approve" && <CheckCircle2 className="w-5 h-5 text-emerald-300" />}
                {decisionType === "reject" && <Ban className="w-5 h-5 text-rose-300" />}
                {decisionType === "query" && <HelpCircle className="w-5 h-5 text-purple-300" />}
                <h3 className="font-bold text-base">
                  {decisionType === "approve" && "Confirm FDR Approval"}
                  {decisionType === "reject" && "Reject Institutional FDR"}
                  {decisionType === "query" && "Raise Clarification Query"}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setDecisionType(null)}
                className="text-white/80 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-4">
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs">
                <div>
                  Institution: <strong>{fdr.institutionName}</strong>
                </div>
                <div>
                  FDR Number: <span className="font-mono font-bold">{fdr.fdrNumber}</span> (
                  {formatINR(fdr.amount)})
                </div>
              </div>

              {actionError && (
                <div className="p-3 bg-rose-50 border border-rose-300 rounded-md text-xs text-rose-800">
                  {actionError}
                </div>
              )}

              {/* Discrepancy warning check for approval */}
              {decisionType === "approve" && hasMismatch && (
                <div className="p-3 bg-amber-50 border border-amber-300 rounded-lg text-xs text-amber-900 space-y-2">
                  <div className="font-bold flex items-center gap-1.5 text-amber-800">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    Warning: Unresolved Bank Discrepancy Exists
                  </div>
                  <p className="text-[11px] leading-relaxed">
                    The bank reported a discrepancy in amount or maturity date. Are you sure you wish to
                    approve? You must explicitly acknowledge below.
                  </p>
                  <label className="flex items-start gap-2 pt-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={acknowledgeDiscrepancy}
                      onChange={(e) => setAcknowledgeDiscrepancy(e.target.checked)}
                      className="mt-0.5 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                    />
                    <span className="font-semibold text-amber-950 text-[11px]">
                      I confirm manual scrutiny and authorize approval despite the bank advisory flag.
                    </span>
                  </label>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  {decisionType === "approve"
                    ? "Approval Remarks (Optional)"
                    : decisionType === "reject"
                    ? "Mandatory Rejection Reason *"
                    : "Clarification Query Details *"}
                </label>
                <textarea
                  rows={4}
                  value={remarksInput}
                  onChange={(e) => setRemarksInput(e.target.value)}
                  placeholder={
                    decisionType === "approve"
                      ? "Enter official approval notes or joint lien confirmation references..."
                      : decisionType === "reject"
                      ? "Specify the regulatory clauses violated (e.g. 'Deposit tenure is under mandatory 5-year lock-in period')."
                      : "Specify what information or amended documents the college must provide."
                  }
                  className="w-full px-3 py-2 text-xs text-slate-900 border border-slate-300 rounded-md focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  required={decisionType !== "approve"}
                />
              </div>
            </div>

            {/* Actions */}
            <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setDecisionType(null)}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleConfirmDecision}
                disabled={isProcessing}
                className={`px-5 py-2 text-xs font-bold text-white rounded-md shadow-xs transition-colors flex items-center gap-1.5 ${
                  decisionType === "approve"
                    ? "bg-emerald-600 hover:bg-emerald-700"
                    : decisionType === "reject"
                    ? "bg-rose-600 hover:bg-rose-700"
                    : "bg-purple-600 hover:bg-purple-700"
                }`}
              >
                {decisionType === "approve" && <Check className="w-4 h-4" />}
                {decisionType === "reject" && <Ban className="w-4 h-4" />}
                {decisionType === "query" && <Send className="w-4 h-4" />}
                <span>
                  {decisionType === "approve" && "Confirm & Approve"}
                  {decisionType === "reject" && "Confirm & Reject"}
                  {decisionType === "query" && "Dispatch Query"}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Embedded Document Preview Modal */}
      {showDocPreview && fdr.document && (
        <DocumentPreviewModal
          isOpen={showDocPreview}
          onClose={() => setShowDocPreview(false)}
          document={fdr.document}
          fdrNumber={fdr.fdrNumber}
        />
      )}
    </>
  );
};

