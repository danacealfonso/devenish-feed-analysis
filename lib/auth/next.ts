/**
 * Where to go after signing in: the page the person was sent from (?next=, set when a signed-out visitor
 * opens a portal link such as one in a notification email), if it is a page on this site; else the Feed page.
 */
export function afterSignIn(): string {
  const next = new URLSearchParams(window.location.search).get("next");
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/login") ? next : "/feed";
}
