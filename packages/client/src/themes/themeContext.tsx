import React, { createContext, useEffect, useLayoutEffect, useMemo, useState } from 'react'

import 'tailwindcss/tailwind.css'
import './globals.css'
import 'daisyui/dist/full.css'

export interface ThemeContextProps {
  theme: string
  setTheme: (theme: string) => void
}

export const ThemeContext = createContext<ThemeContextProps>({
  theme: 'dark',
  setTheme: () => {}
})

/**
 * Theme Context Provider.
 *
 * @param value string
 * @param children ReactNode
 * @returns ReactNode
 */
export const ThemeContextProvider = ({ value = 'dark', children }: { value?: string; children: React.ReactNode }) => {
  const [theme, setTheme] = useState(value)
  const useCustomEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect
  useCustomEffect(() => {
    const storeTheme = localStorage.getItem('theme')
    applyTheme(storeTheme || 'dark')
  }, [])

  /**
   * Apply theme to 'html' tag on DOM.
   */
  const applyTheme = (theme = 'default') => {
    const newTheme = theme
    const html = document.getElementsByTagName('html')[0]
    localStorage.setItem('theme', theme)
    ;(html as HTMLHtmlElement).setAttribute('data-theme', newTheme)
  }

  const handleThemeChange = (theme: string) => {
    setTheme(theme)
    applyTheme(theme)
  }

  /**
   * Current context value for theme.
   */
  const val = useMemo(
    () => ({
      theme,
      setTheme: handleThemeChange
    }),
    [theme]
  )

  return <ThemeContext.Provider value={val}>{children}</ThemeContext.Provider>
}
