<template>
  <main class="flex flex-col min-h-dvh bg-cream px-5 pt-safe pb-safe">
    <!-- Header -->
    <header class="flex items-center justify-between py-6">
      <h1 class="text-2xl font-semibold tracking-tight text-ink">
        {{ $t("home.title") }}
      </h1>
      <button
        class="w-10 h-10 flex items-center justify-center active:scale-95 transition-transform"
        :aria-label="$t('home.settings_label')"
        @click="goToSettings"
      >
        <IconSettings />
      </button>
    </header>

    <!-- Loading skeleton -->
    <template v-if="isLoading">
      <div class="flex flex-col gap-4">
        <div
          v-for="n in 2"
          :key="n"
          class="rounded-3xl bg-surface h-40 animate-pulse"
        />
      </div>
    </template>

    <!-- État vide -->
    <template v-else-if="pairs.length === 0">
      <div
        class="flex-1 flex flex-col items-center justify-center text-center gap-6 px-4 pb-16"
      >
        <IconUserPlus :size="64" />
        <div>
          <p class="text-xl font-semibold text-ink mb-2">
            {{ $t("home.empty.heading") }}
          </p>
          <p class="text-muted text-base leading-relaxed">
            {{ $t("home.empty.body") }}
          </p>
          <p class="text-muted text-base leading-relaxed">
            {{ $t("home.empty.body2") }}
          </p>
        </div>
        <button class="invite-btn" :disabled="isInviting" @click="handleInvite">
          <span v-if="isInviting">{{ $t("home.invite_loading") }}</span>
          <span v-else>{{ $t("home.invite_cta") }}</span>
        </button>
      </div>
    </template>

    <!-- Liste des paires -->
    <template v-else>
      <div class="flex flex-col gap-4">
        <PairCard
          v-for="pair in pairs"
          :key="pair.id"
          :pair="pair"
          @click="goToPair(pair.id)"
        />
      </div>

      <!-- CTA Inviter flottant -->
      <div
        class="fixed bottom-8 left-1/2 -translate-x-1/2 px-5 w-full max-w-app"
      >
        <button
          class="invite-btn w-full shadow-lg shadow-accent/20"
          :disabled="isInviting"
          @click="handleInvite"
        >
          <span v-if="isInviting">{{ $t("home.invite_loading") }}</span>
          <span v-else>{{ $t("home.invite_cta_with") }}</span>
        </button>
      </div>

      <!-- Espace pour le bouton flottant -->
      <div class="h-24" />
    </template>

    <!-- Erreur invitation -->
    <Transition name="toast">
      <div
        v-if="inviteError"
        class="fixed bottom-24 left-1/2 -translate-x-1/2 w-[90%] max-w-sm bg-ink text-on-dark text-sm text-center rounded-2xl px-4 py-3"
      >
        {{ inviteError }}
      </div>
    </Transition>
  </main>
</template>

<script setup lang="ts">
import { Share } from "@capacitor/share";
import { useI18n } from "vue-i18n";

const { t } = useI18n();
const { initAuth } = useAuth();
const router = useRouter();
const { pairs, isLoading, fetchPairs, createInvitation } = usePairs();

const isInviting = ref(false);
const inviteError = ref<string | null>(null);

onMounted(async () => {
  await initAuth();
  fetchPairs();
});

function goToSettings() {
  // Phase 8
}

function goToPair(id: string) {
  router.push(`/pair/${id}`);
}

async function handleInvite() {
  isInviting.value = true;
  inviteError.value = null;

  try {
    const { deepLink } = await createInvitation();
    await Share.share({
      title: t("home.title"),
      text: t("invite.body"),
      url: deepLink,
      dialogTitle: t("home.invite_cta"),
    });
  } catch (e: any) {
    if (e?.code === "pair_limit_reached") {
      inviteError.value = t("home.pair_limit_error");
    } else if (e?.errorMessage !== "Share canceled") {
      // Ignore user-cancelled share sheet
      inviteError.value = t("invite.generic_error");
    }
  } finally {
    isInviting.value = false;
    if (inviteError.value) {
      setTimeout(() => {
        inviteError.value = null;
      }, 3500);
    }
  }
}
</script>

<style scoped>
.toast-enter-active,
.toast-leave-active {
  transition:
    opacity 0.25s ease,
    transform 0.25s ease;
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(8px);
}
</style>
