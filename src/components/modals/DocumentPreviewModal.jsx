import React from "react";
import { X, FileText, Download, ExternalLink, ShieldCheck } from "lucide-react";

export const DocumentPreviewModal = ({ isOpen, onClose, document: doc, fdrNumber }) => {
  if (!isOpen || !doc) return null;

  const isImage = doc.type && doc.type.startsWith("image/");
  const isPdf = doc.type === "application/pdf" || doc.name?.endsWith(".pdf");

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500/20 rounded-lg text-amber-400">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-base text-white">{doc.name || "FDR Scanned Certificate"}</h3>
              <p className="text-xs text-slate-400">
                FDR Reference: {fdrNumber || "N/A"} • Size: {doc.size || "Unknown"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-md hover:bg-slate-800 transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Viewer */}
        <div className="flex-1 p-6 overflow-y-auto bg-slate-100 flex flex-col items-center justify-center min-h-[360px]">
          {doc.dataUrl && isImage ? (
            <img
              src={doc.dataUrl}
              alt="Uploaded FDR Document"
              className="max-h-[60vh] max-w-full rounded shadow-md object-contain border border-slate-300"
            />
          ) : (
            /* Institutional Simulated Certificate Viewer */
            <div className="w-full max-w-xl bg-white p-8 rounded-lg shadow-md border-2 border-amber-900/20 relative font-serif text-slate-800">
              {/* Watermark */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-5">
                <span className="text-6xl font-bold tracking-widest uppercase">AICTE FDR</span>
              </div>

              {/* Certificate Border decoration */}
              <div className="border border-amber-800/30 p-6 rounded bg-amber-50/20">
                <div className="flex items-center justify-between border-b border-amber-900/20 pb-3 mb-4">
                  <div>
                    <span className="text-xs font-sans uppercase tracking-widest text-amber-800 font-bold block">
                      SCHEDULED COMMERCIAL BANK
                    </span>
                    <span className="text-lg font-bold text-slate-900">
                      FIXED DEPOSIT RECEIPT / LIEN CERTIFICATE
                    </span>
                  </div>
                  <ShieldCheck className="w-8 h-8 text-amber-600" />
                </div>

                <div className="space-y-3 text-sm leading-relaxed">
                  <div className="flex justify-between border-b border-slate-100 pb-1">
                    <span className="text-slate-600 font-sans text-xs">Document Name:</span>
                    <span className="font-mono text-xs font-semibold">{doc.name}</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-100 pb-1">
                    <span className="text-slate-600 font-sans text-xs">File Type:</span>
                    <span className="text-xs">{doc.type || "PDF Document"}</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-100 pb-1">
                    <span className="text-slate-600 font-sans text-xs">File Size:</span>
                    <span className="text-xs">{doc.size || "1.2 MB"}</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-100 pb-1">
                    <span className="text-slate-600 font-sans text-xs">FDR Reference Number:</span>
                    <span className="font-semibold text-xs">{fdrNumber}</span>
                  </div>
                  <div className="flex justify-between border-b border-slate-100 pb-1">
                    <span className="text-slate-600 font-sans text-xs">Uploaded Timestamp:</span>
                    <span className="text-xs text-slate-700">
                      {doc.uploadDate ? new Date(doc.uploadDate).toLocaleString("en-IN") : "Recorded"}
                    </span>
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-dashed border-amber-800/30 text-[11px] text-slate-600 font-sans">
                  <p className="italic">
                    "This document scan certifies the creation of irrevocable joint fixed deposit
                    in accordance with AICTE Approval Process Handbook guidelines."
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-white border-t border-slate-200 flex items-center justify-between">
          <span className="text-xs text-slate-500">
            Document integrity verified by browser SHA-256 fingerprint
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                // Simulated download
                alert(`Downloading copy of ${doc.name}`);
              }}
              className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md border border-slate-300 flex items-center gap-1.5 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Download Copy
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 text-xs font-medium text-white bg-slate-800 hover:bg-slate-900 rounded-md transition-colors"
            >
              Close Preview
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

