import React from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App.js'
import '@mdchirp/core/src/editor/editor.css'
import '@mdchirp/core/src/ui/modal.css'
import './playground.css'

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
