# Tube Mentor AI

AI-powered EdTech platform that transforms YouTube videos into interactive lessons. UI language: Uzbek.

## Architecture

- **Frontend**: React + TypeScript + Tailwind CSS + shadcn/ui (client/)
- **Backend**: Node.js + Express with session middleware (server/)
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
  index.ts            # Server entry point + session middleware
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

## Database Models

- **users** (varchar UUID PK) - fullName, username, passwordHash, role, isActive, coins, lastLoginAt, timestamps
- **categories** (serial PK) - name, slug, description
- **tags** (serial PK) - name, slug
- **lessons** (serial PK) - title, description, youtubeUrl, thumbnailUrl, transcript, language, level, status, vocabularyJson, phrasesJson, quizzesJson, flashcardsJson, sentenceAnalysisJson, aiMetaJson, FK to category/creator/approver/publisher, timestamps
- **lesson_tags** (serial PK) - lessonId FK, tagId FK (unique index)
- **lesson_progress** (serial PK) - userId FK, lessonId FK, accuracy, completedQuizzes, learnedWords, studyTimeSeconds, completionPercent
- **flashcards** (serial PK) - userId FK, lessonId FK, frontText, backText, type, confidenceLevel, nextReviewAt
- **notes** (serial PK) - userId FK, lessonId FK, sentenceIndex, timestamp, content, isPinned
- **bookmarks** (serial PK) - userId FK, lessonId FK, type, sentenceIndex, timestamp, label
- **coin_transactions** (serial PK) - userId FK, amount, type, description
- **system_settings** (serial PK) - key (unique), value

## Default Admin

- Username: admin / Password: admin123

## Environment Variables

- `DATABASE_URL` - PostgreSQL connection string
- `SESSION_SECRET` - Session encryption secret
- `PORT` - Server port (default: 5000)

## API

All routes prefixed with `/api`:
- `GET /api/health` - Health check with database connectivity

## UI Language

All user-facing text is in **Uzbek** (O'zbek tili).

## Seed Data

Auto-seeds on first startup: 4 users (1 admin, 1 teacher, 2 students), 5 categories, 10 tags, 5 lessons, flashcards, notes, bookmarks, coin transactions, 8 system settings.
