import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, Eye, Pencil, Send } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import {
  useCreateAnnouncementMutation,
  useUpdateAnnouncementMutation,
} from '../../data/queries';
import {
  dateInputToEpochMs,
  getAnnouncementBody,
  normalizePriority,
  toDateInput,
} from '../../lib/announcement-utils';
import { AnnouncementMarkdown } from '../AnnouncementMarkdown';
import type {
  Announcement,
  AnnouncementCreate,
  AnnouncementPriority,
} from '../../data/types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { getBusinessUnitsQuery } from '@/shared/data/business-units/queries';

type Props = {
  open: boolean;
  onClose: () => void;
  initialData?: Announcement | null;
};

type FormValues = {
  title: string;
  body: string;
  priority: AnnouncementPriority;
  is_active: boolean;
  start_at: string;
  end_at: string;
  target_service_area: string;
};

const ALL_BUSINESS_UNITS = '__all__';

export function AnnouncementForm({ open, onClose, initialData }: Props) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const createMutation = useCreateAnnouncementMutation();
  const updateMutation = useUpdateAnnouncementMutation();
  const { data: businessUnits = [], isLoading: businessUnitsLoading } = useQuery(
    getBusinessUnitsQuery()
  );

  const form = useForm<FormValues>({
    defaultValues: {
      title: '',
      body: '',
      priority: 'normal',
      is_active: true,
      start_at: '',
      end_at: '',
      target_service_area: ALL_BUSINESS_UNITS,
    },
  });

  const selectedBody = form.watch('body');
  const selectedStart = form.watch('start_at');
  const selectedEnd = form.watch('end_at');
  const selectedTarget = form.watch('target_service_area');

  const businessUnitOptions = useMemo(
    () =>
      businessUnits
        .filter((unit) => unit.is_business_unit)
        .sort((left, right) => left.name.localeCompare(right.name)),
    [businessUnits]
  );

  const selectedBusinessUnitName = useMemo(() => {
    if (selectedTarget === ALL_BUSINESS_UNITS) return 'Everyone';
    return businessUnitOptions.find((unit) => unit.id === selectedTarget)?.name ?? 'Selected unit';
  }, [businessUnitOptions, selectedTarget]);

  useEffect(() => {
    if (!open) return;

    if (!initialData) {
      form.reset({
        title: '',
        body: '',
        priority: 'normal',
        is_active: true,
        start_at: '',
        end_at: '',
        target_service_area: ALL_BUSINESS_UNITS,
      });
      return;
    }

    const target =
      initialData.target_service_areas?.[0] ??
      initialData.target_business_unit_ids?.[0] ??
      ALL_BUSINESS_UNITS;

    form.reset({
      title: initialData.title,
      body: getAnnouncementBody(initialData),
      priority: normalizePriority(initialData.priority),
      is_active: initialData.is_active,
      start_at: toDateInput(initialData.start_at),
      end_at: toDateInput(initialData.end_at ?? initialData.expires_at),
      target_service_area: target || ALL_BUSINESS_UNITS,
    });
  }, [form, initialData, open]);

  async function onSubmit(values: FormValues) {
    const startEpoch = dateInputToEpochMs(values.start_at);
    const endEpoch = dateInputToEpochMs(values.end_at);

    if (startEpoch && endEpoch && startEpoch > endEpoch) {
      form.setError('end_at', {
        message: 'End date must be on or after the start date.',
      });
      return;
    }

    const targetServiceAreas =
      values.target_service_area === ALL_BUSINESS_UNITS
        ? []
        : [values.target_service_area];

    const payload: AnnouncementCreate = {
      title: values.title.trim(),
      body: values.body,
      priority: values.priority,
      is_active: values.is_active,
      target_service_areas: targetServiceAreas,
      target_business_unit_ids: targetServiceAreas,
      ...(startEpoch ? { start_at: startEpoch } : {}),
      ...(endEpoch ? { end_at: endEpoch } : {}),
    };

    setIsSubmitting(true);
    try {
      if (initialData) {
        await updateMutation.mutateAsync({ id: initialData.id, data: payload });
        toast.success('Announcement updated');
      } else {
        await createMutation.mutateAsync(payload);
        toast.success('Announcement created');
      }
      onClose();
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to save announcement');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl lg:max-w-4xl">
        <DialogHeader>
          <DialogTitle>
            {initialData ? 'Edit announcement' : 'Create announcement'}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="title"
                  rules={{ required: 'Add a short title.' }}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Title</FormLabel>
                      <FormControl>
                        <Input placeholder="What should people notice?" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Tabs defaultValue="write" className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium">Announcement</p>
                    <TabsList>
                      <TabsTrigger value="write" className="gap-2">
                        <Pencil className="h-3.5 w-3.5" />
                        Write
                      </TabsTrigger>
                      <TabsTrigger value="preview" className="gap-2">
                        <Eye className="h-3.5 w-3.5" />
                        Preview
                      </TabsTrigger>
                    </TabsList>
                  </div>
                  <TabsContent value="write" className="mt-0">
                    <FormField
                      control={form.control}
                      name="body"
                      rules={{ required: 'Add the announcement text.' }}
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <Textarea
                              className="min-h-[300px] resize-y font-mono text-sm leading-6"
                              placeholder="Use Markdown for headings, links, lists, and tables."
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </TabsContent>
                  <TabsContent value="preview" className="mt-0">
                    <div className="min-h-[300px] rounded-md border bg-card p-4">
                      {selectedBody.trim() ? (
                        <AnnouncementMarkdown content={selectedBody} />
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          Nothing to preview yet.
                        </p>
                      )}
                    </div>
                  </TabsContent>
                </Tabs>
              </div>

              <div className="space-y-4 rounded-md border bg-muted/20 p-4">
                <FormField
                  control={form.control}
                  name="is_active"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between gap-4 rounded-md border bg-background px-3 py-2.5">
                      <div>
                        <FormLabel>Active</FormLabel>
                        <FormDescription className="text-xs">
                          Visible when the schedule allows it.
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="priority"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Priority</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Priority" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="low">Low</SelectItem>
                          <SelectItem value="normal">Normal</SelectItem>
                          <SelectItem value="high">High</SelectItem>
                          <SelectItem value="critical">Critical</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="target_service_area"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Business unit</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                        disabled={businessUnitsLoading}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Choose a business unit" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value={ALL_BUSINESS_UNITS}>Everyone</SelectItem>
                          {businessUnitOptions.map((unit) => (
                            <SelectItem key={unit.id} value={unit.id}>
                              {unit.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription className="text-xs">
                        Targeting: {selectedBusinessUnitName}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="space-y-3 rounded-md border bg-background p-3">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <CalendarDays className="h-4 w-4 text-muted-foreground" />
                    Schedule
                  </div>
                  <FormField
                    control={form.control}
                    name="start_at"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Start date</FormLabel>
                        <FormControl>
                          <Input type="date" max={selectedEnd || undefined} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="end_at"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>End date</FormLabel>
                        <FormControl>
                          <Input type="date" min={selectedStart || undefined} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2 text-xs"
                    onClick={() => {
                      form.setValue('start_at', '');
                      form.setValue('end_at', '');
                    }}
                  >
                    Clear schedule
                  </Button>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  form.reset();
                  onClose();
                }}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                <Send className="h-4 w-4" />
                {isSubmitting ? 'Saving...' : initialData ? 'Update' : 'Create'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export default AnnouncementForm;
