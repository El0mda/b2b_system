// Helpers for the managed sending platform.
// We own ccmail.io and route every outbound campaign through it,
// so users don't need to verify their own domain.

export const MANAGED_SENDING_DOMAIN = "ccmail.io";

const slugRandomSuffix = /-[a-z0-9]{5,}$/i;

export function workspaceSlug(orgSlug: string | null | undefined, orgName: string): string {
  if (orgSlug) {
    const stripped = orgSlug.replace(slugRandomSuffix, "");
    if (stripped) return stripped;
  }
  return (
    orgName
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 24) || "workspace"
  );
}

export function senderHandle(senderName: string): string {
  const first = senderName
    .toLowerCase()
    .trim()
    .split(/\s+/)[0]
    ?.replace(/[^a-z0-9]/g, "");
  return first || "sender";
}

export function assignedSenderAddress(
  senderName: string,
  org: { slug?: string | null; name: string },
): string {
  return `${senderHandle(senderName)}@${workspaceSlug(org.slug, org.name)}.${MANAGED_SENDING_DOMAIN}`;
}
