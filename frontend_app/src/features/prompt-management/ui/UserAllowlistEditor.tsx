import { useCallback, useEffect, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { Check, ChevronsUpDown, Loader2, User, X } from "lucide-react";
import type { UserSearchResult } from "@/features/users/data/api";
import {
  fetchUserByEmail,
  fetchUserById,
} from "@/features/users/data/api";
import { useUserSearch } from "@/features/users/data/hooks";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type AllowlistUser = Pick<UserSearchResult, "id" | "email" | "name">;

interface UserAllowlistEditorProps {
  value: Array<string> | null | undefined;
  onChange: (value: Array<string> | null) => void;
  disabled?: boolean;
  className?: string;
}

export function UserAllowlistEditor({
  value,
  onChange,
  disabled = false,
  className,
}: UserAllowlistEditorProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [inputValue, setInputValue] = useState("");

  const {
    data: userSearchData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: isLoadingUsers,
  } = useUserSearch(searchQuery, open);

  const allUsers = userSearchData?.pages.flatMap((page) => page.users) || [];
  const selectedIds = value ?? [];
  const selectedUserQueries = useQueries({
    queries: selectedIds.map((userId) => ({
      queryKey: ["users", "allowlist-selected", userId],
      queryFn: () => userId.includes("@") ? fetchUserByEmail(userId) : fetchUserById(userId),
      staleTime: 5 * 60 * 1000,
      retry: false,
    })),
  });
  const selectedUsers: Array<AllowlistUser> = [];
  selectedUserQueries.forEach((query) => {
    const user = query.data;
    if (user) {
      selectedUsers.push({
        id: user.id,
        email: user.email,
        name: user.name || user.full_name || user.email,
      });
    }
  });
  const usersById = new Map<string, AllowlistUser>();
  [...allUsers, ...selectedUsers].forEach((user) => {
    usersById.set(user.id, user);
    if (user.email) {
      usersById.set(user.email.toLowerCase(), user);
    }
  });

  const getUserLabel = (userId: string) => {
    const user = usersById.get(userId) || usersById.get(userId.toLowerCase());
    return user?.name || user?.email || userId;
  };

  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const bottom =
        e.currentTarget.scrollHeight - e.currentTarget.scrollTop <=
        e.currentTarget.clientHeight + 50;
      if (bottom && hasNextPage && !isFetchingNextPage) {
        fetchNextPage();
      }
    },
    [hasNextPage, isFetchingNextPage, fetchNextPage]
  );

  useEffect(() => {
    const t = setTimeout(() => {
      setSearchQuery(inputValue.trim());
    }, 300);
    return () => clearTimeout(t);
  }, [inputValue]);

  const toggleUser = (userId: string) => {
    if (selectedIds.includes(userId)) {
      const next = selectedIds.filter((id) => id !== userId);
      onChange(next.length > 0 ? next : null);
    } else {
      onChange([...selectedIds, userId]);
    }
  };

  const removeUser = (userId: string) => {
    const next = selectedIds.filter((id) => id !== userId);
    onChange(next.length > 0 ? next : null);
  };

  const clearAll = () => {
    onChange(null);
  };

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium">
          Restricted Access (User Allowlist)
        </label>
        {selectedIds.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={clearAll}
            disabled={disabled}
            className="text-xs h-6 px-2"
          >
            Clear all
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {selectedIds.length === 0
          ? "No restrictions — all eligible users can access this meeting type."
          : `Only ${selectedIds.length} selected user(s) can use this meeting type at runtime.`}
      </p>

      {selectedIds.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selectedIds.map((userId) => {
            return (
              <Badge key={userId} variant="secondary" className="gap-1 pr-1">
                <User className="h-3 w-3" />
                <span className="max-w-[120px] truncate text-xs">
                  {getUserLabel(userId)}
                </span>
                <button
                  type="button"
                  onClick={() => removeUser(userId)}
                  disabled={disabled}
                  className="ml-0.5 rounded-full p-0.5 hover:bg-muted"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            );
          })}
        </div>
      )}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className="w-full justify-between"
          >
            <span className="text-muted-foreground">Add users...</span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[320px] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Search users..."
              value={inputValue}
              onValueChange={setInputValue}
            />
            <CommandList onScroll={handleScroll} className="max-h-[200px]">
              {isLoadingUsers ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              ) : allUsers.length === 0 ? (
                <CommandEmpty>No users found.</CommandEmpty>
              ) : (
                <CommandGroup>
                  {allUsers.map((user) => (
                    <CommandItem
                      key={user.id}
                      value={user.id}
                      onSelect={() => toggleUser(user.id)}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          selectedIds.includes(user.id)
                            ? "opacity-100"
                            : "opacity-0"
                        )}
                      />
                      <div className="flex flex-col">
                        <span className="text-sm">
                          {user.name || user.email}
                        </span>
                        {user.name && (
                          <span className="text-xs text-muted-foreground">
                            {user.email}
                          </span>
                        )}
                      </div>
                    </CommandItem>
                  ))}
                  {isFetchingNextPage && (
                    <div className="flex items-center justify-center py-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                    </div>
                  )}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
