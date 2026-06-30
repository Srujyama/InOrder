import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { DEFAULT_THEME, isValidTheme } from './themes.js'
import './styles.css'

// Apply the saved theme before React mounts so there's no flash of the wrong theme.
// Migrate the legacy dark/light values to the new theme ids.
const legacy = { dark: 'blueprint', light: 'blueprint-light' }
const saved = localStorage.getItem('life-theme')
const initial = legacy[saved] || (isValidTheme(saved) ? saved : DEFAULT_THEME)
document.documentElement.setAttribute('data-theme', initial)
localStorage.setItem('life-theme', initial)

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
