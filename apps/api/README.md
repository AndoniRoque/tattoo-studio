# Tattoo Turnero API

API multi-tenant para estudios de tatuajes. Cada estudio puede tener varios tatuadores, con clientes, horarios y turnos propios.

## Requisitos

- Node.js 20+
- PostgreSQL 15+

## Configuración

1. Copiar `.env.example` a `.env`.
2. Ajustar `DATABASE_URL` con la conexión local de PostgreSQL.
3. Instalar dependencias con `npm install`.
4. Generar el cliente Prisma con `npm run prisma:generate`.

Desde Windows con Docker Desktop, iniciar PostgreSQL desde la raíz del proyecto:

```powershell
docker compose up -d postgres
docker compose ps
```

La API se ejecuta fuera de Docker durante el desarrollo, por eso `.env` debe usar
`localhost` como host de PostgreSQL. Una vez que el contenedor esté saludable,
crear la migración inicial:

```powershell
npm run prisma:migrate
```

Para detener PostgreSQL sin borrar los datos:

```powershell
docker compose down
```

Para borrar también los datos persistidos:

```powershell
docker compose down -v
```

## Comandos

```bash
npm run dev
npm run build
npm start
```

La comprobación inicial está disponible en `GET /health`.

## Próximo slice

- Migración inicial de PostgreSQL.
- Registro y login de administradores.
- Middleware de autenticación y contexto de estudio.
- CRUD de tatuadores y disponibilidad.
