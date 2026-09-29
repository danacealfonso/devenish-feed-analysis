"use client";

import type { Session } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { DEFAULT_TOLERANCES, toMap, type ToleranceMap, type ToleranceRule } from "../analysis/tolerances";
import { buildViews, type LocationRow, type MillRow, type SampleRowDb, type SampleView } from "../analysis/view";
import type { NutrientCode } from "../parsers/types";
import { supabase } from "../supabase/client";

export interface Org {
  id: string;
  name: string;
  is_demo: boolean;
}

export type MemberRole = "producer" | "nutritionist";
export type Role = MemberRole | "admin";

export interface Permissions {
  /** Change tolerances, locations, mills, member roles; mark questions answered. */
  manage: boolean;
  /** Roles this user may invite to the current customer. */
  invitable: MemberRole[];
}

interface PortalState {
  session: Session;
  orgs: Org[];
  org: Org | null;
  setOrgId: (id: string) => void;
  /** Effective role for the current customer (respects "preview as customer"). */
  role: Role;
  /** Role without preview, for showing the preview switch. */
  actualRole: Role;
  isAdmin: boolean;
  can: Permissions;
  previewAsProducer: boolean;
  setPreviewAsProducer: (v: boolean) => void;
  locations: LocationRow[];
  mills: MillRow[];
  rules: ToleranceRule[];
  tolerances: ToleranceMap;
  samples: SampleView[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  reloadOrgs: (selectId?: string) => Promise<void>;
}

const Ctx = createContext<PortalState | null>(null);

export function usePortal(): PortalState {
  const v = useContext(Ctx);
  if (!v) throw new Error("usePortal must be used inside <PortalProvider>");
  return v;
}

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Devenish admin",
  nutritionist: "Nutritionist",
  producer: "Customer team",
};

const ORG_KEY = "devenish.orgId";
const PREVIEW_KEY = "devenish.previewProducer";
const PAGE = 1000;

async function fetchAllSamples(orgId: string): Promise<SampleRowDb[]> {
  const out: SampleRowDb[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("samples")
      .select(
        "id, location_id, upload_id, farm_label, external_id, sample_no, diet_code, diet_key, phase, sampled_on, source, lab_or_instrument, source_sheet, source_ref, sample_results(nutrient, basis, analyzed, intended, intended_offset, sheet_pct)",
      )
      .eq("org_id", orgId)
      .order("sampled_on", { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...(data as unknown as SampleRowDb[]));
    if (!data || data.length < PAGE) return out;
  }
}

function mapRule(r: Record<string, unknown>): ToleranceRule {
  const n = (v: unknown) => (v == null ? null : Number(v));
  return {
    nutrient: r.nutrient as NutrientCode,
    mode: r.mode as ToleranceRule["mode"],
    watchLow: n(r.watch_low),
    watchHigh: n(r.watch_high),
    actionLow: n(r.action_low),
    actionHigh: n(r.action_high),
    intendedOffset: Number(r.intended_offset ?? 0),
  };
}

const store = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v);
    } catch {}
  },
};

