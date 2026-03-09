# Tube Mentor AI

AI-powered EdTech platform that transforms YouTube videos into interactive lessons. UI language: Uzbek.

## Architecture

- **Frontend**: React + TypeScript + Tailwind CSS + shadcn/ui (client/)
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
        user-layout.tsx        # User sidebar + topbar + profile menu
        admin-layout.tsx       # Admin sidebar + topbar + admin badge
      protected-route.tsx      # Auth guard with role checks
      ui/                      # shadcn/ui components
    hooks/
      use-auth.ts              # Auth hook (login, logout, current user)
      use-toast.ts             # Toast notifications
    pages/
      home.tsx                 # Public landing page
      login.tsx                # Login page
      dashboard.tsx            # User dashboard (student/teacher)
      not-found.tsx            # 404 page
      user/
        create-lesson.tsx      # Create lesson form with YouTube URL, coin cost
        my-lessons.tsx         # My lessons grid with search/filter/sort
        lesson-process.tsx     # Multi-step transcript extraction + AI generation
        flashcards.tsx         # Flashcards placeholder
        notes.tsx              # Notes placeholder
        analytics.tsx          # Analytics placeholder
        profile.tsx            # User profile
      admin/
        users.tsx              # Admin user management
        lessons.tsx            # Admin lessons management placeholder
        moderation.tsx         # Moderation placeholder
        coins.tsx              # Coin management placeholder
        categories.tsx         # Categories management placeholder
        settings.tsx           # System settings placeholder
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
    ai-generator.ts            # Pluggable AI content generation (mock → OpenAI)
shared/
  schema.ts                    # Drizzle schemas + Zod types
```

## Frontend Routes

### Public
- `/` - Landing page (PublicLayout)
- `/login` - Login page

### User (student/teacher) — UserLayout with sidebar
- `/dashboard` - Dashboard
- `/lessons/create` - Create lesson
- `/lessons` - My lessons
- `/flashcards` - Flashcards
- `/notes` - Notes
- `/analytics` - Analytics
- `/profile` - Profile

### Admin — AdminLayout with sidebar
- `/admin` - Admin dashboard
- `/admin/users` - User management
- `/admin/lessons` - Lessons management
- `/admin/moderation` - Content moderation
- `/admin/coins` - Coin management
- `/admin/categories` - Categories management
- `/admin/settings` - System settings

## Navigation Items (Uzbek)

### User Sidebar
1. Boshqaruv paneli → /dashboard
2. Dars yaratish → /lessons/create
3. Mening darslarim → /lessons
4. Kartochkalar → /flashcards
5. Eslatmalar → /notes
6. Tahlil → /analytics
7. Profil → /profile

### Admin Sidebar
1. Admin paneli → /admin
2. Foydalanuvchilar → /admin/users
3. Darslar → /admin/lessons
4. Moderatsiya → /admin/moderation
5. Coin boshqaruvi → /admin/coins
6. Kategoriyalar → /admin/categories
7. Sozlamalar → /admin/settings

## API Routes

### Auth
- `POST /api/auth/login` - Login (session regeneration)
- `POST /api/auth/logout` - Logout (session destroy)
- `GET /api/auth/me` - Current user

### Admin — User Management
- `GET /api/admin/users` - List all users
- `GET /api/admin/users/:id` - Get user detail
- `POST /api/admin/users` - Create user (fullName, username, password, role, coins?)
- `PATCH /api/admin/users/:id` - Update user (fullName, username, role)
- `PATCH /api/admin/users/:id/status` - Activate/deactivate user (isActive)
- `PATCH /api/admin/users/:id/password` - Reset password (newPassword)

### Admin — Coin Management
- `POST /api/admin/users/:id/coins` - Add/remove coins (amount, type: add|remove, description)
- `GET /api/admin/users/:id/coins` - Get balance + transaction history

### User — Dashboard & Lessons
- `GET /api/user/dashboard` - Aggregated dashboard (coins, counts, recent lessons, recent transactions)
- `GET /api/user/lessons` - User's own lessons
- `GET /api/user/lessons/:id` - Single lesson detail (ownership checked)
- `POST /api/user/lessons` - Create lesson (youtubeUrl, title?, categoryId?, tagIds?, level) — costs 10 coins
- `POST /api/user/lessons/:id/transcript` - Extract/submit transcript (mode: auto|manual|demo)
- `POST /api/user/lessons/:id/generate` - Trigger AI lesson generation from transcript
- `GET /api/user/progress` - User lesson progress
- `GET /api/categories` - List all categories
- `GET /api/tags` - List all tags
- `GET /api/lessons/public` - Public published lessons (up to 10)
- `GET /api/health` - Health check

## AI Generation Pipeline

- **Transcript extraction**: auto (YouTube captions), manual (user input), demo (built-in sample)
- **AI generator**: Mock provider generates vocabulary, phrases, quizzes, flashcards, sentence analysis
- **Architecture**: `server/services/ai-generator.ts` — pluggable, ready for OpenAI replacement
- **Services**: `server/services/transcript.ts` — transcript extraction/cleaning/splitting

## Authentication

- Session-based with express-session + MemoryStore
- Passwords hashed with scrypt (server/auth.ts)
- Session regeneration on login (fixation prevention)
- Cookie: httpOnly, sameSite=lax, secure in production
- Middleware: requireAuth, requireAdmin, requireRole (all re-check DB state)

## Roles

- **admin** - Full access, admin layout
- **teacher** - Create/manage lessons, user layout
- **student** - Learn, take quizzes, user layout

## Default Credentials

- admin / admin123
- aziza_k / aziza123 (teacher)
- bobur_a / bobur123 (student)
- dilnoza_s / dilnoza123 (student)

## Environment Variables

- `DATABASE_URL` - PostgreSQL connection string
- `SESSION_SECRET` - Session encryption secret
- `PORT` - Server port (default: 5000)

## Seed Data

Auto-seeds on first startup: 4 users, 5 categories, 10 tags, 5 lessons, flashcards, notes, bookmarks, coin transactions, 8 system settings.
