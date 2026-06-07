import { satisfies } from "semver";

export interface DriftEntry {
  name: string;
  declared: string;
  locked: string;
}

export interface PinnedEntry {
  name: string;
  version: string;
}

export interface DriftResult {
  drifted: DriftEntry[];
  pinned: PinnedEntry[];
}

/**
 * Returns true if the declared version string is an exact pin
 * (no range characters: ^, ~, >, <, =, *, space, ||).
 */
function isExactPin(declared: string): boolean {
  return !/[\^~><=*\s|]/.test(declared.trim());
}

/**
 * Detects drift and pinned exact-version entries.
 *
 * - `drifted`: packages present in `locked` whose locked version does NOT
 *   satisfy the declared range (uses semver.satisfies).
 * - `pinned`: packages whose declared version has no range character,
 *   regardless of lockfile presence.
 */
export function detectDrift(
  deps: Record<string, string>,
  locked: Map<string, string>
): DriftResult {
  const drifted: DriftEntry[] = [];
  const pinned: PinnedEntry[] = [];

  for (const [name, declared] of Object.entries(deps)) {
    // Pinned check is independent of lockfile presence
    if (isExactPin(declared)) {
      pinned.push({ name, version: declared });
    }

    // Drift check only when the package is in the lockfile
    const lockedVersion = locked.get(name);
    if (lockedVersion === undefined) continue;

    // satisfies() returns false if declared is not a valid range — treat that as drifted
    let satisfiesRange: boolean;
    try {
      satisfiesRange = satisfies(lockedVersion, declared);
    } catch {
      satisfiesRange = false;
    }

    if (!satisfiesRange) {
      drifted.push({ name, declared, locked: lockedVersion });
    }
  }

  return { drifted, pinned };
}
