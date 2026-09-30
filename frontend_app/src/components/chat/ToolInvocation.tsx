import { CheckCircle2, CircleAlert, Loader2, Wrench } from "lucide-react";
import type { ToolApprovalRequest, ToolInvocation } from "@/shared/agent-chat/types";
import { Button } from "@/components/ui/button";
import { formatToolName } from "@/shared/agent-chat/tool-invocations";

interface ToolInvocationListProps {
  invocations?: Array<ToolInvocation>;
  onApprove?: (approval: ToolApprovalRequest) => void;
  onReject?: (approval: ToolApprovalRequest) => void;
  disabled?: boolean;
}

export function ToolInvocationBubble(props: ToolInvocationListProps) {
  if (!props.invocations || props.invocations.length === 0) {
    return null;
  }

  return (
    <div className="flex justify-start">
      <div className="max-w-[80%] rounded-lg border border-border bg-secondary p-3 text-secondary-foreground">
        <ToolInvocationList {...props} />
      </div>
    </div>
  );
}

export function ToolInvocationList({
  invocations = [],
  onApprove,
  onReject,
  disabled = false,
}: ToolInvocationListProps) {
  if (invocations.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2" data-testid="tool-invocations">
      {invocations.map((invocation) => (
        <details
          key={invocation.id}
          open={invocation.status === "approval_required" ? true : undefined}
          className="rounded-md border border-border bg-background/60 px-3 py-2 text-xs"
        >
          <summary className="flex cursor-pointer list-none items-center gap-2 font-medium">
            {invocation.status === "approval_required" ? (
              <CircleAlert className="h-3.5 w-3.5 text-amber-600" />
            ) : invocation.status === "completed" ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
            ) : (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
            )}
            <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
            <span>{formatToolName(invocation.name)}</span>
            <span className="ml-auto text-muted-foreground">
              {toolStatusLabel(invocation.status)}
            </span>
          </summary>
          {(invocation.args || invocation.result) && (
            <div className="mt-2 space-y-2">
              {invocation.args && <ToolPayload label="Args" value={invocation.args} />}
              {invocation.result && <ToolPayload label="Result" value={invocation.result} />}
            </div>
          )}
          {invocation.status === "approval_required" && invocation.approval && (
            <div className="mt-3 flex gap-2">
              <Button
                type="button"
                size="sm"
                onClick={() => onApprove?.(invocation.approval!)}
                disabled={disabled || !onApprove}
              >
                Approve
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => onReject?.(invocation.approval!)}
                disabled={disabled || !onReject}
              >
                Reject
              </Button>
            </div>
          )}
        </details>
      ))}
    </div>
  );
}

function ToolPayload({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="mb-1 font-medium text-muted-foreground">{label}</div>
      <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded bg-muted p-2 font-mono text-[11px]">
        {formatPayload(value)}
      </pre>
    </div>
  );
}

function formatPayload(value: string): string {
  try {
    const parsed = JSON.parse(value);
    return limitPayload(JSON.stringify(parsed, null, 2));
  } catch {
    return limitPayload(value);
  }
}

function limitPayload(value: string): string {
  return value.length > 2000 ? `${value.slice(0, 2000)}...` : value;
}

function toolStatusLabel(status: ToolInvocation["status"]): string {
  if (status === "approval_required") {
    return "Approval required";
  }
  return status === "completed" ? "Done" : "Running";
}
