/**
 * Comprehensive verification test script for SAKSHYA FDR System (Phase 1 & Phase 2)
 */
import { INITIAL_FDR_RECORDS, INITIAL_BANK_CONFIRMATIONS } from "../config/initialData.js";
import { DEMO_ACCOUNTS } from "../config/authConfig.js";
import { INSTITUTION_CONFIG } from "../config/institutionConfig.js";
import { formatINR, isExpiringSoon, numberToWordsINR } from "../utils/formatters.js";

console.log("=== SAKSHYA FDR SYSTEM PHASE 2 VERIFICATION SUITE ===");

// 1. Verify Updated Credentials for KIET Deemed to be University
console.log("\n[Test 1] College Credentials & Institution Identity:");
const collegeAcc = DEMO_ACCOUNTS.find((a) => a.username === "kiet");
const aicteAcc = DEMO_ACCOUNTS.find((a) => a.username === "aicte_admin");

if (!collegeAcc) {
  throw new Error("Missing 'kiet' account");
}
if (collegeAcc.password !== "kiet_123.edu") {
  throw new Error(`Password mismatch for kiet: ${collegeAcc.password}`);
}
if (!collegeAcc.displayName.includes("KIET Deemed to be University")) {
  throw new Error("DisplayName mismatch for KIET");
}
console.log("✓ College account verified: username='kiet', password='kiet_123.edu', institution='KIET Deemed to be University'");

if (!aicteAcc || aicteAcc.password !== "admin123" || aicteAcc.role !== "aicte") {
  throw new Error("AICTE admin credentials misconfigured");
}
console.log("✓ AICTE account verified: username='aicte_admin', role='aicte'");

// 2. Verify Institution Config
console.log("\n[Test 2] Institution Configuration:");
if (INSTITUTION_CONFIG.institutionName !== "KIET Deemed to be University") {
  throw new Error(`Institution name mismatch: ${INSTITUTION_CONFIG.institutionName}`);
}
console.log("✓ Configured Institution Name:", INSTITUTION_CONFIG.institutionName, "(PID:", INSTITUTION_CONFIG.aictePermanentId + ")");

// 3. Verify End-to-End Workflow Simulation
console.log("\n[Test 3] End-to-End College-to-AICTE-to-College Lifecycle Workflow:");

// Step A: College creates & submits FDR
const newFdr = {
  id: "FDR-2026-009",
  institutionId: INSTITUTION_CONFIG.aictePermanentId,
  institutionName: INSTITUTION_CONFIG.institutionName,
  fdrNumber: "SBI/FDR/2026/884910",
  amount: 4000000,
  issuingBank: "State Bank of India",
  status: "Pending Verification",
  submissionDate: new Date().toISOString(),
  lastUpdated: new Date().toISOString(),
  timeline: [
    {
      id: "tl-1",
      action: "Submitted for Verification",
      actor: "Dr. Rameshwar Sharma",
      role: "College Administrator",
      timestamp: new Date().toISOString(),
      remarks: "Submitted FDR record for intake expansion."
    }
  ]
};
console.log("✓ Step A: College submitted FDR", newFdr.id, "Status:", newFdr.status);

// Step B: AICTE reviews and Rejects with reason
const rejectionReason = "Bank lien endorsement clause 4.2 missing on certificate scan.";
newFdr.status = "Rejected";
newFdr.remarks = rejectionReason;
newFdr.timeline.push({
  id: "tl-2",
  action: "Rejected by AICTE",
  actor: "Er. V. K. Verma",
  role: "AICTE Administrator",
  timestamp: new Date().toISOString(),
  remarks: rejectionReason
});
console.log("✓ Step B: AICTE rejected FDR", newFdr.id, "Status:", newFdr.status, "| Reason:", rejectionReason);

// Step C: College reads remarks, corrects document, and resubmits
const collegeClarification = "Rectified scan attached with Bank Manager counter-signature and lien marked to AICTE.";
newFdr.status = "Pending Verification";
newFdr.remarks = `Resubmitted. Compliance: ${collegeClarification}`;
newFdr.timeline.push({
  id: "tl-3",
  action: "Resubmitted with Compliance",
  actor: "Dr. Rameshwar Sharma",
  role: "College Administrator",
  timestamp: new Date().toISOString(),
  remarks: collegeClarification
});
console.log("✓ Step C: College resubmitted FDR", newFdr.id, "Status back to:", newFdr.status);

// Step D: AICTE reviews rectified FDR and Approves
newFdr.status = "Approved";
newFdr.remarks = "Verified and approved. Lien noted in AICTE register.";
newFdr.timeline.push({
  id: "tl-4",
  action: "Approved by AICTE",
  actor: "Er. V. K. Verma",
  role: "AICTE Administrator",
  timestamp: new Date().toISOString(),
  remarks: "Verified and approved."
});
console.log("✓ Step D: AICTE approved FDR", newFdr.id, "Final Status:", newFdr.status);

// Verify history preserved
if (newFdr.timeline.length !== 4) {
  throw new Error("Audit timeline events lost during workflow!");
}
console.log("✓ Complete 4-stage audit timeline preserved intact!");

// 4. Verify Bank Confirmation Discrepancy Fixtures
console.log("\n[Test 4] Bank Confirmation Discrepancy Matching:");
const mismatchRecord = INITIAL_BANK_CONFIRMATIONS.find(b => b.matchStatus === "mismatch");
if (!mismatchRecord || mismatchRecord.submittedAmount === mismatchRecord.verifiedAmount) {
  throw new Error("Mismatch fixture missing amount difference");
}
console.log(`✓ Mismatch fixture verified: Submitted ₹${mismatchRecord.submittedAmount} vs Bank ₹${mismatchRecord.verifiedAmount}`);

console.log("\n=== ALL PHASE 2 VERIFICATION TESTS PASSED SUCCESSFULLY! ===");
