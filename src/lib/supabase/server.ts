import { cookies } from "next/headers";
import { createServerComponentClient, createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export const createSupabaseServerComponentClient = () =>
  createServerComponentClient({ cookies });

export const createSupabaseRouteHandlerClient = () =>
  createRouteHandlerClient({ cookies });
