import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import ui from '@nuxt/ui/vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@main': resolve('src/main')
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    resolve: {
      alias: {
        '@': resolve('src/renderer'),
        '@renderer': resolve('src/renderer')
      }
    },
    plugins: [
      vue(),
      ui({
        colorMode: true,
        router: false,
        ui: {
          colors: {
            primary: 'cyan',
            neutral: 'zinc'
          }
        }
      })
    ]
  }
})
