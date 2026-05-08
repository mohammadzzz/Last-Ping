import { env } from "@/lib/env";

/**
 * Minimal Telegram Bot API sendMessage — avoids pulling a full library.
 */
export async function sendTelegram(
  chatId: string,
  text: string,
): Promise<{ id?: string; error?: string }> {
  const { TELEGRAM_BOT_TOKEN } = env();
  if (!TELEGRAM_BOT_TOKEN) return { error: "telegram not configured" };
  try {
    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
      }),
    });
    const data = (await res.json()) as { ok: boolean; result?: { message_id: number }; description?: string };
    if (!data.ok) return { error: data.description ?? "telegram failed" };
    return { id: String(data.result?.message_id ?? "") };
  } catch (err) {
    return { error: (err as Error).message };
  }
}
