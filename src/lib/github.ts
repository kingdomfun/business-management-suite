// Manager write path: publish config.json to a GitHub repo via the Contents API.
//
// Reads need nothing — every device fetches config.json from the deployed app
// (see lib/config.ts). Only managers write, and the GitHub token must NEVER be
// bundled (the app source is public). Instead each manager pastes their own
// fine-grained PAT (scoped to this one repo, Contents: read+write) into the
// admin tools; it's stored only on their device. Possession of the token is the
// real write authority — the admin password is just a local UI gate.
//
// Fine-grained PAT setup (tell managers):
//   github.com → Settings → Developer settings → Fine-grained tokens →
//   Generate new token → Repository access: only this repo →
//   Permissions: Contents = Read and write.

const PAT_KEY = "schedule-gh-pat-v1";
const REPO_KEY = "schedule-gh-repo-v1"; // JSON: { owner, repo, path, branch }

export interface RepoTarget {
  owner: string;
  repo: string;
  /** Path to the config file in the repo. */
  path: string;
  /** Branch to commit to (the one the site deploys from). */
  branch: string;
}

const DEFAULT_TARGET: RepoTarget = { owner: "", repo: "", path: "public/config.json", branch: "main" };

// ---- device-local credential storage ----------------------------------------

export function getPat(): string {
  try {
    return localStorage.getItem(PAT_KEY) ?? "";
  } catch {
    return "";
  }
}

export function setPat(pat: string): void {
  try {
    if (pat) localStorage.setItem(PAT_KEY, pat);
    else localStorage.removeItem(PAT_KEY);
  } catch {
    /* ignore */
  }
}

export function getRepoTarget(): RepoTarget {
  try {
    const raw = localStorage.getItem(REPO_KEY);
    if (raw) return { ...DEFAULT_TARGET, ...(JSON.parse(raw) as Partial<RepoTarget>) };
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_TARGET };
}

export function setRepoTarget(t: RepoTarget): void {
  try {
    localStorage.setItem(REPO_KEY, JSON.stringify(t));
  } catch {
    /* ignore */
  }
}

export function hasGitHubConfig(): boolean {
  const t = getRepoTarget();
  return !!(getPat() && t.owner && t.repo && t.path);
}

/** Looks like a GitHub PAT (fine-grained `github_pat_…` or classic `ghp_…`). */
export function looksLikePat(pat: string): boolean {
  return /^(github_pat_|ghp_)/.test(pat.trim());
}

/**
 * Check a token is live before we trust it as the admin gate. Calls the
 * authenticated-user endpoint (works for any valid token regardless of repo
 * scope). Only a definitive 401 rejects — everything else (including offline)
 * passes, since the real repo-scoped check happens at publish time and we don't
 * want a transient error or a strictly-scoped token to lock the manager out.
 */
export async function validatePat(pat: string): Promise<{ ok: boolean; reason?: string }> {
  try {
    const res = await fetch("https://api.github.com/user", { headers: headers(pat.trim()), cache: "no-cache" });
    if (res.status === 401) {
      return { ok: false, reason: "GitHub rejected this token (401). Check it was pasted whole and hasn't expired." };
    }
    return { ok: true };
  } catch {
    return { ok: true }; // offline — publish will validate for real
  }
}

// ---- Contents API -----------------------------------------------------------

/** Base64-encode a UTF-8 string (btoa is latin1-only, so encode bytes first). */
function utf8ToBase64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function contentsUrl(t: RepoTarget): string {
  const path = t.path.split("/").map(encodeURIComponent).join("/");
  return `https://api.github.com/repos/${encodeURIComponent(t.owner)}/${encodeURIComponent(t.repo)}/contents/${path}`;
}

function headers(pat: string): HeadersInit {
  return {
    Authorization: `Bearer ${pat}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

/** Fetch the file's current blob sha (needed to update), or null if absent. */
async function currentSha(t: RepoTarget, pat: string): Promise<string | null> {
  const res = await fetch(`${contentsUrl(t)}?ref=${encodeURIComponent(t.branch)}`, {
    headers: headers(pat),
    cache: "no-cache",
  });
  if (res.status === 404) return null; // first publish — file doesn't exist yet
  if (!res.ok) throw new Error(await describeError(res, "read"));
  const body = (await res.json()) as { sha?: string };
  return body.sha ?? null;
}

async function describeError(res: Response, op: string): Promise<string> {
  let detail = "";
  try {
    const body = (await res.json()) as { message?: string };
    detail = body.message ? ` — ${body.message}` : "";
  } catch {
    /* non-JSON body */
  }
  if (res.status === 401) return `GitHub rejected the token (401). Check the PAT.`;
  if (res.status === 403) return `GitHub forbade the ${op} (403). Token may lack Contents: write${detail}`;
  if (res.status === 404) return `Repo or path not found (404). Check owner/repo/path/branch${detail}`;
  if (res.status === 409) return `Conflict (409) — config.json changed since you loaded it. Reload and republish.`;
  if (res.status === 422) return `GitHub couldn't process the commit (422)${detail}`;
  return `GitHub ${op} failed (${res.status})${detail}`;
}

/**
 * Commit `json` to the configured repo path. Reads the current sha first so we
 * update (not just create) and so concurrent edits surface as a 409 rather than
 * silently clobbering. Returns the new commit sha on success; throws with a
 * human-readable message otherwise.
 */
export async function publishConfig(json: string, message: string): Promise<string> {
  const t = getRepoTarget();
  const pat = getPat();
  if (!pat) throw new Error("No GitHub token saved on this device.");
  if (!t.owner || !t.repo || !t.path) throw new Error("GitHub repo is not configured.");

  const sha = await currentSha(t, pat);
  const res = await fetch(contentsUrl(t), {
    method: "PUT",
    headers: { ...headers(pat), "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      content: utf8ToBase64(json),
      branch: t.branch,
      ...(sha ? { sha } : {}),
    }),
  });
  if (!res.ok) throw new Error(await describeError(res, "write"));
  const body = (await res.json()) as { commit?: { sha?: string } };
  return body.commit?.sha ?? "";
}
