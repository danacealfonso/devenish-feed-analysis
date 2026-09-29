"use client";

import { Building2, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { buttonPrimary, buttonSecondary, Card, inputBase, Page, PageHeader } from "@/components/portal/PageHeader";
import { usePortal } from "@/lib/data/portal";
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

const count = (x: { count: number }[]) => x[0]?.count ?? 0;

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
        description="Every customer in the portal. Create a customer, add its locations and mills under Operation, then invite the farm team and their nutritionist."
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
    </Page>
  );
}
