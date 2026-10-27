import React, { useState } from "react";
import {
  X,
  RefreshCw,
  Upload,
  FileText,
  AlertCircle,
  CheckCircle2,
  Calendar,
  Building2,
  CreditCard,
  IndianRupee,
  ShieldCheck,
  Eye,
  Info
} from "lucide-react";
import { formatINR, formatDate, numberToWordsINR } from "../../utils/formatters";
import { useFDR } from "../../context/FDRContext";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { BANK_OPTIONS, INSTRUMENT_TYPES } from "../../config/initialData";

export const RenewalModal = ({ isOpen, onClose, fdr }) => {
  const { submitReplacementFDR, checkDuplicateFdrNumber } = useFDR();
  const { user } = useAuth();
  const { addToast } = useToast();

  const [formData, setFormData] = useState({
    newFdrNumber: "",
    instrumentType: fdr?.instrumentType || "Fixed Deposit Receipt",
    issuingBank: fdr?.issuingBank || "State Bank of India",
    bankBranch: fdr?.bankBranch || "",
    amount: fdr ? String(fdr.amount) : "",
    issueDate: new Date().toISOString().split("T")[0],
    maturityDate: "",
    beneficiary: fdr?.beneficiary || "Member Secretary, AICTE New Delhi & Registrar, KIET Deemed to be University",
    purpose: fdr ? `Renewal / Rollover of ${fdr.fdrNumber}` : "Renewal of Security Deposit",
    remarks: "Mandatory regulatory renewal for further 5-year lock-in."
  });

  const [document, setDocument] = useState(null);
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen || !fdr) return null;

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: null }));
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setErrors((prev) => ({ ...prev, document: "File exceeds 5MB limit." }));
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setDocument({
        name: file.name,
        size: `${(file.size / 1024).toFixed(1)} KB`,
        type: file.type || "application/pdf",
        uploadDate: new Date().toISOString(),
        dataUrl: reader.result
      });
      setErrors((prev) => ({ ...prev, document: null }));
    };
    reader.readAsDataURL(file);
  };

  const validate = () => {
    const errs = {};
    if (!formData.newFdrNumber.trim()) {
      errs.newFdrNumber = "New FDR reference number is required.";
    } else if (checkDuplicateFdrNumber(formData.newFdrNumber)) {
      errs.newFdrNumber = "This FDR number already exists in the register.";
    }

    if (!formData.bankBranch.trim()) {
      errs.bankBranch = "Bank branch and IFSC code are required.";
    }

    if (!formData.amount || isNaN(formData.amount) || Number(formData.amount) <= 0) {
      errs.amount = "Valid deposit amount is required.";
    }

    if (!formData.issueDate) {
      errs.issueDate = "New issue date is required.";
    }

    if (!formData.maturityDate) {
      errs.maturityDate = "New maturity date is required.";
    } else if (formData.issueDate && new Date(formData.maturityDate) <= new Date(formData.issueDate)) {
      errs.maturityDate = "Maturity date must be after the issue date.";
    }

    if (!document) {
      errs.document = "Scanned copy of the renewal/replacement FDR is mandatory.";
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validate()) {
      addToast({
        title: "Validation Error",
        message: "Please complete all mandatory fields for the replacement FDR.",
        type: "error"
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const newRec = submitReplacementFDR(
        fdr.id,
        {
          ...formData,
          document
        },
        user?.fullName || "Dr. Rameshwar Sharma"
      );

      addToast({
        title: "Replacement Submitted",
        message: `Replacement instrument ${newRec.fdrNumber} submitted for AICTE scrutiny. Original deposit marked 'Renewal Pending'.`,
        type: "success"
      });

      setIsSubmitting(false);
      onClose();
    } catch (err) {
      addToast({
        title: "Submission Failed",
        message: err.message,
        type: "error"
      });
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-2xl w-full max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-500/20 text-blue-400 rounded-lg">
              <RefreshCw className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-white">
                Submit FDR Renewal / Replacement
              </h3>
              <p className="text-xs text-slate-400">
                Original Instrument: <span className="font-mono text-amber-300 font-semibold">{fdr.fdrNumber}</span> ({fdr.id})
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

        {/* Existing Instrument Summary Bar */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 text-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
              <CreditCard className="w-4 h-4 text-slate-500" />
              Existing Instrument to be Replaced
            </span>
            <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-300">
              {fdr.status}
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-slate-600 bg-white p-3 rounded border border-slate-200">
            <div>
              <span className="text-slate-400 block text-[10px]">Bank:</span>
              <span className="font-semibold text-slate-800 truncate block">{fdr.issuingBank}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px]">Amount:</span>
              <span className="font-mono font-bold text-slate-900">{formatINR(fdr.amount)}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px]">Issue Date:</span>
              <span className="text-slate-700">{formatDate(fdr.issueDate)}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px]">Maturity:</span>
              <span className="font-semibold text-slate-900">{formatDate(fdr.maturityDate)}</span>
            </div>
          </div>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1 text-xs">
          <div className="p-3 rounded-lg bg-blue-50/70 border border-blue-200 text-blue-900 flex items-start gap-2">
            <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              Submitting a renewal creates a linked replacement record under administrative scrutiny. The
              original record remains preserved with complete historical integrity.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* New FDR Reference */}
            <div>
              <label className="block font-semibold text-slate-700 uppercase tracking-wider mb-1">
                New Replacement FDR Ref No <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="newFdrNumber"
                value={formData.newFdrNumber}
                onChange={handleChange}
                placeholder="e.g. SBI/FDR/2026/REN-9912"
                className={`w-full px-3 py-2 bg-white border rounded-md font-mono text-slate-900 ${
                  errors.newFdrNumber ? "border-red-400 bg-red-50/20" : "border-slate-300"
                }`}
              />
              {errors.newFdrNumber && <p className="text-red-600 text-[11px] mt-1">{errors.newFdrNumber}</p>}
            </div>

            {/* Issuing Bank */}
            <div>
              <label className="block font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Issuing Bank <span className="text-red-500">*</span>
              </label>
              <select
                name="issuingBank"
                value={formData.issuingBank}
                onChange={handleChange}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
              >
                {BANK_OPTIONS.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>

            {/* Bank Branch */}
            <div className="sm:col-span-2">
              <label className="block font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Branch & IFSC Code <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="bankBranch"
                value={formData.bankBranch}
                onChange={handleChange}
                placeholder="Branch name and IFSC"
                className={`w-full px-3 py-2 bg-white border rounded-md ${
                  errors.bankBranch ? "border-red-400 bg-red-50/20" : "border-slate-300"
                }`}
              />
              {errors.bankBranch && <p className="text-red-600 text-[11px] mt-1">{errors.bankBranch}</p>}
            </div>

            {/* Deposit Amount */}
            <div className="sm:col-span-2">
              <label className="block font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Renewal Deposit Principal (₹) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                name="amount"
                value={formData.amount}
                onChange={handleChange}
                className={`w-full px-3 py-2 bg-white border rounded-md font-mono font-bold ${
                  errors.amount ? "border-red-400 bg-red-50/20" : "border-slate-300"
                }`}
              />
              {formData.amount && (
                <div className="text-[11px] text-slate-500 mt-1 italic">
                  {numberToWordsINR(formData.amount)}
                </div>
              )}
              {errors.amount && <p className="text-red-600 text-[11px] mt-1">{errors.amount}</p>}
            </div>

            {/* Issue Date */}
            <div>
              <label className="block font-semibold text-slate-700 uppercase tracking-wider mb-1">
                New Issue Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                name="issueDate"
                value={formData.issueDate}
                onChange={handleChange}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
              />
              {errors.issueDate && <p className="text-red-600 text-[11px] mt-1">{errors.issueDate}</p>}
            </div>

            {/* Maturity Date */}
            <div>
              <label className="block font-semibold text-slate-700 uppercase tracking-wider mb-1">
                New Maturity Date (Min. 3-5 Years) <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                name="maturityDate"
                value={formData.maturityDate}
                onChange={handleChange}
                className={`w-full px-3 py-2 bg-white border rounded-md ${
                  errors.maturityDate ? "border-red-400 bg-red-50/20" : "border-slate-300"
                }`}
              />
              {errors.maturityDate && <p className="text-red-600 text-[11px] mt-1">{errors.maturityDate}</p>}
            </div>

            {/* Beneficiary */}
            <div className="sm:col-span-2">
              <label className="block font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Beneficiary / Favouring Authority
              </label>
              <input
                type="text"
                name="beneficiary"
                value={formData.beneficiary}
                onChange={handleChange}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
              />
            </div>

            {/* Document Upload */}
            <div className="sm:col-span-2">
              <label className="block font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Upload Scanned Renewal Certificate (PDF / Image) <span className="text-red-500">*</span>
              </label>
              <div className="p-3 border border-dashed border-slate-300 rounded-lg bg-slate-50 text-center">
                <input
                  type="file"
                  id="renewalFile"
                  accept=".pdf,image/png,image/jpeg"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <label
                  htmlFor="renewalFile"
                  className="cursor-pointer inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-100"
                >
                  <Upload className="w-3.5 h-3.5 text-slate-500" />
                  Select Scanned Certificate
                </label>

                {document ? (
                  <div className="mt-2 text-xs font-medium text-emerald-700 flex items-center justify-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Selected: {document.name} ({document.size})</span>
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-500 mt-1">PDF or image file up to 5MB</p>
                )}
                {errors.document && <p className="text-red-600 text-[11px] mt-1">{errors.document}</p>}
              </div>
            </div>

            {/* Remarks */}
            <div className="sm:col-span-2">
              <label className="block font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Renewal Notes / Bank Endorsement Details
              </label>
              <textarea
                rows={2}
                name="remarks"
                value={formData.remarks}
                onChange={handleChange}
                placeholder="Details of rollover..."
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md"
              />
            </div>
          </div>

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
              className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-md shadow-xs transition-colors flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Submit Renewal for AICTE Review</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

