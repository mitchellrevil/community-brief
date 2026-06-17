import { useMemo, useState } from "react";

import { useNavigate } from "@tanstack/react-router";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Download, Users } from "lucide-react";
import { toast } from "sonner";
import { UsersTable } from "./UsersTable";
import RegisterUserDialog from "./RegisterUserDialog";
import { PermissionLevel, hasPermissionLevel } from "@/types/permissions";
import { useUserPermissions } from "@/hooks/usePermissions";
import { getUserAnalytics } from "@/features/analytics/data/api";
import { UserStats } from "@/features/analytics/ui/UserStats";
import { getUsersInfiniteQuery } from "@/features/users/data/queries";
import { PermissionGuard } from "@/components/auth/PermissionGuard";
import { Button } from "@/components/ui/button";
import { SmartBreadcrumb } from "@/components/ui/smart-breadcrumb";
import { PageHeading } from "@/components/ui/page-heading";
import { useBreadcrumbs } from "@/hooks/useBreadcrumbs";
import { useIsMobile } from "@/hooks/useMobile";

export function UserManagementDashboard() {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterPermission, setFilterPermission] = useState<"All" | PermissionLevel>("All");
  
  const { data: currentUser } = useUserPermissions();
  const navigate = useNavigate();
  const breadcrumbs = useBreadcrumbs();
  const isMobile = useIsMobile();

  // Fetch users with infinite query

  const {
    data: usersData,
    isLoading: usersLoading,
    error: usersError,
    hasNextPage: hasNextUsersPage,
    isFetchingNextPage: isFetchingNextUsersPage,
    fetchNextPage: fetchNextUsersPage,
  } = useInfiniteQuery(getUsersInfiniteQuery(50));

  // Flatten all pages into single array
  const users = useMemo(() => {
    return usersData?.pages.flatMap(page => page.users) ?? [];
  }, [usersData]);

  // Total users reported by the paginated API (preferred)
  const totalUsersCount = usersData?.pages[0]?.total ?? users.length;

  // Filter users
  const filteredUsers = useMemo(() => {
    if (!Array.isArray(users)) return [];
    const search = (searchTerm || "").toLowerCase();
    return users.filter(user => {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      const email = (user.email ?? "").toLowerCase();
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      const name = (user.name ?? "").toLowerCase();
      const matchesSearch = email.includes(search) || name.includes(search);
      const matchesPermission = filterPermission === "All" || user.permission === filterPermission;
      return matchesSearch && matchesPermission;
    });
  }, [users, searchTerm, filterPermission]);

  const navigateToUserDetails = (userId: string) => {
    navigate({ to: '/admin/users/$userId', params: { userId } });
  };

  const handleNavigateAnnouncements = () => {
    // Use direct location assignment to avoid strict typed-route checks
    window.location.href = '/admin/announcements';
  };

  // CSV Export Handler
  const handleExportMinutesCSV = () => {
    if (!Array.isArray(users) || users.length === 0) {
      toast.error("No user data available for export.");
      return;
    }
    
    const period = 30; // Default to 30 days
    const csvRows = ["user_email,total_minutes"];
    
    toast.promise(
      async () => {
        await Promise.all(
          users.map(async (user) => {
            try {
              const analytics = await getUserAnalytics(user.id, period);
              csvRows.push(`${user.email},${analytics.analytics.transcription_stats.total_minutes}`);
            } catch (err) {
              console.error(`Failed to fetch analytics for user ${user.email}:`, err);
              csvRows.push(`${user.email},0`);
            }
          })
        );
        
        const csvContent = csvRows.join("\n");
        const blob = new Blob([csvContent], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `user_minutes_${new Date().toISOString().slice(0,10)}.csv`;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }, 0);
      },
      {
        loading: 'Generating CSV report...',
        success: 'CSV report downloaded successfully',
        error: 'Failed to generate CSV report'
      }
    );
  };

  if (usersError) {
    return (
      <div className="flex items-center justify-center h-[50vh] text-destructive">
        Error loading users: {usersError.message}
      </div>
    );
  }

  return (
    <PermissionGuard requiredPermission={PermissionLevel.ADMIN}>
      <div className="min-h-screen bg-background overflow-x-hidden">
        <PageHeading
          icon={<Users className="h-6 w-6" />}
          title="Users"
          breadcrumb={<SmartBreadcrumb items={breadcrumbs} />}
          actions={!isMobile ? (
            <div className="flex items-center gap-2">
              {hasPermissionLevel(currentUser?.permission as PermissionLevel, PermissionLevel.MODERATOR) && (
                <div className="mr-2">
                  <RegisterUserDialog />
                </div>
              )}
              <Button onClick={handleNavigateAnnouncements} className="mr-2">
                Announcements
              </Button>
              <Button variant="outline" onClick={handleExportMinutesCSV}>
                <Download className="mr-2 h-4 w-4" />
                Export Report
              </Button>
            </div>
          ) : null}
        />

        <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8">
          {isMobile && (
            <div className="flex flex-col gap-2">
              {hasPermissionLevel(currentUser?.permission as PermissionLevel, PermissionLevel.MODERATOR) && (
                <div className="w-full">
                  <RegisterUserDialog />
                </div>
              )}
              <Button onClick={handleNavigateAnnouncements} className="w-full">
                Announcements
              </Button>
              <Button variant="outline" onClick={handleExportMinutesCSV} className="w-full">
                <Download className="mr-2 h-4 w-4" />
                Export Report
              </Button>
            </div>
          )}

          {/* User Statistics */}
          <UserStats periodDays={30} />

          {/* Main Content Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold tracking-tight">Users <span className="text-sm text-muted-foreground">({totalUsersCount})</span></h2>
            </div>
            <UsersTable
              users={users}
              usersLoading={usersLoading}
              searchTerm={searchTerm}
              setSearchTerm={setSearchTerm}
              filterPermission={filterPermission}
              setFilterPermission={setFilterPermission}
              filteredUsers={filteredUsers}
              onUserClick={navigateToUserDetails}
              hasNextPage={hasNextUsersPage}
              isFetchingNextPage={isFetchingNextUsersPage}
              onLoadMore={fetchNextUsersPage}
            />
          </div>
        </div>
      </div>
    </PermissionGuard>
  );
}

export default UserManagementDashboard;


