# Tube Mentor AI

AI-powered EdTech platform that transforms YouTube videos into interactive lessons. UI language: Uzbek.

## Architecture

- **Frontend**: React + TypeScript + Tailwind CSS + shadcn/ui + recharts (client/)
- **Backend**: Node.js + Express with session-based auth (server/)
- **Database**: PostgreSQL with Drizzle ORM
- **Auth**: Session-based with scrypt password hashing (server/auth.ts)
- **Shared**: Types and schemas (shared/schema.ts)

## Design System

- **Theme**: Dark mode default, futuristic AI lab vibe
- **Colors**: Neon cyan primary (190 95% 50%), violet accent (260 80% 62%)
- **Effects**: Glassmorphism (.glass, .glass-strong), neon glow (.neon-glow), gradient mesh backgrounds
- **Typography**: Inter/DM Sans fonts
- **Dark mode**: Set via `class="dark"` on html element in index.html

## Project Structure

```
client/
  src/
    App.tsx                    # Root component with all routes
    index.css                  # Theme variables + glassmorphism utilities
    components/
      layouts/
        public-layout.tsx      # Public navbar + footer wrapper
        user-layout.tsx        # User sidebar + topbar + profile menu (streak/level/coins indicators)
        admin-layout.tsx       # Admin sidebar + topbar + admin badge
      protected-route.tsx      # Auth guard with role checks
      ui/                      # shadcn/ui components
    hooks/
      use-auth.ts              # Auth hook (login, logout, current user)
      use-toast.ts             # Toast notifications
    pages/
      home.tsx                 # Public landing page
      login.tsx                # Login page
      dashboard.tsx            # User dashboard with gamification widgets (XP, streak, badges)
      not-found.tsx            # 404 page
      public-library.tsx       # Public lesson library with search/filter
      public-lesson.tsx        # Public lesson detail (read-only)
      user/
        create-lesson.tsx      # Create lesson form with YouTube URL, coin cost
        my-lessons.tsx         # My lessons grid with search/filter/sort
        lesson-process.tsx     # Multi-step transcript extraction + AI generation
        lesson-detail.tsx      # Interactive lesson with 6 tabs
        flashcards.tsx         # Flashcards management
        notes.tsx              # Notes management
        analytics.tsx          # Full analytics dashboard with charts
        profile.tsx            # User profile with gamification stats
      admin/
        users.tsx              # Admin user management
        lessons.tsx            # Admin lessons management
        moderation.tsx         # Content moderation workflow
        coins.tsx              # Coin management
        categories.tsx         # Categories management
        settings.tsx           # System settings management
    lib/
      queryClient.ts           # TanStack Query setup
      utils.ts                 # Utility functions
server/
  index.ts                     # Server entry + session middleware
  auth.ts                      # Password hashing, auth middleware
  routes.ts                    # API routes
  storage.ts                   # Database storage interface (IStorage)
  db.ts                        # Database connection
  seed.ts                      # Seed script
  services/
    transcript.ts              # YouTube caption extraction, manual/demo modes
    ai-generator.ts            # AI content generation (OpenAI GPT-4o with mock fallback)
shared/
  schema.ts                    # 11 Drizzle models + relations + Zod types
```

## Subtitle Player System

- `client/src/components/subtitle-player.tsx` — Self-contained YouTube embed + subtitle system
- YouTube IFrame API for embedded video playback
- Subtitle overlay on video with glassmorphism styling
- Subtitle panel below video with clickable lines and auto-scroll
- Display modes: "Faqat asl matn", "Asl matn + tarjima", "Faqat tarjima"
- Translation languages: O'zbekcha / Arabcha
- Panel modes: "Auto kuzatish" (auto-scroll) / "Joyida turish" (fixed)
- Arabic RTL support with dir="rtl"
- Mobile-responsive design
- Subtitles generated from sentenceAnalysisJson with mock timestamps (8s per sentence)

## Frontend Routes

### Public
- `/` - Landing page (PublicLayout)
- `/login` - Login page
- `/library` - Public lesson library (search, filter by category/level, featured)
- `/library/:id` - Public lesson detail (read-only view of published lessons)

