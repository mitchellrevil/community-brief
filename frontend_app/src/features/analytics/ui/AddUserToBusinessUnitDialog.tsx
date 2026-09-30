import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Check,
  ChevronsUpDown,
  Loader2,
  Plus,
  User,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { useUserSearch } from "@/features/users/data/hooks";
import { usersKeys } from "@/features/users/data/keys";
import { addUserToBusinessUnit } from "@/shared/data/business-units/api";
import { cn } from "@/lib/utils";


const addUserSchema = z.object({
  target_user_email: z.string().email("Please enter a valid email address"),
});

type AddUserFormData = z.infer<typeof addUserSchema>;

interface AddUserToBusinessUnitDialogProps {
  businessUnitId?: string | null;
  onUserAdded?: () => void;
}

export function AddUserToBusinessUnitDialog({
  businessUnitId,
  onUserAdded,
}: AddUserToBusinessUnitDialogProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [userSearchOpen, setUserSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [inputValue, setInputValue] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<AddUserFormData>({
    resolver: zodResolver(addUserSchema),
    defaultValues: {
      target_user_email: "",
    },
  });

  // Infinite query for user search with pagination (centralized)
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
    }, 1000);
    return () => clearTimeout(t);
  }, [inputValue]);

  const addUserMutation = useMutation({
    mutationFn: async (email: string) => {
      if (!businessUnitId) throw new Error("Business unit not set");
      return addUserToBusinessUnit(email, [businessUnitId]);
    },
    onSuccess: (_, email) => {
      toast.success(`User ${email} added to business unit`);
      
      // Invalidate business unit related queries
      queryClient.invalidateQueries({ queryKey: ['business-units'] });
      queryClient.invalidateQueries({ queryKey: usersKeys.root() });
      
      form.reset();
      setSearchQuery("");
      setInputValue("");
      setOpen(false);
      onUserAdded?.();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to add user");
    },
  });

  const handleSubmit = async (data: AddUserFormData) => {
    if (!businessUnitId) {
      toast.error("Business unit not set");
      return;
    }

    setIsSubmitting(true);
    try {
      await addUserMutation.mutateAsync(data.target_user_email);
    } catch (error) {
      // Error is handled by the mutation
    } finally {
      setIsSubmitting(false);
    }
  };


  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus className="h-4 w-4 mr-2" />
          Add User to BU
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5 text-primary" />
            Add User to Business Unit
          </DialogTitle>
          <DialogDescription>
            Search and add a user to your business unit
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="target_user_email"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>User</FormLabel>
                  <Popover open={userSearchOpen} onOpenChange={setUserSearchOpen}>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={userSearchOpen}
                          className={cn(
                            "w-full justify-between",
                            !field.value && "text-muted-foreground"
                          )}
                          disabled={isSubmitting}
                        >
                          {field.value || "Select a user..."}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-[450px] p-0" align="start">
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
                            {allUsers.map((user) => (
                              <CommandItem
                                key={user.id}
                                value={user.email}
                                onSelect={(currentValue) => {
                                  form.setValue("target_user_email", currentValue);
                                  setUserSearchOpen(false);
                                }}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    field.value === user.email
                                      ? "opacity-100"
                                      : "opacity-0"
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
                  <FormDescription>
                    Search and select a user to add to this business unit.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => {
                  setOpen(false);
                  form.reset();
                  setSearchQuery("");
                  setInputValue("");
                }}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={!form.watch("target_user_email") || isSubmitting}>
                {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {isSubmitting ? "Adding..." : "Add User"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}