export function PortalProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [orgs, setOrgs] = useState<Org[] | null>(null);
  const [myRoles, setMyRoles] = useState<Record<string, MemberRole>>({});
  const [isAdmin, setIsAdmin] = useState(false);
  const [previewAsProducer, setPreview] = useState(false);
  const [orgId, setOrgIdState] = useState<string | null>(null);
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [mills, setMills] = useState<MillRow[]>([]);
  const [rules, setRules] = useState<ToleranceRule[]>(DEFAULT_TOLERANCES);
  const [rows, setRows] = useState<SampleRowDb[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    setPreview(store.get(PREVIEW_KEY) === "1");
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session === null) router.replace("/login");
  }, [session, router]);

  const userId = session?.user.id;

  const reloadOrgs = useCallback(
    async (selectId?: string) => {
      if (!userId) return;
      // Accept any invitations waiting for this (confirmed) email before reading access.
      await supabase.rpc("claim_invitations");
      const [o, m, a] = await Promise.all([
        supabase.from("organizations").select("id, name, is_demo").order("is_demo").order("name"),
        supabase.from("memberships").select("org_id, role").eq("user_id", userId),
        supabase.rpc("is_admin"),
      ]);
      if (o.error) return setError(o.error.message);
      const list = (o.data ?? []) as Org[];
      setOrgs(list);
      setMyRoles(Object.fromEntries((m.data ?? []).map((r) => [r.org_id, r.role as MemberRole])));
      setIsAdmin(a.data === true);
      const want = selectId ?? store.get(ORG_KEY);
      setOrgIdState(list.find((x) => x.id === want)?.id ?? list[0]?.id ?? null);
      if (!list.length) setLoading(false);
    },
    [userId],
  );

  useEffect(() => {
    reloadOrgs();
  }, [reloadOrgs]);

  const setOrgId = useCallback((id: string) => {
    setOrgIdState(id);
    store.set(ORG_KEY, id);
  }, []);

  const setPreviewAsProducer = useCallback((v: boolean) => {
    setPreview(v);
    store.set(PREVIEW_KEY, v ? "1" : "0");
  }, []);

  const reload = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setError(null);
    try {
      const [loc, mil, tol, smp] = await Promise.all([
        supabase.from("locations").select("id, name, mill_id").eq("org_id", orgId).order("name"),
        supabase.from("feed_mills").select("id, name").eq("org_id", orgId).order("name"),
        supabase.from("tolerance_rules").select("*").eq("org_id", orgId),
        fetchAllSamples(orgId),
      ]);
      for (const r of [loc, mil, tol]) if (r.error) throw r.error;
      setLocations((loc.data ?? []) as LocationRow[]);
      setMills((mil.data ?? []) as MillRow[]);
      const custom = (tol.data ?? []).map(mapRule);
      setRules(DEFAULT_TOLERANCES.map((d) => custom.find((c) => c.nutrient === d.nutrient) ?? d));
      setRows(smp);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const tolerances = useMemo(() => toMap(rules), [rules]);
  const samples = useMemo(() => buildViews(rows, tolerances, locations, mills), [rows, tolerances, locations, mills]);
  const org = orgs?.find((o) => o.id === orgId) ?? null;

  const actualRole: Role = isAdmin ? "admin" : (orgId && myRoles[orgId]) || "producer";
  const role: Role = previewAsProducer && actualRole !== "producer" ? "producer" : actualRole;
  const can: Permissions = {
    manage: role !== "producer",
    invitable: role === "producer" ? ["producer"] : ["producer", "nutritionist"],
  };

  if (!session || orgs === null)
    return <div className="grid min-h-screen place-items-center text-sm text-ink-3">Checking access…</div>;

  if (!orgs.length) return <NoAccess email={session.user.email ?? ""} onRetry={() => reloadOrgs()} />;

  return (
    <Ctx.Provider
      value={{
        session,
        orgs,
        org,
        setOrgId,
        role,
        actualRole,
        isAdmin,
        can,
        previewAsProducer,
        setPreviewAsProducer,
        locations,
        mills,
        rules,
        tolerances,
        samples,
        loading,
        error,
        reload,
        reloadOrgs,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

function NoAccess({ email, onRetry }: { email: string; onRetry: () => void }) {
  return (
    <main className="grid min-h-screen place-items-center p-6">
      <div className="max-w-md rounded-xl border border-line bg-surface p-8 text-center">
        <h1 className="text-2xl font-bold">You don’t have access to a customer yet</h1>
        <p className="mt-3 text-sm text-ink-2">
          You’re signed in as <b>{email}</b>. Ask your Devenish nutritionist, or a colleague who already uses the portal,
          to invite this email address. Once they have, come back here.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <button onClick={onRetry} className="rounded-lg bg-navy-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-navy-800">
            I’ve been invited, check again
          </button>
          <button onClick={() => supabase.auth.signOut()} className="rounded-lg border border-line px-4 py-2.5 text-sm font-semibold hover:bg-page">
            Sign out
          </button>
        </div>
      </div>
    </main>
  );
}
