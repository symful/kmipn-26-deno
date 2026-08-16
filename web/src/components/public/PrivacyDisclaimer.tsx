import { colors } from '../../theme/tokens';

export function PrivacyDisclaimer() {
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 12,
        right: 12,
        backgroundColor: 'rgba(255, 255, 255, 0.85)',
        backdropFilter: 'blur(8px)',
        padding: '6px 10px',
        borderRadius: 999,
        zIndex: 10,
      }}
    >
      <span
        style={{
          fontSize: 11,
          color: colors.textTertiary,
          fontStyle: 'italic',
          whiteSpace: 'nowrap',
        }}
      >
        Lokasi digeneralisasi untuk melindungi privasi pelapor.
      </span>
    </div>
  );
}
