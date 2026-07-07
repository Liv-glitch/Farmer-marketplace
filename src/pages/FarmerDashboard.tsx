import { useCallback, useEffect, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { getSession, signOut } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { EyeOff } from "lucide-react";
import { toast } from "sonner";

type Booking = {
  id: string;
  farmer_id: string;
  acres_booked: number;
  total_amount: number | null;
  price_per_acre: number;
  payment_status: string;
  booking_status: string;
  created_at: string;
  farmer_confirmed_at: string | null;
  payment_requested_at: string | null;
  buyer_id: string;
  buyers?: { buyer_name: string; phone_number: string; email: string; county: string } | null;
};

type FarmerSummary = {
  id: string;
  farmer_id: string | null;
  registration_status: string;
  listing_status: string;
  full_name: string;
  phone_number: string | null;
  email: string | null;
  county: string | null;
  ward: string | null;
  specific_location: string | null;
  potato_variety: string | null;
  acreage_planted: number | null;
  planting_date: string | null;
  bookings?: Booking[];
};

const fmtKES = (n: number) => `KES ${Number(n).toLocaleString()}`;
const fmtDate = (d: string) => new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
const canViewContact = (booking: Booking) => booking.booking_status === "confirmed" || booking.payment_status === "paid";
const farmerBookingStatus = (booking: Booking) => {
  if (booking.booking_status === "pending_approval") return "Pending farmer confirmation";
  if (booking.booking_status === "approved") return "Pending buyer confirmation";
  if (booking.booking_status === "confirmed") return "Confirmed";
  return booking.booking_status.replace(/_/g, " ");
};

export default function FarmerDashboard() {
  const navigate = useNavigate();
  const session = getSession();
  const farmerId = session?.userId;
  const [farms, setFarms] = useState<FarmerSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingDecisionId, setSavingDecisionId] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    if (!farmerId) return;
    const { data, error } = await supabase.functions.invoke("api-auth/farmer/dashboard", { body: { farmer_id: farmerId } });
    if (!error && !data?.error) {
      const farmRows = (data?.farms as FarmerSummary[] | undefined) || [];
      setFarms(farmRows);
    } else {
      toast.error(data?.error || "Failed to load farmer dashboard");
    }
    setLoading(false);
  }, [farmerId]);

  useEffect(() => { void loadDashboard(); }, [loadDashboard]);

  if (!session || session.role !== "farmer") return <Navigate to="/login" replace />;

  const decideBooking = async (farm: FarmerSummary, booking: Booking, decision: "approve" | "reject") => {
    setSavingDecisionId(booking.id);
    const { data, error } = await supabase.functions.invoke("api-auth/farmer/booking/decision", {
      body: { farmer_id: farmerId, farm_id: farm.id, booking_id: booking.id, decision },
    });
    setSavingDecisionId(null);
    if (error || data?.error) {
      toast.error(data?.error || "Failed to update booking");
      return;
    }
    toast.success(decision === "approve" ? "Availability confirmed" : "Booking rejected");
    await loadDashboard();
  };

  const HiddenContact = ({ label }: { label: string }) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-500"
          tabIndex={0}
          aria-label={label}
        >
          <EyeOff className="h-4 w-4" />
        </span>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );

  const statusBadge = (farm: FarmerSummary) => {
    if (farm.registration_status === "pending") return <Badge className="bg-amber-500 hover:bg-amber-500 text-white">Pending Approval</Badge>;
    if (farm.listing_status === "booked") return <Badge className="bg-blue-600 hover:bg-blue-600 text-white">Booked</Badge>;
    if (farm.listing_status === "available") return <Badge className="bg-green-600 hover:bg-green-600 text-white">Available</Badge>;
    return <Badge variant="secondary">{farm.listing_status ?? "—"}</Badge>;
  };

  const primaryFarm = farms[0] ?? null;

  return (
    <div className="container max-w-5xl py-8 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Farmer Dashboard</h1>
          {primaryFarm?.full_name && <p className="text-muted-foreground text-sm">Welcome, {primaryFarm.full_name}</p>}
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline"><Link to="/farmer/settings">Profile & Settings</Link></Button>
          <Button variant="destructive" onClick={async () => { await signOut(); navigate("/login"); }}>Logout</Button>
        </div>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : farms.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">No farm listings are linked to this account.</CardContent></Card>
      ) : (
        <div className="space-y-6">
          {farms.map((farm) => {
            const farmBookings = farm.bookings || [];
            return (
              <Card key={farm.id}>
                <CardHeader className="flex flex-row items-center justify-between gap-3">
                  <CardTitle>
                    {farm.farmer_id || "Farm listing"}
                    <span className="ml-2 text-sm font-normal text-muted-foreground">{farm.specific_location ?? "-"}</span>
                  </CardTitle>
                  {statusBadge(farm)}
                </CardHeader>
                <CardContent className="space-y-5">
                  {farm.registration_status === "pending" && (
                    <p className="text-sm text-muted-foreground">This farm is pending approval. You will be notified once approved.</p>
                  )}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    <div><div className="text-muted-foreground">Phone</div><div>{farm.phone_number ?? "-"}</div></div>
                    <div><div className="text-muted-foreground">Email</div><div>{farm.email ?? "-"}</div></div>
                    <div><div className="text-muted-foreground">County / Ward</div><div>{farm.county ?? "-"}{farm.ward ? `, ${farm.ward}` : ""}</div></div>
                    <div><div className="text-muted-foreground">Location</div><div>{farm.specific_location ?? "-"}</div></div>
                    <div><div className="text-muted-foreground">Variety</div><div>{farm.potato_variety ?? "-"}</div></div>
                    <div><div className="text-muted-foreground">Acreage</div><div>{farm.acreage_planted ?? "-"} acres</div></div>
                    <div><div className="text-muted-foreground">Planting Date</div><div>{farm.planting_date ? fmtDate(farm.planting_date) : "-"}</div></div>
                    <div><div className="text-muted-foreground">Listing</div><div>{farm.listing_status ?? "-"}</div></div>
                  </div>

                  <div>
                    <h2 className="text-lg font-semibold mb-3">Bookings</h2>
                    {farmBookings.length === 0 ? (
                      <div className="rounded-md border py-8 text-center text-sm text-muted-foreground">No bookings for this farm yet.</div>
                    ) : (
                      <div className="space-y-4">
                        {farmBookings.map((r) => (
                          <div key={r.id} className="rounded-md border p-4">
                            <div className="pb-4">
                              <div className="flex items-center justify-between flex-wrap gap-2">
                                <h3 className="text-base font-semibold">Booking Ref: <span className="font-mono text-sm">{r.id}</span></h3>
                                <div className="flex gap-2">
                                  <Badge variant={r.payment_status === "paid" ? "default" : "secondary"}>Payment: {r.payment_status}</Badge>
                                  <Badge variant="outline">Status: {farmerBookingStatus(r)}</Badge>
                                </div>
                              </div>
                            </div>
                            <div className="space-y-3">
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                                <div><div className="text-muted-foreground">Booking Date</div><div>{fmtDate(r.created_at)}</div></div>
                                <div><div className="text-muted-foreground">Acres Booked</div><div>{r.acres_booked}</div></div>
                                <div><div className="text-muted-foreground">Total Amount</div><div className="font-semibold">{fmtKES(r.total_amount ?? r.acres_booked * r.price_per_acre)}</div></div>
                                <div><div className="text-muted-foreground">Payment</div><div>{r.payment_status}</div></div>
                                <div><div className="text-muted-foreground">Booking Status</div><div>{farmerBookingStatus(r)}</div></div>
                              </div>
                              {r.booking_status === "pending_approval" && (
                                <div className="flex flex-wrap gap-2 border-t pt-3">
                                  <Button size="sm" onClick={() => decideBooking(farm, r, "approve")} disabled={savingDecisionId === r.id}>
                                    {savingDecisionId === r.id ? "Saving..." : "Confirm Availability"}
                                  </Button>
                                  <Button size="sm" variant="destructive" onClick={() => decideBooking(farm, r, "reject")} disabled={savingDecisionId === r.id}>
                                    Reject
                                  </Button>
                                </div>
                              )}
                              <Collapsible>
                                <CollapsibleTrigger asChild><Button variant="outline" size="sm">View Buyer Details</Button></CollapsibleTrigger>
                                <CollapsibleContent className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm border-t pt-3">
                                  <div><div className="text-muted-foreground">Buyer Name</div><div>{r.buyers?.buyer_name ?? "—"}</div></div>
                                  <div><div className="text-muted-foreground">Phone</div><div>{canViewContact(r) ? r.buyers?.phone_number ?? "—" : <HiddenContact label="Buyer contact details will be revealed once the booking is confirmed." />}</div></div>
                                  <div><div className="text-muted-foreground">Email</div><div>{canViewContact(r) ? r.buyers?.email ?? "—" : <HiddenContact label="Buyer contact details will be revealed once the booking is confirmed." />}</div></div>
                                  <div><div className="text-muted-foreground">County</div><div>{r.buyers?.county ?? "—"}</div></div>
                                </CollapsibleContent>
                              </Collapsible>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
