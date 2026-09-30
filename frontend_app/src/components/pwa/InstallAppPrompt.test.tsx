import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

import { InstallAppPrompt } from "./InstallAppPrompt";
import {
  clearInstallPrompt,
  initializeInstallPromptCapture,
} from "@/lib/pwa-install";

beforeEach(() => {
  localStorage.clear();
  clearInstallPrompt();
  initializeInstallPromptCapture();
});

it("offers manual installation instructions without a native prompt", () => {
  render(<InstallAppPrompt />);
  fireEvent.click(screen.getByRole("button", { name: "Install app" }));
  expect(screen.getByRole("dialog")).toHaveTextContent("Add to Home Screen");
  expect(screen.getByRole("dialog")).toHaveTextContent("Android");
  expect(screen.getByRole("dialog")).toHaveTextContent("Windows or Mac");
});

it("only invokes browser installation after a user click", async () => {
  const prompt = vi.fn().mockResolvedValue(undefined);
  const event = Object.assign(
    new Event("beforeinstallprompt", { cancelable: true }),
    {
      prompt,
      userChoice: Promise.resolve({ outcome: "accepted" }),
    },
  );
  act(() => window.dispatchEvent(event));
  render(<InstallAppPrompt />);
  expect(event.defaultPrevented).toBe(true);
  expect(prompt).not.toHaveBeenCalled();
  act(() =>
    fireEvent.click(screen.getByRole("button", { name: "Install app" })),
  );
  await waitFor(() => expect(prompt).toHaveBeenCalledOnce());
  expect(
    screen.queryByLabelText("Install Community Brief"),
  ).not.toBeInTheDocument();

  render(<InstallAppPrompt />);
  expect(
    screen.queryByLabelText("Install Community Brief"),
  ).not.toBeInTheDocument();
});

it("retains an install event fired before the signed-in layout mounts", () => {
  const event = Object.assign(
    new Event("beforeinstallprompt", { cancelable: true }),
    {
      prompt: vi.fn(),
      userChoice: Promise.resolve({ outcome: "dismissed" }),
    },
  );
  act(() => window.dispatchEvent(event));
  render(<InstallAppPrompt />);
  expect(screen.getByRole("button", { name: "Install app" })).toBeVisible();
});

it("keeps all installation guidance hidden after dismissal", () => {
  const view = render(<InstallAppPrompt />);
  fireEvent.click(
    screen.getByRole("button", { name: "Dismiss installation guidance" }),
  );
  view.unmount();
  render(<InstallAppPrompt />);
  expect(
    screen.queryByRole("button", { name: "Install app" }),
  ).not.toBeInTheDocument();
});

it("hides guidance when the browser reports installation", () => {
  const view = render(<InstallAppPrompt />);
  act(() => window.dispatchEvent(new Event("appinstalled")));
  expect(
    screen.queryByRole("button", { name: "Install app" }),
  ).not.toBeInTheDocument();
  view.unmount();

  render(<InstallAppPrompt />);
  expect(
    screen.queryByLabelText("Install Community Brief"),
  ).not.toBeInTheDocument();
});
