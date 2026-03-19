<template>
  <div class="min-h-dvh flex flex-col max-w-app mx-auto bg-cream">
    <NuxtRouteAnnouncer />
    <NuxtPage />
  </div>
</template>

<script setup lang="ts">
const { initAuth } = useAuth();

onMounted(() => {
  initAuth();
});
</script>
