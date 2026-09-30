/* eslint-disable import/order */
import type { SupportContact } from "@/features/users/data/api";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeading } from "@/components/ui/page-heading";
import { Skeleton } from "@/components/ui/skeleton";
import { SmartBreadcrumb } from "@/components/ui/smart-breadcrumb";
import { fetchSupportContacts } from "@/features/users/data/api";
import { useBreadcrumbs } from "@/hooks/useBreadcrumbs";
import { useInfiniteQuery } from "@tanstack/react-query";
import { FileText, Mail, Search } from "lucide-react";

const CONTACT_PAGE_SIZE = 100;
const TEMPLATE_SUGGESTION_SUBJECT = "Community Brief meeting output feedback";

type TemplateContact = SupportContact;

const getContactName = (user: TemplateContact) => {
  return user.display_name;
};

interface ContactSectionProps {
  title: string;
  description: string;
  contacts: Array<TemplateContact>;
}

function ContactSection({ title, description, contacts }: ContactSectionProps) {
  return (
    <section className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
          <p className="text-muted-foreground text-sm">{description}</p>
        </div>
        <Badge variant="outline" className="px-2.5 py-1 text-xs">
          {contacts.length}
        </Badge>
      </div>

      {contacts.length === 0 ? (
        <div className="bg-card/60 text-muted-foreground rounded-xl border border-dashed px-4 py-8 text-center text-sm">
          No contacts match the current filter.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {contacts.map((contact) => (
            <article
              key={contact.email}
              className="bg-card hover:border-primary/30 rounded-2xl border p-4 shadow-sm transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <h3 className="text-foreground truncate text-base font-semibold">
                    {getContactName(contact)}
                  </h3>
                  <p className="text-muted-foreground flex items-center gap-2 text-sm">
                    <Mail className="h-4 w-4 flex-shrink-0" />
                    <a
                      href={`mailto:${contact.email}`}
                      className="truncate underline-offset-4 hover:underline"
                    >
                      {contact.email}
                    </a>
                  </p>
                </div>

                <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100/80">
                  Editor
                </Badge>
              </div>

              <div className="mt-4 flex items-center gap-2">
                <Button asChild variant="outline" size="sm">
                  <a
                    href={`mailto:${contact.email}?subject=${encodeURIComponent(TEMPLATE_SUGGESTION_SUBJECT)}`}
                  >
                    Contact
                  </a>
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function ContactsLoadingState() {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="bg-card rounded-2xl border p-4 shadow-sm">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="mt-3 h-4 w-full" />
          <Skeleton className="mt-2 h-4 w-3/4" />
          <Skeleton className="mt-5 h-8 w-24" />
        </div>
      ))}
    </div>
  );
}

export function TemplateSuggestionPage() {
  const breadcrumbs = useBreadcrumbs();
  const [searchTerm, setSearchTerm] = useState("");
  const deferredSearchTerm = useDeferredValue(searchTerm);

  const {
    data,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useInfiniteQuery({
    queryKey: ["template-suggestion-contacts", deferredSearchTerm.trim()],
    queryFn: ({ pageParam = 0 }) =>
      fetchSupportContacts({
        query: deferredSearchTerm.trim(),
        limit: CONTACT_PAGE_SIZE,
        offset: pageParam,
      }),
    getNextPageParam: (lastPage) => {
      return lastPage.has_more ? lastPage.offset + lastPage.limit : undefined;
    },
    initialPageParam: 0,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage) {
      void fetchNextPage();
    }
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  const allContacts = useMemo(() => {
    const contacts = data?.pages.flatMap((page) => page.contacts) ?? [];
    const seenEmails = new Set<string>();

    return contacts.reduce<Array<TemplateContact>>((uniqueContacts, contact) => {
      if (seenEmails.has(contact.email)) {
        return uniqueContacts;
      }

      seenEmails.add(contact.email);
      uniqueContacts.push(contact);

      return uniqueContacts;
    }, []);
  }, [data]);

  const filteredContacts = allContacts;

  const editorCount = useMemo(() => {
    return new Set(filteredContacts.map((contact) => contact.email)).size;
  }, [filteredContacts]);

  const editorsByBusinessUnit = useMemo(() => {
    const map = new Map<string, Array<TemplateContact>>();

    filteredContacts.forEach((editor) => {
      const buNames =
        editor.business_unit_names.length > 0
          ? editor.business_unit_names
          : ["Unassigned"];

      buNames.forEach((bu) => {
        const key = bu || "Unassigned";
        const arr = map.get(key) ?? [];
        if (!arr.find((contact) => contact.email === editor.email)) arr.push(editor);
        map.set(key, arr);
      });
    });

    return Array.from(map.entries())
      .map(([name, contacts]) => ({ name, contacts }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [filteredContacts]);

  if (error) {
    return (
      <div className="bg-background min-h-screen overflow-x-hidden">
        <PageHeading
          icon={<FileText className="h-6 w-6" />}
          title="Meeting Output Feedback"
          breadcrumb={<SmartBreadcrumb items={breadcrumbs} />}
          description="Find the right contact when a meeting output or meeting type needs attention."
        />

        <div className="text-destructive mx-auto flex min-h-[40vh] max-w-7xl items-center justify-center px-4 py-8 text-center">
          Unable to load meeting output contacts. {error.message}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-background min-h-screen overflow-x-hidden">
      <PageHeading
        icon={<FileText className="h-6 w-6" />}
        title="Meeting Output Feedback"
        breadcrumb={<SmartBreadcrumb items={breadcrumbs} />}
        description="Don't like the output of a meeting? Have a problem with a meeting type? Contact the service area that owns it."
      />

      <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
        <div className="space-y-6">
          <section className="grid gap-4 md:grid-cols-3">
            <div className="bg-card rounded-2xl border p-5 shadow-sm">
              <p className="text-muted-foreground text-sm">Editors</p>
              <p className="mt-2 text-3xl font-semibold tracking-tight">
                {editorCount}
              </p>
              <p className="text-muted-foreground mt-2 text-sm">
                Service area contacts for meeting output and meeting type
                feedback.
              </p>
            </div>
          </section>

          <section className="bg-card rounded-2xl border p-4 shadow-sm sm:p-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-lg font-semibold tracking-tight">
                  Contact Directory
                </h2>
                <p className="text-muted-foreground text-sm">
                  Search by name, email, or business unit.
                </p>
              </div>

              <div className="relative w-full md:max-w-sm">
                <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                <Input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search contacts"
                  className="pl-9"
                />
              </div>
            </div>
          </section>

          {isLoading ? (
            <ContactsLoadingState />
          ) : (
            <div className="space-y-8">
              {editorsByBusinessUnit.length === 0 ? (
                <ContactSection
                  title="Editors"
                  description="For meeting output issues, meeting type problems, and content refinement requests."
                  contacts={[]}
                />
              ) : (
                editorsByBusinessUnit.map((group) => (
                  <ContactSection
                    key={group.name}
                    title={group.name}
                    description={`Contacts for ${group.name}`}
                    contacts={group.contacts}
                  />
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
