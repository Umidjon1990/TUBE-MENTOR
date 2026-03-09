# Tube Mentor AI

Sun'iy intellekt yordamida YouTube videolaridan interaktiv darslar yarating.

AI-powered EdTech platform that transforms YouTube videos into interactive lessons.

## Tech Stack

- **Frontend**: React, TypeScript, Tailwind CSS, shadcn/ui
- **Backend**: Node.js, Express
- **Database**: PostgreSQL with Drizzle ORM
- **Language**: Uzbek (O'zbek tili) UI

## Default Admin Credentials

```
Username: admin
Password: admin123
```

## Demo Accounts

| Username    | Password    | Role    |
|-------------|-------------|---------|
| admin       | admin123    | Admin   |
| aziza_k     | aziza123    | Teacher |
| bobur_a     | bobur123    | Student |
| dilorom_y   | dilorom123  | Student |

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

The database is automatically seeded with demo data on first startup.

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

## Database Models

- **User** - Users with roles (admin, teacher, student), coin balance, activity tracking
- **Lesson** - YouTube-based lessons with AI-generated content (vocabulary, phrases, quizzes, flashcards)
- **Category** - Lesson categories (e.g., Ingliz tili, Dasturlash, Matematika)
- **Tag** - Lesson tags for filtering (e.g., Boshlang'ich, Grammatika, Python)
- **LessonTag** - Many-to-many relationship between lessons and tags
- **LessonProgress** - User progress per lesson (accuracy, completion, study time)
- **Flashcard** - Spaced repetition flashcards per user per lesson
- **Note** - User notes tied to lesson sentences/timestamps
- **Bookmark** - User bookmarks on lessons or specific sentences
- **CoinTransaction** - Coin economy transaction history
- **SystemSetting** - Key-value system configuration

## Project Structure

```
client/           # React frontend application
  src/
    pages/        # Page components
    components/   # UI components (shadcn/ui)
    hooks/        # Custom React hooks
    lib/          # Utilities
server/           # Express backend
  index.ts        # Entry point with session middleware
  routes.ts       # API routes (/api/*)
  storage.ts      # Data access layer (IStorage interface)
  db.ts           # Database connection (Drizzle + pg)
  seed.ts         # Database seed script
shared/           # Shared types and schemas
  schema.ts       # Drizzle ORM schemas + Zod validation
```

## API Endpoints

- `GET /api/health` - Health check with database connectivity status

## Seed Data

The app seeds the following demo data on first startup:
- 1 admin, 1 teacher, 2 students
- 5 categories (Ingliz tili, Dasturlash, Matematika, Tarix, Fan va tabiat)
- 10 tags (Boshlang'ich, O'rta daraja, Grammatika, Python, etc.)
- 5 lessons with vocabulary, quizzes, and summaries
- Flashcards, notes, bookmarks, coin transactions
- 8 system settings

## License

MIT
