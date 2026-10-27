import React, { useState, useEffect } from "react";
import { useNavigate, useSearchParams, Link, Navigate } from "react-router-dom";
import {
  FilePlus,
  Save,
  Send,
  X,
  Upload,
  FileText,
  AlertCircle,
  Eye,
  Trash2,
  RefreshCw,
  Building2,
  CreditCard,
  Calendar,
  IndianRupee,
  ShieldCheck,
  CheckCircle2,
  Info
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useFDR } from "../context/FDRContext";
import { useToast } from "../context/ToastContext";
import { INSTITUTION_CONFIG } from "../config/institutionConfig";
import { BANK_OPTIONS, INSTRUMENT_TYPES, DEPOSIT_PURPOSES } from "../config/initialData";
import { numberToWordsINR, formatINR } from "../utils/formatters";
import { DocumentPreviewModal } from "../components/modals/DocumentPreviewModal";

export const FDRRegistrationForm = () => {
  const { user, isCollege, isAicte } = useAuth();
  const { addFDR, updateFDR, records, checkDuplicateFdrNumber } = useFDR();
  const { addToast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editId = searchParams.get("editId");

  // Route protection: AICTE administrators cannot create new FDRs (College-only action)
  if (isAicte) {
    return <Navigate to="/fdr-register" replace />;
  }

  // Form states
  const [institutionData, setInstitutionData] = useState({
    institutionName: INSTITUTION_CONFIG.institutionName,
    aictePermanentId: INSTITUTION_CONFIG.aictePermanentId,
    address: INSTITUTION_CONFIG.address,
    state: INSTITUTION_CONFIG.state,
    city: INSTITUTION_CONFIG.city,
    pincode: INSTITUTION_CONFIG.pincode,
    category: INSTITUTION_CONFIG.institutionCategory
  });

  const [formData, setFormData] = useState({
    fdrNumber: "",
    instrumentType: "Fixed Deposit Receipt",
    issuingBank: "State Bank of India",
    bankBranch: "",
    amount: "",
    issueDate: "",
    maturityDate: "",
    beneficiary: `Member Secretary, AICTE New Delhi & Registrar, ${INSTITUTION_CONFIG.institutionName}`,
    purpose: "Establishment of New Technical Institute (Degree)",
    remarks: ""
  });

  const [document, setDocument] = useState(null);
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // If editId is provided, populate the form
  useEffect(() => {
    if (editId) {
      const existing = records.find((r) => r.id === editId);
      if (existing) {
        setFormData({
          fdrNumber: existing.fdrNumber || "",
          instrumentType: existing.instrumentType || "Fixed Deposit Receipt",
          issuingBank: existing.issuingBank || "State Bank of India",
          bankBranch: existing.bankBranch || "",
          amount: existing.amount ? String(existing.amount) : "",
          issueDate: existing.issueDate || "",
          maturityDate: existing.maturityDate || "",
          beneficiary: existing.beneficiary || "",
          purpose: existing.purpose || "Establishment of New Technical Institute (Degree)",
          remarks: existing.remarks || ""
        });
        if (existing.document) {
          setDocument(existing.document);
        }
      }
    }
  }, [editId, records]);

  // Handle inputs
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: null }));
    }
  };

  // Document upload handler
  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setErrors((prev) => ({
        ...prev,
        document: "File size exceeds 5MB limit. Please attach an optimized document."
      }));
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const docObj = {
        name: file.name,
        size: `${(file.size / 1024).toFixed(1)} KB`,
        type: file.type || (file.name.endsWith(".pdf") ? "application/pdf" : "image/jpeg"),
        uploadDate: new Date().toISOString(),
        dataUrl: reader.result,
        isSample: false
      };
      setDocument(docObj);
      setErrors((prev) => ({ ...prev, document: null }));
    };
    reader.onerror = () => {
      setErrors((prev) => ({ ...prev, document: "Failed to read file. Please try again." }));
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveDocument = () => {
    setDocument(null);
  };

  // Validation function
  const validate = (isSubmittingFinal = true) => {
    const newErrors = {};

    if (isSubmittingFinal) {
      if (!formData.fdrNumber.trim()) {
        newErrors.fdrNumber = "FDR reference number is required.";
      } else if (checkDuplicateFdrNumber(formData.fdrNumber, editId)) {
        newErrors.fdrNumber = `FDR reference '${formData.fdrNumber}' already exists in register.`;
      }

      if (!formData.issuingBank) {
        newErrors.issuingBank = "Please select the issuing bank.";
      }

      if (!formData.bankBranch.trim()) {
        newErrors.bankBranch = "Bank branch and IFSC code are required.";
      }

      if (!formData.amount || isNaN(formData.amount) || Number(formData.amount) <= 0) {
        newErrors.amount = "Please enter a valid deposit amount in Rupees.";
      }

      if (!formData.issueDate) {
        newErrors.issueDate = "Issue date is required.";
      }

      if (!formData.maturityDate) {
        newErrors.maturityDate = "Maturity date is required.";
      } else if (formData.issueDate && new Date(formData.maturityDate) <= new Date(formData.issueDate)) {
        newErrors.maturityDate = "Maturity date must be after the issue date.";
      }

      if (!formData.beneficiary.trim()) {
        newErrors.beneficiary = "Favouring authority / beneficiary is required.";
      }

      if (!formData.purpose.trim()) {
        newErrors.purpose = "Purpose of deposit is required.";
      }

      if (!document) {
        newErrors.document = "Scanned FDR certificate document (PDF/Image) is required for verification.";
      }
    } else {
      if (!formData.fdrNumber.trim()) {
        newErrors.fdrNumber = "Please enter at least an FDR reference to save as Draft.";
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Handle Save Draft
  const handleSaveDraft = () => {
    if (!validate(false)) {
      addToast({
        title: "Draft Incomplete",
        message: "Please enter an FDR reference number to save this draft.",
        type: "warning"
      });
      return;
    }

    setIsSubmitting(true);

    const payload = {
      institutionId: institutionData.aictePermanentId,
      institutionName: institutionData.institutionName,
      fdrNumber: formData.fdrNumber,
      instrumentType: formData.instrumentType,
      issuingBank: formData.issuingBank,
      bankBranch: formData.bankBranch || "Branch Details Pending",
      amount: formData.amount ? Number(formData.amount) : 0,
      issueDate: formData.issueDate || new Date().toISOString().split("T")[0],
      maturityDate: formData.maturityDate || "",
      beneficiary: formData.beneficiary,
      purpose: formData.purpose,
      remarks: formData.remarks || "Draft saved by college.",
      document: document || null,
      authorName: user?.fullName || "Dr. Rameshwar Sharma"
    };

    if (editId) {
      updateFDR(editId, payload, true);
    } else {
      addFDR(payload, true);
    }

    addToast({
      title: "Draft Saved",
      message: `FDR ${formData.fdrNumber} saved to Drafts in FDR Register.`,
      type: "info"
    });

    setIsSubmitting(false);
    navigate("/fdr-register");
  };

  // Handle Submit for Verification
  const handleSubmitVerification = (e) => {
    e.preventDefault();

    if (!validate(true)) {
      addToast({
        title: "Validation Error",
        message: "Please correct the highlighted errors before submitting for verification.",
        type: "error"
      });
      return;
    }

    setIsSubmitting(true);

    const payload = {
      institutionId: institutionData.aictePermanentId,
      institutionName: institutionData.institutionName,
      fdrNumber: formData.fdrNumber,
      instrumentType: formData.instrumentType,
      issuingBank: formData.issuingBank,
      bankBranch: formData.bankBranch,
      amount: Number(formData.amount),
      issueDate: formData.issueDate,
      maturityDate: formData.maturityDate,
      beneficiary: formData.beneficiary,
      purpose: formData.purpose,
      remarks: formData.remarks || "Submitted for AICTE verification.",
      document: document,
      authorName: user?.fullName || "Dr. Rameshwar Sharma"
    };

    let result;
    if (editId) {
      result = updateFDR(editId, payload, false);
    } else {
      result = addFDR(payload, false);
    }

    addToast({
      title: "Submission Successful",
      message: `FDR record ${result.id} (${result.fdrNumber}) submitted for AICTE verification.`,
      type: "success"
    });

    setIsSubmitting(false);
    navigate("/fdr-register");
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-200 gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Link
              to="/fdr-register"
              className="text-xs font-semibold text-slate-500 hover:text-slate-800"
            >
              FDR Register
            </Link>
            <span className="text-slate-400">/</span>
            <span className="text-xs font-semibold text-amber-600">
              {editId ? "Edit FDR Record" : "Add New FDR"}
            </span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mt-1">
            {editId ? `Edit FDR Record (${editId})` : "Register New Security Deposit / FDR"}
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Submit institutional Fixed Deposit Receipt details for AICTE regulatory approval and inter-bank lien tracking.
          </p>
        </div>

        <button
          type="button"
          onClick={() => navigate("/fdr-register")}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 transition-colors self-start sm:self-center"
        >
          <X className="w-4 h-4" />
          <span>Cancel</span>
        </button>
      </div>

      {/* Mandatory Disclaimer Notice */}
      <div className="p-3.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2.5">
        <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
        <div>
          <span className="font-bold">AICTE Regulatory Form:</span> Submissions are scrutinized by the
          AICTE Central Bureau and cross-referenced with bank core banking records before approval is granted.
        </div>
      </div>

      <form onSubmit={handleSubmitVerification} className="space-y-6">
        {/* Section 1: Institutional Information (prefilled from configuration) */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-800 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-amber-600" />
              1. Institutional Identification (Prefilled from Config)
            </h2>
            <span className="text-[11px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
              Verified AICTE Profile
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Institution Name
              </label>
              <input
                type="text"
                value={institutionData.institutionName}
                onChange={(e) =>
                  setInstitutionData({ ...institutionData, institutionName: e.target.value })
                }
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-md text-slate-900 font-semibold"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 uppercase tracking-wider mb-1">
                AICTE Permanent Institution ID
              </label>
              <input
                type="text"
                value={institutionData.aictePermanentId}
                onChange={(e) =>
                  setInstitutionData({ ...institutionData, aictePermanentId: e.target.value })
                }
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-md text-slate-900 font-mono font-medium"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Institution Campus Address
              </label>
              <input
                type="text"
                value={institutionData.address}
                onChange={(e) =>
                  setInstitutionData({ ...institutionData, address: e.target.value })
                }
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-md text-slate-800"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 uppercase tracking-wider mb-1">
                State / UT
              </label>
              <input
                type="text"
                value={institutionData.state}
                onChange={(e) =>
                  setInstitutionData({ ...institutionData, state: e.target.value })
                }
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-md text-slate-800"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Institution Category
              </label>
              <input
                type="text"
                value={institutionData.category}
                onChange={(e) =>
                  setInstitutionData({ ...institutionData, category: e.target.value })
                }
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-md text-slate-800"
              />
            </div>
          </div>
        </div>

        {/* Section 2: FDR Information */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-800 flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-amber-600" />
              2. Fixed Deposit Instrument Details
            </h2>
            <span className="text-[11px] text-slate-500">* Required Fields</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            {/* FDR Reference Number */}
            <div>
              <label className="block font-semibold text-slate-700 uppercase tracking-wider mb-1">
                FDR Reference Number <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="fdrNumber"
                value={formData.fdrNumber}
                onChange={handleChange}
                placeholder="e.g. SBI/FDR/2026/894201"
                className={`w-full px-3 py-2 bg-white border rounded-md font-mono text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 ${
                  errors.fdrNumber ? "border-red-400 bg-red-50/30" : "border-slate-300"
                }`}
              />
              {errors.fdrNumber && (
                <p className="text-red-600 text-[11px] mt-1">{errors.fdrNumber}</p>
              )}
            </div>

            {/* Instrument Type */}
            <div>
              <label className="block font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Instrument Type <span className="text-red-500">*</span>
              </label>
              <select
                name="instrumentType"
                value={formData.instrumentType}
                onChange={handleChange}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                {INSTRUMENT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
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
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                {BANK_OPTIONS.map((bank) => (
                  <option key={bank} value={bank}>
                    {bank}
                  </option>
                ))}
              </select>
            </div>

            {/* Bank Branch */}
            <div>
              <label className="block font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Bank Branch & IFSC Code <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="bankBranch"
                value={formData.bankBranch}
                onChange={handleChange}
                placeholder="e.g. Meerut Road Branch, Ghaziabad (SBIN0004381)"
                className={`w-full px-3 py-2 bg-white border rounded-md text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 ${
                  errors.bankBranch ? "border-red-400 bg-red-50/30" : "border-slate-300"
                }`}
              />
              {errors.bankBranch && (
                <p className="text-red-600 text-[11px] mt-1">{errors.bankBranch}</p>
              )}
            </div>

            {/* Deposit Amount */}
            <div className="sm:col-span-2">
              <label className="block font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Deposit Principal Amount (₹) <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 font-bold">
                  ₹
                </span>
                <input
                  type="number"
                  name="amount"
                  min="1000"
                  step="1000"
                  value={formData.amount}
                  onChange={handleChange}
                  placeholder="e.g. 5000000 (Fifty Lakhs)"
                  className={`w-full pl-8 pr-3 py-2 bg-white border rounded-md font-mono text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 ${
                    errors.amount ? "border-red-400 bg-red-50/30" : "border-slate-300"
                  }`}
                />
              </div>
              {formData.amount && !isNaN(formData.amount) && Number(formData.amount) > 0 && (
                <div className="mt-1.5 p-2 bg-slate-50 border border-slate-200 rounded text-xs text-slate-700 flex items-center justify-between">
                  <span>Formatted: <strong>{formatINR(formData.amount)}</strong></span>
                  <span className="text-[11px] text-amber-800 italic">
                    {numberToWordsINR(formData.amount)}
                  </span>
                </div>
              )}
              {errors.amount && <p className="text-red-600 text-[11px] mt-1">{errors.amount}</p>}
            </div>

            {/* Issue Date */}
            <div>
              <label className="block font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Date of Issue <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                name="issueDate"
                value={formData.issueDate}
                onChange={handleChange}
                className={`w-full px-3 py-2 bg-white border rounded-md text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 ${
                  errors.issueDate ? "border-red-400 bg-red-50/30" : "border-slate-300"
                }`}
              />
              {errors.issueDate && (
                <p className="text-red-600 text-[11px] mt-1">{errors.issueDate}</p>
              )}
            </div>

            {/* Maturity Date */}
            <div>
              <label className="block font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Date of Maturity (Min. 5 Years recommended) <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                name="maturityDate"
                value={formData.maturityDate}
                onChange={handleChange}
                className={`w-full px-3 py-2 bg-white border rounded-md text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 ${
                  errors.maturityDate ? "border-red-400 bg-red-50/30" : "border-slate-300"
                }`}
              />
              {errors.maturityDate && (
                <p className="text-red-600 text-[11px] mt-1">{errors.maturityDate}</p>
              )}
            </div>

            {/* Beneficiary */}
            <div className="sm:col-span-2">
              <label className="block font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Beneficiary / Favouring Authority <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="beneficiary"
                value={formData.beneficiary}
                onChange={handleChange}
                placeholder={`e.g. Member Secretary, AICTE New Delhi & Registrar, ${INSTITUTION_CONFIG.institutionName}`}
                className={`w-full px-3 py-2 bg-white border rounded-md text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 ${
                  errors.beneficiary ? "border-red-400 bg-red-50/30" : "border-slate-300"
                }`}
              />
              {errors.beneficiary && (
                <p className="text-red-600 text-[11px] mt-1">{errors.beneficiary}</p>
              )}
            </div>

            {/* Purpose */}
            <div className="sm:col-span-2">
              <label className="block font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Purpose of Deposit <span className="text-red-500">*</span>
              </label>
              <select
                name="purpose"
                value={formData.purpose}
                onChange={handleChange}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 mb-2"
              >
                {DEPOSIT_PURPOSES.map((purp) => (
                  <option key={purp} value={purp}>
                    {purp}
                  </option>
                ))}
              </select>
            </div>

            {/* Remarks */}
            <div className="sm:col-span-2">
              <label className="block font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Institution Remarks / Special Endorsements
              </label>
              <textarea
                name="remarks"
                rows={2}
                value={formData.remarks}
                onChange={handleChange}
                placeholder="Enter any additional remarks, lien confirmation clauses, or bank advisory references."
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </div>
        </div>

        {/* Section 3: Document Upload */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-800 flex items-center gap-2">
              <FilePlus className="w-4 h-4 text-amber-600" />
              3. Scanned FDR Certificate Attachment <span className="text-red-500">*</span>
            </h2>
            <span className="text-[11px] text-slate-500">PDF, JPG, PNG up to 5MB</span>
          </div>

          {/* Upload Input & Drop Area */}
          {!document ? (
            <div
              className={`p-6 border-2 border-dashed rounded-lg text-center flex flex-col items-center justify-center transition-all ${
                errors.document
                  ? "border-red-400 bg-red-50/20"
                  : "border-slate-300 hover:border-amber-500 bg-slate-50/50"
              }`}
            >
              <input
                type="file"
                id="fdrDocUpload"
                accept=".pdf,image/png,image/jpeg"
                onChange={handleFileUpload}
                className="hidden"
              />
              <div className="p-3 bg-amber-500/10 text-amber-600 rounded-full mb-3">
                <Upload className="w-6 h-6" />
              </div>
              <p className="text-xs font-semibold text-slate-800">
                Upload Scanned Copy of FDR Certificate / Lien Advice
              </p>
              <p className="text-[11px] text-slate-500 mt-1 max-w-sm">
                Ensure bank seal, manager signature, and joint beneficiary lien endorsement are clearly legible.
              </p>
              <label
                htmlFor="fdrDocUpload"
                className="mt-4 px-4 py-2 text-xs font-medium text-white bg-slate-800 hover:bg-slate-900 rounded-md cursor-pointer transition-colors"
              >
                Browse & Select File
              </label>

              {errors.document && (
                <p className="text-red-600 text-xs mt-3 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {errors.document}
                </p>
              )}
            </div>
          ) : (
            <div className="p-4 rounded-lg border border-slate-200 bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-red-100 text-red-700 rounded-lg shrink-0">
                  <FileText className="w-6 h-6" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-900 flex items-center gap-2">
                    <span>{document.name}</span>
                    <span className="text-[10px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                      File Ready
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Type: {document.type} • Size: {document.size}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-center">
                <button
                  type="button"
                  onClick={() => setPreviewModalOpen(true)}
                  className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-100 flex items-center gap-1.5 transition-colors"
                >
                  <Eye className="w-3.5 h-3.5 text-blue-600" />
                  Preview
                </button>

                <label
                  htmlFor="fdrDocReplace"
                  className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-100 flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <input
                    type="file"
                    id="fdrDocReplace"
                    accept=".pdf,image/png,image/jpeg"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <RefreshCw className="w-3.5 h-3.5 text-amber-600" />
                  Replace
                </label>

                <button
                  type="button"
                  onClick={handleRemoveDocument}
                  className="px-3 py-1.5 text-xs font-medium text-rose-700 bg-rose-50 border border-rose-200 rounded-md hover:bg-rose-100 flex items-center gap-1.5 transition-colors"
                  aria-label="Remove document"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Remove
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Section 4: Form Actions */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => navigate("/fdr-register")}
            className="w-full sm:w-auto px-4 py-2.5 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            {/* Save Draft */}
            <button
              type="button"
              onClick={handleSaveDraft}
              disabled={isSubmitting}
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg border border-slate-300 transition-colors"
            >
              <Save className="w-4 h-4 text-slate-600" />
              <span>Save Draft</span>
            </button>

            {/* Submit for Verification */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-6 py-2.5 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-lg shadow-sm transition-all hover:shadow active:scale-[0.98]"
            >
              <Send className="w-4 h-4" />
              <span>Submit for Verification</span>
            </button>
          </div>
        </div>
      </form>

      {/* Document Preview Modal */}
      {previewModalOpen && document && (
        <DocumentPreviewModal
          isOpen={previewModalOpen}
          onClose={() => setPreviewModalOpen(false)}
          document={document}
          fdrNumber={formData.fdrNumber || "UNSUBMITTED"}
        />
      )}
    </div>
  );
};
