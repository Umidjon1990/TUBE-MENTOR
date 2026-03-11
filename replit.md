# TUBE MENTOR

EdTech platform that transforms YouTube videos into interactive Arabic lessons with Uzbek UI. Teachers create lessons, students consume them.

## Architecture

- **Frontend**: React + TypeScript + Tailwind CSS + shadcn/ui + recharts (client/)
- **Backend**: Node.js + Express with session-based auth (server/)
- **Database**: PostgreSQL with Drizzle ORM
- **Auth**: Session-based with scrypt password hashing (server/auth.ts)
- **Shared**: Types and schemas (shared/schema.ts)

## Design System

- **Theme**: Dark mode default, futuristic neon vibe
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
      public-lesson.tsx        # Public lesson detail (full interactive: SubtitlePlayer, Export, Arabic RTL, word maps, quiz, flashcards; no auth-dependent save actions)
      user/
        create-lesson.tsx      # Create lesson form with YouTube URL, coin cost
        my-lessons.tsx         # My lessons grid with search/filter/sort
        lesson-process.tsx     # Multi-step transcript extraction + AI generation
        lesson-detail.tsx      # Interactive lesson with 7 tabs (Matn, Lug'at, Test, Nahw, Xulosa, Kartochkalar, Eslatmalar)
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
        data-center.tsx        # Data Center: aggregated vocabulary/sentences/quizzes/phrases/flashcards/saved-words/wordmaps with filtering, sorting, XLSX/CSV export
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
  schema.ts                    # 12 Drizzle models + relations + Zod types (includes summaryShortAr/summaryDetailedAr)
