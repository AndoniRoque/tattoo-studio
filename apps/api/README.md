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

## Tatuadores

Todas estas rutas requieren `Authorization: Bearer <token-del-dueño>`:

```text
POST  /api/artists
GET   /api/artists
PATCH /api/artists/:artistId
PATCH /api/artists/:artistId/status
```

Crear un tatuador:

```json
{
  "name": "Sofía López",
  "email": "sofia@example.com",
  "password": "una-clave-segura"
}
```

Para activar o desactivar un tatuador, enviar `{ "isActive": false }` o
`{ "isActive": true }`. La baja es lógica para conservar su historial de turnos.

## Horarios de tatuadores

Todas estas rutas requieren `Authorization: Bearer <token>`:

```text
GET    /api/schedules
GET    /api/schedules?artistId=<artistId>
POST   /api/schedules
PATCH  /api/schedules/:scheduleId
DELETE /api/schedules/:scheduleId
```

El dueño puede administrar los horarios del estudio. Cada tatuador también puede
crear, editar y eliminar únicamente sus propios horarios. `weekday` usa `0` para
domingo, `1` para lunes y `6` para sábado.

Ejemplo para crear un horario de lunes de 10:00 a 18:00:

```json
{
  "artistId": "id-del-tatuador",
  "weekday": 1,
  "startTime": "10:00",
  "endTime": "18:00",
  "slotMinutes": 60
}
```

## Próximo slice

- Clientes y turnos.
- Excepciones de disponibilidad y cálculo de slots libres.
