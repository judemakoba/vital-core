import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { AuthProvider } from '@/components/providers/AuthProvider'
import PWARegistration from '@/components/PWARegistration'
import OfflineIndicator from '@/components/OfflineIndicator'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'VitalCore - Clinic Management System',
  description: 'Lightweight, web-based Hospital Management System',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    title: 'VitalCore',
    statusBarStyle: 'default',
  },
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#1a73e8',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <AuthProvider>
          <PWARegistration />
          <OfflineIndicator />
          {children}
        </AuthProvider>
      </body>
    </html>
  )
}
