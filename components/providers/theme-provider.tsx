"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";

/** Light / dark / system appearance (section 5 + 20). */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {children}
    </NextThemesProvider>
  );
}
