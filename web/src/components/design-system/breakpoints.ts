export const BREAKPOINTS = {
  mobile: 0,
  tablet: 600,
  desktop: 1024,
} as const;

export type Breakpoint = "mobile" | "tablet" | "desktop";

export function isMobile(width: number): boolean {
  return width < BREAKPOINTS.tablet;
}

export function isTablet(width: number): boolean {
  return width >= BREAKPOINTS.tablet && width < BREAKPOINTS.desktop;
}

export function isDesktop(width: number): boolean {
  return width >= BREAKPOINTS.desktop;
}

function getBreakpoint(width: number): Breakpoint {
  if (isMobile(width)) return "mobile";
  if (isTablet(width)) return "tablet";
  return "desktop";
}

import { useState, useEffect } from "react";

export function useBreakpoint(): Breakpoint {
  const [breakpoint, setBreakpoint] = useState<Breakpoint>("mobile");

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mq = window.matchMedia(`(min-width: ${BREAKPOINTS.tablet}px)`);

    const update = () => {
      setBreakpoint(getBreakpoint(window.innerWidth));
    };

    update();

    if (mq.addEventListener) {
      mq.addEventListener("change", update);
      return () => mq.removeEventListener("change", update);
    } else {
      mq.addListener(update);
      return () => mq.removeListener(update);
    }
  }, []);

  return breakpoint;
}
