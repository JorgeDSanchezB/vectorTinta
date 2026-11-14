import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  /* El badge circular "N" de dev tools se superponía al footer en el preview
     (NEXTJS-PORTAL, artefacto del modo dev). Se desactiva: no es contenido
     del producto. */
  devIndicators: false,
};

export default nextConfig;
