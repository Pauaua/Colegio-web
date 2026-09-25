#!/usr/bin/env node
/**
 * Genera el artefacto de despliegue: ansible/files/gestor-documental.tar.gz
 *
 *   gestor-documental/
 *   ├── backend/   dist/ (JS compilado), prisma/ (schema + migraciones), package.json,
 *   │              package-lock.json y node_modules/ de producción para Linux
 *   ├── app/dist/  build web de Expo (lo sirve el backend)
 *   └── VERSION
 *
 * Las dependencias se instalan dentro de un contenedor node:20 (Linux x64, glibc) para que el
 * artefacto funcione tal cual en Amazon Linux 2023: así las instancias nuevas del ASG arrancan
 * sin ejecutar `npm ci` y pasan el health check dentro del grace period de 120 s.
 *
 * Uso (desde la raíz):  npm run build:artifact
 * Requisito: Docker en ejecución.
 */
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { delimiter, dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const staging = join(root, '.artifact');
const outDir = join(root, 'ansible', 'files');
const outFile = join(outDir, 'gestor-documental.tar.gz');
// Imagen completa (trae OpenSSL 3, necesario para que Prisma detecte bien la plataforma).
const NODE_IMAGE = 'node:20-bookworm';
const isWindows = process.platform === 'win32';

function run(cmd, args, options = {}) {
  console.log(`\n$ ${cmd} ${args.join(' ')}`);
  // En Windows npm es un .cmd y requiere shell; se pasa como una sola línea (los argumentos son fijos).
  const result =
    isWindows && cmd === 'npm'
      ? spawnSync(`npm ${args.join(' ')}`, { stdio: 'inherit', cwd: root, shell: true, ...options })
      : spawnSync(cmd, args, { stdio: 'inherit', cwd: root, ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Falló: ${cmd} ${args.join(' ')} (código ${result.status})`);
}

function findDocker() {
  const candidates = [process.env.DOCKER_BIN, 'docker'];
  if (isWindows) candidates.push('C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe');
  for (const candidate of candidates.filter(Boolean)) {
    const probe = spawnSync(candidate, ['info', '--format', '{{.ServerVersion}}'], { encoding: 'utf8' });
    if (probe.status === 0) return candidate;
  }
  throw new Error('Docker no está disponible. Inicie Docker Desktop (o defina DOCKER_BIN) y reintente.');
}

function gitVersion() {
  const r = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : 'sin-git';
}

const docker = findDocker();
// Si Docker se encontró por ruta completa, su carpeta debe estar en el PATH (docker-credential-desktop).
const dockerEnv = isAbsolute(docker) ? { ...process.env, PATH: `${dirname(docker)}${delimiter}${process.env.PATH ?? ''}` } : process.env;

// 1. Compilar backend (prisma generate + tsc) y exportar la app web.
run('npm', ['run', 'build', '-w', 'backend']);
run('npm', ['run', 'build:web', '-w', 'app']);

// 2. Preparar el directorio de staging con solo lo necesario en producción.
rmSync(staging, { recursive: true, force: true });
mkdirSync(join(staging, 'backend'), { recursive: true });
mkdirSync(join(staging, 'app'), { recursive: true });

cpSync(join(root, 'backend', 'dist'), join(staging, 'backend', 'dist'), { recursive: true });
cpSync(join(root, 'backend', 'prisma'), join(staging, 'backend', 'prisma'), {
  recursive: true,
  filter: (src) => !src.endsWith('.ts'), // seed.ts ya está compilado en dist/prisma/seed.js
});
cpSync(join(root, 'app', 'dist'), join(staging, 'app', 'dist'), { recursive: true });

const backendPkg = JSON.parse(readFileSync(join(root, 'backend', 'package.json'), 'utf8'));
delete backendPkg.devDependencies;
backendPkg.scripts = {
  start: backendPkg.scripts.start,
  'db:deploy': backendPkg.scripts['db:deploy'],
  'db:seed:prod': backendPkg.scripts['db:seed:prod'],
};
writeFileSync(join(staging, 'backend', 'package.json'), `${JSON.stringify(backendPkg, null, 2)}\n`);

const version = `${backendPkg.version}+${gitVersion()} ${new Date().toISOString()}`;
writeFileSync(join(staging, 'VERSION'), `${version}\n`);

// 3. Dependencias de producción para Linux y empaquetado, todo dentro del contenedor
//    (los enlaces simbólicos de node_modules/.bin no sobreviven bien en un volumen de Windows).
mkdirSync(outDir, { recursive: true });
const script = [
  'set -e',
  'mkdir -p /build',
  'cp -r /src /build/gestor-documental',
  'cd /build/gestor-documental/backend',
  'npm install --package-lock-only --omit=dev --no-audit --no-fund',
  'npm ci --omit=dev --no-audit --no-fund',
  'npx prisma generate',
  // En EC2 (Amazon Linux 2023) solo sirve el motor rhel-openssl-3.0.x: se quitan los demás.
  "find node_modules -type f \\( -name '*debian-openssl*' -o -name '*openssl-1.1.x*' \\) -delete",
  'cd /build',
  'tar -czf /out/gestor-documental.tar.gz -C /build/gestor-documental .',
  'chmod 644 /out/gestor-documental.tar.gz',
].join(' && ');

run(docker, [
  'run',
  '--rm',
  '-e',
  // Motor del CLI de Prisma para Amazon Linux 2023 (migrate deploy en las EC2).
  'PRISMA_CLI_BINARY_TARGETS=rhel-openssl-3.0.x',
  '-v',
  `${staging}:/src:ro`,
  '-v',
  `${outDir}:/out`,
  NODE_IMAGE,
  'bash',
  '-c',
  script,
], { env: dockerEnv });

rmSync(staging, { recursive: true, force: true });

if (!existsSync(outFile)) throw new Error('No se generó el artefacto');
const mb = (statSync(outFile).size / (1024 * 1024)).toFixed(1);
console.log(`\nArtefacto listo: ${outFile} (${mb} MB)\nVersión: ${version}`);
