<script setup lang="ts">
import PaneBody from '@/components/panes/primitives/PaneBody.vue'
import PaneLayout from '@/components/panes/primitives/PaneLayout.vue'
import MediaInfoSections from '@/components/panes/MediaInfoSections.vue'
import GenerationInfoSections from '@/components/panes/GenerationInfoSections.vue'
</script>

<template>
  <PaneLayout title="Info">
    <PaneBody>
      <MediaInfoSections />
      <GenerationInfoSections :show-unavailable-gate="false" actions-title="Generation Actions" />
    </PaneBody>
  </PaneLayout>
</template>
