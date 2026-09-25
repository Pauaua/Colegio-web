# Gestor Documental — Escuela Básica G-733 Chorombo Bajo

**Aplicación web** para que el equipo directivo de la **Escuela Básica G-733 Chorombo Bajo** (comuna de María Pinto, 208 estudiantes de prekínder a 8.º básico) **cargue, clasifique, almacene y comparta** sus documentos institucionales: memos, oficios, citaciones, acuerdos de apoderados, actas y permisos administrativos.

Se usa desde cualquier navegador, sin instalar nada, y su diseño se adapta al computador y al celular. Se compone de un frontend web, una **API Node.js** y la infraestructura en **AWS** creada con **Terraform** y **Ansible**. Incluye pruebas automatizadas funcionales, de carga, de contingencia y de monitoreo.

> **También disponible como app para celulares.** El frontend está hecho con React Native (Expo), así que el mismo código genera, además de la versión web, una app para **iOS y Android** con navegación por pestañas. La versión web es la que se despliega en AWS; la app móvil es un complemento que se puede probar con Expo Go (no se publica en las tiendas).

---

## 1. El problema y el actor de interés

**Actor de interés:** la directora y el equipo directivo, que hoy gestionan los documentos **de forma manual**. La escuela tiene presupuesto acotado, no cuenta con personal técnico ni infraestructura previa y parte desde cero, sin migración de datos históricos.

| Requisito | Cómo lo cubre la solución |
|---|---|
| **RF1** Cargar, clasificar y almacenar los 6 tipos de documento | Subida con URL firmada a S3, tipo y folio correlativo por tipo y año, visibilidad por rol, destinatarios y cursos |
| **RF2** Consulta y descarga para perfiles autorizados | Listado filtrado en el servidor (`buildDocumentWhere`), descarga con URL firmada de 5 min y **403** si no corresponde |
| **RF3** Metadatos persistentes en una base relacional | Amazon RDS MySQL 8 (Prisma): tipo, fecha, autor, folio, estado, visibilidad, destinatarios, acuses y descargas |
| **RNF** Disponibilidad | 2 a 4 instancias en 2 zonas tras un ALB; RDS Multi-AZ; NAT por zona |
| **RNF** Escalabilidad | Target Tracking de CPU al 60% (scale-out y scale-in automáticos) |
| **RNF** Operación eficiente | Todo como código: Terraform + Ansible + user data que auto-despliega |
| **RNF** Seguridad | TLS, SSE-KMS, RDS cifrada, RBAC, MFA, auditoría, mínimo privilegio |
| **RNF** Observabilidad | Dashboard de 4 paneles, 3 alarmas y correos por SNS |

## 2. Componentes exigidos

| Componente exigido | Cómo se cubre | Dónde se define |
|---|---|---|
| Frontend y backend/API | Aplicación web (build web de Expo) + API Express, ejecutadas en EC2 detrás del ALB | `app/`, `backend/`, `compute.tf`, `ansible/` |
| Cómputo | Auto Scaling Group de Amazon EC2 (t3.micro, 2 a 4 instancias) | `compute.tf` |
| Almacenamiento de archivos | Amazon S3 (privado, SSE-KMS, versionado, ciclo de vida) | `database_storage.tf` |
| Base de datos | Amazon RDS MySQL Multi-AZ (db.t3.micro) | `database_storage.tf` |
| Red | VPC con subredes públicas, privadas y aisladas en 2 AZ, más un NAT por AZ | `network.tf` |
| Publicación | Amazon Route 53 + Application Load Balancer (+ CloudFront para contenido estático) | `compute.tf` |
| Identidad | IAM con rol de instancia de mínimo privilegio | `compute.tf` |
| Monitoreo | CloudWatch (alarmas y dashboard) + SNS por correo | `monitoring.tf` |

Flujo: **Usuario → (Route 53) → CloudFront → ALB (subredes públicas) → EC2 del ASG :8000 (subredes privadas) → RDS MySQL Multi-AZ (subredes aisladas)**. Las EC2 acceden a S3 por un VPC Gateway Endpoint.

Diagramas en [`docs/arquitectura.md`](docs/arquitectura.md) y [`docs/autoescalado.md`](docs/autoescalado.md). Guía resumida en [`docs/guia_despliegue.md`](docs/guia_despliegue.md).

