import tailwindcss from "@tailwindcss/vite";

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  future: { compatibilityVersion: 4 },
  compatibilityDate: "2025-01-01",
  devtools: { enabled: true },

  modules: [],

  components: [
    { path: "~/components", pathPrefix: true },
    { path: "~/components/icons", pathPrefix: false },
  ],

  vite: {
    plugins: [tailwindcss()],
    optimizeDeps: {
      include: ["@supabase/supabase-js"],
    },
  },

  css: ["~/assets/css/main.css"],

  app: {
    head: {
      viewport: "width=device-width, initial-scale=1, viewport-fit=cover",
      meta: [
        { name: "apple-mobile-web-app-capable", content: "yes" },
        { name: "apple-mobile-web-app-status-bar-style", content: "default" },
      ],
    },
  },

  ssr: false,
});
