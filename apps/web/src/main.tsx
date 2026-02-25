import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'
import { AuthProvider } from './context/AuthContext'
import { GatewayProvider } from './context/GatewayContext'
import { ErrorProvider } from './context/ErrorContext'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HelmetProvider>
      <BrowserRouter>
        <ErrorProvider>
          <AuthProvider>
            <GatewayProvider>
              <App />
            </GatewayProvider>
          </AuthProvider>
        </ErrorProvider>
      </BrowserRouter>
    </HelmetProvider>
  </StrictMode>,
)
