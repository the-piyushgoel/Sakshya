/**
 * Seed data for AICTE Security Deposit / FDR Portal
 * Contains realistic fixtures for college and AICTE verification, bank reconciliation,
 * maturity tracking, renewal/replacement, and release workflows.
 * All entries are fictional simulation data.
 */

export const INITIAL_FDR_RECORDS = [
  {
    id: "FDR-2024-001",
    institutionId: "1-394829104",
    institutionName: "KIET Deemed to be University",
    fdrNumber: "SBI/FDR/2024/991204",
    instrumentType: "Fixed Deposit Receipt",
    issuingBank: "State Bank of India",
    bankBranch: "Institutional Branch, Meerut Road, Ghaziabad (IFSC: SBIN0004381)",
    amount: 5000000, // 50 Lakhs
    issueDate: "2024-03-15",
    maturityDate: "2029-03-15",
    submissionDate: "2024-03-20T10:30:00Z",
    lastUpdated: "2024-03-25T14:15:00Z",
    beneficiary: "Member Secretary, AICTE, New Delhi & Registrar, KIET Deemed to be University",
    purpose: "Establishment of Technical University (Core Reserve Deposit)",
    status: "Approved",
    lifecycleStatus: "Active",
    remarks: "Joint lien marked in favor of AICTE verified. Deposit term conforms to AICTE Approval Process Handbook (APH 2024-27).",
    remarksHistory: [
      {
        id: "rmk-1",
        author: "Er. V. K. Verma (Senior Scrutiny Officer)",
        role: "AICTE Administrator",
        timestamp: "2024-03-25T14:15:00Z",
        text: "Physical FDR scan verified against Bank SFMS advisory. Lien noted successfully. Security deposit requirement satisfied for 5 years."
      }
    ],
    timeline: [
      {
        id: "tl-1a",
        action: "Draft Created",
        actor: "Dr. Rameshwar Sharma",
        role: "College Administrator",
        timestamp: "2024-03-18T09:00:00Z",
        remarks: "Initial FDR entry drafted from SBI branch receipt."
      },
      {
        id: "tl-1b",
        action: "Submitted for Verification",
        actor: "Dr. Rameshwar Sharma",
        role: "College Administrator",
        timestamp: "2024-03-20T10:30:00Z",
        remarks: "Submitted FDR record along with scanned certificate."
      },
      {
        id: "tl-1c",
        action: "Approved by AICTE",
        actor: "Er. V. K. Verma",
        role: "AICTE Administrator",
        timestamp: "2024-03-25T14:15:00Z",
        remarks: "Joint lien marked in favor of AICTE verified. SFMS confirmation matched."
      }
    ],
    document: {
      name: "SBI_FDR_Certificate_50L.pdf",
      size: "1.4 MB",
      type: "application/pdf",
      uploadDate: "2024-03-20T10:30:00Z",
      mockUrl: "https://example.com/docs/SBI_FDR_Certificate_50L.pdf",
      isSample: true
    }
  },
  {
    id: "FDR-2026-002",
    institutionId: "1-394829104",
    institutionName: "KIET Deemed to be University",
    fdrNumber: "PNB/FD/2026/410291",
    instrumentType: "Fixed Deposit Receipt",
    issuingBank: "Punjab National Bank",
    bankBranch: "Connaught Place Branch, New Delhi (IFSC: PUNB0014200)",
    amount: 2500000, // 25 Lakhs
    issueDate: "2026-01-15",
    maturityDate: "2031-01-15",
    submissionDate: "2026-02-05T09:15:00Z",
    lastUpdated: "2026-02-05T09:15:00Z",
    beneficiary: "Member Secretary, AICTE New Delhi & Director, KIET",
    purpose: "Course Expansion: New B.Tech Division in Artificial Intelligence & Data Science (60 Seats)",
    status: "Pending Verification",
    lifecycleStatus: "Verification Pending",
    remarks: "Submitted by institution. Queued for AICTE Regional Scrutiny Officer verification and bank API reconciliation.",
    remarksHistory: [
      {
        id: "rmk-2",
        author: "Dr. Rameshwar Sharma",
        role: "College Administrator",
        timestamp: "2026-02-05T09:15:00Z",
        text: "FDR submitted along with Bank Letter of Lien creation in favour of AICTE for AI/DS intake expansion."
      }
    ],
    timeline: [
      {
        id: "tl-2a",
        action: "Submitted for Verification",
        actor: "Dr. Rameshwar Sharma",
        role: "College Administrator",
        timestamp: "2026-02-05T09:15:00Z",
        remarks: "Submitted FDR record for amount ₹25,00,000. Document attached."
      }
    ],
    document: {
      name: "PNB_25L_FDR_AICTE_Expansion.pdf",
      size: "890 KB",
      type: "application/pdf",
      uploadDate: "2026-02-05T09:15:00Z",
      mockUrl: "https://example.com/docs/PNB_25L_FDR_AICTE_Expansion.pdf",
      isSample: true
    }
  },
  {
    id: "FDR-2025-003",
    institutionId: "1-394829104",
    institutionName: "KIET Deemed to be University",
    fdrNumber: "CNB/FDR/2025/778103",
    instrumentType: "Term Deposit",
    issuingBank: "Canara Bank",
    bankBranch: "Muradnagar Branch, Ghaziabad (IFSC: CNRB0002890)",
    amount: 1500000, // 15 Lakhs
    issueDate: "2025-10-10",
    maturityDate: "2030-10-10",
    submissionDate: "2025-11-01T11:45:00Z",
    lastUpdated: "2025-11-12T16:20:00Z",
    beneficiary: "Member Secretary, AICTE & Registrar, KIET Deemed to be University",
    purpose: "Establishment of PG MCA Course Expansion",
    status: "Query Raised",
    lifecycleStatus: "Verification Pending",
    remarks: "Bank Lien Confirmation clause is missing from the FDR face. Clause 4.2 of APH requires joint operation or lien marked explicitly in favor of AICTE. Please request the issuing branch to endorse the lien and resubmit.",
    remarksHistory: [
      {
        id: "rmk-3",
        author: "Er. V. K. Verma (Senior Scrutiny Officer)",
        role: "AICTE Administrator",
        timestamp: "2025-11-12T16:20:00Z",
        text: "Deficiency noted: The submitted FDR does not contain the mandatory AICTE lien endorsement stamp from Canara Bank. Please upload an amended receipt or Bank Lien Confirmation certificate."
      }
    ],
    timeline: [
      {
        id: "tl-3a",
        action: "Submitted for Verification",
        actor: "Dr. Rameshwar Sharma",
        role: "College Administrator",
        timestamp: "2025-11-01T11:45:00Z",
        remarks: "Initial submission for MCA program security deposit."
      },
      {
        id: "tl-3b",
        action: "Query Raised by AICTE",
        actor: "Er. V. K. Verma",
        role: "AICTE Administrator",
        timestamp: "2025-11-12T16:20:00Z",
        remarks: "Deficiency noted: The submitted FDR does not contain mandatory AICTE lien endorsement stamp."
      }
    ],
    document: {
      name: "CanaraBank_15Lakhs_FDR_MCA.pdf",
      size: "1.2 MB",
      type: "application/pdf",
      uploadDate: "2025-11-01T11:45:00Z",
      mockUrl: "https://example.com/docs/CanaraBank_15Lakhs_FDR_MCA.pdf",
      isSample: true
    }
  },
  {
    id: "FDR-2021-004",
    institutionId: "1-394829104",
    institutionName: "KIET Deemed to be University",
    fdrNumber: "HDFC/FD/2021/883019",
    instrumentType: "Fixed Deposit Receipt",
    issuingBank: "HDFC Bank",
    bankBranch: "Kailash Colony, New Delhi (IFSC: HDFC0000043)",
    amount: 3500000, // 35 Lakhs
    issueDate: "2021-04-10",
    maturityDate: "2026-09-15", // Passed maturity date (approx 42 days ago) -> Matured but NOT automatically released!
    submissionDate: "2021-04-18T14:00:00Z",
    lastUpdated: "2026-10-20T10:00:00Z",
    beneficiary: "Member Secretary, AICTE New Delhi",
    purpose: "Mandatory Regulatory Reserve for Polytechnic Diploma Division",
    status: "Approved",
    lifecycleStatus: "Matured",
    remarks: "Instrument matured on 15 Sep 2026. Action required: Institution must initiate formal Release/Refund Request or submit Renewal/Replacement.",
    remarksHistory: [
      {
        id: "rmk-4",
        author: "AICTE Regulatory Cell",
        role: "AICTE Administrator",
        timestamp: "2021-04-28T16:00:00Z",
        text: "Approved for 5 year regulatory reserve period."
      }
    ],
    timeline: [
      {
        id: "tl-4a",
        action: "Submitted for Verification",
        actor: "Dr. Rameshwar Sharma",
        role: "College Administrator",
        timestamp: "2021-04-18T14:00:00Z",
        remarks: "Original submission approved in 2021."
      },
      {
        id: "tl-4b",
        action: "Approved by AICTE",
        actor: "AICTE Approval Bureau",
        role: "AICTE Administrator",
        timestamp: "2021-04-28T16:00:00Z",
        remarks: "Approved for 5 year regulatory period."
      }
    ],
    document: {
      name: "HDFC_35L_Regulatory_Deposit.pdf",
      size: "950 KB",
      type: "application/pdf",
      uploadDate: "2021-04-18T14:00:00Z",
      mockUrl: "https://example.com/docs/HDFC_35L_Regulatory_Deposit.pdf",
      isSample: true
    }
  },
  {
    id: "FDR-2021-007",
    institutionId: "1-394829104",
    institutionName: "KIET Deemed to be University",
    fdrNumber: "BOI/FD/2021/304918",
    instrumentType: "Fixed Deposit Receipt",
    issuingBank: "Bank of India",
    bankBranch: "Ghaziabad Main Branch (IFSC: BKID0006901)",
    amount: 3000000, // 30 Lakhs
    issueDate: "2021-11-15",
    maturityDate: "2026-11-15", // Maturing in 19 days -> Expiring Soon (< 30 days)
    submissionDate: "2021-11-20T10:00:00Z",
    lastUpdated: "2026-10-10T12:00:00Z",
    beneficiary: "Member Secretary, AICTE New Delhi",
    purpose: "Pharmacy Division Establishment Reserve",
    status: "Approved",
    lifecycleStatus: "Expiring Soon",
    remarks: "Instrument approaching maturity window (< 30 days). Institution advised to prepare renewal or roll-over.",
    remarksHistory: [
      {
        id: "rmk-7",
        author: "AICTE Approval Bureau",
        role: "AICTE Administrator",
        timestamp: "2021-11-28T14:00:00Z",
        text: "Approved for 5 year period."
      }
    ],
    timeline: [
      {
        id: "tl-7a",
        action: "Approved by AICTE",
        actor: "AICTE Approval Bureau",
        role: "AICTE Administrator",
        timestamp: "2021-11-28T14:00:00Z",
        remarks: "Initial regulatory deposit approved."
      }
    ],
    document: {
      name: "BOI_30L_Pharmacy_Deposit.pdf",
      size: "1.1 MB",
      type: "application/pdf",
      uploadDate: "2021-11-20T10:00:00Z",
      mockUrl: "https://example.com/docs/BOI_30L_Pharmacy_Deposit.pdf",
      isSample: true
    }
  },
  {
    id: "FDR-2025-006",
    institutionId: "1-394829104",
    institutionName: "KIET Deemed to be University",
    fdrNumber: "UBI/FD/2025/551982",
    instrumentType: "Fixed Deposit Receipt",
    issuingBank: "Union Bank of India",
    bankBranch: "Raj Nagar District Centre, Ghaziabad (IFSC: UBIN0538914)",
    amount: 1000000, // 10 Lakhs
    issueDate: "2025-08-14",
    maturityDate: "2030-08-14",
    submissionDate: "2025-09-02T14:10:00Z",
    lastUpdated: "2025-09-18T11:30:00Z",
    beneficiary: "Member Secretary, AICTE New Delhi",
    purpose: "Additional 30 Seats in Mechanical Engineering",
    status: "Rejected",
    lifecycleStatus: "Active",
    remarks: "Rejected: Deposit tenure is 3 years instead of mandatory 5-year lock-in period specified under Regulation 8.4. Resubmission required with revised maturity certificate.",
    remarksHistory: [
      {
        id: "rmk-6",
        author: "Er. V. K. Verma (Senior Scrutiny Officer)",
        role: "AICTE Administrator",
        timestamp: "2025-09-18T11:30:00Z",
        text: "Rejected: Deposit tenure is 3 years instead of mandatory 5-year lock-in period specified under Regulation 8.4. Resubmission required with revised maturity certificate."
      }
    ],
    timeline: [
      {
        id: "tl-6a",
        action: "Submitted for Verification",
        actor: "Dr. Rameshwar Sharma",
        role: "College Administrator",
        timestamp: "2025-09-02T14:10:00Z",
        remarks: "Submitted for intake addition in Mechanical Engineering."
      },
      {
        id: "tl-6b",
        action: "Rejected by AICTE",
        actor: "Er. V. K. Verma",
        role: "AICTE Administrator",
        timestamp: "2025-09-18T11:30:00Z",
        remarks: "Deposit tenure is 3 years instead of mandatory 5-year lock-in period specified under Regulation 8.4."
      }
    ],
    document: {
      name: "UnionBank_10L_FDR_Mechanical.pdf",
      size: "820 KB",
      type: "application/pdf",
      uploadDate: "2025-09-02T14:10:00Z",
      mockUrl: "https://example.com/docs/UnionBank_10L_FDR_Mechanical.pdf",
      isSample: true
    }
  },
  {
    id: "FDR-2026-005",
    institutionId: "1-394829104",
    institutionName: "KIET Deemed to be University",
    fdrNumber: "BOB/FD/2026/102948",
    instrumentType: "Fixed Deposit Receipt",
    issuingBank: "Bank of Baroda",
    bankBranch: "Sector 18, Noida (IFSC: BARB0SECNOI)",
    amount: 2000000, // 20 Lakhs
    issueDate: "2026-02-01",
    maturityDate: "2031-02-01",
    submissionDate: null,
    lastUpdated: "2026-02-15T16:30:00Z",
    beneficiary: "Member Secretary, AICTE New Delhi & Director, KIET",
    purpose: "Additional 30 Seats in Automation & Robotics",
    status: "Draft",
    lifecycleStatus: "Draft",
    remarks: "Draft created by College Admin. Pending final scanned FDR certificate upload from finance department.",
    remarksHistory: [],
    timeline: [
      {
        id: "tl-5a",
        action: "Draft Created",
        actor: "Dr. Rameshwar Sharma",
        role: "College Administrator",
        timestamp: "2026-02-15T16:30:00Z",
        remarks: "Draft saved by college."
      }
    ],
    document: null
  }
];

