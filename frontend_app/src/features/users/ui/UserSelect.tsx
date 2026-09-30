import { useCallback, useEffect, useState } from "react";
import { Check, ChevronsUpDown, Loader2, User } from "lucide-react";
import useUserSearch from "@/features/users/data/hooks";
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
import { cn } from "@/lib/utils";

interface UserSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  includeAllOption?: boolean;
  allOptionLabel?: string;
}

export function UserSelect({
  value,
  onValueChange,
  placeholder = "Select user...",
  disabled = false,
  className,
  includeAllOption = true,
  allOptionLabel = "All Users",
}: UserSelectProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [inputValue, setInputValue] = useState("");

  // Infinite query for user search with pagination
  const {
    data: userSearchData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: isLoadingUsers,
  } = useUserSearch(searchQuery, open);

  // Flatten paginated results
  const allUsers = userSearchData?.pages.flatMap((page) => page.users) || [];

  // Handle scroll to load more
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

  // Debounce the search input
  useEffect(() => {
    const t = setTimeout(() => {
      setSearchQuery(inputValue.trim());
    }, 300);
    return () => clearTimeout(t);
  }, [inputValue]);

  // Get display label for selected value
  const getDisplayLabel = () => {
    if (value === "all" && includeAllOption) {
      return allOptionLabel;
    }
    const selectedUser = allUsers.find((user) => user.id === value);
    if (selectedUser) {
      return selectedUser.name || selectedUser.email;
    }
    return placeholder;
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "w-[200px] justify-between",
            !value && "text-muted-foreground",
            className
          )}
          disabled={disabled}
        >
          <span className="truncate">{getDisplayLabel()}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search users by email or name..."
            value={inputValue}
            onValueChange={setInputValue}
          />
          <CommandList onScroll={handleScroll}>
            <CommandEmpty>
              {isLoadingUsers ? "Loading users..." : "No users found."}
            </CommandEmpty>
            <CommandGroup>
              {includeAllOption && (
                <CommandItem
                  value="all"
                  onSelect={() => {
                    onValueChange("all");
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === "all" ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <User className="mr-2 h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{allOptionLabel}</span>
                </CommandItem>
              )}
              {allUsers.map((user) => (
                <CommandItem
                  key={user.id}
                  value={user.id}
                  onSelect={(currentValue) => {
                    onValueChange(currentValue);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === user.id ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <User className="mr-2 h-4 w-4 text-muted-foreground" />
                  <div className="flex flex-col">
                    <span className="font-medium">{user.email}</span>
                    {user.name && (
                      <span className="text-xs text-muted-foreground">
                        {user.name}
                      </span>
                    )}
                  </div>
                </CommandItem>
              ))}
              {isFetchingNextPage && (
                <div className="flex items-center justify-center py-2">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
