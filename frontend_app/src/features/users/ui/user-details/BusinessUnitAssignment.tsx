import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Save } from "lucide-react";
import { toast } from "sonner";
import type { User } from "@/features/users/data/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { assignUserToBusinessUnits, fetchBusinessUnits } from "@/shared/data/business-units/api";
import { usersKeys } from "@/features/users/data/keys";
import { useUserPermissions } from "@/hooks/usePermissions";
import { PermissionLevel, hasPermissionLevel } from "@/types/permissions";

interface BusinessUnitAssignmentProps {
  user: User;
}

export function BusinessUnitAssignment({ user }: BusinessUnitAssignmentProps) {
  const queryClient = useQueryClient();
  const { data: currentUser } = useUserPermissions();
  
  const initialBusinessUnitIds = user.business_unit_ids ?? [];
  
  const [selectedBusinessUnitIds, setSelectedBusinessUnitIds] = useState<Array<string>>(initialBusinessUnitIds);
  const [hasChanges, setHasChanges] = useState(false);

  // Only admins (and above — Moderator) can manage business units
  const isAdmin = hasPermissionLevel(currentUser?.permission as PermissionLevel, PermissionLevel.ADMIN);

  // Fetch all business units
  const { data: businessUnits, isLoading: unitsLoading } = useQuery({
    queryKey: ["business-units"],
    queryFn: fetchBusinessUnits,
    enabled: isAdmin,
  });

  // Mutation to assign user to business units
  const assignMutation = useMutation({
    mutationFn: async (businessUnitIds: Array<string>) => {
      return assignUserToBusinessUnits(user.id, businessUnitIds);
    },
    onSuccess: (response) => {
      toast.success("Business unit assignment updated successfully");
      setHasChanges(false);
      
      // Update user in cache with business unit data
        if (response.success) {
        const updatedUser = {
          ...user,
          business_unit_ids: response.business_unit_ids,
        };
        queryClient.setQueryData(usersKeys.user(user.id), updatedUser);
      }
      
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: usersKeys.root() });
      queryClient.invalidateQueries({ queryKey: ["business-units"] });
    },
    onError: (error: Error) => {
      toast.error(`Failed to update business unit: ${error.message}`);
    },
  });

  const handleBusinessUnitToggle = (businessUnitId: string, checked: boolean) => {
    const newSelection = checked
      ? [...selectedBusinessUnitIds, businessUnitId]
      : selectedBusinessUnitIds.filter(id => id !== businessUnitId);
    
    setSelectedBusinessUnitIds(newSelection);
    
    // Check if changed from initial
    const initialSet = new Set(initialBusinessUnitIds);
    const newSet = new Set(newSelection);
    const changed = 
      initialSet.size !== newSet.size ||
      ![...initialSet].every(id => newSet.has(id));
    setHasChanges(changed);
  };

  const handleSave = () => {
    assignMutation.mutate(selectedBusinessUnitIds);
  };

  const handleCancel = () => {
    setSelectedBusinessUnitIds(initialBusinessUnitIds);
    setHasChanges(false);
  };

  const getBusinessUnitName = (id: string | null): string => {
    if (!id) return "None";
    const unit = businessUnits?.find((bu) => bu.id === id);
    return unit?.name || "Unknown";
  };

  if (!isAdmin) {
    // Non-admin view: just show the business units (read-only)
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Business Units
          </CardTitle>
          <CardDescription>
            Business units this user is assigned to.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {initialBusinessUnitIds.length > 0 ? (
              initialBusinessUnitIds.map(id => (
                <Badge key={id} variant="outline" className="text-sm">
                  {getBusinessUnitName(id)}
                </Badge>
              ))
            ) : (
              <span className="text-sm text-muted-foreground">No business units assigned</span>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="h-5 w-5" />
          Business Unit Assignment
        </CardTitle>
        <CardDescription>
          Manage which business units this user has access to.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {unitsLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <div className="space-y-2 max-h-64 overflow-y-auto border rounded-md p-3">
                {businessUnits && businessUnits.length > 0 ? (
                  businessUnits.map((unit) => (
                    <div key={unit.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={`bu-${unit.id}`}
                        checked={selectedBusinessUnitIds.includes(unit.id)}
                        onCheckedChange={(checked) => 
                          handleBusinessUnitToggle(unit.id, checked === true)
                        }
                        disabled={assignMutation.isPending}
                      />
                      <label
                        htmlFor={`bu-${unit.id}`}
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer flex items-center gap-2 w-full"
                      >
                        {unit.name}
                      </label>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">No business units available</p>
                )}
              </div>
            </div>

            {/* Save/Cancel Buttons */}
            {hasChanges && (
              <div className="flex flex-col sm:flex-row gap-2 pt-2 animate-in fade-in slide-in-from-top-2">
                <Button
                  onClick={handleSave}
                  disabled={assignMutation.isPending}
                  size="sm"
                  className="w-full sm:w-auto"
                >
                  <Save className="h-4 w-4 mr-2" />
                  {assignMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
                <Button
                  onClick={handleCancel}
                  variant="outline"
                  disabled={assignMutation.isPending}
                  size="sm"
                  className="w-full sm:w-auto"
                >
                  Cancel
                </Button>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              Editors assigned to business units can view and manage content within those units. 
              Admins can access all business units regardless of assignment.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}


