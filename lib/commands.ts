// Replies for the bot's commands. The bot never chats: anything that isn't a
// known command gets FALLBACK_REPLY. Edit the texts here.

export const BOT_COMMANDS = [
  { command: "start", description: "Check whether this chat receives enquiries" },
  { command: "help", description: "What this bot does" },
  { command: "id", description: "Show this chat's ID" },
] as const;

export const FALLBACK_REPLY = "This bot only sends enquiry notifications.";

const HELP_TEXT =
  "This bot forwards enquiries from the Peninsula Delmar website.\n\n" +
  "/start – check whether this chat receives enquiries\n" +
  "/id – show this chat's ID\n" +
  "/help – show this message";

/** Extracts the command name from "/start", "/start@bot_name" or "/start payload". */
export function parseCommand(text: string): string | null {
  const match = /^\/([a-z0-9_]+)(?:@\w+)?(?:\s|$)/i.exec(text.trim());
  return match?.[1]?.toLowerCase() ?? null;
}

/** Builds the reply (Telegram HTML) for a private-chat message. */
export function replyFor(text: string, chatId: string, subscribedIds: readonly string[]): string {
  const subscribed = subscribedIds.includes(chatId);

  switch (parseCommand(text)) {
    case "start":
      return subscribed
        ? "👋 Hi! New website enquiries will arrive in this chat. ✅"
        : "👋 Hi! This chat is not set up to receive enquiries yet.\n\n" +
            `Your chat ID is <code>${chatId}</code>. Send it to the site admin to be added.`;
    case "help":
      return HELP_TEXT;
    case "id":
      return `This chat's ID is <code>${chatId}</code>` +
        (subscribed ? "\n✅ It receives enquiries." : "\n❌ It does not receive enquiries.");
    default:
      return FALLBACK_REPLY;
  }
}
