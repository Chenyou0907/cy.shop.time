export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import DashboardClient from "./dashboard-client";
import { createSupabaseServerComponentClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = createSupabaseServerComponentClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    redirect("/login");
  }

  return <DashboardClient email={data.user.email ?? ""} />;
}
