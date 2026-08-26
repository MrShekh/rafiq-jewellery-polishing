"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProfileTab } from "@/components/settings/profile-tab";
import { BusinessTab } from "@/components/settings/business-tab";
import { AppearanceTab } from "@/components/settings/appearance-tab";
import { DataTab } from "@/components/settings/data-tab";
import { SyncTab } from "@/components/settings/sync-tab";
import { ApplicationTab } from "@/components/settings/application-tab";

export function SettingsContent() {
  return (
    <div className="h-full min-h-0 overflow-auto p-6">
      <h1 className="mb-4 text-xl font-semibold">Settings</h1>
      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="business">Business</TabsTrigger>
          <TabsTrigger value="appearance">Appearance</TabsTrigger>
          <TabsTrigger value="data">Data</TabsTrigger>
          <TabsTrigger value="sync">Sync</TabsTrigger>
          <TabsTrigger value="application">Application</TabsTrigger>
        </TabsList>
        <TabsContent value="profile" className="mt-4"><ProfileTab /></TabsContent>
        <TabsContent value="business" className="mt-4"><BusinessTab /></TabsContent>
        <TabsContent value="appearance" className="mt-4"><AppearanceTab /></TabsContent>
        <TabsContent value="data" className="mt-4"><DataTab /></TabsContent>
        <TabsContent value="sync" className="mt-4"><SyncTab /></TabsContent>
        <TabsContent value="application" className="mt-4"><ApplicationTab /></TabsContent>
      </Tabs>
    </div>
  );
}
