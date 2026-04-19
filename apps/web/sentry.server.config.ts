import * as Sentry from "@sentry/nextjs";
import { env, hasSentry } from "@/lib/env";
import { scrubValue } from "@/lib/observability/scrub";

if (hasSentry()) {
  Sentry.init({
    dsn: env.sentryDsn,
    environment: env.sentryEnvironment,
    tracesSampleRate: env.sentryTracesSampleRate,
    sendDefaultPii: false,
    beforeSend(event) {
      if (event.request?.data) delete event.request.data;
      if (event.request?.cookies) delete event.request.cookies;
      if (event.user?.email) delete event.user.email;
      if (event.extra) event.extra = scrubValue(event.extra) as typeof event.extra;
      if (event.contexts) event.contexts = scrubValue(event.contexts) as typeof event.contexts;
      return event;
    },
  });
}
