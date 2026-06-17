import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import {
  getAnnouncementsQuery,
  useDismissAnnouncementMutation,
  useMarkAnnouncementAsReadMutation,
} from '../data/queries';
import { AnnouncementItem } from './AnnouncementItem';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { getStorageItem, setStorageItem } from '@/lib/storage';

const STORAGE_KEYS = {
  DISMISSED: 'community-brief:announcements-dismissed',
  READ: 'community-brief:announcements-read',
} as const;

function getStoredIds(key: string): Array<string> {
  try {
    const stored = getStorageItem(key, '');
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function setStoredIds(key: string, ids: Array<string>): void {
  setStorageItem(key, JSON.stringify(ids));
}

export interface AnnouncementPopoverProps {
  className?: string;
}

export function AnnouncementPopover({ className }: AnnouncementPopoverProps) {
  const [isOpen, setIsOpen] = useState(false);

  const [readIds, setReadIds] = useState<Set<string>>(
    () => new Set(getStoredIds(STORAGE_KEYS.READ))
  );
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(
    () => new Set(getStoredIds(STORAGE_KEYS.DISMISSED))
  );

  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEYS.READ) {
        setReadIds(new Set(getStoredIds(STORAGE_KEYS.READ)));
      } else if (e.key === STORAGE_KEYS.DISMISSED) {
        setDismissedIds(new Set(getStoredIds(STORAGE_KEYS.DISMISSED)));
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const { data: announcements = [], isLoading } = useQuery(getAnnouncementsQuery());

  const dismissMutation = useDismissAnnouncementMutation();
  const readMutation = useMarkAnnouncementAsReadMutation();

  const visibleAnnouncements = useMemo(() => {
    return announcements.filter((ann) => !dismissedIds.has(ann.id));
  }, [announcements, dismissedIds]);

  const unreadCount = useMemo(() => {
    return visibleAnnouncements.filter((ann) => !readIds.has(ann.id)).length;
  }, [visibleAnnouncements, readIds]);

  const handleMarkAsRead = useCallback(
    (id: string) => {
      const newReadIds = new Set(readIds);
      newReadIds.add(id);
      setReadIds(newReadIds);
      setStoredIds(STORAGE_KEYS.READ, Array.from(newReadIds));

      readMutation.mutate(id);
    },
    [readIds, readMutation]
  );

  const handleDismiss = useCallback(
    (id: string) => {
      const newDismissedIds = new Set(dismissedIds);
      newDismissedIds.add(id);
      setDismissedIds(newDismissedIds);
      setStoredIds(STORAGE_KEYS.DISMISSED, Array.from(newDismissedIds));

      dismissMutation.mutate(id);
    },
    [dismissedIds, dismissMutation]
  );

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn('relative', className)}
          aria-label="Announcements"
        >
          <Bell className="size-5" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -right-1 -top-1 size-5 p-0 flex items-center justify-center text-[10px] font-bold"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent
        className="w-96 p-0 shadow-lg border rounded-xl overflow-hidden"
        align="end"
        sideOffset={8}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
          <div>
            <h2 className="text-sm font-semibold">Notifications</h2>
            {unreadCount > 0 && (
              <p className="text-xs text-muted-foreground">{unreadCount} unread</p>
            )}
          </div>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-7 px-2"
              onClick={() => {
                visibleAnnouncements
                  .filter((a) => !readIds.has(a.id))
                  .forEach((a) => handleMarkAsRead(a.id));
              }}
            >
              Mark all read
            </Button>
          )}
        </div>

        <ScrollArea className="h-[400px]">
          <div className="py-2">
            {isLoading ? (
              <div className="py-8 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
                <span className="animate-pulse">Loading updates...</span>
              </div>
            ) : visibleAnnouncements.length === 0 ? (
              <div className="py-12 px-6 text-center text-muted-foreground flex flex-col items-center gap-3">
                <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                  <Bell className="h-6 w-6 text-muted-foreground/50" />
                </div>
                <div>
                  <p className="font-medium text-sm">All caught up</p>
                  <p className="text-xs mt-1">No new announcements to check.</p>
                </div>
              </div>
            ) : (
              visibleAnnouncements.map((announcement) => (
                <AnnouncementItem
                  key={announcement.id}
                  announcement={announcement}
                  isRead={readIds.has(announcement.id)}
                  onMarkAsRead={handleMarkAsRead}
                  onDismiss={handleDismiss}
                />
              ))
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
