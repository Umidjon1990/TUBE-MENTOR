# Tube Mentor AI

AI-powered EdTech platform that transforms YouTube videos into interactive lessons. UI language: Uzbek.

## Architecture

- **Frontend**: React + TypeScript + Tailwind CSS + shadcn/ui (client/)
- **Backend**: Node.js + Express with session-based auth (server/)
- **Database**: PostgreSQL with Drizzle ORM
- **Auth**: Session-based with scrypt password hashing (server/auth.ts)
- **Shared**: Types and schemas (shared/schema.ts)

## Project Structure

```
client/               # React frontend
  src/
    App.tsx           # Root component with routing + protected routes
    pages/            # Page components (home, login, dashboard, admin, not-found)
    components/
      ui/             # shadcn/ui components
      protected-route.tsx  # Auth guard component
    hooks/
      use-auth.ts     # Auth hook (login, logout, current user)
      use-toast.ts    # Toast notifications
    lib/              # Utilities (queryClient, utils)
server/               # Express backend
  index.ts            # Server entry point + session middleware
  auth.ts             # Password hashing, verification, auth middleware
  routes.ts           # API routes (prefix: /api)
  storage.ts          # Database storage interface (IStorage)
  db.ts               # Database connection (Drizzle + pg)
  seed.ts             # Database seed script (runs on startup)
  vite.ts             # Vite dev server setup
  static.ts           # Production static file serving
shared/
  schema.ts           # Drizzle schemas + Zod validation + types
```

## Key Commands

- `npm run dev` - Start development server (frontend + backend on port 5000)
- `npm run build` - Build for production
- `npm run db:push` - Push schema changes to database
- `npm run check` - TypeScript type checking

## Authentication

- Session-based auth with express-session
- Passwords hashed with scrypt (server/auth.ts)
- No public signup - only admin creates users
- Middleware: requireAuth, requireAdmin, requireRole(...)
- Blocked users (isActive=false) cannot log in
- Role-based redirect after login: admin → /admin, student/teacher → /dashboard

## Roles

- **admin** - Full access, user management
- **teacher** - Create/manage lessons
- **student** - Learn, take quizzes, earn coins

## Frontend Routes

- `/` - Public landing page
- `/login` - Login page
- `/dashboard` - Protected: student/teacher dashboard
- `/admin` - Protected: admin panel (admin only)

## API Routes

- `GET /api/health` - Health check
- `POST /api/auth/login` - Login (username, password)
- `POST /api/auth/logout` - Logout
- `GET /api/auth/me` - Current user
- `GET /api/admin/users` - Admin: list all users
- `GET /api/user/progress` - Auth: user's lesson progress

## Database Models

- **users** (varchar UUID PK) - fullName, username, passwordHash, role, isActive, coins, lastLoginAt, timestamps
- **categories** (serial PK) - name, slug, description
- **tags** (serial PK) - name, slug
- **lessons** (serial PK) - full lesson data with AI-generated JSON fields, FK to category/creator/approver/publisher
- **lesson_tags** (serial PK) - lessonId FK, tagId FK (unique index)
- **lesson_progress** (serial PK) - userId FK, lessonId FK, accuracy, completion (unique user+lesson)
- **flashcards** (serial PK) - userId FK, lessonId FK, frontText, backText, confidence
- **notes** (serial PK) - userId FK, lessonId FK, content, isPinned
- **bookmarks** (serial PK) - userId FK, lessonId FK, type, label
- **coin_transactions** (serial PK) - userId FK, amount, type, description
- **system_settings** (serial PK) - key (unique), value

## Default Admin

- Username: admin / Password: admin123

## Environment Variables

- `DATABASE_URL` - PostgreSQL connection string
- `SESSION_SECRET` - Session encryption secret
- `PORT` - Server port (default: 5000)

## UI Language

All user-facing text is in **Uzbek** (O'zbek tili).

## Seed Data

Auto-seeds on first startup: 4 users (1 admin, 1 teacher, 2 students), 5 categories, 10 tags, 5 lessons, flashcards, notes, bookmarks, coin transactions, 8 system settings.
