// components/ThemeProvider.tsx
import { type ColorMode } from "@xyflow/react"
import React, { createContext, useContext, useEffect, useState } from "react"

type ThemeContextType = {
  colorMode: ColorMode
  updateColorMode: (colorMode: ColorMode) => void
}

const ThemeContext = createContext<ThemeContextType>({
  colorMode: "system",
  updateColorMode: () => {
    console.warn(
      "[ThemeContext] updateColorMode was called, but no ThemeProvider is wrapping your component. Make sure to wrap your app with <ThemeProvider>."
    )
  }
})

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [colorMode, setColorMode] = useState<ColorMode>("system")

  const updateColorMode = (newColorMode: ColorMode) => {
    console.log("updating theme: ", newColorMode)

    setColorMode(newColorMode)

    // Convert theme to ColorMode for ReactFlow
    if (newColorMode === "system") {
      const isDarkMode = window.matchMedia(
        "(prefers-color-scheme: dark)"
      ).matches
      document.documentElement.classList.toggle("dark", isDarkMode)
    } else {
      document.documentElement.classList.toggle("dark", newColorMode === "dark")
    }
  }

  useEffect(() => {
    // Initialize theme
    updateColorMode(colorMode)

    // Set up system theme change listener
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)")
    const handleChange = () => {
      if (colorMode === "system") {
        document.documentElement.classList.toggle("dark", mediaQuery.matches)
      }
    }

    mediaQuery.addEventListener("change", handleChange)
    return () => mediaQuery.removeEventListener("change", handleChange)
  }, [])

  return (
    <ThemeContext.Provider value={{ colorMode, updateColorMode }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)
