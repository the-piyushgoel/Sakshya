import React, { useState } from "react";
import {
  X,
  Unlock,
  AlertCircle,
  CheckCircle2,
  Building2,
  Calendar,
  CreditCard,
  IndianRupee,
  ShieldAlert,
  Info
} from "lucide-react";
import { formatINR, formatDate, numberToWordsINR } from "../../utils/formatters";
import { useFDR } from "../../context/FDRContext";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { RELEASE_REASONS } from "../../config/initialData";

export const ReleaseRequestModal = ({ isOpen, onClose, fdr }) => {
  const { requestFDRRelease } = useFDR();
  const { user } = useAuth();
  const { addToast } = useToast();

  const [reason, setReason] = useState(RELEASE_REASONS[0]);
  const [remarks, setRemarks] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen || !fdr) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    setError("");

    if (!reason) {
      setError("Please select a valid regulatory reason for release.");
      return;
    }

    if (!confirmed) {
      setError("Please confirm the compliance declaration checkbox before submitting.");
      return;
    }

    setIsSubmitting(true);
    try {
      requestFDRRelease(fdr.id, reason, remarks, user?.fullName || "Dr. Rameshwar Sharma");

      addToast({
        title: "Release Request Submitted",
        message: `Release request for FDR ${fdr.fdrNumber} submitted for AICTE Bureau approval.`,
        type: "success"
      });

      setIsSubmitting(false);
      onClose();
    } catch (err) {
      setError(err.message);
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-lg w-full flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-500/20 text-indigo-400 rounded-lg">
              <Unlock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-white">
                Initiate Security Deposit Release / Refund
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

        {/* Prototype Disclaimer */}
        <div className="p-3 bg-amber-50 border-b border-amber-200 text-xs text-amber-900 flex items-start gap-2">
          <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            <strong>Prototype Simulation:</strong> Submitting this request sends an administrative release docket to the AICTE Regional Bureau. No actual banking wire transfer or premature encashment is performed.
          </p>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-300 rounded-md text-xs text-rose-800">
              {error}
            </div>
          )}

          {/* Instrument Metadata */}
          <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
            <div className="flex justify-between items-center border-b border-slate-200 pb-1.5">
              <span className="text-slate-500">Institution:</span>
              <span className="font-semibold text-slate-900">{fdr.institutionName}</span>
            </div>
            <div className="flex justify-between items-center border-b border-slate-200 pb-1.5">
              <span className="text-slate-500">Principal Deposit Value:</span>
              <span className="font-mono font-bold text-slate-900">{formatINR(fdr.amount)}</span>
            </div>
            <div className="flex justify-between items-center border-b border-slate-200 pb-1.5">
              <span className="text-slate-500">Maturity Date:</span>
              <span className="font-semibold text-slate-900">{formatDate(fdr.maturityDate)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-500">Issuing Bank:</span>
              <span className="text-slate-800">{fdr.issuingBank}</span>
            </div>
          </div>

          {/* Reason Selection */}
          <div>
            <label className="block font-semibold text-slate-700 uppercase tracking-wider mb-1">
              Regulatory Basis for Release / Refund <span className="text-red-500">*</span>
            </label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {RELEASE_REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          {/* Remarks */}
          <div>
            <label className="block font-semibold text-slate-700 uppercase tracking-wider mb-1">
              Institution Compliance Remarks / NOC Reference
            </label>
            <textarea
              rows={3}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="e.g. Mandatory 5-year lock-in period successfully completed. AICTE Approval Process Handbook conditions satisfied. Requesting revocation of joint lien."
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Confirmation Checkbox */}
          <div className="pt-2">
            <label className="flex items-start gap-2.5 cursor-pointer p-2.5 rounded bg-slate-50 border border-slate-200">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-[11px] text-slate-700 leading-relaxed">
                I hereby declare that all academic programs and regulatory obligations tied to this security deposit remain in full compliance with AICTE regulations.
              </span>
            </label>
          </div>

          {/* Action Buttons */}
          <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-md shadow-xs transition-colors flex items-center gap-1.5"
            >
              <Unlock className="w-3.5 h-3.5" />
              <span>Submit Release Request</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

