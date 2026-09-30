import { useMemo } from "react";
import { useTheme } from "next-themes";
import { customThemes, systemThemes } from "../lib/themes";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function ThemePicker() {
  const { theme, setTheme } = useTheme();

  const groupedThemes = useMemo(
    () => [
      { label: "App themes", themes: customThemes },
      { label: "System", themes: systemThemes },
    ],
    [],
  );

  return (
    <div className="space-y-4">
      {groupedThemes.map((group) => (
        <div key={group.label} className="space-y-3">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">
            {group.label}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {group.themes.map((option) => {
              const isActive = theme === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setTheme(option.id)}
                  className={cn(
                    "group rounded-xl border border-border bg-card/70 p-3 text-left transition-all",
                    "hover:border-primary/60 hover:shadow-[0_0_0_1px_var(--ring)]",
                    isActive && "border-primary/70 ring-2 ring-primary/30",
                  )}
                >
                  <div
                    className="h-16 w-full rounded-lg border border-border"
                    style={{
                      background: `linear-gradient(135deg, ${option.preview.from}, ${option.preview.to})`,
                    }}
                  />
                  <div className="mt-3 flex items-center justify-between">
                    <div className="text-sm font-semibold text-foreground">
                      {option.label}
                    </div>
                    {isActive ? (
                      <Badge variant="secondary">Active</Badge>
                    ) : (
                      <span
                        className="h-3 w-3 rounded-full"
                        style={{ background: option.preview.accent }}
                        aria-hidden="true"
                      />
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {option.description}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
