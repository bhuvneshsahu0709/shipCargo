import { createApp } from "./app.js";
import { env } from "./config/env.js";

const app = createApp();

app.listen(env.PORT, () => {
  console.log(`CargoLens API listening on http://localhost:${env.PORT} (AI_PROVIDER=${env.AI_PROVIDER})`);
});
