import {
  AssistantSettingsForm,
  WidgetSettingsForm,
} from "@/components/dashboard/settings-forms";
import { EmbedCodeCopy } from "@/components/dashboard/embed-code-copy";
import { mockAssistant } from "@/lib/mock/data";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground">
          Configure your assistant and widget appearance
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <AssistantSettingsForm assistant={mockAssistant} />

        <div className="space-y-6">
          <WidgetSettingsForm
            color={mockAssistant.widgetColor}
            position={mockAssistant.widgetPosition}
          />
          <EmbedCodeCopy assistantId={mockAssistant.id} />
        </div>
      </div>
    </div>
  );
}
