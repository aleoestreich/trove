import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
// Sora 600, Latin only: used just for the "trove" wordmark.
import '@fontsource/sora/latin-600.css'
import './index.css'
import { applyPrivacy } from './lib/privacy'

// Privacy mode applies before anything renders.
applyPrivacy()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