### User (student/teacher) — UserLayout with sidebar
- `/dashboard` - Dashboard with gamification widgets (XP progress, streak, badges)
- `/lessons/create` - Create lesson
- `/lessons/:id/process` - Lesson processing (transcript + AI generation)
- `/lessons/:id` - Lesson detail with 6 tabs (Matn, Lug'at, Test, Xulosa, Kartochkalar, Eslatmalar)
- `/lessons` - My lessons
- `/flashcards` - Flashcards
- `/notes` - Notes
- `/analytics` - Full analytics dashboard with charts (weekly study, stats)
- `/profile` - Profile with XP, level, streak, badges

### Admin — AdminLayout with sidebar
- `/admin` - Admin analytics dashboard with charts (lesson status pie, user roles bar, top users)
- `/admin/users` - User management
- `/admin/lessons` - Lessons management
- `/admin/moderation` - Content moderation (approve/reject/publish/unpublish, metadata, tags, featured)
- `/admin/coins` - Coin management
- `/admin/categories` - Categories management
- `/admin/settings` - System settings management (costs, limits, defaults)

## API Routes

### Auth
- `POST /api/auth/login` - Login (session regeneration)
- `POST /api/auth/logout` - Logout (session destroy)
- `GET /api/auth/me` - Current user

### Admin — User Management
- `GET /api/admin/users` - List all users
- `GET /api/admin/users/:id` - Get user detail
- `POST /api/admin/users` - Create user
- `PATCH /api/admin/users/:id` - Update user
- `PATCH /api/admin/users/:id/status` - Activate/deactivate user
- `PATCH /api/admin/users/:id/password` - Reset password
- `POST /api/admin/users/:id/coins` - Add/remove coins
- `GET /api/admin/users/:id/coins` - Get balance + transactions

### Admin — Lesson Management
- `GET /api/admin/lessons` - List all lessons with tags and creator info
- `GET /api/admin/lessons/:id` - Get lesson detail with all categories/tags
- `PATCH /api/admin/lessons/:id/approve` - Approve lesson
- `PATCH /api/admin/lessons/:id/reject` - Reject lesson
- `PATCH /api/admin/lessons/:id/publish` - Publish lesson
- `PATCH /api/admin/lessons/:id/unpublish` - Unpublish lesson
- `PATCH /api/admin/lessons/:id` - Update metadata (moderationNote, isFeatured, categoryId)
- `PUT /api/admin/lessons/:id/tags` - Set tags
- `DELETE /api/admin/lessons/:id` - Delete lesson

### Admin — Analytics & Settings
- `GET /api/admin/analytics` - Full platform analytics
- `GET /api/admin/settings` - All system settings
- `PUT /api/admin/settings` - Update settings (bulk)

### User — Analytics
- `GET /api/user/analytics` - User analytics (lessons, accuracy, XP, streak, charts)

### User — Dashboard & Lessons
- `GET /api/user/dashboard` - Aggregated dashboard data
- `GET /api/user/lessons` - User's own lessons
- `GET /api/user/lessons/:id` - Single lesson detail
- `POST /api/user/lessons` - Create lesson (costs 10 coins)
- `POST /api/user/lessons/:id/transcript` - Extract/submit transcript
- `POST /api/user/lessons/:id/generate` - Trigger AI lesson generation
- `GET/POST/PATCH/DELETE` - Flashcards, notes, bookmarks, progress CRUD

### Public
- `GET /api/lessons/public` - Published lessons with search/filter
- `GET /api/lessons/public/:id` - Public lesson detail

## Gamification System

- **XP**: Awarded on study progress updates (5 base + 25 per quiz + 2 per word learned)
- **Levels**: 100 XP per level (level = floor(xp/100) + 1)
- **Streaks**: Daily study tracking, resets if a day is missed
- **Badges**: Automatically awarded: first_lesson, quiz_master, streak_7, streak_30, xp_500, xp_1000, level_5, level_10
- **Display**: Header indicators (streak/level/coins), dashboard widgets, profile page

## System Settings

Managed via admin settings page, stored in `system_settings` table:
- lesson_creation_cost, regenerate_cost, export_cost
- max_transcript_length, featured_lesson_count, default_difficulty
- xp_per_lesson_complete, xp_per_quiz, xp_per_flashcard_review
- site_name, coins_per_registration, maintenance_mode, etc.

## Authentication

- Session-based with express-session + MemoryStore
- Passwords hashed with scrypt (server/auth.ts)
- Session regeneration on login (fixation prevention)
- Cookie: httpOnly, sameSite=lax, secure in production
- Middleware: requireAuth, requireAdmin, requireRole

## Roles

- **admin** - Full access, admin layout
- **teacher** - Create/manage lessons, user layout
- **student** - Learn, take quizzes, user layout

## Default Credentials

- admin / admin123
- aziza_k / aziza123 (teacher)
- bobur_a / bobur123 (student)
- dilorom_y / dilorom123 (student)

## Environment Variables

- `DATABASE_URL` - PostgreSQL connection string
- `SESSION_SECRET` - Session encryption secret
- `PORT` - Server port (default: 5000)
- `AI_INTEGRATIONS_OPENAI_API_KEY` - OpenAI API key (via Replit AI Integrations)
- `AI_INTEGRATIONS_OPENAI_BASE_URL` - OpenAI base URL (via Replit AI Integrations)

## AI Integration

- Uses Replit AI Integrations for OpenAI access (no personal API key needed)
- Model: GPT-4o for lesson content generation
- Charges billed to Replit credits
- Falls back to mock generator if OpenAI fails

## Seed Data

Auto-seeds on first startup: 4+ users, 5 categories, 10 tags, 5 lessons with content, flashcards, notes, bookmarks, coin transactions, 17+ system settings.

## Database Schema

11 tables: users, categories, tags, lessons, lesson_tags, lesson_progress, flashcards, notes, bookmarks, coin_transactions, system_settings. User table includes gamification fields: xp, level, streakDays, lastStudyDate, badges.
