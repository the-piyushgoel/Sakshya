# SAKSHYA – AICTE Security Deposit / FDR Portal
**AICTE Security Deposit & Fixed Deposit Receipt Lifecycle Portal**

---

## 🏛️ Project Overview
**SAKSHYA (सुरक्षा निधि एवं एफडीआर प्रबंधन)** is an institutional, role-scoped web application designed for the All India Council for Technical Education (AICTE). It automates and streamlines the complete verification lifecycle of institutional Fixed Deposit Receipts (FDRs) submitted by universities and colleges for regulatory security deposits.

---

## 🔑 Configured Account Credentials

| Role | Username | Password | Notes |
| :--- | :--- | :--- | :--- |
| **College Administrator** | `kiet` | `kiet_123.edu` | Institutional workspace for **KIET Deemed to be University** (PID: `1-394829104`). Full access to College Dashboard, FDR Register, Add New FDR, Draft editing, and query resubmission. |
| **AICTE Administrator** | `aicte_admin` | `admin123` | Scrutiny Officer workspace for **AICTE Central Regulatory Bureau** (Officer: Er. V. K. Verma). Access to AICTE Scrutiny Dashboard, Pending Verification Queue, Document Review Dossier, SFMS Bank Comparison, and Decision actions. |

---

## 🚀 Running the Project

```bash
# 1. Run the automated Phase 2 verification test suite
npm test

# 2. Start the local development server
npm run dev

# 3. Or build and preview for production
npm run build
npm run preview
```
Access the portal at **`http://localhost:5173`**.

---

## 🔄 End-to-End Verification Workflow

### 1. College Submission
- The college user (`kiet`) registers an FDR via **FDR Register $\rightarrow$ Add New FDR**.
- Fills instrument parameters, verifies Indian numbering in words (e.g. ₹25,00,000 $\rightarrow$ *Twenty Five Lakh Rupees Only*), attaches a scanned certificate, and clicks **Submit for Verification**.
- A unique ID (`FDR-2026-XXX`) is assigned, status becomes `Pending Verification`, and an audit event is appended to the timeline.
- A notification is automatically dispatched to the AICTE Administrator.

### 2. AICTE Scrutiny & Review Dossier
- The AICTE Administrator (`aicte_admin`) logs in and is greeted by the **AICTE Administrative Dashboard**.
- Displays 8 live metrics dynamically calculated from the shared data store:
  - *Total Institutions*, *Total FDRs*, *Pending Verification*, *Approved FDRs*, *Query Raised*, *Rejected*, *Expiring Soon*, and *Total Deposit Value*.
- The submitted FDR immediately appears in the **Pending Verification Queue** with live discrepancy detection.
- Clicking **Review & Decide** opens the comprehensive Scrutiny Dossier:
  - **Tab 1: Bank SFMS Comparison:** Evaluates college-submitted values vs core banking system (CBS) reports. Highlights any discrepancy (e.g. amount variance or unendorsed lien) and displays explicit simulated data labeling.
  - **Tab 2: Submitted Details & Document:** Displays full institutional metadata and an in-browser certificate viewer.
  - **Tab 3: Audit Timeline:** Full lifecycle record of every action, author, and timestamp.

### 3. The Three Administrative Decisions
1. **Approve FDR:**
   - Opens confirmation modal displaying FDR number and institution.
   - If an unresolved bank discrepancy exists, displays an alert requiring explicit acknowledgment.
   - Updates status to `Approved`, stamps reviewer name and remarks, adds audit event, and notifies College.
2. **Reject FDR:**
   - Requires a mandatory rejection reason explaining violated regulations.
   - Updates status to `Rejected`, records reviewer and reason, and notifies College.
3. **Raise Query:**
   - Requires clarification query details.
   - Updates status to `Query Raised`, preserves review history, and notifies College.

### 4. College Resubmission
- The college logs in, opens the rejected or queried FDR, reads the scrutiny remarks, corrects fields or uploads a rectified certificate, adds a compliance explanation, and clicks **Submit for AICTE Re-Scrutiny**.
- The record moves back to `Pending Verification` with the complete audit history preserved and appears in AICTE's pending queue in real time.
