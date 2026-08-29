"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Gem, ArrowRight, ArrowLeft, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { api, ApiError } from "@/lib/api-client";

/**
 * First-launch wizard (section 42): Welcome -> Business Profile -> Admin
 * Account -> Ready -> Order Registry. Kept to one page with steps (not a
 * multi-route flow) so there's nothing to configure beyond four fields -
 * "do not require complex configuration."
 */
type Step = "welcome" | "business" | "admin" | "done";

export default function FirstRunPage() {
  const router = useRouter();
  const [step, setStep] = React.useState<Step>("welcome");
  const [submitting, setSubmitting] = React.useState(false);

  const [businessName, setBusinessName] = React.useState("");
  const [businessAddress, setBusinessAddress] = React.useState("");
  const [businessPhone, setBusinessPhone] = React.useState("");

  const [adminDisplayName, setAdminDisplayName] = React.useState("");
  const [adminUsername, setAdminUsername] = React.useState("");
  const [adminPassword, setAdminPassword] = React.useState("");
  const [adminPasswordConfirm, setAdminPasswordConfirm] = React.useState("");
  const [linkedExistingBusiness, setLinkedExistingBusiness] = React.useState(false);

  async function handleFinish() {
    if (adminPassword !== adminPasswordConfirm) {
      toast.error("Passwords do not match.");
      return;
    }
    setSubmitting(true);
    try {
      const result = await api.post<{ success: boolean; linkedExistingBusiness: boolean }>("/api/setup", {
        businessName,
        businessAddress,
        businessPhone,
        adminUsername,
        adminDisplayName,
        adminPassword,
      });
      setLinkedExistingBusiness(result.linkedExistingBusiness);
      setStep("done");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Setup failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-6">
      <Card className="w-full max-w-md">
        <CardContent className="pt-6">
          <div className="mb-6 flex items-center gap-2">
            <Gem className="h-6 w-6 text-primary" />
            <span className="text-lg font-semibold">Jewellery Polishing Manager</span>
          </div>

          {step === "welcome" && (
            <div className="space-y-4">
              <h1 className="text-xl font-semibold">Welcome</h1>
              <p className="text-sm text-muted-foreground">
                Let&apos;s get your workshop set up. This takes less than a minute -
                just your business name and an admin login.
              </p>
              <Button className="w-full" onClick={() => setStep("business")}>
                Get started <ArrowRight />
              </Button>
            </div>
          )}

          {step === "business" && (
            <div className="space-y-4">
              <h1 className="text-xl font-semibold">Your business</h1>
              <div className="space-y-1.5">
                <Label htmlFor="businessName">Business name</Label>
                <Input
                  id="businessName"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="e.g. Sri Balaji Polishing Works"
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="businessAddress">Address (optional)</Label>
                <Input
                  id="businessAddress"
                  value={businessAddress}
                  onChange={(e) => setBusinessAddress(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="businessPhone">Phone (optional)</Label>
                <Input
                  id="businessPhone"
                  value={businessPhone}
                  onChange={(e) => setBusinessPhone(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep("welcome")}>
                  <ArrowLeft />
                </Button>
                <Button
                  className="flex-1"
                  disabled={!businessName.trim()}
                  onClick={() => setStep("admin")}
                >
                  Continue <ArrowRight />
                </Button>
              </div>
            </div>
          )}

          {step === "admin" && (
            <div className="space-y-4">
              <h1 className="text-xl font-semibold">Create your admin account</h1>
              <div className="space-y-1.5">
                <Label htmlFor="adminDisplayName">Your name</Label>
                <Input
                  id="adminDisplayName"
                  value={adminDisplayName}
                  onChange={(e) => setAdminDisplayName(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="adminUsername">Username</Label>
                <Input
                  id="adminUsername"
                  value={adminUsername}
                  onChange={(e) => setAdminUsername(e.target.value)}
                  placeholder="e.g. owner"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="adminPassword">Password</Label>
                <Input
                  id="adminPassword"
                  type="password"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">At least 8 characters, with letters and numbers.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="adminPasswordConfirm">Confirm password</Label>
                <Input
                  id="adminPasswordConfirm"
                  type="password"
                  value={adminPasswordConfirm}
                  onChange={(e) => setAdminPasswordConfirm(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep("business")}>
                  <ArrowLeft />
                </Button>
                <Button
                  className="flex-1"
                  disabled={
                    submitting ||
                    !adminDisplayName.trim() ||
                    !adminUsername.trim() ||
                    adminPassword.length < 8
                  }
                  onClick={handleFinish}
                >
                  {submitting ? "Setting up..." : "Finish setup"}
                </Button>
              </div>
            </div>
          )}

          {step === "done" && (
            <div className="space-y-4 text-center">
              <CheckCircle2 className="mx-auto h-10 w-10 text-success" />
              <h1 className="text-xl font-semibold">You&apos;re all set</h1>
              <p className="text-sm text-muted-foreground">
                {linkedExistingBusiness
                  ? `We found ${businessName}'s existing cloud data and are syncing it to this computer now.`
                  : `${businessName} is ready to go.`}{" "}
                Let&apos;s open the Order Registry.
              </p>
              <Button className="w-full" onClick={() => router.push("/orders")}>
                Open Order Registry
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
