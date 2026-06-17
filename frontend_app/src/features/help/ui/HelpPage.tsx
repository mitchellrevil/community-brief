/* eslint-disable import/order */
import type { Announcement } from "@/features/announcements/data/types";
import type { User } from "@/features/users/data/api";
import { useEffect, useMemo, useState } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PageHeading } from "@/components/ui/page-heading";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { SmartBreadcrumb } from "@/components/ui/smart-breadcrumb";
import {
  HELP_DOCUMENTATION_URL,
  SUPPORT_REQUEST_URL,
} from "@/config/external-links";
import { getAnnouncementsQuery } from "@/features/announcements/data/queries";
import { getAnnouncementBody } from "@/features/announcements/lib/announcement-utils";
import { AnnouncementMarkdown } from "@/features/announcements/ui/AnnouncementMarkdown";
import { getUsersQuery } from "@/features/users/data/queries";
import { useBreadcrumbs } from "@/hooks/useBreadcrumbs";
import { useUserPermissions } from "@/hooks/usePermissions";
import { parseDate } from "@/lib/date-utils";
import { PermissionLevel } from "@/types/permissions";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  BookOpen,
  CircleHelp,
  ExternalLink,
  Lightbulb,
  Mail,
  Megaphone,
  TriangleAlert,
  Users,
} from "lucide-react";

type EditorContact = User & {
  permission: PermissionLevel.EDITOR;
};

const PREVIEW_EDITOR_COUNT = 5;

const getContactName = (user: User) => {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  const trimmedName = (user.name ?? "").trim() || (user.full_name ?? "").trim();
  if (trimmedName) {
    return trimmedName;
  }

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  return (user.email ?? "").split("@")[0];
};

const getPriorityTone = (priority: Announcement["priority"]) => {
  switch (priority) {
    case "critical":
      return "bg-red-100 text-red-800 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800";
    case "high":
      return "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800";
    case "low":
      return "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700";
    default:
      return "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800";
  }
};

const formatAnnouncementDate = (value: string | number) => {
  const date = parseDate(value);
  if (!date) return "";

  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

const normalizeBusinessUnitNames = (names: Array<string> | undefined) => {
  return Array.from(
    new Set((names ?? []).map((name) => name.trim()).filter(Boolean)),
  );
};

function AnnouncementListLoading() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 2 }, (_, index) => (
        <div key={index} className="bg-card space-y-3 rounded-xl border p-4">
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
          <Skeleton className="h-5 w-56" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      ))}
    </div>
  );
}

