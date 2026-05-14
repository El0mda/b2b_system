import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

export interface Profile {
  id: string;
  org_id: string | null;
  full_name: string | null;
  email: string | null;
  role: string | null;
  avatar_url: string | null;
}

export interface Organization {
  id: string;
  name: string;
  slug: string | null;
  plan: string | null;
}

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  organization: Organization | null;
  loading: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = async (userId: string) => {
    const { data: prof } = await supabase
      .from("users")
      .select("id, org_id, full_name, email, role, avatar_url")
      .eq("id", userId)
      .maybeSingle();
    setProfile(prof ?? null);
    if (prof?.org_id) {
      const { data: org } = await supabase
        .from("organizations")
        .select("id, name, slug, plan")
        .eq("id", prof.org_id)
        .maybeSingle();
      setOrganization(org ?? null);
    } else {
      setOrganization(null);
    }
  };

  const refresh = async () => {
    if (session?.user) await loadProfile(session.user.id);
  };

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (!mounted) return;
      setSession(s);
      if (s?.user) {
        loadProfile(s.user.id).finally(() => mounted && setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => {
      if (!mounted) return;
      setSession(s);
      if (s?.user) {
        setTimeout(() => {
          loadProfile(s.user.id);
        }, 0);
      } else {
        setProfile(null);
        setOrganization(null);
      }
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setOrganization(null);
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        profile,
        organization,
        loading,
        refresh,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
