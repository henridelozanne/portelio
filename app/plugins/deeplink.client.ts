import { App } from "@capacitor/app";

export default defineNuxtPlugin((nuxtApp) => {
  const router = useRouter();

  async function handleUrl(url: string) {
    const match = url.match(/portelio:\/\/invite\/([a-f0-9]{32})/);
    if (match) {
      await router.isReady();
      navigateTo(`/invite/${match[1]}`);
    }
  }

  App.addListener("appUrlOpen", ({ url }) => {
    handleUrl(url);
  });

  nuxtApp.hook("app:mounted", async () => {
    const result = await App.getLaunchUrl();
    if (result?.url) handleUrl(result.url);
  });
});