export const INITIAL_BANK_CONFIRMATIONS = [
  // Scenario 1: Details match 100%
  {
    id: "BC-2024-001",
    fdrId: "FDR-2024-001",
    fdrReference: "SBI/FDR/2024/991204",
    institutionName: "KIET Deemed to be University",
    bank: "State Bank of India",
    branch: "Institutional Branch, Meerut Road, Ghaziabad",
    submittedAmount: 5000000,
    verifiedAmount: 5000000,
    submittedIssueDate: "2024-03-15",
    verifiedIssueDate: "2024-03-15",
    submittedMaturityDate: "2029-03-15",
    verifiedMaturityDate: "2029-03-15",
    lienMarked: true,
    lienFavouring: "Member Secretary, AICTE New Delhi & Registrar, KIET",
    confirmationStatus: "Confirmed by Bank (SFMS/API)",
    matchStatus: "match", // 'match' | 'mismatch' | 'pending' | 'incomplete' | 'manual'
    lastChecked: "2026-10-25T11:20:00Z",
    verificationMethod: "Structured Financial Messaging System (SFMS-799)",
    bankReferenceNumber: "SFMS-SBI-DEL-89210943",
    officerRemarks: "Full match. Lien noted in bank CBS core banking database. Auto-rollover restricted without AICTE NOC.",
    notes: "Direct bank confirmation received via RBI SFMS gateway."
  },
  // Scenario 2: Amount & Maturity Mismatch
  {
    id: "BC-2026-002",
    fdrId: "FDR-2026-002",
    fdrReference: "PNB/FD/2026/410291",
    institutionName: "KIET Deemed to be University",
    bank: "Punjab National Bank",
    branch: "Connaught Place Branch, New Delhi",
    submittedAmount: 2500000,
    verifiedAmount: 2000000, // MISMATCH: ₹5L lower
    submittedIssueDate: "2026-01-15",
    verifiedIssueDate: "2026-01-15",
    submittedMaturityDate: "2031-01-15",
    verifiedMaturityDate: "2030-01-15", // MISMATCH: 1 year shorter
    lienMarked: false, // MISMATCH: Missing joint lien
    lienFavouring: "KIET Deemed to be University Only (Joint Lien Missing)",
    confirmationStatus: "Amount/Date Mismatch Detected",
    matchStatus: "mismatch",
    lastChecked: "2026-10-26T15:45:00Z",
    verificationMethod: "Bank API Electronic Reconciliation",
    bankReferenceNumber: "PNB-API-ERR-339184",
    officerRemarks: "Discrepancy detected: Institute submitted ₹25,00,000 but bank CBS records deposit principal as ₹20,00,000. Maturity date is 2030-01-15 (submitted as 2031-01-15). Lien in favour of AICTE is not yet recorded on the CBS terminal.",
    notes: "Requires college or issuing branch to clarify difference of ₹5,00,000."
  },
  // Scenario 3: Bank Confirmation Pending / In Transit
  {
    id: "BC-2025-003",
    fdrId: "FDR-2025-003",
    fdrReference: "CNB/FDR/2025/778103",
    institutionName: "KIET Deemed to be University",
    bank: "Canara Bank",
    branch: "Muradnagar Branch, Ghaziabad",
    submittedAmount: 1500000,
    verifiedAmount: null,
    submittedIssueDate: "2025-10-10",
    verifiedIssueDate: null,
    submittedMaturityDate: "2030-10-10",
    verifiedMaturityDate: null,
    lienMarked: null,
    lienFavouring: null,
    confirmationStatus: "Awaiting Bank Response",
    matchStatus: "pending",
    lastChecked: "2026-10-27T08:30:00Z",
    verificationMethod: "Inter-Bank Verification Dispatch Queue",
    bankReferenceNumber: "REQ-CNB-2026-90412",
    officerRemarks: "Confirmation packet dispatched to Canara Bank Nodal Cell. Response pending SLA window (48 hours).",
    notes: "Dispatched on 2026-10-27 08:30 IST. Awaiting response packet."
  },
  // Scenario 4: Missing / Incomplete Data
  {
    id: "BC-2025-004",
    fdrId: "FDR-2025-006",
    fdrReference: "UBI/FD/2025/551982",
    institutionName: "KIET Deemed to be University",
    bank: "Union Bank of India",
    branch: "Raj Nagar District Centre, Ghaziabad",
    submittedAmount: 1000000,
    verifiedAmount: 1000000,
    submittedIssueDate: "2025-08-14",
    verifiedIssueDate: "2025-08-14",
    submittedMaturityDate: "2030-08-14",
    verifiedMaturityDate: "2028-08-14", // Shorter maturity
    lienMarked: false,
    lienFavouring: "Unspecified Branch Lien",
    confirmationStatus: "Missing / Incomplete Data",
    matchStatus: "incomplete",
    lastChecked: "2026-10-24T14:00:00Z",
    verificationMethod: "Core Banking SFMS Inquiry",
    bankReferenceNumber: "UBI-INQ-991204",
    officerRemarks: "Incomplete data: Mandatory AICTE lien endorsement clause is missing in bank master record.",
    notes: "Requires institutional rectification."
  }
];

