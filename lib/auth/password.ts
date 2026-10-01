/**
 * Password rules for sign-up and password reset. The same length and character rules are enforced by
 * Supabase Auth on the server (supabase/config.toml: minimum_password_length, password_requirements),
 * so the checklist here is guidance, not the only line of defence.
 */
export const MIN_PASSWORD_LENGTH = 10;

export interface PasswordRule {
  id: "length" | "upper" | "lower" | "number" | "symbol" | "personal";
  label: string;
  ok: boolean;
}

/** Each rule and whether the password meets it. `personal` is the person's name and email, which must not appear in it. */
export function passwordRules(password: string, personal: { email?: string; name?: string } = {}): PasswordRule[] {
  const lower = password.toLowerCase();
  const pieces = [
    ...(personal.email ?? "").toLowerCase().split("@")[0].split(/[^a-z0-9]+/),
    ...(personal.name ?? "").toLowerCase().split(/\s+/),
  ].filter((p) => p.length >= 3);
  return [
    { id: "length", label: `At least ${MIN_PASSWORD_LENGTH} characters`, ok: password.length >= MIN_PASSWORD_LENGTH },
    { id: "upper", label: "An uppercase letter (A–Z)", ok: /[A-Z]/.test(password) },
    { id: "lower", label: "A lowercase letter (a–z)", ok: /[a-z]/.test(password) },
    { id: "number", label: "A number (0–9)", ok: /[0-9]/.test(password) },
    { id: "symbol", label: "A symbol, such as ! ? # or *", ok: /[^A-Za-z0-9\s]/.test(password) },
    { id: "personal", label: "Doesn’t contain your name or email", ok: password.length > 0 && !pieces.some((p) => lower.includes(p)) },
  ];
}

export type Strength = "Too weak" | "Fair" | "Strong" | "Very strong";

/** A plain-language strength label: every rule must pass before it counts as Strong. */
export function passwordStrength(password: string, rules: PasswordRule[]): Strength {
  if (!rules.every((r) => r.ok)) return rules.filter((r) => r.ok).length >= 4 ? "Fair" : "Too weak";
  return password.length >= 16 ? "Very strong" : "Strong";
}

/** The first rule that fails, as a message, or null when the password meets every rule. */
export function passwordProblem(password: string, personal: { email?: string; name?: string } = {}): string | null {
  const failed = passwordRules(password, personal).find((r) => !r.ok);
  if (!failed) return null;
  return failed.id === "personal" ? "Your password can’t contain your name or email." : `Your password needs: ${failed.label.toLowerCase()}.`;
}

/**
 * How many times this password appears in known data breaches (Have I Been Pwned "Pwned Passwords").
 * Privacy: only the first 5 characters of the password's SHA-1 fingerprint leave the browser (k-anonymity);
 * the matching is done here. Returns null if the service can't be reached, so sign-up isn't blocked by an outage.
 */
export async function timesLeaked(password: string): Promise<number | null> {
  try {
    const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(password));
    const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
    const res = await fetch(`https://api.pwnedpasswords.com/range/${hex.slice(0, 5)}`, { headers: { "Add-Padding": "true" } });
    if (!res.ok) return null;
    const suffix = hex.slice(5);
    for (const line of (await res.text()).split("\n")) {
      const [s, count] = line.trim().split(":");
      if (s === suffix) return Number(count) || 0;
    }
    return 0;
  } catch {
    return null;
  }
}

export const LEAKED_MESSAGE = (n: number) =>
  `This password has appeared in ${n.toLocaleString("en")} data breach${n === 1 ? "" : "es"}, so attackers try it first. Please choose a different one.`;
