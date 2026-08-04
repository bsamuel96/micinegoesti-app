import { config } from "./config.js";
import { createApp } from "./app.js";
import { logInfo } from "./lib/logger.js";

const app = createApp();

app.listen(config.port, () => {
  logInfo("server:started", {
    port: config.port,
    nodeEnv: config.nodeEnv,
    logDir: config.logDir,
    logStorage: config.logStorage,
    supabaseConfigured: Boolean(config.supabase.url && config.supabase.serviceRoleKey),
    whatsappProvider: config.whatsapp.provider,
    greenApi: {
      apiUrl: config.whatsapp.greenApiBaseUrl,
      idInstance: Boolean(config.whatsapp.greenApiInstanceId),
      apiTokenInstance: Boolean(config.whatsapp.greenApiToken)
    },
    storeNumberConfigured: Boolean(config.whatsapp.storeNumber)
  });
});
