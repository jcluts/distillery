<script setup lang="ts">
import MediaInfoSections from '@/components/panes/MediaInfoSections.vue'
import PaneBody from '@/components/panes/primitives/PaneBody.vue'
import PaneLayout from '@/components/panes/primitives/PaneLayout.vue'
</script>

<template>
  <PaneLayout title="Media Info">
    <PaneBody>
      <MediaInfoSections />
    </PaneBody>
  </PaneLayout>
</template>
