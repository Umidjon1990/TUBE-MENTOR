// SQL timestamp fixtures and the application clock must use the same zone.
// Runtime display still follows each learner's configured timezone.
process.env.TZ = 'UTC';
