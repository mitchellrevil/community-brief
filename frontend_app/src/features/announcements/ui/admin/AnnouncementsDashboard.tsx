import React, { useState } from 'react';
import { Megaphone } from 'lucide-react';
import { AnnouncementsTable } from './AnnouncementsTable';
import { AnnouncementForm } from './AnnouncementForm';
import type { Announcement } from '../../data/types';
import { Button } from '@/components/ui/button';
import { PageHeading } from '@/components/ui/page-heading';
import { SmartBreadcrumb } from '@/components/ui/smart-breadcrumb';
import { useBreadcrumbs } from '@/hooks/useBreadcrumbs';

export function AnnouncementsDashboard() {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Announcement | null>(null);
  const breadcrumbs = useBreadcrumbs();

  const openCreate = () => {
    setEditing(null);
    setOpen(true);
  };

  const openEdit = (a: Announcement) => {
    setEditing(a);
    setOpen(true);
  };

  return (
    <div className="min-h-screen bg-background">
      <PageHeading
        icon={<Megaphone className="h-6 w-6" />}
        title="Announcements"
        breadcrumb={<SmartBreadcrumb items={breadcrumbs} />}
        actions={<Button onClick={openCreate}>Create Announcement</Button>}
      />

      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <AnnouncementsTable onEdit={openEdit} />
      </div>

      <AnnouncementForm
        open={open}
        onClose={() => setOpen(false)}
        initialData={editing}
      />
    </div>
  );
}

export default AnnouncementsDashboard;
