import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

// Las URLs prefirmadas de R2 apuntan a <cuenta>.r2.cloudflarestorage.com o a
// <bucket>.<cuenta>.r2.cloudflarestorage.com: la subida (fetch PUT), la vista
// previa de PDF (iframe) y la de imágenes (img) se redirigen ahí.
const r2Account = process.env.R2_ACCOUNT_ID;
const r2Origins = r2Account
  ? `https://${r2Account}.r2.cloudflarestorage.com https://*.${r2Account}.r2.cloudflarestorage.com`
  : "";

// Sin nonces: next-themes y Next.js inyectan scripts inline, y Recharts/Sonner usan estilos inline.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' blob: data: ${r2Origins}`,
  "font-src 'self'",
  `connect-src 'self' ${r2Origins}`,
  // La vista previa de PDF es un iframe a /api/documents/[id]/preview, que redirige al archivo.
  `frame-src 'self' ${r2Origins}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
  // En Vercel todo es HTTPS; en local (`next start` por http) rompería los recursos.
  ...(process.env.VERCEL ? ["upgrade-insecure-requests"] : []),
]
  .map((directive) => directive.trim())
  .join("; ");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  // SAMEORIGIN y no DENY: el PDF servido por /api/storage/local se muestra en un iframe propio.
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
  ...(process.env.VERCEL
    ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]
    : []),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Los archivos del storage local (PDF, imágenes) solo necesitan poder mostrarse en la propia app;
      // una CSP completa sobre el documento puede interferir con el visor de PDF del navegador.
      { source: "/((?!api/storage/).*)", headers: [{ key: "Content-Security-Policy", value: csp }] },
      {
        source: "/api/storage/:path*",
        headers: [{ key: "Content-Security-Policy", value: "frame-ancestors 'self'" }],
      },
    ];
  },
};

export default nextConfig;
