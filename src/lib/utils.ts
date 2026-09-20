import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// supabase-js's functions.invoke() throws a FunctionsHttpError whose
// .message is just the generic "Edge Function returned a non-2xx status
// code" — the JSON body an edge function actually returned (e.g.
// `{ error: "..." }`) sits unread on `.context`, a raw Response whose
// body hasn't been consumed yet.
export async function getFunctionErrorMessage(error: any): Promise<string> {
  return (await getFunctionErrorDetail(error)).message;
}

export interface FunctionErrorDetail {
  message: string;
  /** campaign-action sets this when SmartLead refused to delete its copy. */
  smartleadBlocked: boolean;
}

// Same unwrapping, but keeps the flags an edge function sends alongside
// its message — a caller that can offer a way out of the failure needs
// to know which failure it was.
export async function getFunctionErrorDetail(error: any): Promise<FunctionErrorDetail> {
  const fallback = error?.message || error?.error || String(error);
  if (error?.context && typeof error.context.json === "function") {
    try {
      const body = await error.context.clone().json();
      if (body?.error) {
        return { message: body.error, smartleadBlocked: !!body.smartlead_blocked };
      }
    } catch {
      // context body isn't JSON (or already consumed) — fall back below
    }
  }
  return { message: fallback, smartleadBlocked: false };
}
