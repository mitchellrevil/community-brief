import React, { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  BarChart3,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  FileAudio,
  FileText,
  LogOut,
  Mic,
  MoreHorizontal,
  Trash2,
  Upload,
  User,
  UserCog,
  Users,
} from "lucide-react";
import type { LinkOptions } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { isDevelopmentBannerEnabled } from "@/components/development-server-banner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useAuthActions } from "@/features/auth/hooks/useAuthActions";
import { useMicrosoftAccessToken } from "@/features/auth/hooks/useMicrosoftAccessToken";
import { useMicrosoftProfileImage } from "@/features/auth/hooks/useMicrosoftProfileImage";
import { isHelpPageEnabled } from "@/config/features";
import { cn } from "@/lib/utils";
import { getStorageItem, setStorageItem } from "@/lib/storage";
import { useUserPermissions } from "@/hooks/usePermissions";
import { PermissionLevel, hasPermissionLevel } from "@/types/permissions";
import { useTutorialOptional } from "@/app/contexts/tutorial-context";

interface NavItemConfig {
  id: string;
  icon: React.ElementType;
  label: string;
  to: LinkOptions["to"];
  mobileShortLabel?: string;
}

interface NavSectionConfig {
  id: string;
  label?: string;
  minPermission?: PermissionLevel;
  items: ReadonlyArray<NavItemConfig>;
}

type UserMenuAction = "tutorial" | "toggleLayout";

type UserMenuEntry =
  | {
      id: string;
      kind: "route";
      icon: React.ElementType;
      label: string;
      to: LinkOptions["to"];
    }
  | {
      id: string;
      kind: "external";
      icon: React.ElementType;
      label: string;
      href: string;
    }
  | {
      id: string;
      kind: "action";
      icon: React.ElementType;
      label: string;
      action: UserMenuAction;
    };

const PRIMARY_NAV_ITEMS: ReadonlyArray<NavItemConfig> = [
  {
    id: "record-upload",
    icon: Mic,
    label: "Record & upload",
    to: "/simple-upload",
    mobileShortLabel: "Record",
  },
  {
    id: "media-upload",
    icon: Upload,
    label: "Media upload",
    to: "/audio-upload",
    mobileShortLabel: "Media",
  },
  {
    id: "my-files",
    icon: FileAudio,
    label: "Files",
    to: "/audio-recordings",
    mobileShortLabel: "My",
  },
  {
    id: "shared-files",
    icon: Users,
    label: "Shared files",
    to: "/audio-recordings/shared",
    mobileShortLabel: "Shared",
  },
];

const EDITOR_NAV_ITEMS: ReadonlyArray<NavItemConfig> = [
  {
    id: "prompt-management",
    icon: FileText,
    label: "Prompts",
    to: "/prompt-management",
  },
  { id: "analytics", icon: BarChart3, label: "Analytics", to: "/analytics" },
];

const MODERATOR_NAV_ITEMS: ReadonlyArray<NavItemConfig> = [
  { id: "all-files", icon: FileAudio, label: "All Files", to: "/admin/all-jobs" },
];

const ADMIN_NAV_ITEMS: ReadonlyArray<NavItemConfig> = [
  {
    id: "user-management",
    icon: UserCog,
    label: "Users",
    to: "/admin/user-management",
  },
  {
    id: "deleted-files",
    icon: Trash2,
    label: "Deleted Files",
    to: "/admin/deleted-jobs",
  },
];

const HELP_NAV_ITEM: NavItemConfig = {
  id: "help",
  icon: CircleHelp,
  label: "Help",
  to: "/help",
};

const NAV_SECTIONS: ReadonlyArray<NavSectionConfig> = [
  { id: "primary", items: PRIMARY_NAV_ITEMS },
  {
    id: "editor",
    label: "Editor",
    minPermission: PermissionLevel.EDITOR,
    items: EDITOR_NAV_ITEMS,
  },
  {
    id: "moderator",
    label: "Moderator",
    minPermission: PermissionLevel.MODERATOR,
    items: MODERATOR_NAV_ITEMS,
  },
  {
    id: "admin",
    label: "User Admin",
    minPermission: PermissionLevel.ADMIN,
    items: ADMIN_NAV_ITEMS,
  },
];

