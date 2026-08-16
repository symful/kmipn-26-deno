import React from 'react';
import { sidebarBg, sidebarText } from '../../theme/tokens';

interface BrowserChromeProps {
  /** Current route path to display in URL bar (e.g., "/kasus/CB-1790") */
  currentRoute?: string;
  /** Optional title to display in the URL bar instead of the route */
  title?: string;
  /** Background color override (defaults to sidebar dark teal) */
  backgroundColor?: string;
  /** Height of the browser chrome bar in pixels (defaults to 38) */
  height?: number;
}

/**
 * Browser-style top bar component with traffic light dots and URL display.
 * Used for case detail views to simulate a browser-like interface.
 *
 * @example
 * ```tsx
 * <BrowserChrome currentRoute="/kasus/CB-1790" />
 * <BrowserChrome title="app.pantaudesa.id/kasus/CB-1790" />
 * ```
 */
export function BrowserChrome({
  currentRoute,
  title,
  backgroundColor = sidebarBg,
  height = 38,
}: BrowserChromeProps) {
  const urlText = title ?? currentRoute ?? '/';

  return (
    <div
      style={{
        height,
        backgroundColor,
        display: 'flex',
        alignItems: 'center',
        paddingLeft: 12,
        paddingRight: 12,
        gap: 12,
        flexShrink: 0,
      }}
    >
      {/* Traffic Light Dots */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        {/* Close (Red) Dot */}
        <div
          style={{
            width: 12,
            height: 12,
            borderRadius: '50%',
            backgroundColor: '#FF5F57',
            border: '1px solid rgba(0, 0, 0, 0.1)',
          }}
          title="Close"
        />
        {/* Minimize (Yellow) Dot */}
        <div
          style={{
            width: 12,
            height: 12,
            borderRadius: '50%',
            backgroundColor: '#FEBC2E',
            border: '1px solid rgba(0, 0, 0, 0.1)',
          }}
          title="Minimize"
        />
        {/* Maximize (Green) Dot */}
        <div
          style={{
            width: 12,
            height: 12,
            borderRadius: '50%',
            backgroundColor: '#28C840',
            border: '1px solid rgba(0, 0, 0, 0.1)',
          }}
          title="Maximize"
        />
      </div>

      {/* URL Bar */}
      <div
        style={{
          flex: 1,
          height: 24,
          backgroundColor: 'rgba(255, 255, 255, 0.1)',
          borderRadius: 4,
          display: 'flex',
          alignItems: 'center',
          paddingLeft: 10,
          paddingRight: 10,
        }}
      >
        <span
          style={{
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: 11,
            color: sidebarText,
            opacity: 0.8,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {urlText}
        </span>
      </div>
    </div>
  );
}
