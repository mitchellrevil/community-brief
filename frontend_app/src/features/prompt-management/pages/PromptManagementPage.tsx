import { PromptManagementProvider } from "../state/context";
import { isEditor } from "../state/permissions";
import { Layout } from "../ui/layout";
import { useUserPermissions } from "@/hooks/usePermissions";

export function PromptManagementPage() {
  const { data: currentUser } = useUserPermissions();
  const view = isEditor(currentUser) ? "management" : "runtime";

  return (
    <PromptManagementProvider view={view}>
      <Layout />
    </PromptManagementProvider>
  );
}
