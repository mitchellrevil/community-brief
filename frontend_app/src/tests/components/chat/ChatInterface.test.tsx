/* eslint-disable @typescript-eslint/require-await */
/**
 * ChatInterface Component Tests
 * 
 * Tests the chat interface with message handling and loading states.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {Message} from "@/components/chat/ChatInterface";
import { ChatInterface  } from "@/components/chat/ChatInterface";

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
      expect(mockSendMessage).toHaveBeenCalledWith("Hello, assistant!", []);
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
      />
    );

    // Should display both messages
    expect(screen.getByText("What is the weather?")).toBeInTheDocument();
    expect(screen.getByText("I don't have access to weather data.")).toBeInTheDocument();
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
});
