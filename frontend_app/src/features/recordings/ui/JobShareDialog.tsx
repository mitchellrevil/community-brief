import { useCallback, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { toast } from "sonner";
import {
  AlertCircle,
  Check,
  ChevronsUpDown,
  Copy,
  Loader2,
  User,
  UserMinus,
  Users,
} from "lucide-react";
import type { SharedUserInfo } from "@/types/api";
import { announcementKeys } from "@/features/announcements/data/keys";
import { useUserSearch } from "@/features/users/data/hooks";
import { getJobSharingInfo, shareJob, unshareJob } from "@/features/recordings/data/api";
import { recordingsKeys } from "@/features/recordings/data/keys";
import { sharingToasts } from "@/lib/toast-utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const permissionOptions = [
  { value: "view", label: "View" },
  { value: "edit", label: "Edit" },
  { value: "admin", label: "Admin" },
] as const;

type PermissionLevel = (typeof permissionOptions)[number]["value"];

function accessInitials(value: string) {
  const name = value.split("@")[0].replace(/[^a-zA-Z0-9]+/g, " ").trim();
  if (!name) return "?";

  const words = name.split(/\s+/).filter(Boolean);
  if (words.length > 1) {
    return `${words[0][0]}${words[1][0]}`.toUpperCase();
  }

  const capitals = name.match(/[A-Z]/g);
  if (capitals && capitals.length > 1) {
    return capitals.slice(0, 2).join("").toUpperCase();
  }

  return name.slice(0, 2).toUpperCase();
}

const jobShareSchema = z.object({
  shared_user_email: z.string().email("Please enter a valid email address"),
  permission_level: z.enum(["view", "edit", "admin"], {
    error: "Please select a permission level",
  }),
  message: z.string().optional(),
});

type JobShareFormData = z.infer<typeof jobShareSchema>;

interface JobShareDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  jobId: string;
  jobTitle?: string;
}

