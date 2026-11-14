/** @type {import('tailwindcss').Config} */
// Gri tonlar (slate) ve açık marka tonları CSS değişkenlerinden gelir; gece modunda
// index.css içindeki .dark bloğu bu değişkenleri koyu değerlerle değiştirir.
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;
const slate = Object.fromEntries([50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950].map((n) => [n, v(`slate-${n}`)]));

// Kırmızı tonlar: Tailwind'in parlak kırmızısı yerine biraz daha mat, koyu bir kırmızı.
const red = { 50: '#fbf2f2', 100: '#f6e1e1', 200: '#edc5c5', 300: '#df9d9d', 400: '#cd6f6f', 500: '#bd4a4a', 600: '#a83232', 700: '#8c2727', 800: '#742323', 900: '#612121', 950: '#350e0e' };

module.exports = {
  darkMode: 'class',
  content: [__dirname + '/src/renderer/**/*.{html,tsx,ts}'],
  theme: {
    extend: {
      fontFamily: { sans: ['-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'Tahoma', 'Arial', 'sans-serif'] },
      colors: {
        slate,
        surface: v('surface'), // kart, kutu ve düğme zemini (gece modunda koyu)
        // Marka renkleri: kırmızı-siyah tema (logo ve sol menüyle aynı)
        brand: { 50: v('brand-50'), 100: v('brand-100'), 500: red[500], 600: red[600], 700: red[700], 900: '#0a0a0a' },
        red, // bütün kırmızılar aynı mat tondan gelir
      },
      borderColor: { DEFAULT: 'rgb(var(--slate-200))' },
    },
  },
  plugins: [],
};
