import './assets/main.css'
import '@fontsource-variable/inter'

import { addCollection } from '@iconify/vue'
import lucide from '@iconify-json/lucide/icons.json'
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ui from '@nuxt/ui/vue-plugin'

import App from './App.vue'

addCollection(lucide)

const app = createApp(App)

app.use(createPinia())
app.use(ui)

app.mount('#app')
