from enum import Enum


class Role(str, Enum):
    INS_SIGNATORY       = "INS_SIGNATORY"
    INS_ADMIN           = "INS_ADMIN"
    SCRUTINY_OFFICER    = "SCRUTINY_OFFICER"
    APPROVING_OFFICER   = "APPROVING_OFFICER"
    RELEASE_AUTHORITY   = "RELEASE_AUTHORITY"
    FINANCE_OFFICER     = "FINANCE_OFFICER"
    COMPLIANCE_OFFICER  = "COMPLIANCE_OFFICER"
    LEADERSHIP          = "LEADERSHIP"
    AUDITOR             = "AUDITOR"
    SYSTEM_ADMIN        = "SYSTEM_ADMIN"
    BANK_MAKER          = "BANK_MAKER"
    BANK_CHECKER        = "BANK_CHECKER"


class TrustLevel(str, Enum):
    L0_CLAIMED        = "L0_CLAIMED"
    L1_ATTESTED       = "L1_ATTESTED"
    L2_BANK_CONFIRMED = "L2_BANK_CONFIRMED"


class InstrumentState(str, Enum):
    # v1 states used in Golden Path; full list in SRS §5.1
    SUBMITTED          = "SUBMITTED"
    AUTO_CHECKING      = "AUTO_CHECKING"
    SCRUTINY           = "SCRUTINY"
    CHANGES_REQUESTED  = "CHANGES_REQUESTED"
    BANK_PENDING       = "BANK_PENDING"
    DISCREPANCY        = "DISCREPANCY"
    REJECTED           = "REJECTED"
    ACTIVE             = "ACTIVE"
    RENEWAL_DUE        = "RENEWAL_DUE"
    LAPSED             = "LAPSED"
    SUPERSEDED         = "SUPERSEDED"
    MATURED            = "MATURED"
    RELEASE_LOCKED     = "RELEASE_LOCKED"
    RELEASED           = "RELEASED"
    CLOSED             = "CLOSED"
# Overlays (not states, boolean flags): is_quarantined, on_hold


class ObligationState(str, Enum):
    PENDING_DEPOSIT     = "PENDING_DEPOSIT"
    PARTIALLY_COVERED   = "PARTIALLY_COVERED"
    COVERED             = "COVERED"
    TERM_COMPLETE       = "TERM_COMPLETE"
    RELEASE_IN_PROGRESS = "RELEASE_IN_PROGRESS"
    CLOSED              = "CLOSED"


class BankRequestState(str, Enum):
    CREATED                   = "CREATED"
    NOTIFIED                  = "NOTIFIED"
    ACKNOWLEDGED              = "ACKNOWLEDGED"
    MAKER_SUBMITTED           = "MAKER_SUBMITTED"
    CONFIRMED                 = "CONFIRMED"
    CONFIRMED_WITH_EXCEPTIONS = "CONFIRMED_WITH_EXCEPTIONS"
    NOT_FOUND                 = "NOT_FOUND"
    ESCALATED                 = "ESCALATED"
    TIMED_OUT                 = "TIMED_OUT"


class BankOutcome(str, Enum):
    ALL_CLEAR  = "ALL_CLEAR"
    EXCEPTIONS = "EXCEPTIONS"
    NOT_FOUND  = "NOT_FOUND"


class ReleaseState(str, Enum):
    SUBMITTED          = "SUBMITTED"
    INELIGIBLE         = "INELIGIBLE"
    SCRUTINY           = "SCRUTINY"
    RECOMMENDED        = "RECOMMENDED"
    APPROVED           = "APPROVED"
    LETTER_EXPIRED     = "LETTER_EXPIRED"
    REVOKED            = "REVOKED"
    EXECUTED           = "EXECUTED"
    SETTLEMENT_PENDING = "SETTLEMENT_PENDING"
    CLOSED             = "CLOSED"
    REJECTED           = "REJECTED"


class LetterState(str, Enum):
    ISSUED     = "ISSUED"
    EXECUTED   = "EXECUTED"
    EXPIRED    = "EXPIRED"
    REVOKED    = "REVOKED"
    SUPERSEDED = "SUPERSEDED"


class PublicVerifyStatus(str, Enum):
    # no-match is a separate error code VERIFY_NO_MATCH, not a status
    VALID      = "VALID"
    EXPIRED    = "EXPIRED"
    REVOKED    = "REVOKED"
    SUPERSEDED = "SUPERSEDED"
    EXECUTED   = "EXECUTED"
    TAMPERED   = "TAMPERED"


class Severity(str, Enum):
    LOW    = "LOW"
    MEDIUM = "MEDIUM"
    HIGH   = "HIGH"


class DiscrepancyStatus(str, Enum):
    OPEN      = "OPEN"
    CLEARED   = "CLEARED"
    ESCALATED = "ESCALATED"
    REJECTED  = "REJECTED"


class RuleResult(str, Enum):
    PASS   = "PASS"
    WARN   = "WARN"
    FAIL   = "FAIL"
    MANUAL = "MANUAL"


class EligibilityVerdict(str, Enum):
    ELIGIBLE      = "ELIGIBLE"
    INELIGIBLE    = "INELIGIBLE"
    MANUAL_REVIEW = "MANUAL_REVIEW"


class DocCheckOutcome(str, Enum):
    PASS  = "PASS"
    FLAG  = "FLAG"
    NA    = "NA"
    ERROR = "ERROR"


class CaseType(str, Enum):
    TERM_COMPLETE = "TERM_COMPLETE"   # v1 only; more in SRS


class RenewalMode(str, Enum):
    SAME_NUMBER = "SAME_NUMBER"
    NEW_NUMBER  = "NEW_NUMBER"
    REPLACEMENT = "REPLACEMENT"       # P1 (not in v1.0 scope)


class AlertType(str, Enum):
    MATURITY_180         = "MATURITY_180"
    MATURITY_90          = "MATURITY_90"
    MATURITY_30          = "MATURITY_30"
    MATURITY_7           = "MATURITY_7"
    LAPSED               = "LAPSED"
    LAPSE_ESCALATED      = "LAPSE_ESCALATED"
    BANK_REMINDER_3      = "BANK_REMINDER_3"
    BANK_REMINDER_7      = "BANK_REMINDER_7"
    BANK_ESCALATION_14   = "BANK_ESCALATION_14"
    BANK_ESCALATION_21   = "BANK_ESCALATION_21"
    BANK_TIMEOUT_30      = "BANK_TIMEOUT_30"
    LETTER_EXPIRED       = "LETTER_EXPIRED"
    QUARANTINE_VIGILANCE = "QUARANTINE_VIGILANCE"