export const INITIAL_NOTIFICATIONS = [
  {
    id: "notif-1",
    recipientRole: "aicte",
    title: "New FDR Submission",
    message: "KIET Deemed to be University submitted FDR PNB/FD/2026/410291 (₹25,00,000) for scrutiny.",
    fdrId: "FDR-2026-002",
    fdrNumber: "PNB/FD/2026/410291",
    timestamp: "2026-02-05T09:15:00Z",
    read: false,
    type: "info"
  },
  {
    id: "notif-2",
    recipientRole: "college",
    title: "Instrument Matured",
    message: "FDR HDFC/FD/2021/883019 (₹35,00,000) has matured. You may now submit a Renewal or initiate a Release Request.",
    fdrId: "FDR-2021-004",
    fdrNumber: "HDFC/FD/2021/883019",
    timestamp: "2026-09-16T09:00:00Z",
    read: false,
    type: "warning"
  },
  {
    id: "notif-3",
    recipientRole: "college",
    title: "Maturity Warning (< 30 Days)",
    message: "FDR BOI/FD/2021/304918 (₹30,00,000) matures on 15 Nov 2026. Please prepare replacement or renewal.",
    fdrId: "FDR-2021-007",
    fdrNumber: "BOI/FD/2021/304918",
    timestamp: "2026-10-16T10:00:00Z",
    read: false,
    type: "warning"
  },
  {
    id: "notif-4",
    recipientRole: "college",
    title: "FDR Approved",
    message: "FDR SBI/FDR/2024/991204 (₹50,00,000) has been verified and Approved by AICTE.",
    fdrId: "FDR-2024-001",
    fdrNumber: "SBI/FDR/2024/991204",
    timestamp: "2024-03-25T14:15:00Z",
    read: true,
    type: "success"
  }
];

