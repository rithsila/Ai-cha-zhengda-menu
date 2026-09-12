import 'dotenv/config';
import { createApp, prisma } from './app';
import { setupBot } from './bot';
import { warnIfDevIdentityAllowed } from './telegram-initdata';
import { configureSqlite } from './db';
import { startExpirySweep } from './expiry';
import { autoSeedIfEmpty } from './seed';

warnIfDevIdentityAllowed();

const app = createApp();
setupBot();

const PORT = process.env.PORT || 4000;

// WAL and the other SQLite settings go on before the first request arrives.
configureSqlite().then(async () => {
  // Automatically populate catalog if launching on a fresh database
  await autoSeedIfEmpty(prisma);

  // Abandoned KHQR orders never become real orders; sweeping them keeps unpaid
  // tickets off the kitchen board and returns the points they reserved.
  startExpirySweep(prisma);

  const port = Number(process.env.PORT) || 4000;
  const server = app.listen(port, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${port}`);
  });

  const shutdown = (signal: string) => {
    console.log(`Received ${signal}, shutting down gracefully...`);
    server.close(() => {
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 3000);
  };

  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));
});
