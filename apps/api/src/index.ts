import 'dotenv/config';
import { createApp, prisma } from './app';
import { setupBot } from './bot';
import { assertPinsConfigured } from './auth';
import { warnIfDevIdentityAllowed } from './telegram-initdata';
import { configureSqlite } from './db';
import { startExpirySweep } from './expiry';

// Fail fast rather than boot a production server on the default PINs.
assertPinsConfigured();
warnIfDevIdentityAllowed();

const app = createApp();
setupBot();

const PORT = process.env.PORT || 4000;

// WAL and the other SQLite settings go on before the first request arrives.
configureSqlite().then(() => {
  // Abandoned KHQR orders never become real orders; sweeping them keeps unpaid
  // tickets off the kitchen board and returns the points they reserved.
  startExpirySweep(prisma);

  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
});
