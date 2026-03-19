import { createI18n } from "vue-i18n";
import en from "../../i18n/locales/en";

export default defineNuxtPlugin((nuxtApp) => {
  const i18n = createI18n({
    legacy: false,
    locale: "en",
    fallbackLocale: "en",
    messages: { en },
  });

  nuxtApp.vueApp.use(i18n);

  if (import.meta.hot) {
    import.meta.hot.accept("../../i18n/locales/en.ts", (newModule) => {
      if (newModule?.default) {
        i18n.global.setLocaleMessage("en", newModule.default);
      }
    });
  }
});
