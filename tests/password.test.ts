import { describe, expect, it } from "vitest";
import { passwordProblem, passwordRules, passwordStrength } from "../lib/auth/password";

const rule = (pw: string, id: string, personal = {}) => passwordRules(pw, personal).find((r) => r.id === id)!.ok;

describe("password rules", () => {
  it("checks each rule separately", () => {
    expect(rule("short1!A", "length")).toBe(false);
    expect(rule("longenough", "length")).toBe(true);
    expect(rule("nouppercase1!", "upper")).toBe(false);
    expect(rule("NOLOWERCASE1!", "lower")).toBe(false);
    expect(rule("NoNumbers!!x", "number")).toBe(false);
    expect(rule("NoSymbols123x", "symbol")).toBe(false);
    expect(rule("With-Symbol1", "symbol")).toBe(true);
  });

  it("rejects passwords containing the person's name or email", () => {
    const me = { email: "maria.santos@farm.test", name: "Maria Santos" };
    expect(rule("Santos#2026!x", "personal", me)).toBe(false);
    expect(rule("MARIA-feeds-9!", "personal", me)).toBe(false);
    expect(rule("Hens&Calcium42", "personal", me)).toBe(true);
  });

  it("gives the first problem in plain words, or none", () => {
    expect(passwordProblem("abc")).toBe("Your password needs: at least 10 characters.");
    expect(passwordProblem("Hens&Calcium42")).toBeNull();
  });

  it("labels strength", () => {
    const s = (pw: string) => passwordStrength(pw, passwordRules(pw));
    expect(s("abc")).toBe("Too weak");
    expect(s("Hens&Calcium")).toBe("Fair"); // no number yet
    expect(s("Hens&Calcium42")).toBe("Strong");
    expect(s("Hens&Calcium42-Layers")).toBe("Very strong");
  });
});
