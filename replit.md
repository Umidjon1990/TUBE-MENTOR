# Tube Mentor AI

AI-powered EdTech platform that transforms YouTube videos into interactive lessons. UI language: Uzbek.

## Architecture

- **Frontend**: React + TypeScript + Tailwind CSS + shadcn/ui (client/)
- **Backend**: Node.js + Express (server/)
- **Database**: PostgreSQL with Drizzle ORM
- **Shared**: Types and schemas (shared/schema.ts)

## Project Structure

```
client/               # React frontend
  src/
    App.tsx           # Root component with routing
    pages/            # Page components (home, not-found)
    components/ui/    # shadcn/ui components
    hooks/            # Custom hooks
    lib/              # Utilities (queryClient, utils)
server/               # Express backend
  index.ts            # Server entry point
  routes.ts           # API routes (prefix: /api)
  storage.ts          # Database storage interface
  db.ts               # Database connection (Drizzle + pg)
  vite.ts             # Vite dev server setup
  static.ts           # Production static file serving
shared/
  schema.ts           # Drizzle schemas + Zod validation types
```

## Key Commands

- `npm run dev` - Start development server (frontend + backend on port 5000)
- `npm run build` - Build for production
- `npm run db:push` - Push schema changes to database
- `npm run check` - TypeScript type checking

## Database

PostgreSQL via Drizzle ORM. Schema defined in `shared/schema.ts`.
Tables: users (with auth-ready fields: id, username, password, displayName, role, createdAt)

## Environment Variables

- `DATABASE_URL` - PostgreSQL connection string
- `SESSION_SECRET` - Session encryption secret
- `PORT` - Server port (default: 5000)

## API

All routes prefixed with `/api`:
- `GET /api/health` - Health check endpoint

## UI Language

All user-facing text is in **Uzbek** (O'zbek tili).
