import { useState } from 'react';
import { AlertCircle, AlertTriangle, Check, Clock, Info, X } from 'lucide-react';
import { getAnnouncementBody, normalizePriority } from '../lib/announcement-utils';
import { AnnouncementMarkdown } from './AnnouncementMarkdown';
import type { Announcement } from '../data/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { parseDate } from '@/lib/date-utils';

export interface AnnouncementItemProps {
  announcement: Announcement;
  isRead: boolean;
  onMarkAsRead: (id: string) => void;
  onDismiss: (id: string) => void;
}

function formatDate(value: string | number): string {
  const date = parseDate(value);
  if (!date) return '';
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) return 'Just now';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

const PRIORITY_CONFIG = {
  critical: { icon: AlertCircle, color: 'text-destructive', bg: 'bg-destructive/10' },
  high: { icon: AlertTriangle, color: 'text-amber-500', bg: 'bg-amber-500/10' },
  normal: { icon: Info, color: 'text-blue-500', bg: 'bg-blue-500/10' },
  low: { icon: Info, color: 'text-muted-foreground', bg: 'bg-muted' },
};

export function AnnouncementItem({
  announcement,
  isRead,
  onMarkAsRead,
  onDismiss,
}: AnnouncementItemProps) {
  const [isOpen, setIsOpen] = useState(false);
  const priority = normalizePriority(announcement.priority);
  const config = PRIORITY_CONFIG[priority];
  const body = getAnnouncementBody(announcement);
  const PriorityIcon = config.icon;

  return (
    <>
      <div
        className={cn(
          'group relative flex gap-3 p-4 transition-all hover:bg-accent/50 cursor-pointer',
          !isRead ? 'bg-accent/30' : 'bg-transparent',
          'border-b last:border-0'
        )}
        data-testid={`announcement-item-${announcement.id}`}
        role="button"
        aria-label={`View announcement: ${announcement.title}`}
        onClick={() => setIsOpen(true)}
      >
        <div className="flex flex-col items-center gap-2 pt-1">
          {!isRead && <span className="h-2 w-2 rounded-full bg-blue-500 mb-1" />}
          <div className={cn('p-1.5 rounded-full', config.bg)}>
            <PriorityIcon className={cn('h-3.5 w-3.5', config.color)} />
          </div>
        </div>

        <div className="flex-1 space-y-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h4
              className={cn(
                'text-sm font-semibold leading-none',
                !isRead ? 'text-foreground' : 'text-muted-foreground'
              )}
            >
              {announcement.title}
            </h4>
            <span className="text-[10px] text-muted-foreground whitespace-nowrap flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatDate(announcement.created_at)}
            </span>
          </div>

          <div className="line-clamp-2 text-xs text-muted-foreground">
            <AnnouncementMarkdown
              content={body}
              compact
              className="text-muted-foreground [&_a]:pointer-events-none"
            />
          </div>

          <div className="flex items-center gap-2 pt-2 opacity-0 group-hover:opacity-100 transition-opacity">
            {!isRead && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-[10px] hover:bg-blue-500/10 hover:text-blue-500"
                onClick={(e) => {
                  e.stopPropagation();
                  onMarkAsRead(announcement.id);
                }}
              >
                <Check className="h-3 w-3 mr-1" />
                Mark read
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[10px] hover:bg-destructive/10 hover:text-destructive"
              onClick={(e) => {
                e.stopPropagation();
                onDismiss(announcement.id);
              }}
            >
              <X className="h-3 w-3 mr-1" />
              Dismiss
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="w-full max-w-3xl md:max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Badge
                variant="outline"
                className={cn('text-[10px] font-medium px-1.5 py-0.5', config.color, config.bg)}
              >
                {priority.toUpperCase()}
              </Badge>
              <span>{announcement.title}</span>
            </DialogTitle>
            <DialogDescription className="flex items-center gap-2 text-xs">
              <Clock className="w-3 h-3" />
              <span>{formatDate(announcement.created_at)}</span>
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4">
            <AnnouncementMarkdown content={body} />
          </div>

          <div className="flex justify-end gap-2 mt-6">
            {!isRead && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  onMarkAsRead(announcement.id);
                }}
              >
                <Check className="h-3 w-3 mr-1" />
                Mark as read
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                onDismiss(announcement.id);
                setIsOpen(false);
              }}
            >
              <X className="h-3 w-3 mr-1" />
              Dismiss
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
