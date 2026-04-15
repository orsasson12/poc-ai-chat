"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SettingsForm } from "./settings-form";
import { SarPanel } from "./sar-panel";
import { SubProcessorsPanel } from "./sub-processors-panel";
import { PrivacyPolicyPanel } from "./privacy-policy-panel";

export function ComplianceTabs() {
  return (
    <Tabs defaultValue="settings" className="flex flex-col gap-6">
      <TabsList className="w-full justify-start overflow-x-auto md:w-auto">
        <TabsTrigger value="settings">Settings</TabsTrigger>
        <TabsTrigger value="sar">Subject requests</TabsTrigger>
        <TabsTrigger value="privacy-policy">Privacy notice</TabsTrigger>
        <TabsTrigger value="sub-processors">Sub-processors</TabsTrigger>
      </TabsList>

      <TabsContent value="settings" className="mt-0">
        <SettingsForm />
      </TabsContent>

      <TabsContent value="sar" className="mt-0">
        <SarPanel />
      </TabsContent>

      <TabsContent value="privacy-policy" className="mt-0">
        <PrivacyPolicyPanel />
      </TabsContent>

      <TabsContent value="sub-processors" className="mt-0">
        <SubProcessorsPanel />
      </TabsContent>
    </Tabs>
  );
}
