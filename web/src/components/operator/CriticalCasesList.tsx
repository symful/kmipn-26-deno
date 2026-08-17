export interface CriticalCaseItem {
  id: string;
  title: string;
  caseCode: string;
  villageName: string;
  slaHoursRemaining: number;
  isOverdue: boolean;
}

interface CriticalCasesListProps {
  cases: CriticalCaseItem[];
  onCaseClick: (id: string) => void;
}

export const CriticalCasesList = ({ cases, onCaseClick }: CriticalCasesListProps) => {
  if (cases.length === 0) {
    return (
      <div className="text-center py-4">
        <p className="text-sm text-sigap-textMuted">Tidak ada kasus kritis</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {cases.map((c) => (
        <button
          key={c.id}
          onClick={() => onCaseClick(c.id)}
          className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-sigap-surface transition-colors text-left"
        >
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
            c.isOverdue ? "bg-danger-500" : "bg-warning-500"
          }`}></span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-sigap-textPrimary truncate">
              {c.title}
            </p>
            <p className="text-xs text-sigap-textTertiary">
              {c.villageName} · {c.caseCode}
            </p>
          </div>
          <span className={`text-xs font-medium ${
            c.isOverdue ? "text-danger-600" : "text-warning-600"
          }`}>
            {c.slaHoursRemaining}h
          </span>
        </button>
      ))}
    </div>
  );
};
