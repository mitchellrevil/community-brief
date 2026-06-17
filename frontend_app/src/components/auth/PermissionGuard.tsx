import { useEffect } from "react";
import { useRouter } from "@tanstack/react-router";
import type { PermissionLevel } from "@/types/permissions";
import { useAuthSession } from "@/features/auth/hooks/useAuthSession";
import { buildLoginRedirectUrl } from "@/features/auth/lib/navigation";
import { usePermissionGuard } from "@/hooks/usePermissions";

interface PermissionGuardProps {
  requiredPermission?: PermissionLevel;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

export function PermissionGuard({ 
  requiredPermission, 
  fallback = null, 
  children 
}: PermissionGuardProps) {
  const router = useRouter();
  const auth = useAuthSession();
  const guard = usePermissionGuard();

  // Check access based on different criteria. Prefer `requiredPermission`.
  const hasAccess = (() => {
    // Permission level check using hierarchy (preferred)
    if (requiredPermission) {
      return guard.hasPermissionLevel(requiredPermission);
    }

    return auth.isAuthenticated;
  })();

  // Redirect if not authorized
  useEffect(() => {
    if (auth.isLoading || guard.isLoading) {
      return;
    }

    if (!auth.isAuthenticated) {
      window.location.replace(buildLoginRedirectUrl());
      return;
    }

    if (!hasAccess) {
      router.navigate({ to: "/unauthorised" });
    }
  }, [auth.isAuthenticated, auth.isLoading, guard.isLoading, hasAccess, router]);

  if (auth.isLoading || guard.isLoading) {
    return <div>Loading permissions...</div>;
  }

  if (!auth.isAuthenticated || !hasAccess) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
