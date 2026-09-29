"use client";

import { ArrowLeft, Check, Copy, UserPlus, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { buttonPrimary, Card, inputBase, Page, PageHeader } from "@/components/portal/PageHeader";
import { ROLE_LABEL, usePortal, type MemberRole } from "@/lib/data/portal";
import { supabase } from "@/lib/supabase/client";
import { pillClass } from "@/lib/ui/status";

interface Member {
  user_id: string;
  role: MemberRole;
  profile: { email: string; full_name: string | null } | null;
}
interface Invite {
  id: string;
  email: string;
  role: MemberRole;
  created_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
}

const ROLE_HELP: Record<MemberRole, string> = {
  producer: "Farm team: views results, uploads analyses, asks questions, invites colleagues.",
  nutritionist: "Devenish nutritionist: also manages tolerances, locations, mills and the team.",
};

const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

export default function TeamPage() {
  const { org, session, can, reloadOrgs } = usePortal();
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<MemberRole>("producer");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!org) return;
    const [m, i] = await Promise.all([
      supabase.from("memberships").select("user_id, role").eq("org_id", org.id),
      supabase
        .from("invitations")
        .select("id, email, role, created_at, accepted_at, revoked_at")
        .eq("org_id", org.id)
        .is("accepted_at", null)
        .is("revoked_at", null)
        .order("created_at", { ascending: false }),
    ]);
    const ids = (m.data ?? []).map((r) => r.user_id);
    const { data: profiles } = ids.length
      ? await supabase.from("profiles").select("id, email, full_name").in("id", ids)
      : { data: [] as { id: string; email: string; full_name: string | null }[] };
    const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
    setMembers(
      (m.data ?? [])
        .map((r) => ({ user_id: r.user_id, role: r.role as MemberRole, profile: byId.get(r.user_id) ?? null }))
        .sort((a, b) => a.role.localeCompare(b.role) || (a.profile?.email ?? "").localeCompare(b.profile?.email ?? "")),
    );
    setInvites((i.data ?? []) as Invite[]);
  }, [org]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!can.invitable.includes(role)) setRole(can.invitable[0]);
  }, [can.invitable, role]);

  const inviteLink = (to: string) => `${window.location.origin}/signup?email=${encodeURIComponent(to)}`;

  async function copy(to: string) {
    try {
      await navigator.clipboard.writeText(inviteLink(to));
      setCopied(to);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setNotice({ kind: "error", text: `Copy failed. The link is ${inviteLink(to)}` });
    }
  }

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    if (!org) return;
    setBusy(true);
    setNotice(null);
    const { data, error } = await supabase.rpc("invite_member", { p_org: org.id, p_email: email, p_role: role });
    setBusy(false);
    if (error) return setNotice({ kind: "error", text: error.message });
    const added = (data as { status: string }).status === "added";
    setNotice({
      kind: "ok",
      text: added
        ? `${email} already had an account and now has access.`
        : `Invitation created. Send ${email} the sign-up link below; they get access as soon as they confirm that email.`,
    });
    setEmail("");
    await load();
  }

  async function rpc(fn: string, args: Record<string, unknown>, after?: () => Promise<void>) {
    setNotice(null);
    const { error } = await supabase.rpc(fn, args);
    if (error) return setNotice({ kind: "error", text: error.message });
    await load();
    await after?.();
  }

  return (
    <Page>
      <Link href="/operation" className="mt-6 inline-flex items-center gap-1 text-sm font-semibold text-navy-800 hover:underline">
        <ArrowLeft size={16} /> Operation
      </Link>
      <PageHeader
        section="Operation"
        title="Team & access"
        description="Who can see this customer’s data. Farm staff see only their own customer; nutritionists can look after several."
      />

      {notice && (
        <p role={notice.kind === "error" ? "alert" : "status"} className={`mt-6 rounded-lg px-4 py-3 text-sm ${notice.kind === "ok" ? "bg-ok-bg text-ok-ink" : "bg-action-bg text-action-ink"}`}>
          {notice.text}
        </p>
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="space-y-6">
          <Card title="People with access" subtitle={`${members.length} ${members.length === 1 ? "person" : "people"}`}>
            <ul className="divide-y divide-line">
              {members.map((m) => {
                const me = m.user_id === session.user.id;
                return (
                  <li key={m.user_id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                    <div className="grid size-9 place-items-center rounded-full bg-[#eef0f6] text-xs font-semibold text-navy-800">
                      {(m.profile?.full_name || m.profile?.email || "?").slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">
                        {m.profile?.full_name || m.profile?.email || "Unknown user"} {me && <span className="font-normal text-ink-3">(you)</span>}
                      </p>
                      <p className="truncate text-xs text-ink-3">{m.profile?.email}</p>
                    </div>
                    {can.manage ? (
                      <select
                        aria-label={`Role for ${m.profile?.email}`}
                        value={m.role}
                        onChange={(e) => rpc("set_member_role", { p_org: org!.id, p_user: m.user_id, p_role: e.target.value })}
                        className={inputBase}
                      >
                        <option value="producer">{ROLE_LABEL.producer}</option>
                        <option value="nutritionist">{ROLE_LABEL.nutritionist}</option>
                      </select>
                    ) : (
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${pillClass(m.role === "nutritionist" ? "ok" : "info")}`}>
                        {ROLE_LABEL[m.role]}
                      </span>
                    )}
                    {(can.manage || me) && (
                      <button
                        onClick={() =>
                          confirm(me ? "Leave this customer? You’ll lose access to its data." : `Remove ${m.profile?.email} from ${org?.name}?`) &&
                          rpc("remove_member", { p_org: org!.id, p_user: m.user_id }, me ? () => reloadOrgs() : undefined)
                        }
                        className="rounded p-1.5 text-ink-3 hover:bg-action-bg hover:text-action-ink"
                        aria-label={me ? "Leave customer" : `Remove ${m.profile?.email}`}
                        title={me ? "Leave customer" : "Remove access"}
                      >
                        <X size={16} />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>

          <Card title="Pending invitations" subtitle="Access is granted automatically once the person signs up and confirms this email.">
            <ul className="divide-y divide-line">
              {invites.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{i.email}</p>
                    <p className="text-xs text-ink-3">
                      {ROLE_LABEL[i.role]} · invited {fmt(i.created_at)}
                    </p>
                  </div>
                  <button onClick={() => copy(i.email)} className="inline-flex items-center gap-1 text-sm font-semibold text-navy-800 hover:underline">
                    {copied === i.email ? <Check size={14} /> : <Copy size={14} />} {copied === i.email ? "Copied" : "Copy sign-up link"}
                  </button>
                  <button onClick={() => rpc("revoke_invitation", { p_id: i.id })} className="text-sm font-semibold text-action-ink hover:underline">
                    Revoke
                  </button>
                </li>
              ))}
              {!invites.length && <li className="px-5 py-6 text-sm text-ink-3">No pending invitations.</li>}
            </ul>
          </Card>
        </div>

        <Card title="Invite someone">
          <form onSubmit={invite} className="space-y-4 p-5">
            <div>
              <label htmlFor="inv-email" className="block text-sm font-medium">Email</label>
              <input id="inv-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@farm.com" className={`${inputBase} mt-1.5 w-full`} />
            </div>
            <fieldset>
              <legend className="text-sm font-medium">Role</legend>
              <div className="mt-1.5 space-y-2">
                {can.invitable.map((r) => (
                  <label key={r} className={`flex cursor-pointer gap-3 rounded-lg border p-3 ${role === r ? "border-navy-700 bg-[#f3f4fb]" : "border-line"}`}>
                    <input type="radio" name="role" value={r} checked={role === r} onChange={() => setRole(r)} className="mt-0.5 accent-[#1b1e52]" />
                    <span>
                      <span className="block text-sm font-semibold">{ROLE_LABEL[r]}</span>
                      <span className="block text-xs text-ink-3">{ROLE_HELP[r]}</span>
                    </span>
                  </label>
                ))}
              </div>
              {!can.manage && <p className="mt-2 text-xs text-ink-3">Nutritionists are added by Devenish.</p>}
            </fieldset>
            <button disabled={busy} className={`${buttonPrimary} w-full justify-center`}>
              <UserPlus size={16} /> {busy ? "Inviting…" : "Send invitation"}
            </button>
            <p className="text-xs text-ink-3">
              The prototype doesn’t send invitation emails. Copy the sign-up link from “Pending invitations” and share it.
            </p>
          </form>
        </Card>
      </div>
    </Page>
  );
}
