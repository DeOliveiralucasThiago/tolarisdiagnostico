/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    // pdfjs-dist referencia "canvas" só para uso em Node; no navegador não é necessário.
    config.resolve.alias.canvas = false;
    return config;
  },
};

export default nextConfig;
