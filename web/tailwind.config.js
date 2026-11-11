/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        // 通过 CSS 变量实现明暗主题切换
        slate: {
          50: "rgb(var(--s50) / <alpha-value>)",
          100: "rgb(var(--s100) / <alpha-value>)",
          200: "rgb(var(--s200) / <alpha-value>)",
          300: "rgb(var(--s300) / <alpha-value>)",
          400: "rgb(var(--s400) / <alpha-value>)",
          500: "rgb(var(--s500) / <alpha-value>)",
          600: "rgb(var(--s600) / <alpha-value>)",
          700: "rgb(var(--s700) / <alpha-value>)",
          800: "rgb(var(--s800) / <alpha-value>)",
          900: "rgb(var(--s900) / <alpha-value>)",
          950: "rgb(var(--s950) / <alpha-value>)",
        },
        white: "rgb(var(--cwhite) / <alpha-value>)",
        terracotta: {
          DEFAULT: "rgb(var(--t500) / <alpha-value>)",
          50: "rgb(var(--t50) / <alpha-value>)",
          100: "rgb(var(--t100) / <alpha-value>)",
          200: "rgb(var(--t200) / <alpha-value>)",
          400: "rgb(var(--t400) / <alpha-value>)",
          500: "rgb(var(--t500) / <alpha-value>)",
          600: "rgb(var(--t600) / <alpha-value>)",
          700: "rgb(var(--t700) / <alpha-value>)",
        },
      },
      borderRadius: {
        xl: "0.9rem",
        "2xl": "1.15rem",
      },
      fontFamily: {
        sans: ["var(--font-sans)"],
        display: ["var(--font-display)"],
      },
      boxShadow: {
        soft: "0 1px 2px rgba(80,60,40,0.04), 0 8px 24px -12px rgba(80,60,40,0.12)",
      },
    },
  },
  plugins: [],
};
