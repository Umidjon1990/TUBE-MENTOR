# TUBE MENTOR mobile learning implementation

Approved direction: the 20 mobile mockups, Uzbek UI, Arabic/English content, six stages (listen, understand, shadow, practice, vocabulary test, result). Existing accounts and content must survive an additive migration.

## Delivery sequence

1. Versioned migrations, safe production bootstrap, session/rate limits, typecheck.
2. Email registration/verification/reset and Google OAuth; level/goal/timezone preferences.
3. Published-lesson access for learners; creator editing remains separate.
4. One canonical segment model, visible YouTube player, word sheet, audio recording.
5. Server-graded immutable attempts, vocabulary recall at lesson end, review scheduling.
6. Real active time, resume, daily/weekly results and idempotent transactional XP.
7. Light mobile pages, course catalog, creator review/publish and admin tools.
8. Database/API tests, browser tests, production build, deployment instructions, GitHub push.

## Acceptance

- A learner studies another teacher's published lesson and retains progress after reload.
- Unpublished content and another user's private data are inaccessible.
- Generated/imported content requires explicit review; AI errors cannot become demo lessons.
- Arabic context, word maps and grammatical notes survive import and rendering.
- Quiz answers/XP are checked on the server; retries do not multiply rewards.
- Vocabulary errors enter the user's review queue; ratings update due dates once.
- Microphone recordings use supported formats and release microphone/object URLs on exit.
- All core pages work at 320px and keyboard/text zoom; frontend and backend types pass.
- Required external keys are documented, never committed. Third-party live delivery and real-device microphone checks must be reported separately from local test results.

## Test environment

The development/test PostgreSQL protocol server uses the official PGlite socket package and the same pg/Drizzle application code. Production uses PostgreSQL. PGlite is single-connection internally; multi-process PostgreSQL concurrency remains a deployment check, while idempotency is also enforced by SQL uniqueness and row locks.
