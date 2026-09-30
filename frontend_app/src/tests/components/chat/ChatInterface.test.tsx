/* eslint-disable @typescript-eslint/require-await */
/**
 * ChatInterface Component Tests
 *
 * Tests the chat interface with message handling and loading states.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Message } from "@/components/chat/ChatInterface";
import { ChatInterface } from "@/components/chat/ChatInterface";
import { DesktopChatPanel } from "@/components/chat/DesktopChatPanel";
import { mergeToolInvocation } from "@/shared/agent-chat/tool-invocations";

describe("ChatInterface", () => {
  const mockSendMessage = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should send message on submit", async () => {
    const user = userEvent.setup();
    mockSendMessage.mockResolvedValue("This is the assistant response.");

    render(<ChatInterface onSendMessage={mockSendMessage} />);

    // Type a message
    const input = screen.getByRole("textbox", { name: /message input/i });
    await user.type(input, "Hello, assistant!");

    // Submit the form
    const sendButton = screen.getByRole("button", { name: /send message/i });
    await user.click(sendButton);

    // Should call onSendMessage with the message
    await waitFor(() => {
      expect(mockSendMessage).toHaveBeenCalledWith(
        "Hello, assistant!",
        [],
        expect.any(Object),
      );
    });
  });

  it("should display message history", async () => {
    const initialMessages: Array<Message> = [
      { role: "user", content: "What is the weather?" },
      { role: "assistant", content: "I don't have access to weather data." },
    ];

    render(
      <ChatInterface
        initialMessages={initialMessages}
        onSendMessage={mockSendMessage}
      />,
    );

    // Should display both messages
    expect(screen.getByText("What is the weather?")).toBeInTheDocument();
    expect(
      screen.getByText("I don't have access to weather data."),
    ).toBeInTheDocument();
  });

  it("should handle loading state during message send", async () => {
    const user = userEvent.setup();

    // Create a promise we can control
    let resolveResponse: (value: string) => void;
    const responsePromise = new Promise<string>((resolve) => {
      resolveResponse = resolve;
    });
    mockSendMessage.mockReturnValue(responsePromise);

    render(<ChatInterface onSendMessage={mockSendMessage} />);

    // Type and send a message
    const input = screen.getByRole("textbox", { name: /message input/i });
    await user.type(input, "Test message");

    const sendButton = screen.getByRole("button", { name: /send message/i });
    await user.click(sendButton);

    // Should show loading indicator
    await waitFor(() => {
      expect(screen.getByTestId("loading-indicator")).toBeInTheDocument();
    });

    // Input should be cleared and disabled
    expect(input).toHaveValue("");
    expect(input).toBeDisabled();

    // Resolve the response
    resolveResponse!("Response received!");

    // Loading should disappear
    await waitFor(() => {
      expect(screen.queryByTestId("loading-indicator")).not.toBeInTheDocument();
    });

    // Response should be displayed
    expect(screen.getByText("Response received!")).toBeInTheDocument();
  });

  it("should not send empty messages", async () => {
    const user = userEvent.setup();
    mockSendMessage.mockResolvedValue("Response");

    render(<ChatInterface onSendMessage={mockSendMessage} />);

    // Try to submit with empty input
    const sendButton = screen.getByRole("button", { name: /send message/i });
    expect(sendButton).toBeDisabled();

    // Type only whitespace
    const input = screen.getByRole("textbox", { name: /message input/i });
    await user.type(input, "   ");

    // Button should still be disabled
    expect(sendButton).toBeDisabled();

    // Should not have called sendMessage
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it("should display empty state when no messages", () => {
    render(<ChatInterface onSendMessage={mockSendMessage} />);

    expect(screen.getByTestId("empty-chat")).toBeInTheDocument();
    expect(screen.getByText(/no messages yet/i)).toBeInTheDocument();
  });

  it("clears added messages from the frameless header", async () => {
    const user = userEvent.setup();
    mockSendMessage.mockResolvedValue("Assistant response");

    render(
      <ChatInterface
        initialMessages={[
          { role: "assistant", content: "Initial prompt context" },
        ]}
        onSendMessage={mockSendMessage}
        frameless
      />,
    );

    await user.type(
      screen.getByRole("textbox", { name: /message input/i }),
      "Hello",
    );
    await user.click(screen.getByRole("button", { name: /send message/i }));

    expect(await screen.findByText("Assistant response")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /clear chat/i }));

    expect(screen.getByText("Initial prompt context")).toBeInTheDocument();
    expect(screen.queryByText("Assistant response")).not.toBeInTheDocument();
  });

  it("should handle send error gracefully", async () => {
    const user = userEvent.setup();
    mockSendMessage.mockRejectedValue(new Error("Network error"));

    render(<ChatInterface onSendMessage={mockSendMessage} />);

    // Type and send
    const input = screen.getByRole("textbox", { name: /message input/i });
    await user.type(input, "Test message");

    const sendButton = screen.getByRole("button", { name: /send message/i });
    await user.click(sendButton);

    // Should display error message
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Network error");
    });
  });

  it("should display tool invocations from send context", async () => {
    const user = userEvent.setup();
    mockSendMessage.mockImplementation(async (_message, _history, context) => {
      context?.updateToolInvocation({
        id: "tool-1",
        name: "read_selected_folder",
        status: "completed",
        args: '{"limit":100}',
      });
      return "Done.";
    });

    render(<ChatInterface onSendMessage={mockSendMessage} />);

    const input = screen.getByRole("textbox", { name: /message input/i });
    await user.type(input, "Create a prompt");
    await user.click(screen.getByRole("button", { name: /send message/i }));

    expect(await screen.findByText("Read Selected Folder")).toBeInTheDocument();
    expect(screen.getByText("Done.")).toBeInTheDocument();
  });

  it("should approve edit tool invocations", async () => {
    const user = userEvent.setup();
    const mockApproveTool = vi.fn().mockResolvedValue("Prompt saved.");
    mockSendMessage.mockImplementation(async (_message, _history, context) => {
      context?.updateAgUiMessages([
        {
          role: "assistant",
          tool_calls: [
            {
              id: "tool-1",
              type: "function",
              function: {
                name: "create_prompt",
                arguments: '{"name":"Review"}',
              },
            },
          ],
        },
      ]);
      context?.updateToolInvocation({
        id: "tool-1",
        name: "create_prompt",
        status: "approval_required",
        args: '{"name":"Review"}',
        approval: {
          id: "approval-1",
          callId: "tool-1",
          name: "create_prompt",
          arguments: { name: "Review" },
        },
      });
      return "";
    });

    render(
      <ChatInterface
        onSendMessage={mockSendMessage}
        onApproveTool={mockApproveTool}
      />,
    );

    await user.type(
      screen.getByRole("textbox", { name: /message input/i }),
      "Create it",
    );
    await user.click(screen.getByRole("button", { name: /send message/i }));
    const approveButton = await screen.findByRole("button", {
      name: "Approve",
    });

    expect(approveButton.closest("details")).toHaveAttribute("open");

    await user.click(approveButton);

    expect(mockApproveTool).toHaveBeenCalledWith(
      expect.objectContaining({ id: "approval-1", callId: "tool-1" }),
      true,
      expect.any(Array),
      expect.any(Object),
    );
    expect(mockApproveTool.mock.calls[0][2]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          agUiMessages: expect.any(Array),
        }),
      ]),
    );
    expect(await screen.findByText("Prompt saved.")).toBeInTheDocument();
  });

  it("keeps edit approvals open when the tool call end event arrives", () => {
    const invocations = mergeToolInvocation(
      [
        {
          id: "tool-1",
          name: "replace_selected_prompt",
          status: "approval_required",
          args: '{"name":"Review"}',
          approval: {
            id: "approval-1",
            callId: "tool-1",
            name: "replace_selected_prompt",
            arguments: { name: "Review" },
          },
        },
      ],
      {
        id: "tool-1",
        name: "replace_selected_prompt",
        status: "completed",
        args: '{"name":"Review"}',
      },
    );

    expect(invocations[0]).toMatchObject({
      status: "approval_required",
      approval: {
        id: "approval-1",
        callId: "tool-1",
      },
    });
  });

  it("keeps each approval request available until the user decides it", () => {
    const invocations = mergeToolInvocation(
      [
        {
          id: "tool-1",
          name: "replace_selected_prompt",
          status: "approval_required",
          approval: {
            id: "approval-1",
            callId: "tool-1",
            name: "replace_selected_prompt",
            arguments: { name: "Review" },
          },
        },
      ],
      {
        id: "tool-2",
        name: "add_pre_session_form_field",
        status: "approval_required",
        approval: {
          id: "approval-2",
          callId: "tool-2",
          name: "add_pre_session_form_field",
          arguments: { label: "Manager" },
        },
      },
    );

    expect(invocations).toEqual([
      expect.objectContaining({
        id: "tool-1",
        status: "approval_required",
        approval: expect.objectContaining({ callId: "tool-1" }),
      }),
      expect.objectContaining({
        id: "tool-2",
        status: "approval_required",
        approval: expect.objectContaining({ callId: "tool-2" }),
      }),
    ]);
  });

  it("should render tool invocations in the recording desktop panel", () => {
    render(
      <DesktopChatPanel
        messages={[]}
        input=""
        setInput={vi.fn()}
        isLoading={false}
        error={null}
        activeToolInvocations={[
          {
            id: "tool-1",
            name: "read_selected_prompt",
            status: "completed",
          },
        ]}
        isExpanded={false}
        onToggleExpanded={vi.fn()}
        onClose={vi.fn()}
        onClearHistory={vi.fn()}
        onSubmit={vi.fn()}
        messagesEndRef={{ current: null }}
      />,
    );

    expect(screen.getByText("Read Selected Prompt")).toBeInTheDocument();
  });

  it("should surface apply patch approval in the recording desktop panel", async () => {
    const user = userEvent.setup();
    const onApproveTool = vi.fn();

    render(
      <DesktopChatPanel
        messages={[
          {
            role: "assistant",
            content: "",
            toolInvocations: [
              {
                id: "patch-1",
                name: "apply_patch",
                status: "approval_required",
                approval: {
                  id: "approval-1",
                  callId: "patch-1",
                  name: "apply_patch",
                  arguments: { old_text: "old", new_text: "new" },
                },
              },
            ],
          },
        ]}
        input=""
        setInput={vi.fn()}
        isLoading={false}
        error={null}
        onApproveTool={onApproveTool}
        isExpanded={false}
        onToggleExpanded={vi.fn()}
        onClose={vi.fn()}
        onClearHistory={vi.fn()}
        onSubmit={vi.fn()}
        messagesEndRef={{ current: null }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Approve" }));

    expect(onApproveTool).toHaveBeenCalledWith(
      expect.objectContaining({ callId: "patch-1", name: "apply_patch" }),
    );
  });
});
