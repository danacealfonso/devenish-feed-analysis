"use client";

import { Building2, Plus, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { buttonPrimary, buttonSecondary, Card, inputBase, Page, PageHeader } from "@/components/portal/PageHeader";
import { ROLE_LABEL, usePortal, type MemberRole } from "@/lib/data/portal";
import { supabase } from "@/lib/supabase/client";
import { pillClass } from "@/lib/ui/status";

interface CustomerRow {
  id: string;
  name: string;
  is_demo: boolean;
  created_at: string;
  memberships: { count: number }[];
  locations: { count: number }[];
  samples: { count: number }[];
}

interface Waiting {
  id: string;
  email: string;
  full_name: string | null;
  created_at: string;
}

const count = (x: { count: number }[]) => x[0]?.count ?? 0;
const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** People who signed up without an invitation: they see nothing until an admin gives them a customer and a role. */
function WaitingForAccess({ customers, onAdded }: { customers: CustomerRow[]; onAdded: () => Promise<void> }) {
  const [people, setPeople] = useState<Waiting[]>([]);
  const [choice, setChoice] = useState<Record<string, { org: string; role: MemberRole }>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    const [p, m, a] = await Promise.all([
      supabase.from("profiles").select("id, email, full_name, created_at").order("created_at", { ascending: false }),
      supabase.from("memberships").select("user_id"),
      supabase.from("platform_admins").select("user_id"),
    ]);
    const err = p.error ?? m.error ?? a.error;
    if (err) return setNotice({ kind: "error", text: err.message });
    const hasAccess = new Set([...(m.data ?? []), ...(a.data ?? [])].map((r) => r.user_id as string));
    setPeople(((p.data ?? []) as Waiting[]).filter((x) => !hasAccess.has(x.id)));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function add(person: Waiting) {
    const c = choice[person.id] ?? { org: customers[0]?.id ?? "", role: "producer" as MemberRole };
    if (!c.org) return;
    setBusy(person.id);
    setNotice(null);
    const { data, error } = await supabase.rpc("invite_member", { p_org: c.org, p_email: person.email, p_role: c.role });
    setBusy(null);
    if (error) return setNotice({ kind: "error", text: error.message });
    const customer = customers.find((x) => x.id === c.org)?.name ?? "the customer";
    setNotice({
      kind: "ok",
      text:
        (data as { status: string }).status === "added"
          ? `${person.email} now has access to ${customer} as ${ROLE_LABEL[c.role].toLowerCase()}.`
          : `${person.email} hasn't confirmed their email yet. They get access to ${customer} as soon as they do.`,
    });
    await Promise.all([load(), onAdded()]);
  }

  return (
    <Card title="Waiting for access" subtitle="Signed up without an invitation. They see nothing until you add them to a customer.">
      {notice && (
        <p role={notice.kind === "error" ? "alert" : "status"} className={`mx-5 mt-4 rounded-lg px-4 py-3 text-sm ${notice.kind === "error" ? "bg-action-bg text-action-ink" : "bg-ok-bg text-ok-ink"}`}>
          {notice.text}
        </p>
      )}
      {!people.length ? (
        <p className="p-5 text-sm text-ink-3">Nobody is waiting.</p>
      ) : (
        <ul className="divide-y divide-line">
          {people.map((p) => {
            const c = choice[p.id] ?? { org: customers[0]?.id ?? "", role: "producer" as MemberRole };
            const set = (next: Partial<typeof c>) => setChoice((all) => ({ ...all, [p.id]: { ...c, ...next } }));
            return (
              <li key={p.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                <div className="min-w-48 flex-1">
                  <p className="font-semibold">{p.full_name || p.email}</p>
                  <p className="text-xs text-ink-3">
                    {p.full_name ? `${p.email} · ` : ""}signed up {fmt(p.created_at)}
                  </p>
                </div>
                <select aria-label={`Customer for ${p.email}`} value={c.org} onChange={(e) => set({ org: e.target.value })} className={inputBase}>
                  {customers.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                      {x.is_demo ? " (demo)" : ""}
                    </option>
                  ))}
                </select>
                <select aria-label={`Role for ${p.email}`} value={c.role} onChange={(e) => set({ role: e.target.value as MemberRole })} className={inputBase}>
                  <option value="producer">{ROLE_LABEL.producer}</option>
                  <option value="nutritionist">{ROLE_LABEL.nutritionist}</option>
                </select>
                <button onClick={() => add(p)} disabled={busy === p.id || !c.org} className={buttonPrimary}>
                  <UserPlus size={16} /> {busy === p.id ? "Adding…" : "Add"}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

export default function AdminPage() {
  const router = useRouter();
  const { isAdmin, setOrgId, reloadOrgs } = usePortal();
  const [rows, setRows] = useState<CustomerRow[]>([]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("organizations")
      .select("id, name, is_demo, created_at, memberships(count), locations(count), samples(count)")
      .order("is_demo")
      .order("name");
    if (error) setError(error.message);
    else setRows((data ?? []) as unknown as CustomerRow[]);
  }, []);

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin, load]);

  function open(id: string, path: string) {
    setOrgId(id);
    router.push(path);
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { data, error } = await supabase.rpc("create_customer", { p_name: name });
    setBusy(false);
    if (error) return setError(error.message);
    setName("");
    await reloadOrgs(data as string);
    router.push("/operation");
  }

  if (!isAdmin)
    return (
      <Page>
        <PageHeader section="Admin" title="Admin" description="This area is for Devenish administrators." />
      </Page>
    );

  return (
    <Page>
      <PageHeader
        section="Admin"
        title="Customers"
        description="Every customer in the portal. Create a customer, add its locations and mills under Operation, then invite the farm team and their nutritionist. People who sign up without an invitation wait below until you add them."
      />
      {error && (
        <p role="alert" className="mt-6 rounded-lg bg-action-bg px-4 py-3 text-sm text-action-ink">
          {error}
        </p>
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card title="All customers" subtitle={`${rows.length} customers`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-ink-3 uppercase">
                  <th scope="col" className="px-5 py-2">Customer</th>
                  <th scope="col" className="px-3 py-2 text-right">People</th>
                  <th scope="col" className="px-3 py-2 text-right">Locations</th>
                  <th scope="col" className="px-3 py-2 text-right">Samples</th>
                  <th scope="col" className="px-5 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-line">
                    <th scope="row" className="px-5 py-3 text-left">
                      <span className="flex items-center gap-2 font-semibold">
                        <Building2 size={16} className="text-navy-700" /> {r.name}
                        {r.is_demo && <span className={`rounded-full px-2 py-0.5 text-[11px] ${pillClass("info")}`}>demo</span>}
                      </span>
                    </th>
                    <td className="px-3 py-3 text-right font-mono">{count(r.memberships)}</td>
                    <td className="px-3 py-3 text-right font-mono">{count(r.locations)}</td>
                    <td className="px-3 py-3 text-right font-mono">{count(r.samples)}</td>
                    <td className="px-5 py-3 text-right whitespace-nowrap">
                      <button onClick={() => open(r.id, "/operation/team")} className="mr-3 text-sm font-semibold text-navy-800 hover:underline">
                        Team
                      </button>
                      <button onClick={() => open(r.id, "/overview")} className="text-sm font-semibold text-navy-800 hover:underline">
                        Open
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="New customer">
          <form onSubmit={create} className="space-y-3 p-5">
            <label htmlFor="cust-name" className="block text-sm font-medium">Customer name</label>
            <input id="cust-name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Hillside Egg Farms" className={`${inputBase} w-full`} />
            <p className="text-xs text-ink-3">Starts with the default feed tolerances. You’ll be taken to Operation to add its locations and mills.</p>
            <div className="flex gap-2">
              <button disabled={busy || !name.trim()} className={buttonPrimary}>
                <Plus size={16} /> {busy ? "Creating…" : "Create customer"}
              </button>
              <button type="button" onClick={() => setName("")} className={buttonSecondary}>
                Clear
              </button>
            </div>
          </form>
        </Card>
      </div>

      <div className="mt-6">
        <WaitingForAccess customers={rows} onAdded={load} />
      </div>
    </Page>
  );
}
