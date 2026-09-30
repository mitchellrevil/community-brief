import * as React from "react";

/**
 * Breakpoint in pixels for mobile detection.
 * Matches Tailwind's md: breakpoint (768px).
 */
const MOBILE_BREAKPOINT = 768;

/**
 * Hook to detect if the current viewport is mobile-sized.
 *
 * Uses matchMedia for efficient breakpoint detection with automatic
 * updates on window resize. Mobile is defined as viewport width < 768px.
 *
 * @description Reactive viewport detection that triggers re-render on
 * breakpoint crossing. SSR-safe with initial false value.
 *
 * @returns {boolean} True if viewport width is less than 768px
 *
 * @example
 * ```tsx
 * import { useIsMobile } from '@/hooks/useMobile';
 *
 * function ResponsiveLayout() {
 *   const isMobile = useIsMobile();
 *
 *   return isMobile ? (
 *     <MobileNavigation />
 *   ) : (
 *     <DesktopSidebar />
 *   );
 * }
 * ```
 *
 * @example
 * ```tsx
 * // Conditional rendering with mobile-specific behavior
 * function DataTable() {
 *   const isMobile = useIsMobile();
 *
 *   return isMobile ? (
 *     <CardView items={items} />
 *   ) : (
 *     <TableView items={items} columns={columns} />
 *   );
 * }
 * ```
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = React.useState<boolean>(
    () => (typeof window !== "undefined" ? window.innerWidth < MOBILE_BREAKPOINT : false)
  );

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };
    mql.addEventListener("change", onChange);
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return isMobile;
}
