/**
 * Localhost URL detection for tunnel routing.
 *
 * Returns true when the URL points at the local machine, meaning a
 * reverse tunnel is required to make it reachable from a hosted browser.
 */
export function isLocalUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname;

    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "0.0.0.0" ||
      hostname === "::1" ||
      hostname === "[::1]"
    ) {
      return true;
    }

    if (hostname.endsWith(".local")) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}
