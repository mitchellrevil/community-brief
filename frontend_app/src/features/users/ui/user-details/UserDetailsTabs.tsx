import { OverviewTab } from "./OverviewTab";
import { SecurityTab } from "./SecurityTab";
import type { User } from "@/features/users/data/api";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface UserDetailsTabsProps {
  user: User;
}

export function UserDetailsTabs({ user }: UserDetailsTabsProps) {
  return (
    <Tabs defaultValue="overview" className="space-y-4">
      <TabsList className="flex flex-wrap w-full">
        <TabsTrigger value="overview" className="flex-1 sm:flex-none">Overview</TabsTrigger>
        <TabsTrigger value="security" className="flex-1 sm:flex-none">Security & Access</TabsTrigger>
      </TabsList>
      
      <TabsContent value="overview" className="space-y-4">
        <OverviewTab user={user} />
      </TabsContent>
      
      <TabsContent value="security" className="space-y-4">
        <SecurityTab user={user} />
      </TabsContent>
      
      {/* Activity & Logs tab removed */}
    </Tabs>
  );
}


