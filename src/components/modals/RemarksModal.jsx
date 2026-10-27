import React from "react";
import { X, MessageSquare, AlertCircle, RefreshCw, Clock } from "lucide-react";
import { StatusBadge } from "../common/StatusBadge";

export const RemarksModal = ({ isOpen, onClose, fdr, onResubmit, isCollegeUser }) => {
  if (!isOpen || !fdr) return null;

  const isActionable =
    fdr.status === "Query Raised" ||
    fdr.status === "Rejected / Query Raised" ||
    fdr.status === "Rejected";

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-lg w-full flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-amber-500/20 text-amber-400 rounded-lg">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-base text-white">AICTE Remarks & Queries</h3>
              <p className="text-xs text-slate-400 font-mono">
                {fdr.fdrNumber} • {fdr.id}
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

        {/* Status header */}
        <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <span className="text-xs text-slate-600">Current Status:</span>
          <StatusBadge status={fdr.status} size="sm" />
        </div>

        {/* Body */}
        <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
          {Array.isArray(fdr.remarksHistory) && fdr.remarksHistory.length > 0 ? (
            <div className="space-y-3">
              {fdr.remarksHistory.map((item, idx) => (
                <div
                  key={item.id || idx}
                  className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1.5"
                >
                  <div className="flex items-center justify-between text-slate-500">
                    <span className="font-semibold text-slate-900">{item.author}</span>
                    <span className="text-[10px]">
                      {new Date(item.timestamp).toLocaleString("en-IN")}
                    </span>
                  </div>
                  <p className="text-slate-700 leading-relaxed font-sans">{item.text}</p>
                </div>
              ))}
            </div>
          ) : fdr.remarks ? (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-lg text-xs space-y-1 text-rose-900">
              <div className="font-bold flex items-center gap-1.5 text-rose-800 mb-1">
                <AlertCircle className="w-4 h-4" />
                Scrutiny Deficiency Remark:
              </div>
              <p className="leading-relaxed">{fdr.remarks}</p>
            </div>
          ) : (
            <p className="text-xs text-slate-500 text-center py-4">No remarks recorded yet.</p>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors"
          >
            Close
          </button>

          {isActionable && isCollegeUser && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onResubmit(fdr);
              }}
              className="px-4 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-md transition-colors flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Address & Resubmit
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
