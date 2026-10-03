import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  build: {
    rolldownOptions: {
      input: {
        home: fileURLToPath(new URL("./index.html", import.meta.url)),
        login: fileURLToPath(new URL("./dang-nhap.html", import.meta.url)),
        admin: fileURLToPath(new URL("./quan-tri.html", import.meta.url)),
        student: fileURLToPath(new URL("./hoc-sinh.html", import.meta.url)),
      },
    },
  },
});
