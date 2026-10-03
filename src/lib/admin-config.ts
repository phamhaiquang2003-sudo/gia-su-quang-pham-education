// Public API endpoint only. Firebase service credentials stay in Worker secrets.
const configuredUrl =
  import.meta.env.VITE_ADMIN_API_URL ||
  "https://phq-education-admin.lumenpelagi-phq.workers.dev";

function readApiUrl(value: string): string {
  if (!value) return "";
  try {
    const url = new URL(value);
    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== "/"
    )
      return "";
    if (
      url.protocol === "https:" ||
      (import.meta.env.DEV &&
        url.protocol === "http:" &&
        url.hostname === "127.0.0.1")
    )
      return url.origin;
  } catch {
    /* invalid endpoint */
  }
  return "";
}

export const adminApiUrl = readApiUrl(configuredUrl);
