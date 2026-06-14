import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vite sirve `public/` en la raiz, por lo que `public/wasm/compiler.js`
// queda accesible en tiempo de ejecucion como `/wasm/compiler.js`.
export default defineConfig({
  plugins: [react()],
});
