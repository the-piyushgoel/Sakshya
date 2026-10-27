import React, { createContext, useContext, useState, useEffect, useMemo } from "react";
import {
  INITIAL_FDR_RECORDS,
  INITIAL_BANK_CONFIRMATIONS,
  INITIAL_NOTIFICATIONS
} from "../config/initialData";
import { STORAGE_KEYS } from "../config/authConfig";
import { isExpiringSoon, isMatured, getLifecycleStatus, getDaysRemaining } from "../utils/formatters";

const FDRContext = createContext(null);

export const FDRProvider = ({ children }) => {
  // Configurable alert threshold (default 30 days as requested in prompt)
  const [maturityThreshold, setMaturityThreshold] = useState(30);

  // Load FDR records from localStorage or fallback
  const [records, setRecords] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.FDR_RECORDS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((r) => {
            if (r.institutionName?.includes("Apex")) {
              return {
                ...r,
                institutionName: "KIET Deemed to be University",
                beneficiary: r.beneficiary?.replace(/Apex Institute/g, "KIET Deemed to be University")
              };
            }
            return r;
          });
        }
      }
    } catch (e) {
      console.warn("Could not parse saved FDR records from localStorage", e);
    }
    return INITIAL_FDR_RECORDS;
  });

  // Load Bank Confirmations
  const [bankConfirmations, setBankConfirmations] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.BANK_CONFIRMATIONS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn("Could not parse saved Bank Confirmations from localStorage", e);
    }
    return INITIAL_BANK_CONFIRMATIONS;
  });

  // Load Notifications
  const [notifications, setNotifications] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.NOTIFICATIONS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn("Could not parse saved notifications", e);
    }
    return INITIAL_NOTIFICATIONS;
  });

  // Persist FDR records safely
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.FDR_RECORDS, JSON.stringify(records));
    } catch (err) {
      console.error("Storage error when saving FDR records:", err);
      try {
        const trimmed = records.map((r) => {
          if (r.document && r.document.dataUrl) {
            const { dataUrl, ...restDoc } = r.document;
            return { ...r, document: restDoc };
          }
          return r;
        });
        localStorage.setItem(STORAGE_KEYS.FDR_RECORDS, JSON.stringify(trimmed));
      } catch (innerErr) {
        console.error("Secondary storage failed:", innerErr);
      }
    }
  }, [records]);

  // Persist bank confirmations
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.BANK_CONFIRMATIONS, JSON.stringify(bankConfirmations));
    } catch (err) {
      console.error("Storage error when saving Bank Confirmations:", err);
    }
  }, [bankConfirmations]);

  // Persist notifications
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(notifications));
    } catch (err) {
      console.error("Storage error when saving Notifications:", err);
    }
  }, [notifications]);

  /**
   * Helper to add notification
   */
  const addNotification = ({ recipientRole = "all", title, message, fdrId, fdrNumber, type = "info" }) => {
    const newNotif = {
      id: `notif-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
      recipientRole,
      title,
      message,
      fdrId,
      fdrNumber,
      timestamp: new Date().toISOString(),
      read: false,
      type
    };
    setNotifications((prev) => [newNotif, ...prev]);
    return newNotif;
  };

  const markNotificationAsRead = (id) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  };

  const markAllNotificationsAsRead = (role) => {
    setNotifications((prev) =>
      prev.map((n) => {
        if (n.recipientRole === "all" || n.recipientRole === role) {
          return { ...n, read: true };
        }
        return n;
      })
    );
  };

  /**
   * Derive stats dynamically from records
   */
  const stats = useMemo(() => {
    const uniqueInstitutions = new Set(records.map((r) => r.institutionId).filter(Boolean));
    let totalCount = 0;
    let pendingCount = 0;
    let approvedCount = 0;
    let rejectedCount = 0;
    let queryRaisedCount = 0;
    let expiringSoonCount = 0;
    let maturedCount = 0;
    let releasedCount = 0;
    let renewalPendingCount = 0;
    let draftCount = 0;
    let pendingReleaseCount = 0;
    let pendingRenewalCount = 0;
    let totalDepositAmount = 0;

    records.forEach((rec) => {
      totalCount++;
      const amt = Number(rec.amount || 0);
      const lifecycle = getLifecycleStatus(rec, maturityThreshold);

      if (rec.status === "Pending Verification") {
        pendingCount++;
        totalDepositAmount += amt;
      } else if (rec.status === "Approved") {
        approvedCount++;
        totalDepositAmount += amt;
      } else if (rec.status === "Rejected") {
        rejectedCount++;
      } else if (rec.status === "Query Raised" || rec.status === "Rejected / Query Raised") {
        queryRaisedCount++;
      } else if (rec.status === "Draft") {
        draftCount++;
      } else if (rec.status === "Released") {
        releasedCount++;
      }

      // Lifecycle status tallies
      if (lifecycle === "Expiring Soon") {
        expiringSoonCount++;
      } else if (lifecycle === "Matured") {
        maturedCount++;
      } else if (lifecycle === "Renewal Pending") {
        renewalPendingCount++;
      }

      // Release requests pending approval
      if (rec.releaseRequest && rec.releaseRequest.status === "Pending Approval") {
        pendingReleaseCount++;
      }

      // Replacement submissions pending AICTE review
      if (rec.isReplacement && rec.status === "Pending Verification") {
        pendingRenewalCount++;
      }
    });

    // Unresolved discrepancies
    const unresolvedDiscrepancies = bankConfirmations.filter(
      (bc) => bc.matchStatus === "mismatch" && !bc.manualReview
    ).length;

    return {
      totalInstitutions: uniqueInstitutions.size || 1,
      totalFDRs: totalCount,
      pendingVerification: pendingCount,
      approvedFDRs: approvedCount,
      rejectedFDRs: rejectedCount,
      queryRaised: queryRaisedCount,
      rejectedQueryRaised: rejectedCount + queryRaisedCount,
      expiringSoon: expiringSoonCount,
      maturedFDRs: maturedCount,
      releasedFDRs: releasedCount,
      renewalPendingFDRs: renewalPendingCount,
      pendingReleaseRequests: pendingReleaseCount,
      pendingRenewals: pendingRenewalCount,
      unresolvedDiscrepancies,
      drafts: draftCount,
      totalDepositAmount,
      totalDepositedValue: totalDepositAmount
    };
  }, [records, bankConfirmations, maturityThreshold]);

  /**
   * Pending Verification Queue
   */
  const pendingVerificationQueue = useMemo(() => {
    return records
      .filter((r) => r.status === "Pending Verification")
      .map((rec) => {
        const bankConf = bankConfirmations.find(
          (bc) =>
            bc.fdrReference?.toLowerCase() === rec.fdrNumber?.toLowerCase() ||
            bc.fdrId === rec.id
        );

        let discrepancyStatus = "Clean";
        let discrepancyText = "No discrepancy reported";

        if (!bankConf) {
          discrepancyStatus = "Pending Check";
          discrepancyText = "Bank verification dispatch pending";
        } else if (bankConf.manualReview) {
          discrepancyStatus = "Manually Reconciled";
          discrepancyText = `Reconciled: ${bankConf.manualReview.outcome}`;
        } else if (bankConf.matchStatus === "mismatch") {
          discrepancyStatus = "Discrepancy";
          discrepancyText = bankConf.confirmationStatus;
        } else if (bankConf.matchStatus === "pending") {
          discrepancyStatus = "Pending Bank";
          discrepancyText = "Awaiting bank nodal reply";
        } else if (bankConf.matchStatus === "incomplete") {
          discrepancyStatus = "Incomplete";
          discrepancyText = "Incomplete bank master record";
        } else if (bankConf.matchStatus === "match") {
          discrepancyStatus = "Matched";
          discrepancyText = "CBS verification confirmed";
        }

        return {
          ...rec,
          bankConfirmation: bankConf || null,
          discrepancyStatus,
          discrepancyText
        };
      })
      .sort((a, b) => new Date(b.submissionDate || b.lastUpdated).getTime() - new Date(a.submissionDate || a.lastUpdated).getTime());
  }, [records, bankConfirmations]);

  /**
   * Release Requests Queue for AICTE Review
   */
  const pendingReleaseQueue = useMemo(() => {
    return records
      .filter((r) => r.releaseRequest && r.releaseRequest.status === "Pending Approval")
      .sort((a, b) => new Date(b.releaseRequest.requestedDate).getTime() - new Date(a.releaseRequest.requestedDate).getTime());
  }, [records]);

  /**
   * Pending Renewals / Replacements Queue
   */
  const pendingRenewalQueue = useMemo(() => {
    return records
      .filter((r) => r.isReplacement && r.status === "Pending Verification")
      .sort((a, b) => new Date(b.submissionDate).getTime() - new Date(a.submissionDate).getTime());
  }, [records]);

  /**
   * Upcoming maturity watchlist
   */
  const upcomingMaturityWatchlist = useMemo(() => {
    return [...records]
      .filter((r) => r.status !== "Draft" && r.status !== "Released" && r.maturityDate)
      .sort((a, b) => new Date(a.maturityDate).getTime() - new Date(b.maturityDate).getTime())
      .slice(0, 6);
  }, [records]);

  /**
   * Matured instruments requiring action (Release or Renew)
   */
  const maturedInstrumentsList = useMemo(() => {
    return records.filter((r) => {
      const days = getDaysRemaining(r.maturityDate);
      return days !== null && days < 0 && r.status !== "Released" && r.status !== "Draft";
    });
  }, [records]);

  /**
   * Recent submissions
   */
  const recentSubmissions = useMemo(() => {
    return [...records]
      .sort((a, b) => {
        const timeA = new Date(a.submissionDate || a.lastUpdated || a.issueDate).getTime();
        const timeB = new Date(b.submissionDate || b.lastUpdated || b.issueDate).getTime();
        return timeB - timeA;
      })
      .slice(0, 5);
  }, [records]);

  /**
   * Status distribution
   */
  const statusDistribution = useMemo(() => {
    const total = records.length || 1;
    return [
      {
        label: "Approved",
        count: stats.approvedFDRs,
        percentage: Math.round((stats.approvedFDRs / total) * 100),
        color: "bg-emerald-500",
        textColor: "text-emerald-700",
        lightBg: "bg-emerald-50"
      },
      {
        label: "Pending Verification",
        count: stats.pendingVerification,
        percentage: Math.round((stats.pendingVerification / total) * 100),
        color: "bg-amber-500",
        textColor: "text-amber-700",
        lightBg: "bg-amber-50"
      },
      {
        label: "Query Raised",
        count: stats.queryRaised,
        percentage: Math.round((stats.queryRaised / total) * 100),
        color: "bg-purple-500",
        textColor: "text-purple-700",
        lightBg: "bg-purple-50"
      },
      {
        label: "Rejected",
        count: stats.rejectedFDRs,
        percentage: Math.round((stats.rejectedFDRs / total) * 100),
        color: "bg-rose-500",
        textColor: "text-rose-700",
        lightBg: "bg-rose-50"
      },
      {
        label: "Matured (Unreleased)",
        count: stats.maturedFDRs,
        percentage: Math.round((stats.maturedFDRs / total) * 100),
        color: "bg-amber-600",
        textColor: "text-amber-900",
        lightBg: "bg-amber-100"
      },
      {
        label: "Released / Refunded",
        count: stats.releasedFDRs,
        percentage: Math.round((stats.releasedFDRs / total) * 100),
        color: "bg-slate-500",
        textColor: "text-slate-800",
        lightBg: "bg-slate-100"
      }
    ];
  }, [records, stats]);

  /**
   * Recent remarks feed
   */
  const recentRemarksFeed = useMemo(() => {
    const list = [];
    records.forEach((rec) => {
      if (Array.isArray(rec.remarksHistory) && rec.remarksHistory.length > 0) {
        rec.remarksHistory.forEach((rmk) => {
          list.push({
            ...rmk,
            fdrId: rec.id,
            fdrNumber: rec.fdrNumber,
            bank: rec.issuingBank,
            amount: rec.amount
          });
        });
      }
    });

    return list
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 6);
  }, [records]);

  const generateFdrId = () => {
    const year = new Date().getFullYear();
    const existingNums = records
      .map((r) => {
        const match = r.id.match(/FDR-\d{4}-(\d+)/);
        return match ? parseInt(match[1], 10) : 0;
      })
      .filter((n) => !isNaN(n));
    const nextNum = existingNums.length > 0 ? Math.max(...existingNums) + 1 : 1;
    return `FDR-${year}-${String(nextNum).padStart(3, "0")}`;
  };

  /**
   * Add a new FDR
   */
  const addFDR = (formData, isDraft = false) => {
    const now = new Date().toISOString();
    const newId = generateFdrId();
    const institution = formData.institutionName || "KIET Deemed to be University";
    const instId = formData.institutionId || "1-394829104";

    const newRecord = {
      id: newId,
      institutionId: instId,
      institutionName: institution,
      fdrNumber: formData.fdrNumber.trim(),
      instrumentType: formData.instrumentType || "Fixed Deposit Receipt",
      issuingBank: formData.issuingBank,
      bankBranch: formData.bankBranch,
      amount: Number(formData.amount),
      issueDate: formData.issueDate,
      maturityDate: formData.maturityDate,
      submissionDate: isDraft ? null : now,
      lastUpdated: now,
      beneficiary: formData.beneficiary || "Member Secretary, AICTE New Delhi",
      purpose: formData.purpose,
      status: isDraft ? "Draft" : "Pending Verification",
      lifecycleStatus: isDraft ? "Draft" : "Verification Pending",
      remarks: isDraft
        ? "Draft record saved by institution."
        : "Newly submitted for AICTE verification.",
      remarksHistory: isDraft
        ? []
        : [
            {
              id: `rmk-${Date.now()}`,
              author: formData.authorName || "Dr. Rameshwar Sharma",
              role: "College Administrator",
              timestamp: now,
              text: `Submitted FDR record for amount ₹${formData.amount}. Document attached: ${
                formData.document?.name || "Uploaded Scan"
              }`
            }
          ],
      timeline: [
        {
          id: `tl-${Date.now()}`,
          action: isDraft ? "Draft Created" : "Submitted for Verification",
          actor: formData.authorName || "Dr. Rameshwar Sharma",
          role: "College Administrator",
          timestamp: now,
          remarks: isDraft
            ? "Draft saved by institution."
            : `Submitted FDR ${formData.fdrNumber.trim()} for AICTE verification.`
        }
      ],
      document: formData.document || null,
      replacesFdrId: null,
      replacedByFdrId: null,
      isReplacement: false
    };

    setRecords((prev) => [newRecord, ...prev]);

    if (!isDraft) {
      const newConfirmation = {
        id: `BC-${Date.now().toString().slice(-6)}`,
        fdrId: newId,
        fdrReference: formData.fdrNumber.trim(),
        institutionName: institution,
        bank: formData.issuingBank,
        branch: formData.bankBranch,
        submittedAmount: Number(formData.amount),
        verifiedAmount: null,
        submittedIssueDate: formData.issueDate,
        verifiedIssueDate: null,
        submittedMaturityDate: formData.maturityDate,
        verifiedMaturityDate: null,
        lienMarked: null,
        lienFavouring: null,
        confirmationStatus: "Awaiting Bank Response",
        matchStatus: "pending",
        lastChecked: now,
        verificationMethod: "Scheduled Bank Verification Queue",
        bankReferenceNumber: `REQ-QUE-${Date.now().toString().slice(-5)}`,
        officerRemarks: "Automated verification ticket dispatched to bank liaison portal.",
        notes: "Generated upon college submission."
      };
      setBankConfirmations((prev) => [newConfirmation, ...prev]);

      addNotification({
        recipientRole: "aicte",
        title: "New FDR Submission",
        message: `${institution} submitted FDR ${formData.fdrNumber} (₹${formData.amount}) for verification.`,
        fdrId: newId,
        fdrNumber: formData.fdrNumber.trim(),
        type: "info"
      });
    }

    return newRecord;
  };

  /**
   * Update existing record or draft
   */
  const updateFDR = (id, updatedFields, isDraft = false) => {
    const now = new Date().toISOString();
    let updatedRecord = null;

    setRecords((prev) =>
      prev.map((rec) => {
        if (rec.id === id) {
          const wasDraft = rec.status === "Draft";
          const newStatus = isDraft ? "Draft" : wasDraft ? "Pending Verification" : rec.status;
          const updatedTimeline = [...(rec.timeline || [])];

          if (!isDraft && wasDraft) {
            updatedTimeline.push({
              id: `tl-${Date.now()}`,
              action: "Submitted for Verification",
              actor: updatedFields.authorName || "College Administrator",
              role: "College Administrator",
              timestamp: now,
              remarks: `Submitted draft FDR ${rec.fdrNumber} for verification.`
            });
          }

          updatedRecord = {
            ...rec,
            ...updatedFields,
            lastUpdated: now,
            status: newStatus,
            submissionDate: !isDraft && wasDraft ? now : rec.submissionDate || now,
            timeline: updatedTimeline
          };
          return updatedRecord;
        }
        return rec;
      })
    );

    return updatedRecord;
  };

  /**
   * AICTE Action: Approve FDR
   */
  const approveFDR = (fdrId, remarks = "", reviewer = "Er. V. K. Verma (Senior Scrutiny Officer)") => {
    const now = new Date().toISOString();
    let updatedRec = null;

    setRecords((prev) =>
      prev.map((rec) => {
        if (rec.id === fdrId) {
          const approvalText = remarks.trim() || "FDR verified and approved as compliant with AICTE APH regulations.";
          const newRemarksHistory = [
            ...(rec.remarksHistory || []),
            {
              id: `rmk-${Date.now()}`,
              author: reviewer,
              role: "AICTE Administrator",
              timestamp: now,
              text: `APPROVAL: ${approvalText}`
            }
          ];

          const newTimeline = [
            ...(rec.timeline || []),
            {
              id: `tl-${Date.now()}`,
              action: "Approved by AICTE",
              actor: reviewer,
              role: "AICTE Administrator",
              timestamp: now,
              remarks: approvalText
            }
          ];

          updatedRec = {
            ...rec,
            status: "Approved",
            lifecycleStatus: "Active",
            lastUpdated: now,
            remarks: approvalText,
            remarksHistory: newRemarksHistory,
            timeline: newTimeline
          };
          return updatedRec;
        }
        return rec;
      })
    );

    // If this was a replacement FDR, also update the original FDR!
    if (updatedRec && updatedRec.replacesFdrId) {
      setRecords((prev) =>
        prev.map((r) => {
          if (r.id === updatedRec.replacesFdrId) {
            return {
              ...r,
              lifecycleStatus: "Superceded / Replaced",
              status: "Superceded",
              lastUpdated: now,
              timeline: [
                ...(r.timeline || []),
                {
                  id: `tl-${Date.now()}-sup`,
                  action: "Superceded by Replacement",
                  actor: reviewer,
                  role: "AICTE Administrator",
                  timestamp: now,
                  remarks: `Superceded by approved replacement FDR ${updatedRec.fdrNumber} (${updatedRec.id}).`
                }
              ]
            };
          }
          return r;
        })
      );
    }

    if (updatedRec) {
      addNotification({
        recipientRole: "college",
        title: "FDR Approved",
        message: `Your FDR ${updatedRec.fdrNumber} (₹${updatedRec.amount}) has been Approved by AICTE Scrutiny Bureau.`,
        fdrId: updatedRec.id,
        fdrNumber: updatedRec.fdrNumber,
        type: "success"
      });
    }

    return updatedRec;
  };

  /**
   * AICTE Action: Reject FDR
   */
  const rejectFDR = (fdrId, reason, reviewer = "Er. V. K. Verma (Senior Scrutiny Officer)") => {
    if (!reason || !reason.trim()) {
      throw new Error("A specific rejection reason is mandatory.");
    }

    const now = new Date().toISOString();
    let updatedRec = null;

    setRecords((prev) =>
      prev.map((rec) => {
        if (rec.id === fdrId) {
          const rejectionText = reason.trim();
          const newRemarksHistory = [
            ...(rec.remarksHistory || []),
            {
              id: `rmk-${Date.now()}`,
              author: reviewer,
              role: "AICTE Administrator",
              timestamp: now,
              text: `REJECTION: ${rejectionText}`
            }
          ];

          const newTimeline = [
            ...(rec.timeline || []),
            {
              id: `tl-${Date.now()}`,
              action: "Rejected by AICTE",
              actor: reviewer,
              role: "AICTE Administrator",
              timestamp: now,
              remarks: rejectionText
            }
          ];

          updatedRec = {
            ...rec,
            status: "Rejected",
            lastUpdated: now,
            remarks: rejectionText,
            remarksHistory: newRemarksHistory,
            timeline: newTimeline
          };
          return updatedRec;
        }
        return rec;
      })
    );

    if (updatedRec) {
      addNotification({
        recipientRole: "college",
        title: "FDR Rejected by AICTE",
        message: `FDR ${updatedRec.fdrNumber} was Rejected: "${reason}". Please review remarks and resubmit.`,
        fdrId: updatedRec.id,
        fdrNumber: updatedRec.fdrNumber,
        type: "error"
      });
    }

    return updatedRec;
  };

  /**
   * AICTE Action: Raise Query
   */
  const raiseQueryFDR = (fdrId, queryMessage, reviewer = "Er. V. K. Verma (Senior Scrutiny Officer)") => {
    if (!queryMessage || !queryMessage.trim()) {
      throw new Error("Query message is required.");
    }

    const now = new Date().toISOString();
    let updatedRec = null;

    setRecords((prev) =>
      prev.map((rec) => {
        if (rec.id === fdrId) {
          const queryText = queryMessage.trim();
          const newRemarksHistory = [
            ...(rec.remarksHistory || []),
            {
              id: `rmk-${Date.now()}`,
              author: reviewer,
              role: "AICTE Administrator",
              timestamp: now,
              text: `QUERY: ${queryText}`
            }
          ];

          const newTimeline = [
            ...(rec.timeline || []),
            {
              id: `tl-${Date.now()}`,
              action: "Query Raised by AICTE",
              actor: reviewer,
              role: "AICTE Administrator",
              timestamp: now,
              remarks: queryText
            }
          ];

          updatedRec = {
            ...rec,
            status: "Query Raised",
            lastUpdated: now,
            remarks: queryText,
            remarksHistory: newRemarksHistory,
            timeline: newTimeline
          };
          return updatedRec;
        }
        return rec;
      })
    );

    if (updatedRec) {
      addNotification({
        recipientRole: "college",
        title: "Clarification Query Raised",
        message: `AICTE Scrutiny Officer raised a query on FDR ${updatedRec.fdrNumber}: "${queryMessage}"`,
        fdrId: updatedRec.id,
        fdrNumber: updatedRec.fdrNumber,
        type: "warning"
      });
    }

    return updatedRec;
  };

  /**
   * College Action: Resubmit Query or Rejection
   */
  const resubmitFDR = (id, resubmissionNote, updatedData = {}, authorName = "Dr. Rameshwar Sharma") => {
    const now = new Date().toISOString();
    let updatedRecord = null;

    setRecords((prev) =>
      prev.map((rec) => {
        if (rec.id === id) {
          const responseText = resubmissionNote.trim() || "Compliance documents and clarification provided.";
          const newHistory = [
            ...(rec.remarksHistory || []),
            {
              id: `rmk-${Date.now()}`,
              author: `${authorName} (College Admin)`,
              role: "College Administrator",
              timestamp: now,
              text: `College Compliance Response: ${responseText}`
            }
          ];

          const newTimeline = [
            ...(rec.timeline || []),
            {
              id: `tl-${Date.now()}`,
              action: "Resubmitted with Compliance",
              actor: authorName,
              role: "College Administrator",
              timestamp: now,
              remarks: responseText
            }
          ];

          updatedRecord = {
            ...rec,
            ...updatedData,
            status: "Pending Verification",
            lastUpdated: now,
            submissionDate: now,
            remarks: `Resubmitted on ${new Date().toLocaleDateString("en-IN")}. Awaiting AICTE re-scrutiny.`,
            remarksHistory: newHistory,
            timeline: newTimeline
          };
          return updatedRecord;
        }
        return rec;
      })
    );

    if (updatedRecord) {
      addNotification({
        recipientRole: "aicte",
        title: "FDR Resubmitted by College",
        message: `${updatedRecord.institutionName} resubmitted FDR ${updatedRecord.fdrNumber} with compliance notes.`,
        fdrId: updatedRecord.id,
        fdrNumber: updatedRecord.fdrNumber,
        type: "info"
      });
    }

    return updatedRecord;
  };

  /**
   * Feature 3: Renewal / Replacement Workflow
   * College submits replacement for an approved instrument
   */
  const submitReplacementFDR = (originalFdrId, replacementData, authorName = "Dr. Rameshwar Sharma") => {
    const now = new Date().toISOString();
    const originalFdr = records.find((r) => r.id === originalFdrId);
    if (!originalFdr) throw new Error("Original FDR record not found.");

    const newId = generateFdrId();
    const newReplacementRecord = {
      id: newId,
      institutionId: originalFdr.institutionId,
      institutionName: originalFdr.institutionName,
      fdrNumber: replacementData.newFdrNumber.trim(),
      instrumentType: replacementData.instrumentType || "Fixed Deposit Receipt",
      issuingBank: replacementData.issuingBank,
      bankBranch: replacementData.bankBranch,
      amount: Number(replacementData.amount),
      issueDate: replacementData.issueDate,
      maturityDate: replacementData.maturityDate,
      submissionDate: now,
      lastUpdated: now,
      beneficiary: replacementData.beneficiary || originalFdr.beneficiary,
      purpose: `Renewal / Replacement of ${originalFdr.fdrNumber}: ${replacementData.purpose || originalFdr.purpose}`,
      status: "Pending Verification",
      lifecycleStatus: "Verification Pending",
      isReplacement: true,
      replacesFdrId: originalFdr.id,
      replacesFdrNumber: originalFdr.fdrNumber,
      remarks: `Replacement instrument submitted to renew ${originalFdr.fdrNumber}. Reason: ${replacementData.remarks || "Mandatory roll-over"}`,
      remarksHistory: [
        {
          id: `rmk-${Date.now()}`,
          author: authorName,
          role: "College Administrator",
          timestamp: now,
          text: `Submitted replacement for FDR ${originalFdr.fdrNumber} (New Ref: ${replacementData.newFdrNumber}).`
        }
      ],
      timeline: [
        {
          id: `tl-${Date.now()}`,
          action: "Renewal / Replacement Submitted",
          actor: authorName,
          role: "College Administrator",
          timestamp: now,
          remarks: `Submitted new replacement FDR ${replacementData.newFdrNumber} for original ${originalFdr.fdrNumber}.`
        }
      ],
      document: replacementData.document || null
    };

    // Update original record status to "Renewal Pending"
    const updatedOriginal = {
      ...originalFdr,
      replacedByFdrId: newId,
      replacedByFdrNumber: replacementData.newFdrNumber.trim(),
      lifecycleStatus: "Renewal Pending",
      isRenewalPending: true,
      lastUpdated: now,
      timeline: [
        ...(originalFdr.timeline || []),
        {
          id: `tl-${Date.now()}-orig`,
          action: "Replacement Initiated",
          actor: authorName,
          role: "College Administrator",
          timestamp: now,
          remarks: `Replacement submitted under ${newId} (${replacementData.newFdrNumber}). Awaiting AICTE approval.`
        }
      ]
    };

    setRecords((prev) => [
      newReplacementRecord,
      ...prev.map((r) => (r.id === originalFdrId ? updatedOriginal : r))
    ]);

    // Also add bank confirmation ticket for replacement
    const newConfirmation = {
      id: `BC-${Date.now().toString().slice(-6)}`,
      fdrId: newId,
      fdrReference: replacementData.newFdrNumber.trim(),
      institutionName: originalFdr.institutionName,
      bank: replacementData.issuingBank,
      branch: replacementData.bankBranch,
      submittedAmount: Number(replacementData.amount),
      verifiedAmount: Number(replacementData.amount), // Pre-seeded matching for replacement test
      submittedIssueDate: replacementData.issueDate,
      verifiedIssueDate: replacementData.issueDate,
      submittedMaturityDate: replacementData.maturityDate,
      verifiedMaturityDate: replacementData.maturityDate,
      lienMarked: true,
      lienFavouring: originalFdr.beneficiary,
      confirmationStatus: "Confirmed by Bank (SFMS/API)",
      matchStatus: "match",
      lastChecked: now,
      verificationMethod: "Renewal SFMS Inter-Bank Advisory",
      bankReferenceNumber: `SFMS-REN-${Date.now().toString().slice(-6)}`,
      officerRemarks: "Replacement instrument verified against SFMS rollover certificate.",
      notes: "Automatic SFMS match for renewal instrument."
    };
    setBankConfirmations((prev) => [newConfirmation, ...prev]);

    addNotification({
      recipientRole: "aicte",
      title: "Replacement FDR Submitted",
      message: `${originalFdr.institutionName} submitted replacement FDR ${replacementData.newFdrNumber} for original ${originalFdr.fdrNumber}.`,
      fdrId: newId,
      fdrNumber: replacementData.newFdrNumber.trim(),
      type: "info"
    });

    return newReplacementRecord;
  };

  /**
   * Feature 4: Release / Refund Workflow
   * College initiates release request
   */
  const requestFDRRelease = (fdrId, reason, remarks = "", requestedBy = "Dr. Rameshwar Sharma") => {
    const now = new Date().toISOString();
    let updated = null;

    setRecords((prev) =>
      prev.map((rec) => {
        if (rec.id === fdrId) {
          const releaseData = {
            status: "Pending Approval",
            reason: reason.trim(),
            remarks: remarks.trim(),
            requestedBy,
            requestedDate: now
          };

          const newTimeline = [
            ...(rec.timeline || []),
            {
              id: `tl-${Date.now()}`,
              action: "Release / Refund Requested",
              actor: requestedBy,
              role: "College Administrator",
              timestamp: now,
              remarks: `Initiated release request: ${reason}. Remarks: ${remarks || "None"}`
            }
          ];

          updated = {
            ...rec,
            releaseRequest: releaseData,
            lastUpdated: now,
            timeline: newTimeline
          };
          return updated;
        }
        return rec;
      })
    );

    if (updated) {
      addNotification({
        recipientRole: "aicte",
        title: "FDR Release Requested",
        message: `${updated.institutionName} requested Release / Refund of FDR ${updated.fdrNumber} (₹${updated.amount}).`,
        fdrId: updated.id,
        fdrNumber: updated.fdrNumber,
        type: "warning"
      });
    }

    return updated;
  };

  /**
   * AICTE Action: Approve Release Request
   */
  const approveFDRRelease = (fdrId, remarks = "", approvedBy = "Er. V. K. Verma (Senior Scrutiny Officer)") => {
    const now = new Date().toISOString();
    let updated = null;

    setRecords((prev) =>
      prev.map((rec) => {
        if (rec.id === fdrId) {
          const approvalText = remarks.trim() || "Release approved upon completion of mandatory regulatory tenure.";

          const updatedRelease = {
            ...(rec.releaseRequest || {}),
            status: "Approved",
            approvedBy,
            approvalDate: now,
            approvalRemarks: approvalText
          };

          const newTimeline = [
            ...(rec.timeline || []),
            {
              id: `tl-${Date.now()}`,
              action: "Release Approved by AICTE",
              actor: approvedBy,
              role: "AICTE Administrator",
              timestamp: now,
              remarks: approvalText
            }
          ];

          updated = {
            ...rec,
            status: "Released",
            lifecycleStatus: "Released",
            releaseRequest: updatedRelease,
            lastUpdated: now,
            remarks: `Instrument released on ${new Date().toLocaleDateString("en-IN")}. Lien revoked in favour of institution.`,
            timeline: newTimeline
          };
          return updated;
        }
        return rec;
      })
    );

    if (updated) {
      addNotification({
        recipientRole: "college",
        title: "FDR Release Approved",
        message: `AICTE Approved Release of FDR ${updated.fdrNumber} (₹${updated.amount}). Institutional lien revoked.`,
        fdrId: updated.id,
        fdrNumber: updated.fdrNumber,
        type: "success"
      });
    }

    return updated;
  };

  /**
   * AICTE Action: Reject Release Request
   */
  const rejectFDRRelease = (fdrId, rejectionReason, rejectedBy = "Er. V. K. Verma (Senior Scrutiny Officer)") => {
    if (!rejectionReason || !rejectionReason.trim()) {
      throw new Error("Rejection reason is mandatory.");
    }

    const now = new Date().toISOString();
    let updated = null;

    setRecords((prev) =>
      prev.map((rec) => {
        if (rec.id === fdrId) {
          const reasonText = rejectionReason.trim();

          const updatedRelease = {
            ...(rec.releaseRequest || {}),
            status: "Rejected",
            rejectedBy,
            rejectionDate: now,
            rejectionReason: reasonText
          };

          const newTimeline = [
            ...(rec.timeline || []),
            {
              id: `tl-${Date.now()}`,
              action: "Release Request Rejected by AICTE",
              actor: rejectedBy,
              role: "AICTE Administrator",
              timestamp: now,
              remarks: `Release rejected: ${reasonText}`
            }
          ];

          updated = {
            ...rec,
            releaseRequest: updatedRelease,
            lastUpdated: now,
            timeline: newTimeline
          };
          return updated;
        }
        return rec;
      })
    );

    if (updated) {
      addNotification({
        recipientRole: "college",
        title: "Release Request Rejected",
        message: `AICTE rejected release of FDR ${updated.fdrNumber}: "${rejectionReason}". Instrument remains in regulatory lien.`,
        fdrId: updated.id,
        fdrNumber: updated.fdrNumber,
        type: "error"
      });
    }

    return updated;
  };

  /**
   * Feature 1: Manual Bank Confirmation Review & Reconciliation
   */
  const reconcileBankConfirmation = (confirmationId, reviewOutcome, reviewNotes, officerName = "Er. V. K. Verma") => {
    const now = new Date().toISOString();
    let updatedConf = null;

    setBankConfirmations((prev) =>
      prev.map((bc) => {
        if (bc.id === confirmationId) {
          updatedConf = {
            ...bc,
            matchStatus: reviewOutcome === "reconciled" ? "match" : bc.matchStatus,
            confirmationStatus: reviewOutcome === "reconciled" ? "Manually Reconciled" : bc.confirmationStatus,
            lastChecked: now,
            manualReview: {
              outcome: reviewOutcome,
              notes: reviewNotes.trim(),
              officer: officerName,
              timestamp: now
            }
          };
          return updatedConf;
        }
        return bc;
      })
    );

    if (updatedConf) {
      // Append note to linked FDR record timeline
      setRecords((prev) =>
        prev.map((r) => {
          if (r.id === updatedConf.fdrId || r.fdrNumber === updatedConf.fdrReference) {
            return {
              ...r,
              timeline: [
                ...(r.timeline || []),
                {
                  id: `tl-${Date.now()}-recon`,
                  action: "Bank Record Manually Reconciled",
                  actor: officerName,
                  role: "AICTE Administrator",
                  timestamp: now,
                  remarks: `Manual reconciliation recorded: ${reviewNotes.trim()}`
                }
              ]
            };
          }
          return r;
        })
      );
    }

    return updatedConf;
  };

  const deleteDraft = (id) => {
    setRecords((prev) => prev.filter((r) => !(r.id === id && r.status === "Draft")));
  };

  const checkDuplicateFdrNumber = (fdrNumber, excludeId = null) => {
    if (!fdrNumber) return false;
    const clean = fdrNumber.trim().toLowerCase();
    return records.some(
      (r) => r.id !== excludeId && r.fdrNumber.trim().toLowerCase() === clean
    );
  };

  const resetDemoData = () => {
    localStorage.removeItem(STORAGE_KEYS.FDR_RECORDS);
    localStorage.removeItem(STORAGE_KEYS.BANK_CONFIRMATIONS);
    localStorage.removeItem(STORAGE_KEYS.NOTIFICATIONS);
    setRecords(INITIAL_FDR_RECORDS);
    setBankConfirmations(INITIAL_BANK_CONFIRMATIONS);
    setNotifications(INITIAL_NOTIFICATIONS);
  };

  return (
    <FDRContext.Provider
      value={{
        records,
        bankConfirmations,
        notifications,
        stats,
        statusDistribution,
        pendingVerificationQueue,
        pendingReleaseQueue,
        pendingRenewalQueue,
        upcomingMaturityWatchlist,
        maturedInstrumentsList,
        recentSubmissions,
        recentRemarksFeed,
        maturityThreshold,
        setMaturityThreshold,
        addFDR,
        updateFDR,
        approveFDR,
        rejectFDR,
        raiseQueryFDR,
        resubmitFDR,
        submitReplacementFDR,
        requestFDRRelease,
        approveFDRRelease,
        rejectFDRRelease,
        reconcileBankConfirmation,
        deleteDraft,
        checkDuplicateFdrNumber,
        addNotification,
        markNotificationAsRead,
        markAllNotificationsAsRead,
        resetDemoData
      }}
    >
      {children}
    </FDRContext.Provider>
  );
};

export const useFDR = () => {
  const context = useContext(FDRContext);
  if (!context) {
    throw new Error("useFDR must be used within an FDRProvider");
  }
  return context;
};
