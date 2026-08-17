interface DataQualityPanelProps {
  qualityPercent: number;
  waitingCount: number;
}

export const DataQualityPanel = ({ qualityPercent, waitingCount }: DataQualityPanelProps) => {
  return (
    <div className="bg-white rounded-lg p-4 border border-sigap-border">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-sigap-textPrimary">
          Kualitas Data
        </h2>
        <span className="text-xs text-sigap-textMuted">SLA compliance</span>
      </div>
      <div className="relative pt-1">
        <div className="flex mb-2 items-center justify-between">
          <div>
            <span className="text-xs font-semibold inline-block text-sigap-primary">
              {qualityPercent}%
            </span>
          </div>
        </div>
        <div className="overflow-hidden h-2 mb-4 text-xs flex rounded bg-sigap-surface">
          <div
            style={{ width: `${qualityPercent}%` }}
            className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-sigap-primary"
          ></div>
        </div>
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-sigap-textMuted">Menunggu</span>
        <span className="font-semibold text-sigap-textPrimary">{waitingCount}</span>
      </div>
    </div>
  );
};
