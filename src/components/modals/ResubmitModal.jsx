import React, { useState } from "react";
import { X, RefreshCw, Upload, AlertCircle, FileText, CheckCircle2 } from "lucide-react";
import { useFDR } from "../../context/FDRContext";
import { useToast } from "../../context/ToastContext";
import { useAuth } from "../../context/AuthContext";

export const ResubmitModal = ({ isOpen, onClose, fdr }) => {
  const { resubmitFDR } = useFDR();
  const { user } = useAuth();
  const { addToast } = useToast();

  const [resubmissionNote, setResubmissionNote] = useState("");
  const [newDocument, setNewDocument] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  if (!isOpen || !fdr) return null;

  const isRejected = fdr.status === "Rejected";

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setError("File exceeds 5 MB limit. Please select an optimized file.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setNewDocument({
        name: file.name,
        size: `${(file.size / 1024).toFixed(1)} KB`,
        type: file.type,
        uploadDate: new Date().toISOString(),
        dataUrl: reader.result
      });
      setError("");
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!resubmissionNote.trim()) {
      setError("Please provide a compliance note or explanation describing the rectification.");
      return;
    }

    setIsSubmitting(true);

    const updatedData = {};
    if (newDocument) {
      updatedData.document = newDocument;
    }

    resubmitFDR(
      fdr.id,
      resubmissionNote.trim(),
      updatedData,
      user?.fullName || "Dr. Rameshwar Sharma"
    );

    addToast({
      title: "Resubmitted for Verification",
      message: `${fdr.fdrNumber} has been updated and moved back to 'Pending Verification'.`,
      type: "success"
    });

    setIsSubmitting(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/75 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-lg w-full flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-amber-500/20 text-amber-400 rounded-lg">
              <RefreshCw className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-base text-white">
                {isRejected ? "Correct Deficiency & Resubmit" : "Address Query & Resubmit"}
              </h3>
              <p className="text-xs text-slate-400 font-mono">
                {fdr.fdrNumber} • Current Status: {fdr.status}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-md hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Existing Query / Rejection reminder */}
        <div
          className={`p-4 border-b text-xs space-y-1 ${
            isRejected
              ? "bg-rose-50 border-rose-200 text-rose-950"
              : "bg-amber-50 border-amber-200 text-amber-950"
          }`}
        >
          <div className="font-semibold flex items-center gap-1.5">
            <AlertCircle className={`w-4 h-4 ${isRejected ? "text-rose-600" : "text-amber-600"}`} />
            <span>{isRejected ? "AICTE Rejection Reason:" : "Active AICTE Query:"}</span>
          </div>
          <p className="leading-relaxed bg-white/80 p-2.5 rounded border border-slate-200">
            {fdr.remarks || "Please review and rectify the stated regulatory deficiency."}
          </p>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-300 rounded-md text-xs text-rose-800">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Institution Compliance Response <span className="text-red-500">*</span>
            </label>
            <textarea
              rows={3}
              value={resubmissionNote}
              onChange={(e) => setResubmissionNote(e.target.value)}
              placeholder="Explain how the deficiency has been rectified (e.g. 'Bank has endorsed joint lien clause on page 1 of the attached amended FDR certificate')."
              className="w-full px-3 py-2 text-xs text-slate-800 border border-slate-300 rounded-md focus:ring-2 focus:ring-amber-500 focus:outline-none"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Upload Rectified Document Scan (Optional if existing file is sufficient)
            </label>
            <div className="p-3 border border-dashed border-slate-300 rounded-lg bg-slate-50 text-center">
              <input
                type="file"
                id="rectifiedFile"
                accept=".pdf,image/png,image/jpeg"
                onChange={handleFileChange}
                className="hidden"
              />
              <label
                htmlFor="rectifiedFile"
                className="cursor-pointer inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors"
              >
                <Upload className="w-3.5 h-3.5 text-slate-500" />
                Select New / Amended Scan
              </label>

              {newDocument ? (
                <div className="mt-2 text-xs font-medium text-emerald-700 flex items-center justify-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Selected: {newDocument.name} ({newDocument.size})</span>
                </div>
              ) : (
                <div className="mt-1 text-[11px] text-slate-500">
                  Current file: {fdr.document?.name || "None"}
                </div>
              )}
            </div>
          </div>

          <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-md shadow-xs transition-colors flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Submit for AICTE Re-Scrutiny</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