```

## Subtitle Player System

- `client/src/components/subtitle-player.tsx` — YouTube embed + subtitle system + learning controls + word interaction; accepts `readOnly` prop to disable save actions for public view
- YouTube IFrame API for embedded video playback
- **Learning controls bar**: Play/Pause, ±5s skip, prev/next subtitle, replay current, loop toggle (Takror), speed control (0.5x–2x via Sekinroq/Tezroq), current time display
- Subtitle overlay on video with glassmorphism styling
- **Collapsible subtitle panel** below video with progress indicator (current/total), clickable lines and auto-scroll
- Display modes: "Asl matn", "Asl + tarjima", "Tarjima"
- Translation languages: O'zbekcha / Arabcha
- Panel modes: "Auto" (auto-scroll) / "Joyida" (fixed)
- **Arabic RTL support**: dir="rtl", textAlign, fontFamily `'Noto Naskh Arabic', 'Amiri', serif` (loaded via Google Fonts), lineHeight 1.8 for Arabic
- **Clickable words**: Active subtitle words are tokenized and clickable (overlay + panel), with active/hover states
- **Word Inspector**: Desktop popup near clicked word; mobile bottom sheet with safe-area padding
- **Edge cases**: No-subtitles empty state, translation fallback, break-words overflow prevention, loop end-time handling
- Props: `youtubeUrl`, `subtitles`, `lessonId`, `vocabulary`, `phrases`, `sentenceWordMaps`
- **Sticky video**: Video + controls stick to top of viewport (`position: sticky`) while subtitle panel and tabs scroll below
- **WordMap lookup**: Per-sentence word-level translations (UZ+AR) + grammaticalRole + i_rab fields for precise word inspector & Nahw tab data
- **Nahw (نحو) tab**: Syntactic analysis tab showing sentenceType (جملة فعلية/اسمية), per-word grammaticalRole (الوظيفة النحوية), and i_rab (الإعراب) in expandable sentence cards with table view
- **Timestamped subtitle support**: Both auto (YouTube XML captions with start/dur) and manual transcripts preserve real timing in `subtitlesJson` column. Supports two manual formats: inline (`M:SS text`) and standalone (timestamp on separate line from text)
- **Auto transcript timing**: YouTube XML `<text start="X" dur="Y">` attributes parsed and stored; merged via `mergeShortSubtitles()`
- **Subtitle↔sentenceAnalysis matching**: Fuzzy matching with word overlap scoring (40%+ threshold) to pair timed subtitles with AI translations
- Falls back to mock timestamps (8s per sentence) from sentenceAnalysisJson only when no timed data available

## Word Inspector & Saved Words System

- `client/src/components/word-inspector.tsx` — Desktop popup / mobile bottom sheet for word details
- Shows: word, pronunciation, UZ/AR translations, contextual meaning, part of speech, phrase info, source sentence with word highlighting across original/UZ/AR views
- "Mening so'zlarimga qo'shish" button saves word to `saved_words` table
- Escape key / click-outside / backdrop to close
- `client/src/pages/user/saved-words.tsx` — Full "Mening so'zlarim" page
- Features: search, filter by lesson, filter by status (yangi/yod olingan), delete, mark learned
- Stats cards: total, new, learned counts
- DB table: `saved_words` with unique constraint on (userId, lessonId, normalized, subtitleTime)
- API: GET/POST/PATCH/DELETE `/api/user/saved-words`
- Sidebar nav: "Mening so'zlarim" with BookmarkCheck icon at `/saved-words`

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
- `/lessons/:id` - Lesson detail with 6 tabs (Matn, Lug'at, Test, Xulosa, Kartochkalar, Eslatmalar). Supports `?t=<seconds>` deep-link to auto-seek video
- `/lessons` - My lessons
- `/dictionary` - Smart Lug'at: cross-lesson word search (Arabic/Uzbek), grouped results with video deep-links
- `/flashcards` - Flashcards
- `/saved-words` - Mening so'zlarim
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

## Lesson Detail Tabs (lesson-detail.tsx)

- **Matn**: Sentence-by-sentence transcript analysis with 4-mode translation toggle (Tarjimasiz / O'zbekcha / Arabcha / Ikki tilli), per-sentence grammar notes, key words, wordMap tooltips, bookmarks, difficulty marking, flashcard saving
- **Lug'at**: 4 sections (Yangi so'zlar / Birikmalar / So'zma-so'z tarjima / Kontekstdagi ma'nolar), vocab search, save-to-saved-words and flashcard actions per card, Arabic translations displayed
- **Test**: Quiz system supporting multiple_choice and fill_blank types, Arabic RTL in options, question type badges, up to 10 questions, progress tracking
- **Xulosa**: Summary with O'zbekcha/Arabcha language toggle, lesson statistics, AI meta info
- **Kartochkalar**: Preset + saved modes, 3D flip cards, Arabic toggle on back side, confidence tracking, list view
- **Eslatmalar**: Notes CRUD with pinning, bookmarks list with sentence reference

## AI Generator — Language-Aware Content Generation

- `server/services/ai-generator.ts` with `detectLanguage()` for Arabic/English/mixed transcripts
- OpenAI GPT-4o-mini (user's own API key prioritized) with explicit O'ZBEK translation requirements (SHART markers)
- AI prompt sends all sentences as numbered list + instructs "BARCHA gaplarni tahlil qil" for complete analysis
- **ChatGPT manual import**: Users can bypass API costs by using a built-in ChatGPT prompt template, pasting JSON result into the system
  - Endpoint: `POST /api/user/lessons/:id/import-content` accepts `{ content: { ... } }` with full lesson JSON
  - Frontend: `lesson-process.tsx` JsonImportState with template viewer, copy button, JSON validator
  - Provider metadata: `provider: "manual-import"`, `model: "chatgpt-manual"`
  - **JSON auto-repair**: `repairChatGptJson()` fixes unescaped quotes inside string values (common ChatGPT issue), then `jsonrepair` library handles remaining syntax issues
  - **Timed subtitle sync**: `buildChatGptPrompt()` includes numbered timed lines list when manual transcript has timestamps, instructs ChatGPT to use exact text in `sentence` field
- **AI timeout**: 120s timeout on OpenAI calls; timeout errors propagated to user (not silently falling back to mock)
- Mock fallback produces proper Uzbek placeholder text (not English snippets)
- `mockUzTranslation()` with dictionary + generic Uzbek terms for unknown words
- Generates:
  - `translationAr` per vocabulary item, phrase, and sentence
  - `wordMap` array per sentence: word-level UZ+AR translations + contextual meaning
  - `backAr` per flashcard
  - `summaryShortAr` / `summaryDetailedAr` for lesson summaries
- Schema columns: `summary_short_ar`, `summary_detailed_ar` on lessons table
- Mock fallback includes Arabic data for testing

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

## Export Center / Download System

- **Export Studio Modal**: `client/src/components/export-studio.tsx` — premium download modal with section toggles, format chooser, quiz options
- **Export Types**: `client/src/lib/export-types.ts` — ExportConfig, LessonExportData, section/format types
- **Export Transform**: `client/src/lib/export-transform.ts` — transforms lesson JSON into export-ready structures, quiz randomization
- **PDF Renderer**: `client/src/lib/export-pdf.tsx` — @react-pdf/renderer with MiniGuidePDF, QuizSheetPDF, FlashcardsPDF; color-coded sections (Arabic=emerald, Uzbek=blue, wordByWord=amber, vocab=cyan/violet)
- **DOCX Renderer**: `client/src/lib/export-docx.ts` — `docx` library for Teacher Worksheet with branded design, RTL Arabic support
- **XLSX Renderer**: `client/src/lib/export-xlsx.ts` — `exceljs` library for vocabulary export with styled headers and alternating rows
- **Integration**: Download button in lesson-detail.tsx header, opens ExportStudio modal
- **Supported formats**: PDF (mini guide, quiz sheet, flashcards), DOCX (teacher worksheet), XLSX (vocabulary)
- **Quiz options**: all/random mode, count (5/10/15/20), with/without answers
- **Dependencies**: @react-pdf/renderer, docx, exceljs, file-saver

## Database Schema

11 tables: users, categories, tags, lessons, lesson_tags, lesson_progress, flashcards, notes, bookmarks, coin_transactions, system_settings. User table includes gamification fields: xp, level, streakDays, lastStudyDate, badges.
