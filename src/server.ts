import { createApp } from './app';
import { loadConfig } from './config';

const config = loadConfig();
const app = createApp({ config });

app.listen(config.port, () => {
  console.log(`Order splitter listening on http://localhost:${config.port}`);
  console.log(`Share quantities rounded down to ${config.shareDecimals} decimal places`);
});