### Estructura del repositorio

```
proyecto_chorombo_bajo/
├── app/                 Frontend: aplicación web (Expo SDK 57 + React Native + TypeScript), también como app iOS/Android
├── backend/             API REST Express 5 + TypeScript + Prisma (MySQL), tests Jest + Supertest
├── terraform/           main, variables, network, compute, database_storage, monitoring, outputs (.tf)
├── ansible/             playbook, inventario, generar_inventario.sh, templates/ y files/
├── tests/               Selenium, JMeter, contingencia, autoscaling, monitoreo SNS y sus resultados
├── docs/                arquitectura, política de autoescalado y guía de despliegue
├── scripts/             build-artifact.mjs (npm run build:artifact)
└── docker-compose.yml   MySQL 8 + MinIO para desarrollo local
```

## 3. Requisitos previos

| Herramienta | Versión | Para qué |
|---|---|---|
| Node.js | 20 LTS o superior | Backend, app y scripts |
| Docker Desktop | reciente | MySQL + MinIO locales y el build del artefacto (contenedor Linux) |
| AWS CLI | v2 | Despliegue y pruebas en AWS |
| Terraform | ≥ 1.5 | Infraestructura |
| Ansible | ansible-core ≥ 2.15, con `amazon.aws` y `community.aws` | Configuración de las EC2 (en Windows, desde WSL) |
| Python | 3.9+ | Pruebas y `app_referencia.py` |
| Apache JMeter | 5.6.x (Java 8+) | Prueba de carga |
| Google Chrome | reciente | Selenium |
| Expo Go (opcional) | en el teléfono | Solo para probar la versión app para celulares |

```bash
ansible-galaxy collection install amazon.aws community.aws
python -m venv .venv && .venv/bin/pip install -r tests/requirements.txt     # Windows: .venv\Scripts\pip
```

## 4. Desarrollo local paso a paso

```bash
# 1. Dependencias (monorepo con npm workspaces: backend y app)
npm install

# 2. Base de datos (MySQL 8) y almacenamiento (MinIO, bucket creado al iniciar)
docker compose up -d

# 3. Variables de entorno del backend
cp backend/.env.example backend/.env         # genere un JWT_SECRET propio

# 4. Esquema y datos de ejemplo
npm run db:migrate
npm run db:seed

# 5. Generar la aplicación web y levantar la API, que la sirve en el puerto 8000
npm run build:web
npm run dev:api      # abra http://localhost:8000
```

| Qué | Dónde |
|---|---|
| **Aplicación web** (servida por el backend, igual que en AWS) | `http://localhost:8000` |
| Aplicación web en desarrollo, con recarga en vivo | `npm run dev` (API + Metro) y luego `http://localhost:8081` |
| Consola de MinIO | `http://localhost:9001` (minioadmin / minioadmin) |
| Salud de la API | `http://localhost:8000/health` |

La página se adapta sola al tamaño de la pantalla. En el computador muestra una barra lateral, la barra superior con el nombre y el rol, y tablas. Desde el navegador del celular muestra pestañas abajo y tarjetas.

**Opcional: versión app para celulares.** Con `npm run dev` corriendo, escanee el QR de Metro con **Expo Go**. El teléfono y el PC deben estar en la misma red; la app usa automáticamente la IP del PC. Para que las descargas funcionen en el teléfono, defina `S3_PUBLIC_ENDPOINT=http://<IP-del-PC>:9000` en `backend/.env`.

Scripts útiles desde la raíz: `npm run dev:api`, `npm run build:web`, `npm run build:artifact`, `npm test`, `npm run typecheck`, `npm run lint`, `npm run db:reset`.

### Rutas de compatibilidad (contrato del informe, puerto 8000)

| Método y ruta | Comportamiento |
|---|---|
| `GET /` | Pantalla de acceso (login) de la app web |
| `POST /login` | `{ "username", "password" }` (usuario o email) → `{ token, user }` o 401 |
| `GET /documentos` | Con `Authorization: Bearer`, lista en JSON los documentos visibles para el rol |
| `POST /documentos` | Rol directivo: `{ titulo, tipo, fecha, … }` (archivo opcional en base64 o multipart) → **201** |
| `GET /health` | **200** `{ status: "ok", db: "ok", instance, timestamp }` tras `SELECT 1`; 503 si la base falla |

