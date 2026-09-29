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
}

interface PortalState {
  session: Session;
  orgs: Org[];
  org: Org | null;
  setOrgId: (id: string) => void;
  locations: LocationRow[];
  mills: MillRow[];
  rules: ToleranceRule[];
  tolerances: ToleranceMap;
  samples: SampleView[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

const Ctx = createContext<PortalState | null>(null);

export function usePortal(): PortalState {
  const v = useContext(Ctx);
  if (!v) throw new Error("usePortal must be used inside <PortalProvider>");
  return v;
}

const ORG_KEY = "devenish.orgId";
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

export function PortalProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [orgs, setOrgs] = useState<Org[]>([]);
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
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session === null) router.replace("/login");
  }, [session, router]);

  useEffect(() => {
    if (!session) return;
    supabase
      .from("organizations")
      .select("id, name")
      .order("name")
      .then(({ data, error }) => {
        if (error) return setError(error.message);
        const list = (data ?? []) as Org[];
        setOrgs(list);
        let saved: string | null = null;
        try {
          saved = localStorage.getItem(ORG_KEY);
        } catch {}
        setOrgIdState(list.find((o) => o.id === saved)?.id ?? list[0]?.id ?? null);
        if (!list.length) setLoading(false);
      });
  }, [session]);

  const setOrgId = useCallback((id: string) => {
    setOrgIdState(id);
    try {
      localStorage.setItem(ORG_KEY, id);
    } catch {}
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
  const org = orgs.find((o) => o.id === orgId) ?? null;

  if (!session)
    return <div className="grid min-h-screen place-items-center text-sm text-ink-3">Checking sign-in…</div>;

  return (
    <Ctx.Provider
      value={{ session, orgs, org, setOrgId, locations, mills, rules, tolerances, samples, loading, error, reload }}
    >
      {children}
    </Ctx.Provider>
  );
}
