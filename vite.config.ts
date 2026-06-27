import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { VitePWA } from "vite-plugin-pwa";

// Base path. Local dev/preview serve from root ("/"); the GitHub Pages workflow
// sets BASE_PATH="/<repo>/" so emitted asset URLs are absolute and resolve under
// the project-site subpath regardless of trailing slash. (Relative "./" breaks on
// Pages when the URL has no trailing slash or the SW controls a deep path.)
export default defineConfig({
  base: process.env.BASE_PATH || "/",
  plugins: [
    svelte(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      includeAssets: ["icon.svg"],
      // Let the SW work on the dev server so installability can be tested.
      devOptions: { enabled: true },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,webmanifest}"],
        // config.json is the shared company directory — always try the network
        // first so published edits propagate, falling back to cache offline.
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.endsWith("config.json"),
            handler: "NetworkFirst",
            options: {
              cacheName: "org-config",
              expiration: { maxEntries: 1 },
            },
          },
        ],
      },
      manifest: {
        name: "Business Management Suite",
        short_name: "Business",
        description: "Schedule, HR directory, and budget tools for a small team.",
        start_url: "./",
        scope: "./",
        display: "standalone",
        orientation: "portrait",
        background_color: "#0f1115",
        theme_color: "#0f1115",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
    }),
  ],
  server: { host: true, port: 5173 },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
