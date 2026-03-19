import type { CapacitorConfig } from "@capacitor/cli";

const isDev = process.env.CAP_DEV === "true";

const config: CapacitorConfig = {
  appId: "com.portelio.app",
  appName: "Portelio",
  webDir: ".output/public",

  // En développement, on pointe vers le serveur Nuxt dev pour le HMR.
  // Ne jamais commiter avec server.url renseigné.
  ...(isDev && {
    server: {
      // Remplace par ton IP locale si tu testes sur device physique : http://192.168.x.x:3000
      url: "http://localhost:3000",
      cleartext: true,
    },
  }),

  ios: {
    contentInset: "always",
    backgroundColor: "#faf9f6",
  },

  plugins: {
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
    LocalNotifications: {
      smallIcon: "ic_stat_icon_config_sample",
      iconColor: "#E8926B",
    },
  },
};

export default config;
