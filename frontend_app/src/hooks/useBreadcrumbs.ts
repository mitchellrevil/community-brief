import { useLocation } from "@tanstack/react-router";
import { useMemo } from "react";

/**
 * Single breadcrumb item configuration.
 */
export interface BreadcrumbItem {
  /** Display text */
  label: string;
  /** External URL (for <a> tag) */
  href?: string;
  /** Internal route path (for TanStack Router Link) */
  to?: string;
  /** Whether this is the current page (no link) */
  isCurrentPage?: boolean;
}

// Route mappings for better breadcrumb labels
const ROUTE_MAPPINGS: Record<string, string> = {
  "/": "Home",
  "/audio-upload": "Media Upload",
  "/audio-recordings": "Audio Recordings", 
  "/audio-recordings/shared": "Shared Recordings",
  "/help": "Help",
  "/prompt-management": "Prompts",
  "/suggest-template": "Suggest a Template",
  "/user-management": "Users",
  "/analytics": "Analytics",
  "/admin": "Admin",
  "/admin/user-management": "Users",
  "/admin/deleted-jobs": "Deleted Recordings",
  "/admin/all-jobs": "All Recordings",
  "/unauthorised": "Unauthorized",
};

// Specific route handlers for complex breadcrumbs
const ROUTE_HANDLERS: Record<string, ((pathname: string, segments: Array<string>) => Array<BreadcrumbItem>) | undefined> = {  "/audio-recordings": (_: string, segments) => {
    const items: Array<BreadcrumbItem> = [
      { label: "Audio Recordings", to: "/audio-recordings" }
    ];
    
    // Handle shared recordings path
    if (segments.length > 1 && segments[1] === "shared") {
      items.push({
        label: "Shared Recordings",
        isCurrentPage: true
      });
    } else if (segments.length > 2 && segments[2]) {
      // If there's a recording ID
      items.push({
        label: `Recording ${segments[2]}`,
        isCurrentPage: true
      });
    } else {
      items[0].isCurrentPage = true;
    }
    
    return items;
  },
  
  "/prompt-management": (_: string, segments) => {
    const items: Array<BreadcrumbItem> = [
      { label: "Prompts", to: "/prompt-management" }
    ];
    
    // Handle subcategory or category views
    if (segments.length > 2) {
      if (segments[2] === "category") {
        items.push({
          label: "Category Management",
          isCurrentPage: true
        });
      } else if (segments[2] === "prompts") {
        items.push({
          label: "Prompt Editor",
          isCurrentPage: true
        });
      }
    } else {
      items[0].isCurrentPage = true;
    }
    
    return items;  },
  
  "/user-management": (_: string, segments) => {
    const items: Array<BreadcrumbItem> = [
      { label: "Users", to: "/user-management" }
    ];
    
    if (segments.length > 2 && segments[2]) {
      items.push({
        label: `User ${segments[2]}`,
        isCurrentPage: true
      });
    } else {
      items[0].isCurrentPage = true;
    }
    
    return items;
  },

  "/analytics": () => {
    const items: Array<BreadcrumbItem> = [
      { label: "Analytics", to: "/analytics", isCurrentPage: true }
    ];
    
    return items;
  },

  "/admin": (_: string, segments) => {
    const items: Array<BreadcrumbItem> = [
      { label: "Admin", to: "/admin" }
    ];
    
    if (segments.length > 1) {
      if (segments[1] === "deleted-jobs") {
        items.push({
          label: "Deleted Recordings",
          isCurrentPage: true
        });
      } else if (segments[1] === "all-jobs") {
        items.push({
          label: "All Recordings",
          isCurrentPage: true
        });
      } else if (segments[1] === "user-management") {
        items.push({
          label: "Users",
          isCurrentPage: true
        });
      } else if (segments[1] === "announcements") {
        items.push({
          label: "Announcements",
          isCurrentPage: true
        });
      }
    } else {
      items[0].isCurrentPage = true;
    }
    
    return items;
  }
};

/**
 * Hook to generate breadcrumb navigation items from the current route.
 *
 * Automatically generates breadcrumbs based on the current URL path.
 * Uses predefined route mappings for friendly labels and special handlers
 * for complex routes with dynamic segments.
 *
 * @description Parses the current pathname and generates breadcrumb items.
 * Falls back to formatted segment names when no mapping is defined.
 *
 * @returns {Array<BreadcrumbItem>} Breadcrumb items for the current route
 *
 * @example
 * ```tsx
 * import { useBreadcrumbs } from '@/hooks/useBreadcrumbs';
 *
 * function PageHeader() {
 *   const breadcrumbs = useBreadcrumbs();
 *
 *   return (
 *     <nav aria-label="Breadcrumb">
 *       <ol className="flex items-center gap-2">
 *         {breadcrumbs.map((item, index) => (
 *           <li key={index}>
 *             {item.isCurrentPage ? (
 *               <span>{item.label}</span>
 *             ) : (
 *               <Link to={item.to}>{item.label}</Link>
 *             )}
 *           </li>
 *         ))}
 *       </ol>
 *     </nav>
 *   );
 * }
 * ```
 *
 * @see {@link BreadcrumbItem} for item structure
 * @see {@link useManualBreadcrumbs} for custom breadcrumbs
 */
export function useBreadcrumbs(): Array<BreadcrumbItem> {
  const location = useLocation();
  
  return useMemo(() => {
    const pathname = location.pathname;
    
    // Handle root path
    if (pathname === "/") {
      return [{ label: "Home", isCurrentPage: true }];
    }
    
    const segments = pathname.split("/").filter(Boolean);
    
    // Check if we have a specific handler for this route
    const baseRoute = `/${segments[0]}`;
    const handler = ROUTE_HANDLERS[baseRoute];
    
    if (handler) {
      return handler(pathname, segments);
    }
    
    // Default breadcrumb generation
    const breadcrumbs: Array<BreadcrumbItem> = [];
    let currentPath = "";
    
    segments.forEach((segment, index) => {
      currentPath += `/${segment}`;
      const isLast = index === segments.length - 1;
      
      // Get a friendly label
      let label = ROUTE_MAPPINGS[currentPath];
      if (!label) {
        // Fallback to formatted segment name
        label = segment
          .split("-")
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(" ");
      }
      
      breadcrumbs.push({
        label,
        to: currentPath,
        isCurrentPage: isLast
      });
    });
    
    return breadcrumbs;
  }, [location.pathname]);
}

/**
 * Hook for manually specifying breadcrumb items.
 *
 * Use this for complex pages that need custom breadcrumb logic
 * or when the automatic generation doesn't fit the use case.
 *
 * @param {Array<BreadcrumbItem>} items - Custom breadcrumb items
 *
 * @returns {Array<BreadcrumbItem>} The provided items (pass-through)
 *
 * @example
 * ```tsx
 * import { useManualBreadcrumbs } from '@/hooks/useBreadcrumbs';
 *
 * function RecordingDetailPage({ recording }: { recording: Recording }) {
 *   const breadcrumbs = useManualBreadcrumbs([
 *     { label: 'Recordings', to: '/audio-recordings' },
 *     { label: recording.name, isCurrentPage: true },
 *   ]);
 *
 *   return <BreadcrumbNav items={breadcrumbs} />;
 * }
 * ```
 */
export function useManualBreadcrumbs(items: Array<BreadcrumbItem>) {
  return items;
}
