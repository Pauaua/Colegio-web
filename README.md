# Gestor Documental Escolar

Aplicación web para que el equipo directivo de un establecimiento **cargue, clasifique, almacene y comparta** sus documentos institucionales: memos, oficios, citaciones, acuerdos, actas y permisos administrativos. Docentes y apoderados acceden solo a lo que les corresponde según su rol.

Se usa desde el navegador, con diseño adaptable a computador y celular, y modo claro/oscuro.

## Stack

| Capa | Tecnología |
|---|---|
| Framework | **Next.js 16** (App Router, Server Components, Server Actions) + React 19 + TypeScript |
| Autenticación | **Auth.js v5** (credenciales email + contraseña, sesión JWT de 8 h, bcrypt) |
| Base de datos | **PostgreSQL** en **Neon**, con **Prisma 7.10** (`@prisma/adapter-pg`) |
| Archivos | **Cloudflare R2** (bucket privado, URLs prefirmadas). En desarrollo, disco local (`.storage/`) |
| Interfaz | Tailwind CSS 4, shadcn/ui (Radix), lucide-react, Recharts, Sonner, next-themes |
| Formularios | react-hook-form + Zod |
| Pruebas | Vitest |
| Despliegue | Vercel |

## Funcionalidades

- **Documentos:** subida directa al almacenamiento con URL prefirmada (PDF, DOCX, JPG y PNG, máx. 10 MB, validando extensión, tipo MIME y *magic bytes*). Tipo, fecha, **folio correlativo por tipo y año**, visibilidad por rol y destinatarios. Edición, archivado/restauración y borrado lógico.
- **Consulta y descarga:** listados filtrados en el servidor con `buildDocumentWhere` (`src/lib/permissions.ts`), vista previa de PDF e imágenes, y descarga con URL firmada de 5 min. Quien no tiene acceso recibe **403**.
- **Citaciones:** directivos y docentes generan citaciones a apoderados (con PDF generado). El apoderado responde *asistirá*, *no podrá asistir* o *solicita otro horario*.
- **Mis documentos:** bandeja de docentes y apoderados con confirmación de lectura.
- **Usuarios y cursos:** gestión de directivos, docentes (con sus cursos) y apoderados (con sus pupilos), RUT validado y foto de perfil.
- **Dashboard** según el rol, con estadísticas institucionales para la dirección.
- **Auditoría** de inicios de sesión y acciones sobre documentos y usuarios.
- **Seguridad:** `src/proxy.ts` bloquea las rutas sin sesión o sin rol permitido, y cada Server Component, Server Action y Route Handler vuelve a verificar en el servidor. Límite de intentos de login persistido en PostgreSQL (5 fallos por email y 20 por IP cada 15 min).

### Roles

| Rol | Permisos |
|---|---|
| `DIRECTOR` y `EQUIPO_DIRECTIVO` | Gestión completa: documentos, citaciones, usuarios, cursos, auditoría y estadísticas |
| `DOCENTE` | Crea citaciones y ve las que envió; ve los documentos visibles para docentes o dirigidos a él/ella; confirma lectura |
| `APODERADO` | Solo lectura de lo visible para apoderados o dirigido a él/ella; responde sus citaciones |

## Estructura

```
├── prisma/
│   ├── schema.prisma        Modelos y enums
│   ├── migrations/
│   └── seed.ts              Datos de demostración
├── scripts/r2-cors.ts       Configura CORS del bucket R2 (npm run storage:cors)
├── src/
│   ├── app/
│   │   ├── (auth)/login/
│   │   ├── (dashboard)/     documentos, mis-documentos, citaciones, cursos, usuarios, auditoria, perfil
│   │   └── api/             auth, documents (upload-url, download, preview), users/[id]/avatar, storage/local, health
│   ├── components/
│   ├── lib/                 permisos, auth, storage, validaciones, PDF, RUT, rate limit
│   ├── server/              actions/ y queries/
│   └── proxy.ts             Control de acceso por sesión y rol
├── tests/unit/              Pruebas Vitest
└── docker-compose.yml       PostgreSQL local opcional
```

## Requisitos

