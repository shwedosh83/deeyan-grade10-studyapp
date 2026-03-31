/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        barca: {
          navy:       '#004D98',
          'navy-dark':'#003875',
          'navy-light':'#EBF2FC',
          red:        '#A50044',
          'red-light':'#FBEBF2',
          gold:       '#EDBB00',
          'gold-light':'#FDF9E3',
        },
      },
    },
  },
  plugins: [],
};
