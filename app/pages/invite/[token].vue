<template>
  <main class="flex flex-col min-h-dvh bg-cream px-5 pt-safe pb-safe items-center justify-center text-center gap-6">
    <template v-if="state === 'loading'">
      <div class="w-16 h-16 rounded-full bg-accent/20 animate-pulse" />
      <p class="text-muted">{{ $t("invite.loading") }}</p>
    </template>

    <template v-else-if="state === 'error'">
      <p class="text-xl font-semibold text-ink">{{ errorMessage }}</p>
      <button class="invite-btn" @click="router.push('/')">
        {{ $t("invite.back_home") }}
      </button>
    </template>

    <template v-else-if="state === 'success'">
      <p class="text-2xl font-semibold text-ink">{{ $t("invite.success") }}</p>
      <button class="invite-btn" @click="router.push('/')">
        {{ $t("invite.go_home") }}
      </button>
    </template>
  </main>
</template>

<script setup lang="ts">
import { useI18n } from "vue-i18n";

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const { initAuth } = useAuth();
const { acceptInvitation } = usePairs();

const state = ref<"loading" | "error" | "success">("loading");
const errorMessage = ref("");

onMounted(async () => {
  await initAuth();
  const token = route.params.token as string;

  try {
    await acceptInvitation(token);
    state.value = "success";
  } catch (e: any) {
    console.error('[invite] error:', e?.code, e?.message);
    state.value = "error";
    const code = e?.code ?? e?.message ?? "unknown";
    if (code === "invitation_already_used") {
      errorMessage.value = t("invite.already_used");
    } else if (code === "invitation_expired") {
      errorMessage.value = t("invite.expired");
    } else if (code === "Cannot pair with yourself") {
      errorMessage.value = t("invite.self_pair");
    } else if (code === "pair_already_exists") {
      errorMessage.value = t("invite.already_paired");
    } else if (code === "Invitation not found") {
      errorMessage.value = t("invite.not_found");
    } else {
      errorMessage.value = t("invite.generic_error");
    }
  }
});
</script>
