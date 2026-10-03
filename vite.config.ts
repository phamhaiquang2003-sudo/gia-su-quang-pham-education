import { fileURLToPath, URL } from "node:url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const localAdmin =
    process.env.VITE_LOCAL_ADMIN === "true" || env.VITE_LOCAL_ADMIN === "true";
  return {
    base: "./",
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
    },
    server: {
      host: "127.0.0.1",
      ...(localAdmin
        ? {
            proxy: {
              "/api/admin": {
                target: "http://127.0.0.1:8787",
                changeOrigin: true,
              },
            },
          }
        : {}),
    },
    build: {
      rolldownOptions: {
        input: {
          home: fileURLToPath(new URL("./index.html", import.meta.url)),
          login: fileURLToPath(new URL("./dang-nhap.html", import.meta.url)),
          admin: fileURLToPath(new URL("./quan-tri.html", import.meta.url)),
          student: fileURLToPath(new URL("./hoc-sinh.html", import.meta.url)),
          exercises: fileURLToPath(new URL("./bai-tap.html", import.meta.url)),
        },
      },
    },
  };
});
