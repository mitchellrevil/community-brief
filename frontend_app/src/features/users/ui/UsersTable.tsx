import { useEffect, useMemo, useState } from "react";
import { ArrowUpDown, Building2, Filter, LayoutGrid, List, Loader2, MoreHorizontal, Search, Settings, Settings2 } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { motion } from "framer-motion";
import type { User } from "@/features/users/data/api";
import type {BulkUserUpdate} from "@/shared/data/business-units/api";
import { listContainerStagger, listItemFadeInUp } from "@/lib/motion";
import { MotionList, MotionListItem } from "@/components/ui/motion-list";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { PERMISSION_HIERARCHY, PermissionLevel } from "@/types/permissions";
import { formatDate } from "@/lib/date-utils";
import {  bulkUpdateUsers } from "@/shared/data/business-units/api";
import { usersKeys } from "@/features/users/data/keys";
import { useInfiniteScroll } from "@/hooks/useInfinitePagination";
import { useInfiniteBusinessUnits } from "@/hooks/useInfiniteBusinessUnits";
import { useIsMobile } from "@/hooks/useMobile";

interface UsersTableProps {
  // users is supplied by parent but table renders using filteredUsers
  usersLoading: boolean;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  filterPermission: "All" | PermissionLevel;
  setFilterPermission: (filter: "All" | PermissionLevel) => void;
  users: Array<User>;
  filteredUsers: Array<User>;
  onUserClick: (userId: string) => void;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  onLoadMore?: () => void;
}

type UserSortOption = "name-asc" | "name-desc" | "role";

