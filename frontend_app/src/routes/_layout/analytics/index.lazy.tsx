import { createLazyFileRoute } from '@tanstack/react-router';
import { PermissionLevel } from '@/types/permissions';
import { PermissionGuard } from '@/components/auth/PermissionGuard';
import { AnalyticsDashboard } from '@/features/analytics/ui/AnalyticsDashboard';
import { MotionDiv } from '@/components/ui/motion';
import { fadeInUp } from '@/lib/motion';

export const Route = createLazyFileRoute('/_layout/analytics/')({
  component: AnalyticsPage,
});

function AnalyticsPage() {
  return (
    <PermissionGuard requiredPermission={PermissionLevel.EDITOR}>
      <MotionDiv variants={fadeInUp} initial="hidden" animate="visible">
        <AnalyticsDashboard />
      </MotionDiv>
    </PermissionGuard>
  );
}
