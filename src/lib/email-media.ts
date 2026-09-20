// Photos and videos for sequence emails.
//
// SmartLead only accepts an HTML body — no attachments — so media is
// hosted in the public `email-media` bucket and embedded in that HTML
// (see migration 0019). A photo renders inline. A video renders as a
// poster frame with a play button baked into the image, linking to the
// file: mail clients strip <video> and CSS overlays, so the play button
// has to be pixels, not markup.
import { supabase } from "@/lib/supabase";

// A type alias, not an interface: aliases get an implicit index
// signature, which is what lets EmailMedia[] be written straight into a
// jsonb column typed as Json (sequences.attachments, template steps).
export type EmailMedia = {
  kind: "image" | "video";
  url: string;
  // Videos only: the still image that stands in for the video in the email.
  poster_url?: string;
  name: string;
  // Storage object path. Never deleted when a step drops the media: a
  // saved template or an already-sent email may still reference it.
  path: string;
  size: number;
};

const BUCKET = "email-media";

export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];
export const VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"];

// Images are loaded by the recipient's mail client on open, so they stay
// small; videos only download when someone clicks, so they get the
// bucket's full ceiling.
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Returns an error message, or null when the file is acceptable.
export function validateMediaFile(file: File): string | null {
  if (IMAGE_TYPES.includes(file.type)) {
    return file.size > MAX_IMAGE_BYTES
      ? `${file.name} is ${formatBytes(file.size)} — photos can be up to ${formatBytes(MAX_IMAGE_BYTES)}.`
      : null;
  }
  if (VIDEO_TYPES.includes(file.type)) {
    return file.size > MAX_VIDEO_BYTES
      ? `${file.name} is ${formatBytes(file.size)} — videos can be up to ${formatBytes(MAX_VIDEO_BYTES)}.`
      : null;
  }
  return `${file.name} isn't a supported photo (PNG, JPG, GIF, WebP) or video (MP4, MOV, WebM).`;
}

function extensionFor(file: File): string {
  const fromName = file.name.split(".").pop()?.toLowerCase();
  if (fromName && fromName.length <= 5) return fromName;
  return file.type.split("/")[1] ?? "bin";
}

async function uploadObject(orgId: string, blob: Blob, ext: string, contentType: string) {
  // The org id has to be the first folder — the storage insert policy
  // checks it against the uploader's org.
  const path = `${orgId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { contentType, cacheControl: "31536000", upsert: false });
  if (error) throw error;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { path, url: data.publicUrl };
}

export async function uploadEmailMedia(orgId: string, file: File): Promise<EmailMedia> {
  const problem = validateMediaFile(file);
  if (problem) throw new Error(problem);

  const kind = VIDEO_TYPES.includes(file.type) ? "video" : "image";
  const { path, url } = await uploadObject(orgId, file, extensionFor(file), file.type);

  if (kind === "image") {
    return { kind, url, name: file.name, path, size: file.size };
  }

  // A poster failure shouldn't lose an upload that already succeeded —
  // the email falls back to a plain "watch the video" link.
  let poster_url: string | undefined;
  try {
    const poster = await capturePosterFrame(file);
    poster_url = (await uploadObject(orgId, poster, "jpg", "image/jpeg")).url;
  } catch (e) {
    console.warn("Couldn't generate a video thumbnail:", e);
  }
  return { kind, url, poster_url, name: file.name, path, size: file.size };
}

// Grabs a frame about a second in (the very first frame is often black)
// and draws a play button over it. Works on the local File through an
// object URL, so there's no cross-origin canvas tainting to deal with.
function capturePosterFrame(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    const src = URL.createObjectURL(file);
    const cleanup = () => URL.revokeObjectURL(src);
    const fail = (msg: string) => {
      cleanup();
      reject(new Error(msg));
    };

    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.src = src;

    video.onerror = () => fail("This video format can't be previewed in the browser");
    video.onloadedmetadata = () => {
      video.currentTime = Math.min(1, (video.duration || 0) / 2);
    };
    video.onseeked = () => {
      const width = Math.min(video.videoWidth || 640, 1200);
      const height = Math.round(width * ((video.videoHeight || 360) / (video.videoWidth || 640)));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return fail("Canvas unavailable");

      ctx.drawImage(video, 0, 0, width, height);

      // Darken slightly so the button reads on bright footage.
      ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
      ctx.fillRect(0, 0, width, height);

      const r = Math.round(Math.min(width, height) * 0.12);
      const cx = width / 2;
      const cy = height / 2;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255, 255, 255, 0.92)";
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.3, cy - r * 0.45);
      ctx.lineTo(cx - r * 0.3, cy + r * 0.45);
      ctx.lineTo(cx + r * 0.5, cy);
      ctx.closePath();
      ctx.fillStyle = "#111827";
      ctx.fill();

      canvas.toBlob(
        (blob) => {
          cleanup();
          blob ? resolve(blob) : reject(new Error("Couldn't encode thumbnail"));
        },
        "image/jpeg",
        0.85,
      );
    };
  });
}

export function parseMedia(value: unknown): EmailMedia[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw) => {
    const m = (raw ?? {}) as Record<string, unknown>;
    if (typeof m.url !== "string" || (m.kind !== "image" && m.kind !== "video")) return [];
    return [
      {
        kind: m.kind,
        url: m.url,
        poster_url: typeof m.poster_url === "string" ? m.poster_url : undefined,
        name: typeof m.name === "string" ? m.name : "attachment",
        path: typeof m.path === "string" ? m.path : "",
        size: typeof m.size === "number" ? m.size : 0,
      },
    ];
  });
}
