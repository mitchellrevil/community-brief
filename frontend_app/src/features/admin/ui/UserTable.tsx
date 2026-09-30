/**
 * User Table Component
 * 
 * Displays a table of users with search/filter capabilities.
 * This is a simplified version for admin use cases.
 * For the full-featured table, see UsersTable in user-management/.
 */

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { PermissionLevel } from "@/types/permissions";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

export interface User {
  id: string;
  email: string;
  name?: string;
  permission: PermissionLevel | string;
  createdAt?: string;
}

export interface UserTableProps {
  /** List of users to display */
  users: Array<User>;
  /** Whether data is loading */
  isLoading?: boolean;
  /** Handler for clicking a user row */
  onUserClick?: (userId: string) => void;
  /** Additional class names */
  className?: string;
}

/**
 * UserTable - Displays users with search filtering.
 * 
 * @example
 * ```tsx
 * <UserTable 
 *   users={[{ id: "1", email: "user@example.com", permission: "User" }]}
 *   onUserClick={(id) => navigate(`/users/${id}`)}
 * />
 * ```
 */
export function UserTable({
  users,
  isLoading = false,
  onUserClick,
  className,
}: UserTableProps) {
  const [searchTerm, setSearchTerm] = useState("");

  // Filter users by search term
  const filteredUsers = useMemo(() => {
    if (!searchTerm.trim()) return users;
    
    const term = searchTerm.toLowerCase();
    return users.filter(
      (user) =>
        user.email.toLowerCase().includes(term) ||
        user.name?.toLowerCase().includes(term)
    );
  }, [users, searchTerm]);

  const getPermissionBadgeVariant = (permission: string) => {
    switch (permission.toLowerCase()) {
      case "admin":
        return "destructive";
      case "editor":
      case "moderator":
        return "default";
      default:
        return "secondary";
    }
  };

  // Loading skeleton
  if (isLoading) {
    return (
      <div className={className}>
        <div className="mb-4">
          <Skeleton className="h-10 w-72" />
        </div>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Permission</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...Array(5)].map((_, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <Skeleton className="h-4 w-48" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-6 w-16 rounded-full" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      {/* Search input */}
      <div className="relative mb-4 w-72">
        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search users..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-8"
          data-testid="user-search-input"
          aria-label="Search users"
        />
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Permission</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredUsers.length === 0 ? (
              <TableRow>
                <TableCell 
                  colSpan={2} 
                  className="h-24 text-center text-muted-foreground"
                >
                  {users.length === 0 
                    ? "No users found." 
                    : "No users match your search."}
                </TableCell>
              </TableRow>
            ) : (
              filteredUsers.map((user) => (
                <TableRow
                  key={user.id}
                  className={onUserClick ? "cursor-pointer hover:bg-muted/50" : ""}
                  onClick={() => onUserClick?.(user.id)}
                  data-testid={`user-row-${user.id}`}
                >
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">{user.email}</span>
                      {user.name && (
                        <span className="text-xs text-muted-foreground">
                          {user.name}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={getPermissionBadgeVariant(user.permission)}>
                      {user.permission}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Results count */}
      {users.length > 0 && (
        <p className="text-sm text-muted-foreground mt-2">
          Showing {filteredUsers.length} of {users.length} users
        </p>
      )}
    </div>
  );
}

export default UserTable;
