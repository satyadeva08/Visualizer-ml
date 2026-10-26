/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // VISUALISER color palette
        brand: {
          900: '#0a0a1a', // deepest background
          800: '#0d0d2b',
          700: '#111133',
          600: '#1a1a4a',
          500: '#2d2d7a',
        },
        accent: {
          DEFAULT: '#7c3aed', // electric violet
          light: '#a78bfa',
          bright: '#c4b5fd',
          glow: '#8b5cf6',
        },
        surface: {
          DEFAULT: '#1e1e3f',
          elevated: '#2a2a52',
          border: '#3b3b6b',
        },
        text: {
          primary: '#f0f0ff',
          secondary: '#a0a0cc',
          muted: '#6b6b9b',
        },
        success: '#10b981',
        error: '#ef4444',
        warning: '#f59e0b',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Outfit', 'Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'float': 'float 6s ease-in-out infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        glow: {
          '0%': { boxShadow: '0 0 5px #7c3aed, 0 0 10px #7c3aed' },
          '100%': { boxShadow: '0 0 20px #7c3aed, 0 0 40px #7c3aed, 0 0 60px #7c3aed' },
        }
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(135deg, #0a0a1a 0%, #111133 50%, #1a1a4a 100%)',
        'accent-gradient': 'linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%)',
        'glow-gradient': 'radial-gradient(ellipse at center, #7c3aed33 0%, transparent 70%)',
      },
    },
  },
  plugins: [],
}
