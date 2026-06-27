import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchUserById } from "@/features/users/data/api";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { AlertCircle } from "lucide-react";

import { UserDetailsHeader } from "./UserDetailsHeader";
import { UserDetailsTabs } from "./UserDetailsTabs";

export function UserDetails() {
  // @ts-ignore - params are typed in the route definition
  const { userId } = useParams({ from: "/_layout/admin/users/$userId" });

  const {
    data: user,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["user", userId],
    queryFn: () => fetchUserById(userId),
    enabled: !!userId,
  });

  if (isLoading) {
    return (
      <div className="space-y-6 p-4 sm:p-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-48" />
          </div>
          <Skeleton className="h-10 w-32" />
        </div>
        <Skeleton className="h-[200px] w-full" />
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            Failed to load user details.{" "}
            {(error as Error).message || "User not found."}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
      <UserDetailsHeader user={user} />
      <UserDetailsTabs user={user} />
    </div>
  );
}
