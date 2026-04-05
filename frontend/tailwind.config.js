/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "./node_modules/@tremor/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['IBM Plex Mono', 'Fira Code', 'Courier New', 'monospace'],
      },
      colors: {
        // Semantic deal-type signals
        'signal-vc':     '#34d399', // emerald-400
        'signal-crypto': '#a78bfa', // violet-400
        'signal-ma':     '#38bdf8', // sky-400
        'signal-ipo':    '#fb7185', // rose-400
      },
      dropShadow: {
        'amount': '0 0 8px rgba(52, 211, 153, 0.4)',
      },
    },
  },
  plugins: [require("@tailwindcss/forms")],
};
