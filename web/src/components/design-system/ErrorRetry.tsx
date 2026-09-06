import {
  colors,
  spacing,
  radius,
  fontWeights,
  dangerBorder,
  dangerLight,
  dangerTextStrong,
} from "@/theme/tokens";

type ErrorRetryProps = {
  error: string | Error;
  onRetry: () => void;
  retrying?: boolean;
  className?: string;
};

export const ErrorRetry = ({
  error,
  onRetry,
  retrying = false,
  className = "",
}: ErrorRetryProps) => {
  const errorMessage = typeof error === "string" ? error : error.message;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={className}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: spacing["18"],
        padding: `${spacing["24"]} ${spacing["18"]}`,
        borderRadius: radius.card,
        backgroundColor: colors.dangerBg,
        border: `1px solid ${dangerBorder}`,
        textAlign: "center",
        minWidth: "200px",
        maxWidth: "400px",
        margin: "0 auto",
      }}
    >
      <div
        aria-hidden="true"
        style={{
          width: "48px",
          height: "48px",
          borderRadius: "50%",
          backgroundColor: dangerLight,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
          style={{ display: "block" }}
        >
          <path
            d="M12 8V12M12 16H12.01M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z"
            stroke={colors.danger}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: spacing["8"],
        }}
      >
        <span
          style={{
            fontSize: "14px",
            fontWeight: fontWeights.semibold,
            color: dangerTextStrong,
            lineHeight: "1.4",
          }}
        >
          {errorMessage}
        </span>
      </div>

      <button
        type="button"
        onClick={onRetry}
        disabled={retrying}
        aria-disabled={retrying}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: spacing["8"],
          padding: `${spacing["13"]} ${spacing["18"]}`,
          minHeight: "48px",
          minWidth: "120px",
          borderRadius: radius.btn,
          backgroundColor: retrying ? colors.textMuted : colors.primary,
          color: colors.bgCard,
          fontSize: "14px",
          fontWeight: fontWeights.semibold,
          border: "none",
          cursor: retrying ? "not-allowed" : "pointer",
          transition: "background-color 150ms ease",
          opacity: retrying ? 0.7 : 1,
        }}
      >
        {retrying ? (
          <>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
              style={{
                display: "block",
                animation: "errorRetrySpin 1s linear infinite",
              }}
            >
              <path
                d="M12 2V6M12 18V22M6 12H2M22 12H18M19.07 4.93L16.24 7.76M7.76 16.24L4.93 19.07M19.07 19.07L16.24 16.24M7.76 7.76L4.93 4.93"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Memuat...
          </>
        ) : (
          "Coba lagi"
        )}
      </button>

      <style>{`
        @keyframes errorRetrySpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};
