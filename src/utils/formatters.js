/**
 * Utility functions for currency, dates, number conversions, and FDR lifecycle tracking
 */

export const formatINR = (amount) => {
  if (amount === undefined || amount === null || isNaN(amount)) return "₹0";
  const num = Number(amount);
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0
  }).format(num);
};

export const formatDate = (dateStr) => {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return new Intl.DateTimeFormat("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric"
    }).format(d);
  } catch {
    return dateStr;
  }
};

export const getDaysRemaining = (maturityDateStr) => {
  if (!maturityDateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const matDate = new Date(maturityDateStr);
  if (isNaN(matDate.getTime())) return null;
  const diffMs = matDate.getTime() - today.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
};

export const isMatured = (maturityDateStr) => {
  const days = getDaysRemaining(maturityDateStr);
  if (days === null) return false;
  return days < 0;
};

export const isExpiringSoon = (maturityDateStr, daysThreshold = 30) => {
  const days = getDaysRemaining(maturityDateStr);
  if (days === null) return false;
  return days >= 0 && days <= daysThreshold;
};

/**
 * Calculates instrument lifecycle status independent of administrative verification status
 * Supports: 'Active', 'Expiring Soon', 'Matured', 'Renewal Pending', 'Released', 'Superceded', 'Draft'
 */
export const getLifecycleStatus = (fdr, daysThreshold = 30) => {
  if (!fdr) return "Unknown";
  if (fdr.status === "Draft") return "Draft";
  if (fdr.status === "Released" || fdr.lifecycleStatus === "Released") return "Released";
  if (fdr.lifecycleStatus === "Superceded / Replaced" || fdr.status === "Superceded") return "Superceded";
  if (fdr.lifecycleStatus === "Renewal Pending" || fdr.isRenewalPending) return "Renewal Pending";
  if (fdr.releaseRequest && fdr.releaseRequest.status === "Pending Approval") return "Release Requested";

  const days = getDaysRemaining(fdr.maturityDate);
  if (days !== null) {
    if (days < 0) {
      // Maturity date has passed, but NOT automatically released!
      return "Matured";
    }
    if (days <= daysThreshold) {
      return "Expiring Soon";
    }
  }

  if (fdr.status === "Approved") return "Active";
  if (fdr.status === "Pending Verification") return "Verification Pending";
  return fdr.status || "Active";
};

// Convert number to Indian words
const units = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"];
const teens = ["Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function convertLessThanThousand(num) {
  let str = "";
  if (num >= 100) {
    str += units[Math.floor(num / 100)] + " Hundred ";
    num %= 100;
  }
  if (num >= 20) {
    str += tens[Math.floor(num / 10)] + " ";
    num %= 10;
  } else if (num >= 10) {
    str += teens[num - 10] + " ";
    num = 0;
  }
  if (num > 0) {
    str += units[num] + " ";
  }
  return str.trim();
}

export const numberToWordsINR = (num) => {
  if (!num || isNaN(num) || num <= 0) return "";
  num = Math.floor(Number(num));
  if (num === 0) return "Zero Rupees Only";

  let crore = Math.floor(num / 10000000);
  num %= 10000000;
  let lakh = Math.floor(num / 100000);
  num %= 100000;
  let thousand = Math.floor(num / 1000);
  num %= 1000;
  let remainder = num;

  let result = "";
  if (crore > 0) {
    result += convertLessThanThousand(crore) + " Crore ";
  }
  if (lakh > 0) {
    result += convertLessThanThousand(lakh) + " Lakh ";
  }
  if (thousand > 0) {
    result += convertLessThanThousand(thousand) + " Thousand ";
  }
  if (remainder > 0) {
    result += convertLessThanThousand(remainder) + " ";
  }

  return (result.trim() + " Rupees Only").replace(/\s+/g, " ");
};
