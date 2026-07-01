// Ensure a public/config.json exists before dev/build.
//
// config.json is gitignored (it's the live, per-deployment directory a manager
// publishes via the GitHub API, not a source file we track). So a fresh clone or
// fork won't have one. This copies the tracked config.example.json into place if
// it's missing, so `npm run dev` and the GitHub Pages build always serve a working
// default. Once a manager publishes, the committed config.json takes over and this
// no-ops.
import { existsSync, copyFileSync } from "node:fs";

const target = "public/config.json";
const example = "public/config.example.json";

if (!existsSync(target)) {
  copyFileSync(example, target);
  console.log(`[ensure-config] created ${target} from ${example}`);
}
