export type Severity = "critical" | "high" | "medium" | "low" | "informational";
export type ReportStatus =
  | "new"
  | "triaged"
  | "accepted"
  | "resolved"
  | "rejected"
  | "duplicate"
  | "informative";
export type ProgramStatus = "active" | "paused" | "closed";
export type UserRole = "researcher" | "company" | "admin";

export const SEVERITY_CONFIG: Record<
  Severity,
  { label: string; color: string; bgColor: string; textColor: string }
> = {
  critical: {
    label: "Critical",
    color: "border-red-600",
    bgColor: "bg-red-100",
    textColor: "text-red-800",
  },
  high: {
    label: "High",
    color: "border-orange-500",
    bgColor: "bg-orange-100",
    textColor: "text-orange-800",
  },
  medium: {
    label: "Medium",
    color: "border-yellow-500",
    bgColor: "bg-yellow-100",
    textColor: "text-yellow-800",
  },
  low: {
    label: "Low",
    color: "border-blue-400",
    bgColor: "bg-blue-100",
    textColor: "text-blue-800",
  },
  informational: {
    label: "Informational",
    color: "border-gray-400",
    bgColor: "bg-gray-100",
    textColor: "text-gray-700",
  },
};

export const STATUS_CONFIG: Record<
  ReportStatus,
  { label: string; bgColor: string; textColor: string }
> = {
  new: { label: "New", bgColor: "bg-blue-100", textColor: "text-blue-800" },
  triaged: {
    label: "Triaged",
    bgColor: "bg-purple-100",
    textColor: "text-purple-800",
  },
  accepted: {
    label: "Accepted",
    bgColor: "bg-green-100",
    textColor: "text-green-800",
  },
  resolved: {
    label: "Resolved",
    bgColor: "bg-emerald-100",
    textColor: "text-emerald-800",
  },
  rejected: {
    label: "Rejected",
    bgColor: "bg-red-100",
    textColor: "text-red-800",
  },
  duplicate: {
    label: "Duplicate",
    bgColor: "bg-gray-100",
    textColor: "text-gray-700",
  },
  informative: {
    label: "Informative",
    bgColor: "bg-yellow-100",
    textColor: "text-yellow-800",
  },
};
