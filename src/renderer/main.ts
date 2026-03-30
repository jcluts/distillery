import './assets/main.css'
import '@fontsource-variable/inter'

import { addCollection } from '@iconify/vue'
import lucide from '@iconify-json/lucide/icons.json'
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import PrimeVue from 'primevue/config'
import Aura from '@primeuix/themes/aura'
import Tooltip from 'primevue/tooltip'

import App from './App.vue'

addCollection(lucide)

const app = createApp(App)

app.use(createPinia())
app.use(PrimeVue, {
  theme: {
    preset: Aura,
    options: {
      prefix: 'p',
      darkModeSelector: '.dark',
      cssLayer: false
    }
  }
})
app.directive('tooltip', Tooltip)

app.mount('#app')
