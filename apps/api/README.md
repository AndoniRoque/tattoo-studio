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
