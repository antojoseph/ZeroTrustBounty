import { STATUS_CONFIG, ReportStatus } from "@/lib/types";

export default function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status as ReportStatus] || STATUS_CONFIG.new;
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.bgColor} ${config.textColor}`}
    >
      {config.label}
    </span>
  );
}
