import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import './assets/style.css'

const app = createApp(App)
app.use(router)
app.mount('#app')

// GoatCounter analytics (only if configured via env)
const gcUrl = import.meta.env.VITE_GOATCOUNTER_URL
if (gcUrl) {
  const s = document.createElement('script')
  s.async = true
  s.src = '//gc.zgo.at/count.js'
  s.dataset.goatcounter = gcUrl
  document.head.appendChild(s)
}
