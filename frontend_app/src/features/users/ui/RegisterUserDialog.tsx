import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { registerUser } from "@/features/auth/data/api";
import { PermissionLevel } from "@/types/permissions";
import { usersKeys } from "@/features/users/data/keys";

export function RegisterUserDialog() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<PermissionLevel>(PermissionLevel.USER);

  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async () => registerUser(email.trim(), password, role),
    onSuccess: (res) => {
      toast.success(res.message || "User created");
      setOpen(false);
      setEmail("");
      setPassword("");
      queryClient.invalidateQueries({ queryKey: usersKeys.root() });
    },
    onError: (err: any) => {
      toast.error(err?.message || "Failed to register user");
    },
  });

  const canSubmit = email.trim().length > 0 && password.trim().length >= 8 && !mutation.isPending;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="default">Register User</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Register New User</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <label className="text-sm font-medium">Email</label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="newuser@example.com" />
          </div>
          <div>
            <label className="text-sm font-medium">Password</label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" />
          </div>
          <div>
            <label className="text-sm font-medium">Role</label>
            <Select value={role} onValueChange={(v) => setRole(v as PermissionLevel)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={PermissionLevel.USER}>User</SelectItem>
                <SelectItem value={PermissionLevel.EDITOR}>Editor</SelectItem>
                <SelectItem value={PermissionLevel.ADMIN}>Admin</SelectItem>
                <SelectItem value={PermissionLevel.MODERATOR}>Moderator</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={mutation.isPending}>Cancel</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!canSubmit}
          >
            {mutation.isPending ? "Registering..." : "Create User"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default RegisterUserDialog;
