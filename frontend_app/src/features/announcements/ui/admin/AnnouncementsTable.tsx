import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { deleteAnnouncement, fetchAdminAnnouncements } from '../../data/api';
import { announcementKeys } from '../../data/keys';
import { getAnnouncementBody } from '../../lib/announcement-utils';
import type { AdminAnnouncementsResponse, Announcement } from '../../data/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatDate } from '@/lib/date-utils';
import { getBusinessUnitsQuery } from '@/shared/data/business-units/queries';

type Props = {
  onEdit?: (a: Announcement) => void;
};

function getAnnouncementSummary(announcement: Announcement): string {
  return getAnnouncementBody(announcement).slice(0, 120);
}

export function AnnouncementsTable({ onEdit }: Props) {
  const [limit] = useState<number>(50);
  const [offset, setOffset] = useState<number>(0);
  const [search, setSearch] = useState<string>('');
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>(
    'all'
  );
  const [filterPriority, setFilterPriority] = useState<string>('all');

  const queryClient = useQueryClient();
  const { data: businessUnits = [] } = useQuery(getBusinessUnitsQuery());

  const { data, isLoading } = useQuery<AdminAnnouncementsResponse>({
    queryKey: announcementKeys.adminTable(
      limit,
      offset,
      filterActive,
      filterPriority
    ),
    queryFn: () => fetchAdminAnnouncements(limit, offset),
  });

  const items: Array<Announcement> = data?.items ?? [];
  const businessUnitNamesById = useMemo(
    () => new Map(businessUnits.map((unit) => [unit.id, unit.name])),
    [businessUnits]
  );

  const filtered = useMemo(() => {
    let list = items;
    if (search.trim().length > 0) {
      const q = search.toLowerCase();
      list = list.filter(
        (a) =>
          (a.title || '').toLowerCase().includes(q) ||
          (a.body || '').toLowerCase().includes(q)
      );
    }
    if (filterPriority !== 'all') {
      list = list.filter((a) => a.priority === filterPriority);
    }
    if (filterActive !== 'all') {
      const want = filterActive === 'active';
      list = list.filter((a) => !!a.is_active === want);
    }
    return list;
  }, [items, search, filterPriority, filterActive]);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteAnnouncement(id),
    onSuccess: () => {
      toast.success('Announcement deleted');
      queryClient.invalidateQueries({ queryKey: announcementKeys.adminRoot() });
    },
    onError: (err: any) => {
      toast.error(`Delete failed: ${err?.message ?? 'unknown'}`);
    },
  });

  const handleDelete = (id: string) => {
    if (!confirm('Delete announcement?')) return;
    deleteMutation.mutate(id);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-center gap-2 justify-between">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Input
            placeholder="Search announcements..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-64"
          />
          <Select value={filterActive} onValueChange={(v) => setFilterActive(v as any)}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterPriority} onValueChange={(v) => setFilterPriority(v)}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="normal">Normal</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <Button
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - limit))}
          >
            Prev
          </Button>
          <Button
            disabled={!(data && data.offset + data.items.length < data.total)}
            onClick={() => setOffset(offset + limit)}
          >
            Next
          </Button>
        </div>
      </div>

      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Business unit</TableHead>
              <TableHead>Start</TableHead>
              <TableHead>End</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7}>Loading...</TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8">
                  No announcements
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((a) => {
                const startVal = a.start_at ?? a.created_at;
                const endVal = a.end_at ?? a.expires_at;
                const targets = [
                  ...(a.target_service_areas ?? []),
                  ...(a.target_business_unit_ids ?? []),
                ].filter((target): target is string => typeof target === 'string');
                const targetLabel =
                  targets.length === 0
                    ? 'Everyone'
                    : targets
                        .map((target) => businessUnitNamesById.get(target) ?? target)
                        .join(', ');

                return (
                  <TableRow key={a.id}>
                    <TableCell>
                      <div className="font-medium">{a.title}</div>
                      <div className="text-xs text-muted-foreground">
                        {getAnnouncementSummary(a)}
                      </div>
                    </TableCell>
                    <TableCell>{a.priority}</TableCell>
                    <TableCell>{a.is_active ? 'Active' : 'Inactive'}</TableCell>
                    <TableCell className="max-w-48 truncate">{targetLabel}</TableCell>
                    <TableCell>{formatDate(startVal)}</TableCell>
                    <TableCell>{formatDate(endVal)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="sm" onClick={() => onEdit?.(a)}>
                          Edit
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleDelete(a.id)}
                        >
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export default AnnouncementsTable;
