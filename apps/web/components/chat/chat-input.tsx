"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
}

const MAX_AUTO_GROW_ROWS = 5;

export function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [message, setMessage] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Resize the textarea to fit its content, capped at MAX_AUTO_GROW_ROWS.
  // Reads computed line-height at call time so it stays correct across themes.
  const resizeTextarea = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 20;
    const maxHeight = lineHeight * MAX_AUTO_GROW_ROWS;
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
  }, []);

  useEffect(() => {
    resizeTextarea();
  }, [message, resizeTextarea]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || disabled) return;
    onSend(message.trim());
    setMessage("");
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value);
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex items-end gap-2 border-t px-4 pt-4"
      role="form"
      aria-label="Send a message"
      style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
    >
      <textarea
        ref={inputRef}
        value={message}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder="Type your message..."
        rows={1}
        disabled={disabled}
        className="flex-1 resize-none rounded-lg border bg-background px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 disabled:opacity-50 min-h-[44px] max-h-[140px] overflow-y-auto"
        aria-label="Type your message. Press Enter to send, Shift+Enter for new line."
        aria-disabled={disabled}
      />
      <Button
        type="submit"
        size="icon"
        disabled={disabled || !message.trim()}
        aria-label={disabled ? "Send message (waiting for response)" : "Send message"}
        className="min-w-[44px] min-h-[44px]"
      >
        <Send className="h-4 w-4" aria-hidden="true" />
      </Button>
    </form>
  );
}
