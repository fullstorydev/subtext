import { defineConfig, Plugin } from "vite";
import { resolve } from "path";
import preact from "@preact/preset-vite";

// Custom plugin to handle SPA routing for each app
function multiPageSPAPlugin(): Plugin {
  return {
    name: "multi-page-spa",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url || "";

        // Skip if it's an asset request or vite specific request
        if (
          url.includes(".") ||
          url.startsWith("/@") ||
          url.startsWith("/__") ||
          url.startsWith("/node_modules")
        ) {
          return next();
        }

        // Check if this is an app route
        if (url.startsWith("/apps/")) {
          // Extract app name from URL path (ignore query params)
          const pathname = url.split("?")[0];
          const appMatch = pathname.match(/^\/apps\/([^/]+)/);

          if (appMatch) {
            const appName = appMatch[1];
            // Don't rewrite if we're already requesting the index.html
            if (!pathname.endsWith("/index.html")) {
              // Serve the app's index.html for any route within that app
              req.url = `/apps/${appName}/index.html${url.includes("?") ? url.substring(url.indexOf("?")) : ""}`;
            }
          }
        }

        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [preact(), multiPageSPAPlugin()],
  root: ".",
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        todo: resolve(__dirname, "apps/todo/index.html"),
        topwork: resolve(__dirname, "apps/topwork/index.html"),
        medcart: resolve(__dirname, "apps/medcart/index.html"),
      },
    },
  },
  server: {
    open: true,
  },
});
