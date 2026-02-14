import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

export const createSupabaseClient = () => {
  const supabase = createClientComponentClient();
  
  // 確保 Session 持久化
  if (typeof window !== 'undefined') {
    supabase.auth.onAuthStateChange((event, session) => {
      if (session) {
        // Session 會自動保存到 localStorage
      }
    });
  }
  
  return supabase;
};
