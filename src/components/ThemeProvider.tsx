// components/ThemeProvider.tsx
import { type ColorMode } from "@xyflow/react"
import React, { createContext, useContext, useEffect, useState } from "react"

type ThemeContextType = {
  colorMode: ColorMode
  setColorMode: (theme: ColorMode) => void
}

const ThemeContext = createContext<ThemeContextType>({
  colorMode: "system",
  setColorMode: () => {}
})

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // const [theme, setTheme] = useState<string>("system")
  const [colorMode, setColorMode] = useState<ColorMode>("system")

  const updateTheme = (newColorMode: ColorMode) => {
    setColorMode(newColorMode)

    // Convert theme to ColorMode for ReactFlow
    if (newColorMode === "system") {
      const systemTheme = window.matchMedia("(prefers-color-scheme: dark)")
        .matches
        ? "dark"
        : "light"
      setColorMode(systemTheme as ColorMode)
    } else {
      setColorMode(newColorMode as ColorMode)
    }

    // Apply theme to document for portal inheritance
    document.documentElement.classList.toggle(
      "dark",
      newColorMode === "dark" ||
        (newColorMode === "system" &&
          window.matchMedia("(prefers-color-scheme: dark)").matches)
    )
  }

  useEffect(() => {
    // Initialize theme
    updateTheme(colorMode)

    // Optional: Listen for system theme changes
    if (colorMode === "system") {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)")
      const handleChange = () => {
        document.documentElement.classList.toggle("dark", mediaQuery.matches)
        setColorMode(mediaQuery.matches ? "dark" : "light")
      }

      mediaQuery.addEventListener("change", handleChange)
      return () => mediaQuery.removeEventListener("change", handleChange)
    }
  }, [colorMode])

  return (
    <ThemeContext.Provider value={{ colorMode, setColorMode: updateTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)