const BASE_USER_MENU_ENTRIES: ReadonlyArray<UserMenuEntry> = [
  {
    id: "profile",
    kind: "route",
    icon: User,
    label: "Profile Settings",
    to: "/profile",
  },
  {
    id: "suggest-template",
    kind: "route",
    icon: FileText,
    label: "Suggest a template?",
    to: "/suggest-template",
  },
  {
    id: "tutorial",
    kind: "action",
    icon: BookOpen,
    label: "Replay Tutorial",
    action: "tutorial",
  },
];

const HELP_USER_MENU_ENTRY: UserMenuEntry = {
  id: "help",
  kind: "route",
  icon: CircleHelp,
  label: "Help",
  to: "/help",
};

const getBaseUserMenuEntries = (): Array<UserMenuEntry> => [
  ...BASE_USER_MENU_ENTRIES,
  ...(isHelpPageEnabled ? [HELP_USER_MENU_ENTRY] : []),
];

const getFooterNavItems = (): Array<NavItemConfig> => [
  ...(isHelpPageEnabled ? [HELP_NAV_ITEM] : []),
];

interface AppSidebarProps {
  children?: React.ReactNode;
}

const getUserInitials = (email?: string) => {
  if (!email) return "U";
  return email.split("@")[0].slice(0, 2).toUpperCase();
};

const getPermissionColor = (permission?: string) => {
  switch (permission) {
    case "manage":
      return "bg-red-100 text-red-800 border-red-200";
    case "edit":
      return "bg-yellow-100 text-yellow-800 border-yellow-200";
    case "view":
      return "bg-blue-100 text-blue-800 border-blue-200";
    default:
      return "bg-gray-100 text-gray-800 border-gray-200";
  }
};

const readBooleanStorage = (key: string, fallback: boolean) => {
  const raw = getStorageItem(key, JSON.stringify(fallback));
  try {
    return JSON.parse(raw) as boolean;
  } catch {
    return fallback;
  }
};

