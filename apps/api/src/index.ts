import { createApp } from './app';
import { setupBot } from './bot';

const app = createApp();
setupBot();

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
