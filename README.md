# Tube Mentor AI

Sun'iy intellekt yordamida YouTube videolaridan interaktiv darslar yarating.

AI-powered EdTech platform that transforms YouTube videos into interactive lessons.

## Tech Stack

- **Frontend**: React, TypeScript, Tailwind CSS, shadcn/ui
- **Backend**: Node.js, Express
- **Database**: PostgreSQL with Drizzle ORM
- **Language**: Uzbek (O'zbek tili) UI

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL database

### Environment Variables

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

Required variables:
- `DATABASE_URL` - PostgreSQL connection string
- `SESSION_SECRET` - Secret for session encryption
- `PORT` - Server port (default: 5000)

### Installation

```bash
npm install
```

### Database Setup

Push the schema to your database:

```bash
npm run db:push
```

### Development

```bash
npm run dev
```

The app runs on `http://localhost:5000` (or the port specified in `PORT`).

### Production Build

```bash
npm run build
npm start
```

## Project Structure

```
client/           # React frontend application
  src/
    pages/        # Page components
    components/   # UI components (shadcn/ui)
    hooks/        # Custom React hooks
    lib/          # Utilities
server/           # Express backend
  index.ts        # Entry point
  routes.ts       # API routes (/api/*)
  storage.ts      # Data access layer
  db.ts           # Database connection
shared/           # Shared types and schemas
  schema.ts       # Drizzle ORM schemas
```

## API Endpoints

- `GET /api/health` - Health check with database connectivity status

## License

MIT
