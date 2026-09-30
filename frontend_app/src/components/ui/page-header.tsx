import React from "react";

interface PageHeaderProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  breadcrumb?: React.ReactNode;
  right?: React.ReactNode;
  titleClassName?: string;
  noContainer?: boolean;
}

export function PageHeader({
  title,
  description,
  icon,
  breadcrumb,
  right,
  titleClassName = "text-2xl sm:text-2xl font-semibold text-foreground",
  noContainer = false,
}: PageHeaderProps) {
  return (
    <div>
      {noContainer ? (
        <div className="flex items-center gap-3">
          {icon ? (
            <div className="p-2 rounded-lg bg-zinc-200/70 text-zinc-700 dark:bg-zinc-700/60 dark:text-zinc-100 flex-shrink-0">
              {icon}
            </div>
          ) : null}

          <div className="space-y-1 flex-1 min-w-0">
            <h1 className={`${titleClassName} truncate`}>{title}</h1>
            {breadcrumb ? <div className="hidden sm:block">{breadcrumb}</div> : null}
            {description ? (
              <div className="hidden sm:block text-muted-foreground">{description}</div>
            ) : null}
          </div>

          {right ? <div className="flex-shrink-0">{right}</div> : null}
        </div>
      ) : (
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center gap-3">
            {icon ? (
              <div className="p-2 rounded-lg bg-zinc-200/70 text-zinc-700 dark:bg-zinc-700/60 dark:text-zinc-100 flex-shrink-0">
                {icon}
              </div>
            ) : null}

            <div className="space-y-1 flex-1 min-w-0">
              <h1 className={`${titleClassName} truncate`}>{title}</h1>
              {breadcrumb ? <div className="hidden sm:block">{breadcrumb}</div> : null}
              {description ? (
              <div className="hidden sm:block text-muted-foreground">{description}</div>
            ) : null}
            </div>

            {right ? <div className="flex-shrink-0">{right}</div> : null}
          </div>
        </div>
      )}
    </div>
  );
}

export default PageHeader;
