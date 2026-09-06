import {
  type ReactNode,
  type CSSProperties,
  type ReactElement,
  forwardRef,
  type ElementType,
} from "react";
import { colors, radius } from "@/theme/tokens";

type SigapCardProps = {
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
  /** Left border color token (e.g. 'danger', 'warning', 'info', 'success') */
  severity?: string;
  /** Top border color token (e.g. 'danger', 'warning', 'info', 'success') */
  status?: string;
  /** Padding in px (default: 16) */
  padding?: number;
  as?: ElementType;
};

const severityColors: Record<string, string> = {
  danger: colors.danger,
  warning: colors.warning,
  info: colors.info,
  success: colors.success,
  primary: colors.primary,
};

const statusColors: Record<string, string> = {
  danger: colors.danger,
  warning: colors.warning,
  info: colors.info,
  success: colors.success,
  primary: colors.primary,
};

export const SigapCard = forwardRef(
  (
    {
      children,
      className = "",
      style,
      severity,
      status,
      padding = 24,
      as,
      ...rest
    }: SigapCardProps & { as?: ElementType },
    ref: React.Ref<Element>,
  ) => {
    const Component = as || "div";

    const combinedStyle: CSSProperties = {
      backgroundColor: colors.bgCard,
      border: `1px solid ${colors.borderCard}`,
      borderRadius: radius.card,
      padding: `${padding}px`,
      ...style,
    };

    if (severity) {
      const borderColor = severityColors[severity] || severity;
      combinedStyle.borderLeftWidth = 4;
      combinedStyle.borderLeftColor = borderColor;
    }

    if (status) {
      const borderColor = statusColors[status] || status;
      combinedStyle.borderTopWidth = 3;
      combinedStyle.borderTopColor = borderColor;
    }

    return (
      <Component
        ref={ref}
        className={className}
        style={combinedStyle}
        {...rest}
      >
        {children}
      </Component>
    ) as ReactElement;
  },
);

SigapCard.displayName = "SigapCard";
