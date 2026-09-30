import { useState } from "react";
import { Download, Mail, MoreVertical, Shield, ShieldCheck, Trash2, User as UserIcon } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";
import type {User} from "@/features/users/data/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {  deleteUser, exportUserDetailsPDF } from "@/features/users/data/api";
import { PermissionLevel } from "@/types/permissions";
import { formatDate } from "@/lib/date-utils";

interface UserDetailsHeaderProps {
  user: User;
}

export function UserDetailsHeader({ user }: UserDetailsHeaderProps) {
  const navigate = useNavigate();
  const [isExporting, setIsExporting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const handleExportPDF = async () => {
    setIsExporting(true);
    try {
      const blob = await exportUserDetailsPDF(user.id, true, 30);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = `user-${user.email}-details.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success("User details exported successfully");
    } catch (error) {
      console.error("Failed to export user details:", error);
      toast.error("Failed to export user details");
    } finally {
      setIsExporting(false);
    }
  };

  const handleDeleteUser = async () => {
    setIsDeleting(true);
    try {
      await deleteUser(user.id);
      toast.success(`User ${user.email} has been deleted`);
      navigate({ to: "/admin/user-management" });
    } catch (error: any) {
      console.error("Failed to delete user:", error);
      toast.error(error.message || "Failed to delete user");
      setIsDeleting(false);
      setShowDeleteDialog(false);
    }
  };

  const getPermissionBadge = (permission: PermissionLevel) => {
    switch (permission) {
      case PermissionLevel.ADMIN:
        return <Badge variant="destructive" className="gap-1"><Shield className="h-3 w-3" /> Admin</Badge>;
      case PermissionLevel.EDITOR:
        return <Badge variant="secondary" className="gap-1 bg-yellow-100 text-yellow-800 hover:bg-yellow-100/80"><ShieldCheck className="h-3 w-3" /> Editor</Badge>;
      default:
        return <Badge variant="outline" className="gap-1"><UserIcon className="h-3 w-3" /> User</Badge>;
    }
  };

  const displayName = user.full_name || user.name || "Unnamed User";
  const initials = displayName !== "Unnamed User"
    ? displayName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : user.email.split('@')[0].slice(0, 2).toUpperCase();

  return (
    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 w-full md:w-auto">
        <div className="h-14 w-14 sm:h-16 sm:w-16 rounded-full bg-primary/10 flex items-center justify-center text-xl sm:text-2xl font-bold text-primary flex-shrink-0">
          {initials}
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight flex flex-wrap items-center gap-2">
            {displayName}
            {getPermissionBadge(user.permission)}
          </h1>
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 text-muted-foreground mt-1">
            <div className="flex items-center gap-2 min-w-0">
              <Mail className="h-4 w-4 flex-shrink-0" />
              <span className="break-all sm:break-normal truncate sm:whitespace-nowrap">{user.email}</span>
            </div>
            <span className="text-xs hidden sm:inline">•</span>
            <span className="text-sm">Joined {formatDate(user.date)}</span>
          </div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full md:w-auto">
        <Button variant="outline" onClick={handleExportPDF} disabled={isExporting} className="w-full sm:w-auto">
          <Download className="mr-2 h-4 w-4" />
          {isExporting ? "Exporting..." : "Export PDF"}
        </Button>
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="self-start sm:self-auto">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Actions</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => setShowDeleteDialog(true)} className="text-red-600">
              <Trash2 className="mr-2 h-4 w-4" />
              Delete User
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the user
              account and remove their data from our servers.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteUser} className="bg-red-600 hover:bg-red-700">
              {isDeleting ? "Deleting..." : "Delete User"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}


