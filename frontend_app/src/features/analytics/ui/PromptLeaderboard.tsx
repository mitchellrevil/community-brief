import { useEffect, useState } from "react";
import { AlertTriangle, BarChart3, Download } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { exportPromptAnalyticsCSV } from "@/features/analytics/data/api";

interface PromptData {
  rank: number;
  prompt_name: string;
  total_jobs: number;
}

interface PromptLeaderboardProps {
  days?: number;
  businessUnitId?: string | null;
  onExport?: () => void;
  isExporting?: boolean;
}

export function PromptLeaderboard({
  days = 30,
  businessUnitId = null,
  onExport,
  isExporting = false,
}: PromptLeaderboardProps) {
  const [prompts, setPrompts] = useState<Array<PromptData>>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPrompts = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const csvText = await exportPromptAnalyticsCSV(days, businessUnitId ?? undefined);
        const lines = csvText.trim().split("\n");

        if (lines.length < 2) {
          setPrompts([]);
          return;
        }

        const data = lines
          .slice(1)
          .map((line) => {
            const regex = /"([^"]*)"|([^,]+)/g;
            const parts: Array<string> = [];
            let match: RegExpExecArray | null;

            while ((match = regex.exec(line)) !== null) {
              const raw = match[1] || match[2];
              parts.push(raw.trim());
            }

            return {
              rank: parseInt(parts[0], 10) || 0,
              prompt_name: (parts[1] || "").trim(),
              total_jobs: parseInt(parts[2], 10) || 0,
            };
          })
          .filter((prompt) => prompt.prompt_name);

        setPrompts(data);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to fetch prompt analytics";
        setError(message);
        if (import.meta.env.DEV) {
          console.error("[PromptLeaderboard] Error fetching prompts:", err);
        }
      } finally {
        setIsLoading(false);
      }
    };

    fetchPrompts();
  }, [days, businessUnitId]);

  const totalJobs = prompts.reduce((sum, prompt) => sum + prompt.total_jobs, 0);

  const getPercentage = (value: number, total: number) => {
    if (total === 0) {
      return "0.0";
    }

    return ((value / total) * 100).toFixed(1);
  };

  return (
    <Card className="overflow-hidden rounded-lg border border-border/70 bg-card shadow-sm">
      <CardHeader className="border-b border-border/70 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Most used prompts</CardTitle>
          </div>

          {onExport ? (
            <Button
              variant="outline"
              size="sm"
              onClick={onExport}
              disabled={isExporting}
              className="h-8 gap-2 rounded-md"
            >
              <Download className="h-4 w-4" />
              {isExporting ? "Exporting" : "Export"}
            </Button>
          ) : null}
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {error ? (
          <Alert variant="destructive" className="m-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {isLoading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary"></div>
          </div>
        ) : prompts.length === 0 ? (
          <div className="flex h-64 items-center justify-center text-muted-foreground">
            No prompt usage data available
          </div>
        ) : (
          <div className="divide-y divide-border/60">
            {prompts.map((prompt) => {
              const percentage = getPercentage(prompt.total_jobs, totalJobs);

              return (
                <div
                  key={`prompt-${prompt.rank}-${prompt.prompt_name}`}
                  className="grid grid-cols-[2rem_minmax(0,1fr)_5rem] items-center gap-3 px-4 py-3"
                >
                  <div className="flex h-7 w-7 items-center justify-center rounded-md bg-muted text-xs font-semibold text-muted-foreground">
                    {prompt.rank}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {prompt.prompt_name}
                    </p>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>

                  <div className="text-right">
                    <p className="text-sm font-semibold text-foreground">
                      {prompt.total_jobs.toLocaleString()}
                    </p>
                    <p className="text-xs text-muted-foreground">{percentage}%</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
