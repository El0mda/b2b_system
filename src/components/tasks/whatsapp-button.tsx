// "Open WhatsApp" for a WhatsApp task: opens a chat with the lead, the
// sequence's message already typed. A number without a country code can't
// be dialled safely, so it's explained instead of guessed at.
import { MessageCircle } from "lucide-react";

import { whatsappLink, whatsappTarget } from "@/lib/whatsapp";
import { cn } from "@/lib/utils";

export function WhatsappButton({
  phone,
  message,
  size = "md",
}: {
  phone: string | null | undefined;
  message: string | null | undefined;
  size?: "sm" | "md";
}) {
  const target = whatsappTarget(phone);
  if (!target.ok) {
    return <p className="text-xs text-amber-600 dark:text-amber-400">{target.reason}</p>;
  }
  return (
    <a
      href={whatsappLink(target.digits, message)}
      target="_blank"
      rel="noreferrer"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md bg-emerald-600 font-medium text-white transition-colors hover:bg-emerald-700",
        size === "sm" ? "px-2 py-1 text-xs" : "px-3 py-1.5 text-sm",
      )}
    >
      <MessageCircle className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} />
      Open WhatsApp
    </a>
  );
}
