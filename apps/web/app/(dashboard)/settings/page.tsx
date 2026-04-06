import {
  AssistantSettingsForm,
  WidgetSettingsForm,
} from "@/components/dashboard/settings-forms";
import { EmbedCodeCopy } from "@/components/dashboard/embed-code-copy";
import { getSessionContext } from "@/lib/auth/session";
import { mockAssistant } from "@/lib/mock/data";

export default async function SettingsPage() {
  const ctx = await getSessionContext();
  const assistant = ctx?.assistant ?? mockAssistant;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground">
          Configure your assistant and widget appearance
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <AssistantSettingsForm assistant={assistant} />

        <div className="space-y-6">
          <WidgetSettingsForm
            color={assistant.widgetColor}
            position={assistant.widgetPosition}
          />
          <EmbedCodeCopy assistantId={assistant.id} />
        </div>
      </div>
    </div>
  );
}
