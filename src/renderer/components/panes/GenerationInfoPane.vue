<script setup lang="ts">
import GenerationInfoSections from '@/components/panes/GenerationInfoSections.vue'
import PaneBody from '@/components/panes/primitives/PaneBody.vue'
import PaneLayout from '@/components/panes/primitives/PaneLayout.vue'
</script>

<template>
  <PaneLayout title="Generation Info">
    <PaneBody>
      <GenerationInfoSections />
    </PaneBody>
  </PaneLayout>
</template>
