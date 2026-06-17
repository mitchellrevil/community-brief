import { PromptManagementProvider } from "../state/context";
import { Layout } from "../ui/layout";

export function PromptManagementPage() {
  return (
    <PromptManagementProvider>
      <Layout />
    </PromptManagementProvider>
  );
}
