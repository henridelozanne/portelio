<template>
  <button
    class="w-full text-left rounded-3xl overflow-hidden bg-card shadow-sm active:scale-[0.98] transition-transform"
    @click="$emit('click')"
  >
    <!-- Photo reçue en fond -->
    <div class="relative h-44">
      <img
        v-if="pair.lastPhotoReceived"
        :src="pair.lastPhotoReceived.storagePath"
        class="w-full h-full object-cover"
        alt=""
      />
      <div
        v-else
        class="w-full h-full bg-surface flex items-center justify-center"
      >
        <svg
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--color-subtle)"
          stroke-width="1.6"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <rect x="3" y="3" width="18" height="18" rx="4" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <polyline points="21 15 16 10 5 21" />
        </svg>
      </div>

      <!-- Overlay gradient bas -->
      <div
        class="absolute inset-0 bg-linear-to-t from-overlay/50 via-transparent to-transparent"
      />

      <!-- Nom du partenaire + caption -->
      <div class="absolute bottom-0 left-0 right-0 px-4 pb-4">
        <p class="text-on-dark font-semibold text-base leading-tight">
          {{ pair.partner.username || $t("pair_card.partner_fallback") }}
        </p>
        <p
          v-if="pair.lastPhotoReceived?.caption"
          class="text-on-dark/80 text-sm mt-0.5 truncate"
        >
          {{ pair.lastPhotoReceived.caption }}
        </p>
        <p
          v-else-if="!pair.lastPhotoReceived"
          class="text-on-dark/70 text-sm mt-0.5"
        >
          {{ $t("home.no_photo_yet") }}
        </p>
      </div>

      <!-- Badge statut envoi -->
      <div class="absolute top-3 right-3">
        <span
          v-if="sentToday"
          class="text-xs font-medium bg-card/90 text-ink rounded-full px-3 py-1"
        >
          {{ $t("home.sent_today") }}
        </span>
        <span
          v-else
          class="text-xs font-medium bg-accent/90 text-on-dark rounded-full px-3 py-1"
        >
          {{ $t("home.to_send") }}
        </span>
      </div>
    </div>
  </button>
</template>

<script setup lang="ts">
import type { Pair } from "../composables/usePairs";

const props = defineProps<{ pair: Pair }>();
defineEmits<{ click: [] }>();

const sentToday = computed(() => {
  if (!props.pair.lastPhotoSent) return false;
  const sentDate = new Date(props.pair.lastPhotoSent.sentAt);
  const today = new Date();
  return (
    sentDate.getFullYear() === today.getFullYear() &&
    sentDate.getMonth() === today.getMonth() &&
    sentDate.getDate() === today.getDate()
  );
});
</script>