export function UsersTable({
  usersLoading,
  searchTerm,
  setSearchTerm,
  filterPermission,
  setFilterPermission,
  users,
  filteredUsers,
  onUserClick,
  hasNextPage = false,
  isFetchingNextPage = false,
  onLoadMore,
}: UsersTableProps) {
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  // ensure `users` param is referenced to avoid unused var TS6133
  void users;
  const [viewMode, setViewMode] = useState<"list" | "card">("list");
  const [sortBy, setSortBy] = useState<UserSortOption>("name-asc");
  const [selectedUserIds, setSelectedUserIds] = useState<Array<string>>([]);
  const [bulkPermission, setBulkPermission] = useState<string>("");
  const [bulkBusinessUnits, setBulkBusinessUnits] = useState<Array<string>>([]);
  const [isBulkPopoverOpen, setIsBulkPopoverOpen] = useState(false);

  const sortedUsers = useMemo(() => {
    return [...filteredUsers].sort((leftUser, rightUser) => {
      if (sortBy === "role") {
        const roleDelta =
          PERMISSION_HIERARCHY[rightUser.permission] -
          PERMISSION_HIERARCHY[leftUser.permission];
        if (roleDelta !== 0) {
          return roleDelta;
        }
      }

      const leftLabel = (leftUser.name || leftUser.full_name || leftUser.email).toLowerCase();
      const rightLabel = (rightUser.name || rightUser.full_name || rightUser.email).toLowerCase();
      const nameDelta = leftLabel.localeCompare(rightLabel);

      if (sortBy === "name-desc") {
        return -nameDelta;
      }

      return nameDelta;
    });
  }, [filteredUsers, sortBy]);

  // Default to card view on mobile
  useEffect(() => {
    if (isMobile) {
      setViewMode("card");
    }
  }, [isMobile]);

  // Infinite scroll sentinel ref
  const usersSentinelRef = useInfiniteScroll(
    hasNextPage,
    isFetchingNextPage,
    onLoadMore ?? (() => {})
  );

  // Fetch business units for display
  const { businessUnits } = useInfiniteBusinessUnits(50);

  // Bulk update mutation
  const bulkUpdateMutation = useMutation({
    mutationFn: bulkUpdateUsers,
    onSuccess: (data) => {
      toast.success(`${data.message}. Updated ${data.success_count} user(s).`);
      if (data.failed_count > 0) {
        toast.error(`${data.failed_count} user(s) failed to update`);
      }
      setSelectedUserIds([]);
      setBulkPermission("");
      setBulkBusinessUnits([]);
      setIsBulkPopoverOpen(false);
      queryClient.invalidateQueries({ queryKey: usersKeys.root() });
    },
    onError: (error: Error) => {
      toast.error(`Bulk update failed: ${error.message}`);
    },
  });

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedUserIds(sortedUsers.map((u) => u.id));
    } else {
      setSelectedUserIds([]);
    }
  };

  const handleSelectUser = (userId: string, checked: boolean) => {
    if (checked) {
      setSelectedUserIds((prev) => [...prev, userId]);
    } else {
      setSelectedUserIds((prev) => prev.filter((id) => id !== userId));
    }
  };

  const handleBulkUpdate = () => {
    if (selectedUserIds.length === 0) {
      toast.error("No users selected");
      return;
    }

    const update: BulkUserUpdate = {
      user_ids: selectedUserIds,
    };

    if (bulkPermission) {
      update.permission = bulkPermission;
    }

    if (bulkBusinessUnits.length > 0) {
      update.business_unit_ids = bulkBusinessUnits;
    }

    if (!update.permission && !update.business_unit_ids) {
      toast.error("Please select permission or business units to update");
      return;
    }

    bulkUpdateMutation.mutate(update);
  };

  const handleBusinessUnitToggle = (businessUnitId: string, checked: boolean) => {
    if (checked) {
      setBulkBusinessUnits(prev => [...prev, businessUnitId]);
    } else {
      setBulkBusinessUnits(prev => prev.filter(id => id !== businessUnitId));
    }
  };

  const getBusinessUnitName = (businessUnitId: string | null | undefined): string => {
    if (!businessUnitId) return "";
    const unit = businessUnits.find((bu) => bu.id === businessUnitId);
    return unit?.name || "";
  };

  // Return a readable string of business unit names for a user.
  // Prefer `business_unit_names` if present and resolve ID-like entries using known business units.
  const getUserBusinessUnitNames = (user: User): string => {
    const ids: Array<string> = user.business_unit_ids ?? [];

    const hasNameCandidates = user.business_unit_names && user.business_unit_names.length > 0;

    let names: Array<string> = [];

    if (hasNameCandidates) {
      names = user.business_unit_names!.map((n: string) => {
        if (/^category_/.test(n)) {
          // resolve id-like entries to readable names where possible
          const unit = businessUnits.find((bu) => bu.id === n);
          return unit?.name || n;
        }
        return n;
      });
    } else {
      names = ids.map((id) => getBusinessUnitName(id) || id);
    }

    // Fallback: if some entries still look like 'category_*', try resolving via ids mapping
    const resolvedNames = names.map((n, idx) => {
      if (/^category_/.test(n)) {
        const unit = businessUnits.find((bu) => bu.id === n || bu.id === ids[idx]);
        return unit?.name || n;
      }
      return n;
    }).filter(Boolean);

    return Array.from(new Set(resolvedNames)).join(", ");
  };

  const getPermissionBadgeColor = (permission: PermissionLevel) => {
    switch (permission) {
      case PermissionLevel.ADMIN:
        return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 hover:bg-red-100/80";
      case PermissionLevel.EDITOR:
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200 hover:bg-yellow-100/80";
      case PermissionLevel.USER:
        return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 hover:bg-blue-100/80";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200 hover:bg-gray-100/80";
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search users..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-8"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          {/* View Toggle */}
          {!isMobile && (
            <div className="flex items-center border rounded-md">
              <Button
                variant={viewMode === "list" ? "secondary" : "ghost"}
                size="sm"
                className="h-8 px-2"
                onClick={() => setViewMode("list")}
              >
                <List className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === "card" ? "secondary" : "ghost"}
                size="sm"
                className="h-8 px-2"
                onClick={() => setViewMode("card")}
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
            </div>
          )}
          <Select
            value={sortBy}
            onValueChange={(value) => setSortBy(value as UserSortOption)}
          >
            <SelectTrigger className="w-full sm:w-[180px]">
              <ArrowUpDown className="mr-2 h-4 w-4" />
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name-asc">Name A-Z</SelectItem>
              <SelectItem value="name-desc">Name Z-A</SelectItem>
              <SelectItem value="role">Role</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={filterPermission}
            onValueChange={(value) =>
              setFilterPermission(value as "All" | PermissionLevel)
            }
          >
            <SelectTrigger className="w-full sm:w-[180px]">
              <Filter className="mr-2 h-4 w-4" />
              <SelectValue placeholder="Filter by role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All Roles</SelectItem>
              <SelectItem value={PermissionLevel.ADMIN}>Admin</SelectItem>
              <SelectItem value={PermissionLevel.EDITOR}>Editor</SelectItem>
              <SelectItem value={PermissionLevel.USER}>User</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {selectedUserIds.length > 0 && (
        <div className="bg-muted/50 p-4 rounded-lg border flex flex-col sm:flex-row items-center justify-between gap-4 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">
              {selectedUserIds.length} selected
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedUserIds([])}
              className="h-auto p-0 text-muted-foreground hover:text-foreground"
            >
              Clear
            </Button>
          </div>
          
          <Popover open={isBulkPopoverOpen} onOpenChange={setIsBulkPopoverOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <Settings2 className="h-4 w-4" />
                Bulk Actions
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-4" align="end">
              <div className="space-y-4">
                <h4 className="font-medium leading-none">Update Selected Users</h4>
                <p className="text-sm text-muted-foreground">
                  Apply changes to {selectedUserIds.length} users.
                </p>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium">Role</label>
                  <Select value={bulkPermission} onValueChange={setBulkPermission}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={PermissionLevel.ADMIN}>Admin</SelectItem>
                      <SelectItem value={PermissionLevel.EDITOR}>Editor</SelectItem>
                      <SelectItem value={PermissionLevel.USER}>User</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Business Units</label>
                  <div className="border rounded-md p-2 max-h-40 overflow-y-auto space-y-2">
                    {businessUnits.map((bu) => (
                      <div key={bu.id} className="flex items-center gap-2">
                        <Checkbox
                          id={`bulk-bu-${bu.id}`}
                          checked={bulkBusinessUnits.includes(bu.id)}
                          onCheckedChange={(checked) => handleBusinessUnitToggle(bu.id, checked as boolean)}
                        />
                        <label 
                          htmlFor={`bulk-bu-${bu.id}`}
                          className="text-sm cursor-pointer flex-1"
                        >
                          {bu.name}
                        </label>
                      </div>
                    ))}
                    {businessUnits.length === 0 && (
                      <p className="text-xs text-muted-foreground p-2">No business units available</p>
                    )}
                  </div>
                </div>

                <Button 
                  className="w-full" 
                  onClick={handleBulkUpdate}
                  disabled={bulkUpdateMutation.isPending || (!bulkPermission && bulkBusinessUnits.length === 0)}
                >
                  {bulkUpdateMutation.isPending ? "Updating..." : "Apply Changes"}
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      )}

      {viewMode === "card" ? (
        /* Card View - Better for mobile */
        <div>
          {usersLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {[...Array(6)].map((_, i) => (
                <Card key={i}>
                  <CardContent className="p-4 space-y-3">
                    <Skeleton className="h-5 w-full" />
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-6 w-20 rounded-full" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : sortedUsers.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              No users found.
            </div>
          ) : (
            <MotionList as="div" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {sortedUsers.map((user) => (
                <MotionListItem
                  key={user.id}
                  as="div"
                >
                  <Card
                    className="cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => onUserClick(user.id)}
                  >
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-sm truncate">{user.email}</div>
                          {user.name && (
                            <div className="text-sm text-muted-foreground truncate">{user.name}</div>
                          )}
                        </div>
                        <Checkbox
                          checked={selectedUserIds.includes(user.id)}
                          onCheckedChange={(checked) => handleSelectUser(user.id, checked as boolean)}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </div>
                      
                      <div className="flex items-center justify-between">
                        <Badge className={getPermissionBadgeColor(user.permission)}>
                          {user.permission}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            onUserClick(user.id);
                          }}
                        >
                          <Settings className="h-4 w-4" />
                        </Button>
                      </div>
                      
                      <div className="text-xs text-muted-foreground space-y-1">
                        <div>Joined: {user.date ? formatDate(user.date) : 'N/A'}</div>
                        {getUserBusinessUnitNames(user) && (
                          <div className="flex items-center gap-1">
                            <Building2 className="h-3 w-3" />
                            <span className="truncate">{getUserBusinessUnitNames(user)}</span>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </MotionListItem>
              ))}
            </MotionList>
          )}
        </div>
      ) : (
        /* List/Table View - Original */
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px]">
                  <Checkbox
                    checked={
                      sortedUsers.length > 0 &&
                      selectedUserIds.length === sortedUsers.length
                    }
                    onCheckedChange={handleSelectAll}
                  />
                </TableHead>
                <TableHead>User</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Business Unit</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <motion.tbody
              key={usersLoading ? "loading" : "loaded"}
              variants={listContainerStagger}
              initial="hidden"
              animate="visible"
            >
              {usersLoading ? (
              [...Array(5)].map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-4" /></TableCell>
                  <TableCell>
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-[200px]" />
                      <Skeleton className="h-3 w-[150px]" />
                    </div>
                  </TableCell>
                  <TableCell><Skeleton className="h-6 w-20 rounded-full" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-[100px]" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-[100px]" /></TableCell>
                  <TableCell><Skeleton className="h-8 w-8 ml-auto" /></TableCell>
                </TableRow>
              ))
            ) : sortedUsers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center">
                  No users found.
                </TableCell>
              </TableRow>
            ) : (
              sortedUsers.map((user) => (
                <motion.tr key={user.id} variants={listItemFadeInUp} className="group border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                  <TableCell>
                    <Checkbox
                      checked={selectedUserIds.includes(user.id)}
                      onCheckedChange={(checked) =>
                        handleSelectUser(user.id, checked as boolean)
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span 
                        className="font-medium cursor-pointer hover:underline"
                        onClick={() => onUserClick(user.id)}
                      >
                        {user.email}
                      </span>
                      {user.name && (
                        <span className="text-xs text-muted-foreground">
                          {user.name}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="secondary"
                      className={getPermissionBadgeColor(user.permission)}
                    >
                      {user.permission}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {getUserBusinessUnitNames(user) ? (
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Building2 className="h-3 w-3" />
                        {getUserBusinessUnitNames(user)}
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-sm">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {user.date ? formatDate(user.date) : "N/A"}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0">
                          <span className="sr-only">Open menu</span>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                        <DropdownMenuItem onClick={() => onUserClick(user.id)}>
                          View Details
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => {
                            navigator.clipboard.writeText(user.email);
                            toast.success("Email copied to clipboard");
                          }}
                        >
                          Copy Email
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </motion.tr>
              ))
            )}
          </motion.tbody>
        </Table>
        </div>
      )}
      
      {/* Infinite scroll sentinel */}
      <div ref={usersSentinelRef} className="flex justify-center py-4">
        {isFetchingNextPage && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading more users...
          </div>
        )}
      </div>
    </div>
  );
}


