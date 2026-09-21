// Replies inbox — every lead who wrote back, readable and answerable
// without leaving the app for SmartLead.
//
// Message bodies are shown as plain text only (the edge function strips
// the HTML server-side, and React escapes what's left). An email is
// content from outside the company; rendering it as HTML would let a
// crafted message run script in a salesperson's session.
import { useEffect, useMemo, useState } from "react";
import { formatDistanceToNow, format } from "date-fns";
import {
  Inbox as InboxIcon,
  Search,
  Send,
  ArrowLeft,
  Loader2,
  Building2,
  Briefcase,
  Phone,
  RefreshCw,
} from "lucide-react";

import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { FullPageSpinner } from "@/components/ui/spinner";
import { WhatsappButton } from "@/components/tasks/whatsapp-button";
import {
  conversationName,
  isUnread,
  useConversations,
  useInboxActions,
  useThread,
  type Conversation,
} from "@/lib/inbox";
import { cn } from "@/lib/utils";

export default function InboxPage() {
  const { organization } = useAuth();
  const orgId = organization?.id;
  const { data: conversations = [], isLoading } = useConversations(orgId);
  const { markRead, sendReply } = useInboxActions(orgId);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return conversations.filter((c) => {
      if (unreadOnly && !isUnread(c)) return false;
      if (!q) return true;
      return [conversationName(c), c.email, c.company, c.campaigns?.name]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [conversations, search, unreadOnly]);

  const unreadCount = conversations.filter(isUnread).length;
  const selected = conversations.find((c) => c.id === selectedId) ?? null;

  const open = (c: Conversation) => {
    setSelectedId(c.id);
    if (isUnread(c)) markRead.mutate(c.id);
  };

  if (isLoading) return <FullPageSpinner />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-2xl font-bold">Inbox</h2>
        {unreadCount > 0 && <Badge variant="info">{unreadCount} unread</Badge>}
        <p className="w-full text-sm text-muted-foreground">
          Every lead who replied to your campaigns. Replies are sent from the campaign's sender
          address through SmartLead, threaded under the lead's last message.
        </p>
      </div>

      {conversations.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-12 text-center">
            <InboxIcon className="h-10 w-10 text-muted-foreground/50" />
            <p className="font-medium">No replies yet</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              When a lead answers one of your campaigns, the conversation shows up here — usually
              within a few minutes of the reply.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
          {/* Conversation list — hidden on small screens while a thread is open */}
          <Card className={cn(selected && "hidden lg:block")}>
            <CardContent className="space-y-2 p-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search name, company, campaign…"
                  className="pl-9"
                />
              </div>
              <div className="flex gap-1.5">
                <Button
                  size="sm"
                  variant={unreadOnly ? "outline" : "default"}
                  onClick={() => setUnreadOnly(false)}
                >
                  All ({conversations.length})
                </Button>
                <Button
                  size="sm"
                  variant={unreadOnly ? "default" : "outline"}
                  onClick={() => setUnreadOnly(true)}
                >
                  Unread ({unreadCount})
                </Button>
              </div>

              <div className="max-h-[65vh] space-y-1 overflow-y-auto">
                {visible.length === 0 && (
                  <p className="p-6 text-center text-sm text-muted-foreground">Nothing here.</p>
                )}
                {visible.map((c) => {
                  const unread = isUnread(c);
                  const last = c.last_reply_at ?? c.replied_at;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => open(c)}
                      className={cn(
                        "w-full rounded-lg border p-3 text-left transition-colors",
                        c.id === selectedId
                          ? "border-primary bg-primary/5"
                          : "border-transparent hover:bg-muted/60",
                      )}
                    >
                      <div className="flex items-center gap-2">
                        {unread && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />}
                        <p className={cn("truncate text-sm", unread ? "font-semibold" : "font-medium")}>
                          {conversationName(c)}
                        </p>
                        {last && (
                          <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(last), { addSuffix: true })}
                          </span>
                        )}
                      </div>
                      <p className="truncate text-xs text-muted-foreground">
                        {[c.company, c.campaigns?.name].filter(Boolean).join(" · ") || c.email}
                      </p>
                      {c.reply_text && (
                        <p className={cn("mt-1 line-clamp-2 text-xs", unread ? "text-foreground" : "text-muted-foreground")}>
                          {c.reply_text}
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Thread */}
          {selected ? (
            <ThreadPane
              key={selected.id}
              conversation={selected}
              onBack={() => setSelectedId(null)}
              sending={sendReply.isPending}
              onSend={(body, done) =>
                sendReply.mutate({ leadId: selected.id, body }, { onSuccess: done })
              }
            />
          ) : (
            <Card className="hidden lg:block">
              <CardContent className="flex h-full min-h-[300px] items-center justify-center p-12 text-sm text-muted-foreground">
                Pick a conversation to read it.
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

function ThreadPane({
  conversation: c,
  onBack,
  sending,
  onSend,
}: {
  conversation: Conversation;
  onBack: () => void;
  sending: boolean;
  onSend: (body: string, done: () => void) => void;
}) {
  const { data: messages = [], isLoading, error, refetch, isFetching } = useThread(c.id);
  const [draft, setDraft] = useState("");

  // New thread, new draft.
  useEffect(() => setDraft(""), [c.id]);

  const send = () => {
    if (!draft.trim() || sending) return;
    onSend(draft, () => setDraft(""));
  };

  return (
    <Card className="flex flex-col">
      <CardContent className="flex flex-1 flex-col gap-4 p-4">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-3">
          <div className="flex items-start gap-2">
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={onBack} aria-label="Back to conversations">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <p className="text-lg font-semibold">{conversationName(c)}</p>
              <p className="text-sm text-muted-foreground">{c.email}</p>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                {c.company && (
                  <span className="flex items-center gap-1">
                    <Building2 className="h-3 w-3" /> {c.company}
                  </span>
                )}
                {c.job_title && (
                  <span className="flex items-center gap-1">
                    <Briefcase className="h-3 w-3" /> {c.job_title}
                  </span>
                )}
                {c.phone && (
                  <a href={`tel:${c.phone}`} className="flex items-center gap-1 hover:text-primary">
                    <Phone className="h-3 w-3" /> {c.phone}
                  </a>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {c.phone && <WhatsappButton phone={c.phone} message={null} size="sm" />}
            <Button variant="ghost" size="icon" onClick={() => refetch()} aria-label="Refresh thread">
              <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
            </Button>
          </div>
        </div>

        {/* Messages */}
        <div className="max-h-[50vh] flex-1 space-y-3 overflow-y-auto pr-1">
          {isLoading ? (
            <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading the conversation from SmartLead…
            </div>
          ) : error ? (
            <div className="space-y-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              <p>{(error as Error).message}</p>
              {c.reply_text && (
                <p className="text-muted-foreground">
                  Their last reply: <span className="whitespace-pre-wrap text-foreground">{c.reply_text}</span>
                </p>
              )}
            </div>
          ) : messages.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No messages found for this lead.</p>
          ) : (
            messages.map((m, i) => (
              <div key={i} className={cn("flex", m.type === "sent" ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[85%] rounded-lg px-3 py-2 text-sm",
                    m.type === "sent"
                      ? "bg-primary/10 text-foreground"
                      : "border border-border bg-muted/40",
                  )}
                >
                  <div className="mb-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                    <span className="font-medium">
                      {m.type === "sent" ? "You" : conversationName(c)}
                    </span>
                    {m.time && <span>{format(new Date(m.time), "MMM d, HH:mm")}</span>}
                    {m.subject && m.type === "sent" && <span className="truncate">· {m.subject}</span>}
                  </div>
                  {/* Plain text by design — see the note at the top of the file. */}
                  <p className="whitespace-pre-wrap break-words">{m.text || "(empty message)"}</p>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Composer */}
        <div className="space-y-2 border-t border-border pt-3">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={`Reply to ${conversationName(c)}…`}
            rows={4}
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
          />
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">Ctrl + Enter to send</p>
            <Button onClick={send} disabled={!draft.trim() || sending}>
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Send reply
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
