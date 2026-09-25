/**
 * Configura CORS en el bucket de R2 para permitir la subida directa desde el navegador.
 * Uso: npm run storage:cors -- https://mi-app.vercel.app [otros orígenes...]
 * (siempre incluye http://localhost:3000)
 */
import "dotenv/config";

import { GetBucketCorsCommand, PutBucketCorsCommand, S3Client } from "@aws-sdk/client-s3";

const required = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"] as const;
const missing = required.filter((name) => !process.env[name]);
if (missing.length) {
  console.error(`Faltan variables en .env: ${missing.join(", ")}`);
  process.exit(1);
}

const origins = [...new Set(["http://localhost:3000", ...process.argv.slice(2)])];

const client = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

async function main() {
  await client.send(
    new PutBucketCorsCommand({
      Bucket: process.env.R2_BUCKET,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedOrigins: origins,
            AllowedMethods: ["PUT", "GET", "HEAD"],
            AllowedHeaders: ["content-type"],
            MaxAgeSeconds: 3600,
          },
        ],
      },
    }),
  );
  const current = await client.send(new GetBucketCorsCommand({ Bucket: process.env.R2_BUCKET }));
  console.log("✅ CORS configurado:", JSON.stringify(current.CORSRules, null, 2));
}

main().catch((error) => {
  console.error("No se pudo configurar CORS:", error instanceof Error ? error.message : error);
  console.error(
    "Si el token no tiene permisos de administración, configúralo en el panel de R2 → Settings → CORS Policy.",
  );
  process.exit(1);
});
