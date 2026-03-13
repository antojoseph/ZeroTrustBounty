import { SEVERITY_CONFIG, Severity } from "@/lib/types";

export default function SeverityBadge({ severity }: { severity: string }) {
  const config = SEVERITY_CONFIG[severity as Severity] || SEVERITY_CONFIG.informational;
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.bgColor} ${config.textColor}`}
    >
      {config.label}
    </span>
  );
}