La API completa está en `/api/v1`: autenticación y MFA, documentos (URL de subida y descarga, edición, archivado, borrado lógico, acuses), dashboard, usuarios, cursos, estudiantes, apoderados y auditoría.

## 5. Despliegue en AWS

```bash
# 1. Credenciales
aws configure                                   # AWS Academy: incluya aws_session_token

# 2. Contraseña de la base (no va en archivos)
export TF_VAR_db_password="<clave-segura>"      # ≥ 12 caracteres, sin / @ " ni espacios

# 3. Inicializar y validar
cd terraform
cp terraform.tfvars.example terraform.tfvars    # alert_email, y en Academy existing_instance_profile
terraform init && terraform validate

# 4. Planificar y aplicar (≈ 15 min; RDS Multi-AZ es lo más lento)
terraform plan && terraform apply

# 5. Datos para los pasos siguientes
terraform output

# 6. Artefacto: backend compilado + build web + dependencias Linux (requiere Docker)
cd .. && npm run build:artifact

# 7. Inventario desde el ASG
cd ansible && ./generar_inventario.sh

# 8. Configuración e instalación
ansible-playbook -i inventory.ini playbook.yml --extra-vars "s3_bucket=<s3_bucket_name> db_host=<rds_endpoint> db_password=$TF_VAR_db_password"

# 9. Verificación
curl http://<alb_dns_name>/health               # 200 {"status":"ok","db":"ok",…}
```

- **HTTPS para los usuarios:** use `cloudfront_url` (`https://<dist>.cloudfront.net`).
- **Instancias nuevas:** las que lanza el ASG al escalar se configuran solas con el user data. Descargan el último artefacto de `s3://<bucket>/artifacts/`, que el playbook publica, o levantan `app_referencia.py` si todavía no hay artefacto.
- **Secretos:** la contraseña de la base y el secreto JWT viven en **SSM Parameter Store** (SecureString). Nunca quedan en el Launch Template ni en el repositorio.
- **Confirmación de alertas:** confirme la suscripción de SNS desde el correo que llega después del `apply`.

## 6. Pruebas y resultados

Todas aceptan `BASE_URL` (por defecto `http://localhost:8000`, o el DNS del ALB o CloudFront).

| Prueba | Comando | Resultado |
|---|---|---|
| Unitarias e integración (API) | `npm test` | Consola (75 casos) |
| Funcionales CP-01 a CP-07 (Selenium) | `python tests/selenium_test_gestor_documental.py` | `tests/resultados_pruebas_funcionales.json` |
| Carga "Cyberday" (JMeter) | `jmeter -n -t tests/prueba_carga_cyberday.jmx -Jhost=localhost -Jport=8000 -l tests/resultados_carga_cyberday.jtl -e -o tests/informe_html/` | `tests/resultados_carga_cyberday.jtl` y `tests/informe_html/index.html` |
| Contingencia | `python tests/simular_contingencia.py --modo local` · `--modo aws --asg <asg>` | `tests/resultados_contingencia.json` |
| Autoscaling | `python tests/validar_autoscaling.py --simular` · sin `--simular` en AWS | `tests/resultados_autoscaling.json` |
| Monitoreo SNS | `python tests/validar_monitoreo_sns.py --simular` · `--disparar` en AWS | `tests/resultados_monitoreo.json` |
| Tolerancia a fallos (bitácora) | [`tests/procedimiento_prueba_de_falla.md`](tests/procedimiento_prueba_de_falla.md) | Tabla de tiempos |