export function JobShareDialog({
  isOpen,
  onOpenChange,
  jobId,
  jobTitle = "Recording",
}: JobShareDialogProps) {
  const queryClient = useQueryClient();
  const [userSearchOpen, setUserSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [inputValue, setInputValue] = useState("");

  const form = useForm<JobShareFormData>({
    resolver: zodResolver(jobShareSchema),
    defaultValues: {
      shared_user_email: "",
      permission_level: "view",
      message: "",
    },
  });

  const {
    data: sharingInfo,
    isLoading: isLoadingSharing,
    error: sharingError,
  } = useQuery({
    queryKey: recordingsKeys.jobSharingInfo(jobId),
    queryFn: () => getJobSharingInfo(jobId),
    enabled: isOpen && Boolean(jobId),
    staleTime: 30000,
  });

  const {
    data: userSearchData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: isLoadingUsers,
  } = useUserSearch(searchQuery, isOpen && userSearchOpen);

  const allUsers = userSearchData?.pages.flatMap((page) => page.users) || [];
  const sharedWith = sharingInfo?.shared_with ?? [];
  const canManageAccess = Boolean(sharingInfo?.is_owner || sharingInfo?.user_permission === "admin");
  const isBusy = isLoadingSharing;

  const invalidateAccessQueries = useCallback(
    (includeAnnouncements = false) => {
      queryClient.invalidateQueries({ queryKey: recordingsKeys.jobSharingInfo(jobId) });
      queryClient.invalidateQueries({ queryKey: recordingsKeys.single(jobId) });
      queryClient.invalidateQueries({ queryKey: recordingsKeys.sharedJobs() });
      queryClient.invalidateQueries({ queryKey: recordingsKeys.base() });
      if (includeAnnouncements) {
        queryClient.invalidateQueries({ queryKey: announcementKeys.list() });
      }
    },
    [jobId, queryClient],
  );

  const shareJobMutation = useMutation({
    mutationFn: (data: JobShareFormData) => shareJob(jobId, data),
    onSuccess: (_, variables) => {
      invalidateAccessQueries(true);
      sharingToasts.granted(variables.shared_user_email, jobTitle);
      form.reset();
      setSearchQuery("");
      setInputValue("");
    },
    onError: (error, variables) => {
      sharingToasts.failed(variables.shared_user_email, error.message, {
        onRetry: () => shareJobMutation.mutate(form.getValues()),
      });
    },
  });

  const updatePermissionMutation = useMutation({
    mutationFn: (data: { userEmail: string; permissionLevel: PermissionLevel }) =>
      shareJob(jobId, {
        shared_user_email: data.userEmail,
        permission_level: data.permissionLevel,
      }),
    onSuccess: (_, variables) => {
      invalidateAccessQueries(true);
      toast.success(`Permission updated for ${variables.userEmail}`);
    },
    onError: (error, variables) => {
      sharingToasts.failed(variables.userEmail, error.message, {
        onRetry: () => updatePermissionMutation.mutate(variables),
      });
    },
  });

  const removeAccessMutation = useMutation({
    mutationFn: (userEmail: string) => unshareJob(jobId, userEmail),
    onSuccess: (_, userEmail) => {
      invalidateAccessQueries();
      sharingToasts.revoked(userEmail);
    },
    onError: (error, userEmail) => {
      sharingToasts.failed(userEmail, error.message, {
        onRetry: () => removeAccessMutation.mutate(userEmail),
      });
    },
  });

  const handleScroll = useCallback(
    (event: React.UIEvent<HTMLDivElement>) => {
      const bottom =
        event.currentTarget.scrollHeight - event.currentTarget.scrollTop <=
        event.currentTarget.clientHeight + 50;

      if (bottom && hasNextPage && !isFetchingNextPage) {
        fetchNextPage();
      }
    },
    [fetchNextPage, hasNextPage, isFetchingNextPage],
  );

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/audio-recordings/${jobId}`);
      sharingToasts.linkCopied();
    } catch {
      toast.error("Failed to copy link");
    }
  };

  const handlePermissionChange = (
    share: SharedUserInfo,
    permissionLevel: PermissionLevel,
  ) => {
    if (share.permission_level === permissionLevel) return;
    updatePermissionMutation.mutate({
      userEmail: share.user_email,
      permissionLevel,
    });
  };

  const accessError = useMemo(() => {
    if (!sharingError) return null;
    return sharingError instanceof Error ? sharingError.message : "Unable to load access";
  }, [sharingError]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(inputValue.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [inputValue]);

  useEffect(() => {
    if (isOpen) return;
    form.reset();
    setSearchQuery("");
    setInputValue("");
    setUserSearchOpen(false);
  }, [form, isOpen]);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Manage Access
          </DialogTitle>
          <DialogDescription className="break-words pr-8">
            Manage who can open "{jobTitle}" and what they can do.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-medium">Recording link</p>
              <p className="truncate text-xs text-muted-foreground">
                {typeof window !== "undefined" ? `${window.location.origin}/audio-recordings/${jobId}` : jobId}
              </p>
            </div>
            <Button type="button" variant="outline" onClick={handleCopyLink} className="shrink-0">
              <Copy className="mr-2 h-4 w-4" />
              Copy link
            </Button>
          </div>

          {canManageAccess && (
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit((data) => shareJobMutation.mutate(data))}
                className="space-y-3 rounded-md border p-3"
              >
                <div className="grid gap-3 sm:grid-cols-[1fr_9rem]">
                  <FormField
                    control={form.control}
                    name="shared_user_email"
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
                                  !field.value && "text-muted-foreground",
                                )}
                                disabled={shareJobMutation.isPending}
                              >
                                <span className="truncate">{field.value || "Select a user..."}</span>
                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-[min(92vw,26rem)] p-0" align="start">
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
                                        form.setValue("shared_user_email", currentValue, {
                                          shouldValidate: true,
                                        });
                                        setUserSearchOpen(false);
                                      }}
                                    >
                                      <Check
                                        className={cn(
                                          "mr-2 h-4 w-4",
                                          field.value === user.email ? "opacity-100" : "opacity-0",
                                        )}
                                      />
                                      <User className="mr-2 h-4 w-4 text-muted-foreground" />
                                      <div className="min-w-0">
                                        <p className="truncate text-sm font-medium">{user.email}</p>
                                        {user.name && (
                                          <p className="truncate text-xs text-muted-foreground">
                                            {user.name}
                                          </p>
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
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="permission_level"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Permission</FormLabel>
                        <Select
                          value={field.value}
                          onValueChange={field.onChange}
                          disabled={shareJobMutation.isPending}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {permissionOptions.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="message"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Message</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Add an optional message..."
                          rows={2}
                          className="resize-none"
                          disabled={shareJobMutation.isPending}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex justify-end">
                  <Button type="submit" disabled={shareJobMutation.isPending}>
                    {shareJobMutation.isPending && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Add access
                  </Button>
                </div>
              </form>
            </Form>
          )}

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">People with access</h3>
              {sharingInfo && (
                <Badge variant="secondary">
                  {sharingInfo.total_shares} shared
                </Badge>
              )}
            </div>

            {isBusy && (
              <div className="flex items-center justify-center rounded-md border p-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            )}

            {accessError && (
              <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>{accessError}</p>
              </div>
            )}

            {!isBusy && !accessError && (
              <div className="divide-y rounded-md border">
                {sharingInfo?.is_owner && (
                  <div className="flex items-center gap-3 px-3 py-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-muted-foreground">
                      {accessInitials("You")}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">You</p>
                      <p className="text-xs text-muted-foreground">Owner</p>
                    </div>
                    <Badge>Owner</Badge>
                  </div>
                )}

                {sharedWith.map((share) => (
                  <AccessRow
                    key={share.user_id || share.user_email}
                    share={share}
                    canManageAccess={canManageAccess}
                    isUpdating={updatePermissionMutation.isPending}
                    isRemoving={removeAccessMutation.isPending}
                    onPermissionChange={handlePermissionChange}
                    onRemove={(email) => removeAccessMutation.mutate(email)}
                  />
                ))}

                {!sharingInfo?.is_owner && sharedWith.length === 0 && (
                  <div className="p-6 text-center text-sm text-muted-foreground">
                    No shared users found.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AccessRow({
  share,
  canManageAccess,
  isUpdating,
  isRemoving,
  onPermissionChange,
  onRemove,
}: {
  share: SharedUserInfo;
  canManageAccess: boolean;
  isUpdating: boolean;
  isRemoving: boolean;
  onPermissionChange: (share: SharedUserInfo, permissionLevel: PermissionLevel) => void;
  onRemove: (email: string) => void;
}) {
  const currentPermission = permissionOptions.some((option) => option.value === share.permission_level)
    ? (share.permission_level as PermissionLevel)
    : "view";

  return (
    <div className="flex flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-muted-foreground">
          {accessInitials(share.user_email)}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{share.user_email}</p>
          {share.message && (
            <p className="truncate text-xs text-muted-foreground">{share.message}</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 sm:justify-end">
        {canManageAccess ? (
          <Select
            value={currentPermission}
            onValueChange={(value) => onPermissionChange(share, value as PermissionLevel)}
            disabled={isUpdating || isRemoving}
          >
            <SelectTrigger
              className="h-9 w-28"
              aria-label={`Permission for ${share.user_email}`}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {permissionOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Badge variant="outline" className="capitalize">
            {currentPermission}
          </Badge>
        )}

        {canManageAccess && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-destructive"
                disabled={isRemoving}
                aria-label={`Remove access for ${share.user_email}`}
              >
                {isRemoving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <UserMinus className="h-4 w-4" />
                )}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remove Access</AlertDialogTitle>
                <AlertDialogDescription>
                  Remove access for {share.user_email}? They will no longer be able to open this recording.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => onRemove(share.user_email)}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Remove Access
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    </div>
  );
}
