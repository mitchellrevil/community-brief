import { useState } from "react";
import { Key, Shield } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BusinessUnitAssignment } from "./BusinessUnitAssignment";
import type { User } from "@/features/users/data/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { changeUserPassword, updateUserPermission } from "@/features/users/data/api";
import { usersKeys } from "@/features/users/data/keys";
import { PermissionLevel } from "@/types/permissions";

interface SecurityTabProps {
  user: User;
}

export function SecurityTab({ user }: SecurityTabProps) {
  const queryClient = useQueryClient();
  const [permission, setPermission] = useState<PermissionLevel>(user.permission);
  const [password, setPassword] = useState("");
  
  const permissionMutation = useMutation({
    mutationFn: (newPermission: PermissionLevel) => updateUserPermission(user.id, newPermission),
    onSuccess: () => {
      toast.success(`Permission updated to ${permission}`);
      queryClient.invalidateQueries({ queryKey: usersKeys.user(user.id) });
    },
    onError: (error: Error) => {
      toast.error(`Failed to update permission: ${error.message}`);
      setPermission(user.permission); // Reset on error
    },
  });

  const passwordMutation = useMutation({
    mutationFn: (newPassword: string) => changeUserPassword(user.id, newPassword),
    onSuccess: () => {
      toast.success("Password changed successfully");
      setPassword("");
    },
    onError: (error: Error) => {
      toast.error(`Failed to change password: ${error.message}`);
    },
  });

  const handlePermissionChange = () => {
    if (permission !== user.permission) {
      permissionMutation.mutate(permission);
    }
  };

  const handlePasswordChange = (e: React.FormEvent) => {
    e.preventDefault();
    if (password.trim()) {
      passwordMutation.mutate(password);
    }
  };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Role & Permissions
            </CardTitle>
            <CardDescription>
              Control the user's access level within the application.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="role">Role</Label>
              <div className="flex flex-col sm:flex-row gap-2">
                <Select 
                  value={permission} 
                  onValueChange={(val) => setPermission(val as PermissionLevel)}
                >
                  <SelectTrigger id="role" className="w-full">
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={PermissionLevel.ADMIN}>Admin</SelectItem>
                    <SelectItem value={PermissionLevel.EDITOR}>Editor</SelectItem>
                    <SelectItem value={PermissionLevel.USER}>User</SelectItem>
                  </SelectContent>
                </Select>
                <Button 
                  onClick={handlePermissionChange}
                  disabled={permission === user.permission || permissionMutation.isPending}
                  className="w-full sm:w-auto"
                >
                  {permissionMutation.isPending ? "Saving..." : "Save"}
                </Button>
              </div>
            </div>
            <div className="text-sm text-muted-foreground space-y-1">
              <p><strong>Admin:</strong> Full access to all resources and settings.</p>
              <p><strong>Editor:</strong> Can manage content within assigned business units.</p>
              <p><strong>User:</strong> Read-only access to assigned content.</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              Change Password
            </CardTitle>
            <CardDescription>
              Update the user's password.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handlePasswordChange} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">New Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter new password"
                  minLength={8}
                />
              </div>
              <Button 
                type="submit" 
                disabled={!password.trim() || passwordMutation.isPending}
                className="w-full sm:w-auto"
              >
                {passwordMutation.isPending ? "Updating..." : "Update Password"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <BusinessUnitAssignment user={user} />
      </div>
    </div>
  );
}


