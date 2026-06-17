import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertCircle, Check, ChevronsUpDown, Loader2, Share2, User } from "lucide-react";
import { useRouter } from "@tanstack/react-router";
import { announcementKeys } from "@/features/announcements/data/keys";
import { useUserSearch } from "@/features/users/data/hooks";
import { shareJob } from "@/features/recordings/data/api";
import { recordingsKeys } from "@/features/recordings/data/keys";
import { sharingToasts } from "@/lib/toast-utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [userSearchOpen, setUserSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  // Local input state to debounce typing before triggering network requests
  const [inputValue, setInputValue] = useState("");
  const router = useRouter();

  const form = useForm<JobShareFormData>({
    resolver: zodResolver(jobShareSchema),
    defaultValues: {
      shared_user_email: "",
      permission_level: "view",
      message: "",
    },
  });

  // Infinite query for user search with pagination (centralized)
  const {
    data: userSearchData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: isLoadingUsers,
  } = useUserSearch(searchQuery, isOpen);

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

  const shareJobMutation = useMutation({
    mutationFn: (data: JobShareFormData) => shareJob(jobId, data),
    onSuccess: (_, variables) => {
      // Copy share link to clipboard helper
      const copyShareLink = async () => {
        const shareUrl = `${window.location.origin}/audio-recordings/${jobId}`;
        try {
          await navigator.clipboard.writeText(shareUrl);
          sharingToasts.linkCopied();
        } catch (err) {
          toast.error("Failed to copy link");
        }
      };

      sharingToasts.granted(variables.shared_user_email, jobTitle, {
        onView: () => {
          onOpenChange(false);
          // Navigate to the recording details page (showing sharing info)
          try {
            router.navigate({
              to: "/audio-recordings/$id",
              params: { id: jobId },
              search: { tab: "sharing" },
            });
          } catch (e) {
            // Fallback
            window.location.href = `/audio-recordings/${jobId}`;
          }
        },
        onCopyLink: copyShareLink,
      });

      // Invalidate all relevant caches to ensure fresh data
      queryClient.invalidateQueries({ queryKey: recordingsKeys.jobSharingInfo(jobId) });
      queryClient.invalidateQueries({ queryKey: recordingsKeys.single(jobId) });
      queryClient.invalidateQueries({ queryKey: recordingsKeys.sharedJobs() });
      queryClient.invalidateQueries({ queryKey: recordingsKeys.base() });
      // Refresh announcements so recipients (or the sharer) see new share announcements quickly
      queryClient.invalidateQueries({ queryKey: announcementKeys.list() });
      form.reset();
      setSearchQuery("");
      setInputValue("");
      onOpenChange(false);
    },
    onError: (error, variables) => {
      sharingToasts.failed(variables.shared_user_email, error.message, {
        onRetry: () => {
          shareJobMutation.mutate(form.getValues());
        },
        onViewDetails: () => {
          console.error("Share error details:", error);
          toast.error("Error details logged to console");
        },
      });
    },
  });

  const handleSubmit = async (data: JobShareFormData) => {
    setIsSubmitting(true);
    try {
      await shareJobMutation.mutateAsync(data);
    } catch (error) {
      // Error is handled by the mutation
    } finally {
      setIsSubmitting(false);
    }
  };

  // Debounce the search input so we don't fire requests on every keystroke
  useEffect(() => {
    const t = setTimeout(() => {
      setSearchQuery(inputValue.trim());
    }, 1000);
    return () => clearTimeout(t);
  }, [inputValue]);

  const permissionDescriptions = {
    view: "Can view transcriptions and analysis results",
    edit: "Can view and edit transcription content",
    admin: "Full access including sharing permissions",
  };

  const permissionLevel = form.watch("permission_level");

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="h-5 w-5 text-primary" />
            Share Recording
          </DialogTitle>
          <DialogDescription>
            Share "{jobTitle}" with another user and set their permission level.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
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
                            !field.value && "text-muted-foreground"
                          )}
                          disabled={isSubmitting}
                        >
                          {field.value || "Select a user..."}
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
                                  form.setValue("shared_user_email", currentValue);
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
                    Search and select a user to share this recording with.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="permission_level"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Permission Level</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value}
                    disabled={isSubmitting}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select permission level" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="view">
                        <div className="flex flex-col items-start">
                          <span className="font-medium">View</span>
                          <span className="text-xs text-muted-foreground">
                            Can view transcriptions and analysis
                          </span>
                        </div>
                      </SelectItem>
                      <SelectItem value="edit">
                        <div className="flex flex-col items-start">
                          <span className="font-medium">Edit</span>
                          <span className="text-xs text-muted-foreground">
                            Can view and edit content
                          </span>
                        </div>
                      </SelectItem>
                      <SelectItem value="admin">
                        <div className="flex flex-col items-start">
                          <span className="font-medium">Admin</span>
                          <span className="text-xs text-muted-foreground">
                            Full access including sharing
                          </span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <FormDescription>{permissionDescriptions[permissionLevel]}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="message"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Message (Optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Add a message for the recipient..."
                      className="resize-none"
                      rows={3}
                      {...field}
                      disabled={isSubmitting}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex items-center gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting} className="flex-1">
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sharing...
                  </>
                ) : (
                  <>
                    <Share2 className="mr-2 h-4 w-4" />
                    Share
                  </>
                )}
              </Button>
            </div>
          </form>
        </Form>

        {shareJobMutation.error && (
          <div className="mt-4 p-3 bg-destructive/10 text-destructive rounded-md flex items-start gap-2 text-sm" role="alert" aria-live="assertive">
            <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" aria-hidden="true" />
            <div>
              <p className="font-medium">Sharing failed</p>
              <p>{shareJobMutation.error.message}</p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}