export function AppSidebar({ children }: AppSidebarProps) {
  const [isOpen, setIsOpen] = useState(() => readBooleanStorage("sidebarOpen", true));
  const [sidebarLayout, setSidebarLayout] = useState(() =>
    getStorageItem("sidebarLayout", "left")
  );

  const { data: userPermissions } = useUserPermissions();
  const { signOut } = useAuthActions();
  const tutorialContext = useTutorialOptional();
  const startTutorial = tutorialContext?.startTutorial ?? (() => {});
  const msAccessToken = useMicrosoftAccessToken();
  const profileImage = useMicrosoftProfileImage(msAccessToken || null);

  const userPermission = userPermissions?.permission;

  const hasSectionPermission = (section: NavSectionConfig) => {
    if (!section.minPermission) return true;
    if (!userPermission) return false;
    return hasPermissionLevel(userPermission, section.minPermission);
  };

  const visibleDesktopSections = NAV_SECTIONS.filter(hasSectionPermission);
  const visibleMobileMoreSections = NAV_SECTIONS.filter(
    (section) => section.id !== "primary" && hasSectionPermission(section)
  );

  const toggleSidebar = () => {
    const newState = !isOpen;
    setIsOpen(newState);
    setStorageItem("sidebarOpen", JSON.stringify(newState));
  };

  const toggleSidebarLayout = () => {
    const newLayout = sidebarLayout === "left" ? "top" : "left";
    setSidebarLayout(newLayout);
    setStorageItem("sidebarLayout", newLayout);
  };

  const handleLogout = () => {
    void signOut().then(() => {
      window.location.replace("/login");
    });
  };

  const handleUserMenuAction = (action: UserMenuAction) => {
    if (action === "tutorial") {
      startTutorial();
      return;
    }

    toggleSidebarLayout();
  };

  const baseUserMenuEntries = getBaseUserMenuEntries();
  const footerNavItems = getFooterNavItems();
  const userMenuEntries: Array<UserMenuEntry> = [
    ...baseUserMenuEntries,
    {
      id: "layout-toggle",
      kind: "action",
      icon: ChevronLeft,
      label: sidebarLayout === "top" ? "Switch to Left Sidebar" : "Switch to Top Bar",
      action: "toggleLayout",
    },
  ];

  const renderDesktopLink = (item: NavItemConfig) => (
    <Link
      key={item.id}
      to={item.to}
      aria-label={sidebarLayout === "left" && !isOpen ? item.label : undefined}
      className={cn(
        "flex items-center rounded-lg px-2 py-1.5 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        sidebarLayout === "left" ? "w-full" : ""
      )}
      activeProps={{
        className: "bg-sidebar-accent text-sidebar-accent-foreground",
        "aria-current": "page",
      }}
    >
      <item.icon className="h-5 w-5" />
      <span className={cn("ml-3 hidden", sidebarLayout === "top" ? "inline" : isOpen && "inline")}>
        {item.label}
      </span>
    </Link>
  );

  const renderMobileSection = (section: NavSectionConfig) => (
    <React.Fragment key={section.id}>
      {section.label && <DropdownMenuLabel>{section.label}</DropdownMenuLabel>}
      {section.items.map((item) => (
        <DropdownMenuItem key={item.id} asChild>
          <Link
            to={item.to}
            className="flex items-center"
            activeProps={{ "aria-current": "page" }}
            aria-label={item.label}
          >
            <item.icon className="mr-2 h-4 w-4" />
            <span>{item.label}</span>
          </Link>
        </DropdownMenuItem>
      ))}
    </React.Fragment>
  );

  const renderUserMenuEntry = (entry: UserMenuEntry) => {
    if (entry.kind === "route") {
      return (
        <DropdownMenuItem key={entry.id} asChild>
          <Link
            to={entry.to}
            className="flex items-center"
            activeProps={{ "aria-current": "page" }}
            aria-label={entry.label}
          >
            <entry.icon className="mr-2 h-4 w-4" />
            <span>{entry.label}</span>
          </Link>
        </DropdownMenuItem>
      );
    }

    if (entry.kind === "external") {
      return (
        <DropdownMenuItem key={entry.id} asChild>
          <a
            href={entry.href}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center"
            aria-label={entry.label}
          >
            <entry.icon className="mr-2 h-4 w-4" />
            <span>{entry.label}</span>
          </a>
        </DropdownMenuItem>
      );
    }

    return (
      <DropdownMenuItem key={entry.id} onClick={() => handleUserMenuAction(entry.action)}>
        <entry.icon className="mr-2 h-4 w-4" />
        <span>{entry.label}</span>
      </DropdownMenuItem>
    );
  };

  return (
    <div className="flex min-h-screen flex-col">
      <nav
        aria-label="Primary"
        className={cn(
          "fixed left-0 right-0 z-50 border-t border-border bg-background pb-[env(safe-area-inset-bottom)] md:hidden",
          isDevelopmentBannerEnabled ? "bottom-8" : "bottom-0"
        )}
      >
        <ul className="flex h-16 items-center justify-around px-2">
          {PRIMARY_NAV_ITEMS.slice(0, 4).map((item) => (
            <li key={item.id}>
              <Link
                to={item.to}
                aria-label={item.label}
                className="flex min-h-[2.75rem] min-w-16 flex-col items-center justify-center rounded-lg px-2 py-1.5 text-foreground transition-colors hover:bg-muted"
                activeProps={{
                  className: "bg-accent text-accent-foreground",
                  "aria-current": "page",
                }}
              >
                <item.icon className="h-5 w-5" />
                <span className="mt-1 max-w-[8ch] truncate text-[0.7rem]">
                  {item.mobileShortLabel ?? item.label.split(" ")[0]}
                </span>
              </Link>
            </li>
          ))}

          <li>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="flex min-h-[2.75rem] min-w-16 flex-col items-center justify-center px-2 py-1.5 text-foreground hover:bg-muted"
                  aria-label="More menu"
                >
                  <MoreHorizontal className="h-5 w-5" />
                  <span className="mt-1 text-[0.7rem]">More</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" side="top" className="mb-2 w-56">
                {visibleMobileMoreSections.map(renderMobileSection)}

                <DropdownMenuSeparator />
                {baseUserMenuEntries.map(renderUserMenuEntry)}

                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="text-red-400 focus:text-red-300">
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Logout</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </li>
        </ul>
      </nav>

      <div
        className={cn(
          "hidden md:fixed md:left-0 md:top-0 md:z-40 md:flex bg-sidebar text-sidebar-foreground transition-all duration-300 ease-in-out border-sidebar-border",
          sidebarLayout === "top"
            ? "md:h-16 md:w-full md:flex-row md:border-b"
            : cn(
                isDevelopmentBannerEnabled ? "md:h-[calc(100vh-2rem)]" : "md:h-full",
                "md:flex-col md:border-r",
                isOpen ? "md:w-64" : "md:w-16"
              )
        )}
      >
        {sidebarLayout === "left" && (
          <Button
            variant="ghost"
            className="absolute z-50 h-8 w-8 rounded-full border border-sidebar-border bg-sidebar-accent p-0 text-sidebar-accent-foreground hover:bg-sidebar-accent/80 md:-right-4 md:top-4"
            onClick={toggleSidebar}
            aria-label={isOpen ? "Collapse sidebar" : "Expand sidebar"}
          >
            {isOpen ? <ChevronLeft /> : <ChevronRight />}
          </Button>
        )}

        <div className={cn("flex h-full w-full min-h-0", sidebarLayout === "top" ? "md:flex-row" : "md:flex-col")}>
          {sidebarLayout === "left" && isOpen && (
            <div
              className="flex h-24 w-full flex-shrink-0 items-center justify-center overflow-hidden bg-sidebar px-4 pt-4 transition-all duration-300 md:h-24"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sidebar-accent text-sidebar-accent-foreground">
                  <FileAudio className="h-5 w-5" />
                </div>
                <span className="text-lg font-semibold text-sidebar-foreground">
                  Community Brief
                </span>
              </div>
            </div>
          )}


          <nav
            aria-label="Primary"
            className={cn(
              "flex min-h-0 flex-1 p-4",
              sidebarLayout === "top"
                ? "flex-row space-x-2 space-y-0"
                : cn(
                    "flex-col space-x-0 space-y-1 overflow-y-auto hide-scrollbar",
                    !isOpen && "items-center"
                  )
            )}
          >
            {visibleDesktopSections.map((section) => (
              <React.Fragment key={section.id}>
                {sidebarLayout === "left" && isOpen && section.label && (
                  <div className="mx-2 my-3 flex items-center">
                    <div className="h-px flex-grow bg-sidebar-border" />
                    <span className="px-3 text-xs font-medium uppercase tracking-wider text-sidebar-foreground/60">
                      {section.label}
                    </span>
                    <div className="h-px flex-grow bg-sidebar-border" />
                  </div>
                )}

                {section.items.map(renderDesktopLink)}
              </React.Fragment>
            ))}
          </nav>

          <div className="flex-shrink-0">
            {sidebarLayout === "top" && (
              <div className="mr-4 flex items-center space-x-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="h-full space-x-3 px-3 py-3 hover:bg-sidebar-accent">
                      <Avatar className="h-8 w-8">
                        {profileImage && <AvatarImage src={profileImage} alt="Microsoft profile" />}
                        <AvatarFallback className="bg-sidebar-accent text-xs font-medium text-sidebar-accent-foreground">
                          {getUserInitials(userPermissions?.email)}
                        </AvatarFallback>
                      </Avatar>
                      {userPermissions && (
                        <div className="min-w-0 items-start text-left">
                          <span className="block max-w-[180px] truncate text-sm font-medium text-sidebar-foreground">
                            {userPermissions.email}
                          </span>
                          <Badge
                            variant="outline"
                            className={cn(
                              "h-4 px-1.5 py-0.5 text-xs",
                              getPermissionColor(userPermissions.permission)
                            )}
                          >
                            {userPermissions.permission}
                          </Badge>
                        </div>
                      )}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-64">
                    {userPermissions && (
                      <div className="border-b px-3 py-2">
                        <div className="text-sm font-medium">{userPermissions.email}</div>
                        <div className="mt-1">
                          <Badge
                            variant="outline"
                            className={cn("px-2 py-0.5 text-xs", getPermissionColor(userPermissions.permission))}
                          >
                            {userPermissions.permission}
                          </Badge>
                        </div>
                      </div>
                    )}

                    {userMenuEntries.map(renderUserMenuEntry)}
                  </DropdownMenuContent>
                </DropdownMenu>

                <Button
                  variant="ghost"
                  className="h-full px-3 py-3 text-red-400 hover:bg-red-900/20 hover:text-red-300"
                  onClick={handleLogout}
                  aria-label="Logout"
                >
                  <LogOut className="h-5 w-5" />
                </Button>
              </div>
            )}

            {sidebarLayout === "left" && (
              <div className="mt-auto flex w-full flex-col">
                {footerNavItems.length > 0 && (
                  <div className={cn("px-4 pb-2", !isOpen && "px-2")}>
                    {footerNavItems.map(renderDesktopLink)}
                  </div>
                )}

                <div className="mt-2 rounded-lg px-3 py-2 transition-colors hover:rounded-t-md hover:bg-sidebar-accent">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className={cn(
                          "w-full cursor-pointer p-0",
                          !isOpen
                            ? "flex flex-col space-x-0 space-y-2 py-2"
                            : "flex flex-row items-center space-x-3 space-y-0 py-2"
                        )}
                        aria-label="Open profile menu"
                      >
                        <Avatar className="h-10 w-10">
                          {profileImage && <AvatarImage src={profileImage} alt="Microsoft profile" />}
                          <AvatarFallback className="bg-sidebar-accent text-sm font-medium text-sidebar-accent-foreground">
                            {getUserInitials(userPermissions?.email)}
                          </AvatarFallback>
                        </Avatar>
                        {userPermissions && isOpen && (
                          <div className="min-w-0 items-start text-left">
                            <span className="block max-w-full truncate text-sm font-medium text-sidebar-foreground">
                              {userPermissions.email}
                            </span>
                            <Badge
                              variant="outline"
                              className={cn(
                                "mt-1.5 h-5 px-2 py-1 text-xs",
                                getPermissionColor(userPermissions.permission)
                              )}
                            >
                              {userPermissions.permission}
                            </Badge>
                          </div>
                        )}
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-64">
                      {userPermissions && (
                        <div className="border-b px-3 py-2">
                          <div className="text-sm font-medium">{userPermissions.email}</div>
                          <div className="mt-1">
                            <Badge
                              variant="outline"
                              className={cn("px-2 py-0.5 text-xs", getPermissionColor(userPermissions.permission))}
                            >
                              {userPermissions.permission}
                            </Badge>
                          </div>
                        </div>
                      )}

                      {userMenuEntries.map(renderUserMenuEntry)}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <div className="mt-auto border-t border-sidebar-border p-4">
                  <Button
                    variant="ghost"
                    className={cn(
                      "w-full justify-start p-4 text-red-400 hover:bg-red-900/20 hover:text-red-300",
                      !isOpen && "flex-col space-y-2"
                    )}
                    onClick={handleLogout}
                    aria-label="Logout"
                  >
                    <LogOut className="h-5 w-5" />
                    {isOpen && <span className="ml-3">Logout</span>}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div
        className={cn(
          "flex-1 transition-all duration-300 ease-in-out",
          isDevelopmentBannerEnabled
            ? "pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-8"
            : "pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0",
          sidebarLayout === "top"
            ? "md:mt-16"
            : isOpen
              ? "md:mt-0 md:ml-64"
              : "md:mt-0 md:ml-16"
        )}
      >
        {children}
      </div>
    </div>
  );
}