function EditorContactsLoading() {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {Array.from({ length: 4 }, (_, index) => (
        <div
          key={index}
          className="bg-card flex items-center gap-3 rounded-lg border px-3 py-2.5"
        >
          <Skeleton className="h-8 w-8 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-28" />
            <Skeleton className="h-3 w-40" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function HelpPage() {
  const breadcrumbs = useBreadcrumbs();
  const { data: currentUser } = useUserPermissions();
  const [selectedBusinessUnit, setSelectedBusinessUnit] = useState("");
  const {
    data: announcements = [],
    error: announcementsError,
    isLoading: announcementsLoading,
  } = useQuery(getAnnouncementsQuery());
  const {
    data: allUsers = [],
    error: usersError,
    isLoading: usersLoading,
  } = useQuery(getUsersQuery());

  const viewerBusinessUnitNames = useMemo(
    () => normalizeBusinessUnitNames(currentUser?.business_unit_names),
    [currentUser?.business_unit_names],
  );

  useEffect(() => {
    if (viewerBusinessUnitNames.length === 0) {
      if (selectedBusinessUnit) {
        setSelectedBusinessUnit("");
      }

      return;
    }

    if (
      !selectedBusinessUnit ||
      !viewerBusinessUnitNames.includes(selectedBusinessUnit)
    ) {
      setSelectedBusinessUnit(viewerBusinessUnitNames[0]);
    }
  }, [selectedBusinessUnit, viewerBusinessUnitNames]);

  const sortedAnnouncements = useMemo(() => {
    return [...announcements].sort((left, right) => {
      return (
        new Date(right.created_at).getTime() -
        new Date(left.created_at).getTime()
      );
    });
  }, [announcements]);

  const editorsByBusinessUnit = useMemo(() => {
    return viewerBusinessUnitNames.reduce<Record<string, Array<EditorContact>>>(
      (result, businessUnitName) => {
        const businessUnitKey = businessUnitName.toLowerCase();

        result[businessUnitName] = allUsers
          .reduce<Array<EditorContact>>((contacts, user) => {
            if (user.permission !== PermissionLevel.EDITOR) {
              return contacts;
            }

            const editorBusinessUnits = normalizeBusinessUnitNames(
              user.business_unit_names,
            ).map((name) => name.toLowerCase());

            if (!editorBusinessUnits.includes(businessUnitKey)) {
              return contacts;
            }

            if (contacts.some((contact) => contact.id === user.id)) {
              return contacts;
            }

            contacts.push({
              ...user,
              permission: PermissionLevel.EDITOR,
            });

            return contacts;
          }, [])
          .sort((left, right) =>
            getContactName(left).localeCompare(getContactName(right)),
          );

        return result;
      },
      {},
    );
  }, [allUsers, viewerBusinessUnitNames]);

  const activeBusinessUnit =
    selectedBusinessUnit &&
    viewerBusinessUnitNames.includes(selectedBusinessUnit)
      ? selectedBusinessUnit
      : (viewerBusinessUnitNames[0] ?? "");
  const activeEditors = activeBusinessUnit
    ? (editorsByBusinessUnit[activeBusinessUnit] ?? [])
    : [];
  const previewEditors = activeEditors.slice(0, PREVIEW_EDITOR_COUNT);
  const remainingEditors = Math.max(
    activeEditors.length - previewEditors.length,
    0,
  );
  const activeBusinessUnitLabel = activeBusinessUnit || "your business unit";

  return (
    <div className="bg-background min-h-screen overflow-x-hidden">
      <PageHeading
        icon={<CircleHelp className="h-6 w-6" />}
        title="Help"
        breadcrumb={<SmartBreadcrumb items={breadcrumbs} />}
        description="Announcements, guidance, and ways to get support."
      />

      <div className="mx-auto w-full max-w-7xl space-y-8 px-4 py-6 sm:px-6 sm:py-8">
        {/* ── Quick links ── */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {HELP_DOCUMENTATION_URL && (
            <a
              href={HELP_DOCUMENTATION_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="group border-border/70 bg-card hover:border-primary/40 hover:bg-accent/50 flex items-center gap-3 rounded-xl border p-4 shadow-sm transition-colors"
            >
              <div className="bg-primary/10 text-primary flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
                <BookOpen className="h-4.5 w-4.5" />
              </div>
              <div className="min-w-0">
                <p className="text-foreground text-sm font-medium">
                  Documentation
                </p>
                <p className="text-muted-foreground text-xs">
                  Guides &amp; reference
                </p>
              </div>
              <ExternalLink className="text-muted-foreground ml-auto h-3.5 w-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
            </a>
          )}

          {SUPPORT_REQUEST_URL && (
            <a
              href={SUPPORT_REQUEST_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="group border-border/70 bg-card hover:bg-accent/50 flex items-center gap-3 rounded-xl border p-4 shadow-sm transition-colors hover:border-amber-500/40"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600">
                <TriangleAlert className="h-4.5 w-4.5" />
              </div>
              <div className="min-w-0">
                <p className="text-foreground text-sm font-medium">
                  Request support
                </p>
                <p className="text-muted-foreground text-xs">
                  Configured support channel
                </p>
              </div>
              <ExternalLink className="text-muted-foreground ml-auto h-3.5 w-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
            </a>
          )}

          <Link
            to="/suggest-template"
            className="group border-border/70 bg-card hover:bg-accent/50 flex items-center gap-3 rounded-xl border p-4 shadow-sm transition-colors hover:border-green-500/40"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-green-500/10 text-green-600">
              <Lightbulb className="h-4.5 w-4.5" />
            </div>
            <div className="min-w-0">
              <p className="text-foreground text-sm font-medium">
                Meeting output feedback
              </p>
              <p className="text-muted-foreground text-xs">
                Don't like an output or meeting type?
              </p>
            </div>
          </Link>
        </div>

        {/* ── Main two-column layout ── */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* ── Announcements (wide column) ── */}
          <div className="space-y-4 lg:col-span-2">
            <div className="flex items-center gap-2">
              <Megaphone className="text-muted-foreground h-4.5 w-4.5" />
              <h2 className="text-foreground text-base font-semibold">
                Announcements
              </h2>
              {sortedAnnouncements.length > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {sortedAnnouncements.length}
                </Badge>
              )}
            </div>

            {announcementsLoading ? (
              <AnnouncementListLoading />
            ) : announcementsError ? (
              <Card>
                <CardContent className="py-8 text-center">
                  <p className="text-muted-foreground text-sm">
                    Unable to load announcements. {announcementsError.message}
                  </p>
                </CardContent>
              </Card>
            ) : sortedAnnouncements.length === 0 ? (
              <Card>
                <CardContent className="py-10 text-center">
                  <Megaphone className="text-muted-foreground/40 mx-auto h-8 w-8" />
                  <p className="text-muted-foreground mt-3 text-sm font-medium">
                    No announcements
                  </p>
                  <p className="text-muted-foreground/70 mt-1 text-xs">
                    Nothing to show right now. Check back later.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <Accordion type="single" collapsible className="space-y-3">
                {sortedAnnouncements.map((announcement) => (
                  <Card key={announcement.id} className="overflow-hidden">
                    <AccordionItem
                      value={announcement.id}
                      className="border-b-0"
                    >
                      <CardHeader className="p-0">
                        <AccordionTrigger className="px-6 py-4 text-left hover:no-underline">
                          <div className="flex min-w-0 flex-1 items-start justify-between gap-3 pr-3">
                            <div className="min-w-0 space-y-1">
                              <CardTitle className="text-base leading-snug">
                                {announcement.title}
                              </CardTitle>
                              <p className="text-muted-foreground text-xs">
                                {formatAnnouncementDate(
                                  announcement.created_at,
                                )}
                              </p>
                            </div>
                            <Badge
                              variant="outline"
                              className={`shrink-0 capitalize ${getPriorityTone(announcement.priority)}`}
                            >
                              {announcement.priority}
                            </Badge>
                          </div>
                        </AccordionTrigger>
                      </CardHeader>
                      <AccordionContent className="px-6 pb-4">
                        <AnnouncementMarkdown
                          content={getAnnouncementBody(announcement)}
                          className="text-sm text-foreground/85"
                        />
                      </AccordionContent>
                    </AccordionItem>
                  </Card>
                ))}
              </Accordion>
            )}
          </div>

          {/* ── Sidebar: Editor contacts ── */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Users className="text-muted-foreground h-4.5 w-4.5" />
              <h2 className="text-foreground text-base font-semibold">
                Service area contacts
              </h2>
            </div>
            <div className="-mt-1 space-y-3">
              <p className="text-muted-foreground text-xs">
                Don't like the output of a meeting? Have a problem with a
                meeting type? Choose a business unit to find the editors who can
                help.
              </p>

              {viewerBusinessUnitNames.length > 1 ? (
                <div className="space-y-1.5">
                  <p className="text-muted-foreground text-xs font-medium tracking-[0.14em] uppercase">
                    Business unit
                  </p>
                  <Select
                    value={activeBusinessUnit}
                    onValueChange={setSelectedBusinessUnit}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a business unit" />
                    </SelectTrigger>
                    <SelectContent>
                      {viewerBusinessUnitNames.map((businessUnitName) => (
                        <SelectItem
                          key={businessUnitName}
                          value={businessUnitName}
                        >
                          {businessUnitName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : viewerBusinessUnitNames.length === 1 ? (
                <div className="bg-card rounded-lg border px-3 py-2.5">
                  <p className="text-muted-foreground text-xs font-medium tracking-[0.14em] uppercase">
                    Business unit
                  </p>
                  <p className="text-foreground mt-1 text-sm font-medium">
                    {activeBusinessUnitLabel}
                  </p>
                </div>
              ) : null}
            </div>

            {usersLoading ? (
              <EditorContactsLoading />
            ) : usersError ? (
              <div className="text-muted-foreground rounded-xl border border-dashed p-5 text-center text-sm">
                Unable to load contacts.
              </div>
            ) : viewerBusinessUnitNames.length === 0 ? (
              <div className="text-muted-foreground rounded-xl border border-dashed p-5 text-center text-sm">
                No business unit assigned to your account yet.
              </div>
            ) : previewEditors.length === 0 ? (
              <div className="text-muted-foreground rounded-xl border border-dashed p-5 text-center text-sm">
                No editors found for {activeBusinessUnitLabel}.
              </div>
            ) : (
              <div className="space-y-2">
                {previewEditors.map((editor) => (
                  <div
                    key={editor.id}
                    className="bg-card flex items-center gap-3 rounded-lg border px-3 py-2.5"
                  >
                    <div className="bg-muted text-muted-foreground flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-medium">
                      {getContactName(editor).charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-foreground truncate text-sm font-medium">
                        {getContactName(editor)}
                      </p>
                      <p className="text-muted-foreground truncate text-xs">
                        {editor.email}
                      </p>
                    </div>
                    <Button
                      asChild
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0"
                    >
                      <a
                        href={`mailto:${editor.email}`}
                        aria-label={`Email ${getContactName(editor)}`}
                      >
                        <Mail className="h-3.5 w-3.5" />
                      </a>
                    </Button>
                  </div>
                ))}

                {remainingEditors > 0 && (
                  <p className="text-muted-foreground pt-1 text-center text-xs">
                    +{remainingEditors} more editor
                    {remainingEditors === 1 ? "" : "s"} in{" "}
                    {activeBusinessUnitLabel}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