- **JMeter:** antes de repetir la prueba, borre `tests/informe_html/` (JMeter exige que el directorio esté vacío). El APDEX (satisfecho ≤ 500 ms, frustrado > 1500 ms) se configura en `user.properties` o se agrega al comando: `-Jjmeter.reportgenerator.apdex_satisfied_threshold=500 -Jjmeter.reportgenerator.apdex_tolerated_threshold=1500`.
- **`simular_contingencia.py --modo local`:** detenga antes el servidor del puerto 8000. El script levanta 2 réplicas de `app_referencia.py` detrás de su propio balanceador con health check.
- **Escalado en AWS:** para observar el paso del ASG de 2 a 4 instancias durante JMeter, siga [`docs/autoescalado.md`](docs/autoescalado.md#cómo-observar-el-escalado-durante-la-prueba-de-carga).

### Resultados obtenidos en local (25-09-2026)

| Prueba | Resultado |
|---|---|
| Selenium CP-01 a CP-07 | **7/7 PASS (100%)** |
| JMeter, 500 usuarios / 60 s / 5 iteraciones | 7.500 solicitudes, todas HTTP 200, **0,09% de errores** (7 logins sobre 1.500 ms), 92 req/s |
| — `GET /health` | promedio 3 ms · p95 6 ms · APDEX 1,00 |
| — `GET /documentos` | promedio 21 ms · p95 28 ms · APDEX 1,00 |
| — `POST /login` | promedio 741 ms · p95 1.333 ms · APDEX 0,66: **cuello de botella** (bcrypt con un solo proceso) |
| Contingencia, 2 réplicas + balanceador | Interrupción percibida **4,3 s** (≤ 5 s) · recuperación **13,1 s** (≤ 5 min) |
| Contingencia sin redundancia (`--replicas 1`) | ≈ 6 s de interrupción: **no cumple**, lo que justifica las 2 instancias |
| Autoscaling (simulado) | 11/11 verificaciones · CPU al 78,4% con 2 instancias → **scale-out de 2 a 3** |
| Monitoreo SNS (simulado) | 31/31 verificaciones (3 alarmas, umbrales, acciones SNS, dashboard de 4 paneles) |

## 7. Usuarios de prueba

Contraseña común: **`Colegio2026!`**. Se puede entrar con el nombre de usuario o con el email.

| Rol | Usuario | Email | Qué ve |
|---|---|---|---|
| DIRECTOR | `directora.chorombo` | directora@colegiochorombo.cl | Todo; gestiona usuarios, cursos y estudiantes; elimina |
| SOSTENEDOR | `sostenedor.chorombo` | sostenedor@colegiochorombo.cl | Igual que la dirección |
| EQUIPO_DIRECTIVO | `equipo.chorombo` | equipo@colegiochorombo.cl | Todo; sube y edita **sus** documentos; auditoría |
| DOCENTE | `docente.chorombo` | docente@colegiochorombo.cl | Documentos para docentes o dirigidos a él |
| APODERADO | `apoderado1.chorombo` | apoderado1@colegiochorombo.cl | Lo dirigido a ella y a los cursos de sus pupilos (3° y 7° básico) |
| APODERADO | `apoderado2.chorombo` | apoderado2@colegiochorombo.cl | Lo dirigido a él y al curso de su pupila (7° básico) |

El seed crea además 2 cursos, 6 estudiantes y 20 documentos con PDF de muestra, entre ellos **"Acta reunión apoderados 08-2026"**. **Para uso real**, cambie estas contraseñas o use `seed_demo_data = false` en Terraform y `run_seed=false` en Ansible.

## 8. AWS Academy / Learner Lab

- **Instance profile:** Academy no permite crear roles IAM, así que en `terraform.tfvars` defina `existing_instance_profile = "LabInstanceProfile"`.
- **Llave KMS:** si el laboratorio restringe crear llaves KMS, use `use_custom_kms_key = false` (el bucket usa la llave administrada `aws/s3`).
- **Credenciales temporales:** expiran con la sesión (unas 4 horas). Vuelva a copiarlas desde *AWS Details* antes de cada `terraform` o prueba.
- **Sin dominio:** CloudFront entrega HTTPS con `*.cloudfront.net` y Route 53 crea la zona privada `chorombo.internal`, con `gestor.chorombo.internal` apuntando al ALB.
- **Créditos limitados:** despliegue, saque las evidencias y ejecute `terraform destroy` en la misma sesión.

## 9. Costos

El **NAT Gateway por zona (×2)**, **RDS Multi-AZ** y el **ALB** cobran **por hora aunque no haya tráfico**. Referencia aproximada en us-east-1 (verifique en la [calculadora de AWS](https://calculator.aws/)):

| Recurso | Aprox. por hora |
|---|---|
| 2 × NAT Gateway | USD 0,090 (+ USD 0,045 por GB procesado) |
| RDS db.t3.micro Multi-AZ | USD 0,034 |
| Application Load Balancer | USD 0,023 (+ LCU) |
| 2 × EC2 t3.micro (hasta 4 en picos) | USD 0,021 |
| CloudFront, S3, KMS, CloudWatch, SNS | por uso (bajo en este volumen) |
| **Total base** | **≈ USD 0,17/hora ≈ USD 4 al día** |

**Ejecute `terraform destroy` al terminar de sacar las evidencias.**

```bash
cd terraform && terraform destroy
```

## 10. Brechas y propuestas de mejora

| # | Brecha | Cómo cerrarla |
|---|---|---|
| 1 | **HTTPS en el ALB** cuando exista dominio (hoy HTTPS termina en CloudFront y el tramo CloudFront → ALB va por HTTP) | `enable_https = true`, `domain_name` y `hosted_zone_id`: Terraform emite el certificado ACM, crea el listener 443 y lo usa también en CloudFront. Luego, origen de CloudFront en `https-only` |
| 2 | **Política de retención de datos** (Ley 19.628 de protección de datos personales) | Reforzar el ciclo de vida de S3 por prefijo o tipo de documento. Agregar un script de depuración en RDS que elimine en forma definitiva los documentos con borrado lógico y los `AuditLog`/`DownloadLog` que superen el plazo definido por la escuela (tarea programada con EventBridge + SSM Run Command) |
| 3 | **Identidad de los apoderados** | Evaluar **Amazon Cognito** (User Pools con recuperación de contraseña por correo, MFA y federación) para delegar el ciclo de vida de las cuentas |
| 4 | Login como cuello de botella en la prueba de carga (bcrypt) | Mantener bcrypt, pero ejecutar un proceso por vCPU (cluster o PM2) o subir `UV_THREADPOOL_SIZE`. Ajustar el flujo para que el usuario inicie sesión una vez por visita (los tokens duran 15 min y se renuevan). El ASG absorbe el resto escalando |
| 5 | TLS obligatorio hacia RDS | Parámetro `require_secure_transport = ON` y `sslaccept=strict` con el certificado de RDS en `DATABASE_URL` |
| 6 | Estado de Terraform local con secretos | Backend remoto S3 cifrado con bloqueo (DynamoDB o `use_lockfile`), con acceso restringido |
| 7 | Límite de intentos de login por instancia (memoria) | Store compartido (ElastiCache/Redis) o AWS WAF con regla de rate limit en CloudFront o el ALB |
| 8 | Modo oscuro de la app (opcional en el diseño) | Tokens desaturados en `app/src/theme` con `useColorScheme` |

---

## Checklist de entrega

- [x] El equipo directivo puede cargar, clasificar y almacenar los 6 tipos de documentos en S3 (MinIO en local)
- [x] Cada rol ve solo lo que le corresponde; un apoderado sin acceso recibe 403 al pedir la descarga
- [x] Los metadatos (tipo, fecha, autor, folio, etc.) quedan en MySQL (RDS en AWS)
- [x] El dashboard muestra información distinta según el rol, en la web (computador y celular) y en la app móvil
- [x] Las rutas `/`, `/login`, `/documentos` y `/health` cumplen el contrato del informe en el puerto 8000
- [x] `terraform validate` sin errores; los 7 archivos `.tf` coinciden con la estructura (`terraform plan` pendiente de credenciales)
- [x] ASG t3.micro de 2 a 4 instancias, target tracking de CPU al 60%, un NAT por AZ, RDS db.t3.micro Multi-AZ, S3 con SSE-KMS + versionado + ciclo de vida
- [x] Las 3 alarmas (`cpu-alta` > 70%, `hosts-no-saludables` > 0, `db-conexiones-altas` > 40) notifican por SNS; el dashboard tiene 4 paneles
- [x] Route 53 y CloudFront configurados; HTTPS en el ALB opcional
- [x] El playbook de Ansible despliega y verifica `/health`; `app_referencia.py` funciona como respaldo
- [x] Selenium (CP-01 a CP-07), JMeter (500 usuarios / 60 s / 5 iteraciones), contingencia, autoscaling y monitoreo generan sus archivos de resultados
- [x] README completo, con el despliegue, los costos y `terraform destroy`