export const BANK_OPTIONS = [
  "State Bank of India",
  "Punjab National Bank",
  "Canara Bank",
  "Bank of Baroda",
  "Union Bank of India",
  "HDFC Bank",
  "ICICI Bank",
  "Axis Bank",
  "Indian Bank",
  "Bank of India",
  "Kotak Mahindra Bank",
  "Other Scheduled Commercial Bank"
];

export const INSTRUMENT_TYPES = [
  "Fixed Deposit Receipt",
  "Term Deposit",
  "Bank Guarantee in lieu of FDR",
  "Special Term Deposit"
];

export const DEPOSIT_PURPOSES = [
  "Establishment of New Technical Institute (Degree)",
  "Establishment of New Technical Institute (Diploma)",
  "Introduction of New Course / Discipline",
  "Increase in Approved Intake / Additional Division",
  "Change of Site / Location of Institution",
  "Restoration of Intake / Regulatory Reserve",
  "Mandatory Corpus Fund as per AICTE APH"
];

export const RELEASE_REASONS = [
  "Regulatory Reserve Period Completed (5-Year Lock-in Matured)",
  "Formal AICTE Approval Bureau NOC Issued",
  "Course / Discipline Discontinuation Approved by Council",
  "Replacement Security Deposit Submitted and Active",
  "Closure of Institution / Division Compliance Fulfilled"
];
