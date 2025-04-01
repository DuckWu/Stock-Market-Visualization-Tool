import '@/styles/globals.css'
import type { AppProps } from 'next/app'
import { useEffect } from 'react'

export default function App({ Component, pageProps }: AppProps) {
  // Force Tailwind to be applied
  useEffect(() => {
    document.body.className = 'bg-slate-100'
  }, [])

  return <Component {...pageProps} />
} 