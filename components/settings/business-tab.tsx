"use client";

import * as React from "react";
import useSWR from "swr";
import { toast } from "sonner";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api-client";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface SettingsResponse {
  business: { name: string; address: string; phone: string; logoPath: string | null };
  precision: { weight: number; touch: number; fine: number };
}

export function BusinessTab() {
  const { data, mutate } = useSWR<SettingsResponse>("/api/settings", fetcher);
  const [name, setName] = React.useState("");
  const [address, setAddress] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [precision, setPrecision] = React.useState({ weight: 3, touch: 2, fine: 3 });
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (data) {
      setName(data.business.name);
      setAddress(data.business.address);
      setPhone(data.business.phone);
      setPrecision(data.precision);
    }
  }, [data]);

  async function handleSaveBusiness(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.patch("/api/settings", { business: { name, address, phone } });
      toast.success("Business profile saved.");
      mutate();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not save.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSavePrecision() {
    try {
      await api.patch("/api/settings", { precision });
      toast.success("Calculation precision updated. This applies to new and edited orders.");
      mutate();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not save.");
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Business profile</CardTitle>
          <CardDescription>Shown on Excel exports and printed reports.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSaveBusiness} className="max-w-md space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="business-name">Business name</Label>
              <Input id="business-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="business-address">Address</Label>
              <Input id="business-address" value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="business-phone">Phone</Label>
              <Input id="business-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving..." : "Save business profile"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Calculation precision</CardTitle>
          <CardDescription>
            Decimal places used when rounding Weight, Touch, and Fine Total (brief section 8/43 - the
            underlying formulas are Loss = Weight In - Weight Out - Making Charge, and Fine Total =
            Loss x Touch / 100; only the rounding is configurable here).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid max-w-md grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="precision-weight">Weight decimals</Label>
              <Input
                id="precision-weight"
                type="number"
                min={0}
                max={6}
                value={precision.weight}
                onChange={(e) => setPrecision({ ...precision, weight: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="precision-touch">Touch decimals</Label>
              <Input
                id="precision-touch"
                type="number"
                min={0}
                max={6}
                value={precision.touch}
                onChange={(e) => setPrecision({ ...precision, touch: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="precision-fine">Fine Total decimals</Label>
              <Input
                id="precision-fine"
                type="number"
                min={0}
                max={6}
                value={precision.fine}
                onChange={(e) => setPrecision({ ...precision, fine: Number(e.target.value) })}
              />
            </div>
          </div>
          <Button className="mt-4" onClick={handleSavePrecision}>Save precision</Button>
        </CardContent>
      </Card>
    </div>
  );
}
