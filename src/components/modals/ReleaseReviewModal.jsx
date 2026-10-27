import React, { useState } from "react";
import {
  X,
  Unlock,
  Check,
  Ban,
  Building2,
  Calendar,
  CreditCard,
  FileText,
  AlertTriangle,
  CheckCircle2,
  AlertCircle
} from "lucide-react";
import { formatINR, formatDate, numberToWordsINR } from "../../utils/formatters";
import { useFDR } from "../../context/FDRContext";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";

export const ReleaseReviewModal = ({ isOpen, onClose, fdr }) => {
  const { approveFDRRelease, rejectFDRRelease } = useFDR();
  const { user } = useAuth();
  const { addToast } = useToast();

  const [decision, setDecision] = useState(null); // 'approve' | 'reject'
  const [remarks, setRemarks] = useState("");
  const [error, setError] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  if (!isOpen || !fdr || !fdr.releaseRequest) return null;

  const req = fdr.releaseRequest;

  const handleDecision = () => {
    setError("");

    if (decision === "reject" && !remarks.trim()) {
      setError("A specific rejection reason is mandatory.");
      return;
    }

    setIsProcessing(true);
    try {
      if (decision === "approve") {
        approveFDRRelease(fdr.id, remarks, user?.fullName || "Er. V. K. Verma");
        addToast({
          title: "FDR Release Approved",
          message: `Release of FDR ${fdr.fdrNumber} (₹${fdr.amount}) has been approved. Instrument marked 'Released'.`,
          type: "success"
        });
      } else if (decision === "reject") {
        rejectFDRRelease(fdr.id, remarks, user?.fullName || "Er. V. K. Verma");
        addToast({
          title: "Release Request Rejected",
          message: `Release request for FDR ${fdr.fdrNumber} was rejected. Retained in active regulatory custody.`,
          type: "error"
        });
      }
      setIsProcessing(false);
      onClose();
    } catch (e) {
      setError(e.message);
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-xl w-full flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150 text-xs">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-500/20 text-indigo-400 rounded-lg">
              <Unlock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-white">
                Review Security Deposit Release Request
              </h3>
              <p className="text-xs text-slate-400 font-mono">
                {fdr.fdrNumber} • {fdr.id}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-md hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Request Dossier */}
        <div className="p-6 space-y-4 overflow-y-auto max-h-[75vh]">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-300 rounded-md text-rose-800">
              {error}
            </div>
          )}

          {/* Institution & Amount Banner */}
          <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
            <div className="flex justify-between items-center border-b border-slate-200 pb-2">
              <span className="text-slate-500">Applicant Institution:</span>
              <span className="font-bold text-slate-900">{fdr.institutionName}</span>
            </div>
            <div className="flex justify-between items-center border-b border-slate-200 pb-2">
              <span className="text-slate-500">Deposit Principal to Release:</span>
              <span className="font-mono font-bold text-base text-slate-900">{formatINR(fdr.amount)}</span>
            </div>
            <div className="flex justify-between items-center border-b border-slate-200 pb-2">
              <span className="text-slate-500">Maturity Date:</span>
              <span className="font-semibold text-slate-800">{formatDate(fdr.maturityDate)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500">Requested By:</span>
              <span className="text-slate-800 font-medium">
                {req.requestedBy} on {new Date(req.requestedDate).toLocaleDateString("en-IN")}
              </span>
            </div>
          </div>

          {/* Basis of Request */}
          <div className="p-3.5 rounded-lg bg-indigo-50/60 border border-indigo-200 space-y-1.5">
            <span className="font-bold text-indigo-950 uppercase tracking-wider text-[11px] block">
              Institution's Regulatory Basis:
            </span>
            <p className="font-semibold text-indigo-900">{req.reason}</p>
            {req.remarks && (
              <p className="text-slate-600 pt-1 italic bg-white p-2 rounded border border-indigo-100">
                "{req.remarks}"
              </p>
            )}
          </div>

          {/* Decision Form */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-800 uppercase tracking-wider">Select Bureau Decision:</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setDecision("approve")}
                className={`p-3 rounded-lg border text-left transition-all flex items-center justify-between ${
                  decision === "approve"
                    ? "bg-emerald-50 border-emerald-500 text-emerald-950 shadow-xs font-semibold ring-1 ring-emerald-500"
                    : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                }`}
              >
                <div>
                  <div className="font-bold flex items-center gap-1.5 text-emerald-800">
                    <Check className="w-4 h-4" />
                    Approve Release
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">Revoke regulatory lien</div>
                </div>
                {decision === "approve" && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
              </button>

              <button
                type="button"
                onClick={() => setDecision("reject")}
                className={`p-3 rounded-lg border text-left transition-all flex items-center justify-between ${
                  decision === "reject"
                    ? "bg-rose-50 border-rose-500 text-rose-950 shadow-xs font-semibold ring-1 ring-rose-500"
                    : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                }`}
              >
                <div>
                  <div className="font-bold flex items-center gap-1.5 text-rose-800">
                    <Ban className="w-4 h-4" />
                    Reject Release
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">Retain in active lien</div>
                </div>
                {decision === "reject" && <AlertCircle className="w-4 h-4 text-rose-600" />}
              </button>
            </div>

            {decision && (
              <div className="pt-2 animate-in fade-in duration-150">
                <label className="block font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  {decision === "approve" ? "Approval Remarks (Optional)" : "Mandatory Rejection Reason *"}
                </label>
                <textarea
                  rows={3}
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder={
                    decision === "approve"
                      ? "e.g. AICTE Approval Bureau NOC No. 2026/DELHI verified. Deposit released."
                      : "e.g. Course continuation in progress; reserve cannot be released without replacement."
                  }
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  required={decision === "reject"}
                />
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-100"
          >
            Cancel
          </button>

          <button
            type="button"
            disabled={!decision || isProcessing}
            onClick={handleDecision}
            className={`px-5 py-2 text-xs font-bold text-white rounded-md shadow-xs transition-colors flex items-center gap-1.5 ${
              !decision
                ? "bg-slate-400 cursor-not-allowed"
                : decision === "approve"
                ? "bg-emerald-600 hover:bg-emerald-700"
                : "bg-rose-600 hover:bg-rose-700"
            }`}
          >
            {decision === "approve" && <Check className="w-3.5 h-3.5" />}
            {decision === "reject" && <Ban className="w-3.5 h-3.5" />}
            <span>Confirm {decision === "approve" ? "Approval" : "Rejection"}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