- **Node.js ≥ 20.19** y npm
- Una base PostgreSQL: **Neon** (recomendado) o Docker con `docker compose up -d`
- Opcional en desarrollo, obligatorio en producción: un bucket de **Cloudflare R2**

## Desarrollo local

```bash
# 1. Dependencias (postinstall ejecuta prisma generate)
npm install

# 2. Variables de entorno
cp .env.example .env
#   DATABASE_URL (con pooling) y DIRECT_URL (directa) de Neon, o las de Docker
#   AUTH_SECRET: npx auth secret
#   R2_*: opcional; sin ellas los archivos se guardan en .storage/

# 3. (Solo si usa Docker en vez de Neon)
docker compose up -d

# 4. Migraciones y datos de demostración
npm run db:migrate
npm run db:seed

# 5. Servidor de desarrollo
npm run dev          # http://localhost:3000
```

### Variables de entorno

| Variable | Uso |
|---|---|
| `DATABASE_URL` | Conexión con pooling (host `-pooler` en Neon) que usa la app |
| `DIRECT_URL` | Conexión directa para migraciones, seed y Prisma Studio |
| `AUTH_SECRET` | Secreto de Auth.js |
| `AUTH_URL` | URL pública (`http://localhost:3000` en local; se puede omitir en Vercel) |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | Cloudflare R2. Si faltan, en desarrollo se usa el disco local |
| `STORAGE_DRIVER=local` | Solo para probar `next start` sin R2. Nunca en Vercel |

Con R2 configurado, habilite CORS para la subida directa desde el navegador:

```bash
npm run storage:cors -- https://mi-app.vercel.app   # siempre incluye http://localhost:3000
```

### Scripts

| Script | Descripción |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | `prisma migrate deploy` + `next build` (el que usa Vercel) |
| `npm run build:next` | Solo `next build` |
| `npm start` | Servidor de producción |
| `npm test` / `npm run test:watch` | Pruebas Vitest |
| `npm run lint` / `npm run typecheck` | ESLint / `tsc --noEmit` |
| `npm run format` / `npm run format:check` | Prettier |
| `npm run db:migrate` | Crear y aplicar migraciones en desarrollo |
| `npm run db:deploy` | Aplicar migraciones pendientes |
| `npm run db:seed` | Cargar datos de demostración |
| `npm run db:reset` | Borrar la base, migrar y volver a sembrar |
| `npm run db:studio` | Prisma Studio |
| `npm run storage:cors` | Configurar CORS del bucket R2 |

## Usuarios de demostración

Contraseña común: **`Colegio2026!`**. El inicio de sesión es con email.

| Rol | Email | Nombre |
|---|---|---|
| Director(a) | `director@colegio.cl` | Carolina Muñoz Soto |
| Equipo directivo | `directivo@colegio.cl` | Paula Contreras Díaz |
| Docente | `docente@colegio.cl` | Andrés Fuentes Pérez (profesor de 3° Básico A) |
| Apoderado(a) | `apoderado@colegio.cl` | María José Herrera (2 pupilos en 3° Básico A) |
| Apoderado(a) | `apoderado2@colegio.cl` | Pedro Sepúlveda Lagos (1 pupilo en 1° Medio B; sirve para probar el 403) |

El seed crea además 2 cursos (3° Básico A y 1° Medio B), 6 estudiantes y 21 documentos con PDF de muestra. **Cambie estas contraseñas o no ejecute el seed en producción.**

## Despliegue en Vercel

1. Importe el repositorio en Vercel.
2. Agregue la base desde **Vercel Marketplace → Neon**, o defina `DATABASE_URL` y `DIRECT_URL` a mano.
3. Defina `AUTH_SECRET` y las cuatro variables `R2_*` (en Vercel R2 es obligatorio).
4. El comando de build (`npm run build`) aplica las migraciones antes de compilar.
5. Ejecute `npm run storage:cors -- https://<su-dominio>.vercel.app` para permitir las subidas desde el dominio.
6. Verifique con `GET /api/health`, que responde `{ "status": "ok", "database": "ok" }`, o 503 si la base no responde.

## Pruebas

```bash
npm test
```

Pruebas unitarias en `tests/unit/`: permisos, validaciones, RUT, PDF de citaciones y avatares.
