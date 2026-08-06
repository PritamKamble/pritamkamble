"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function PortalHeader({
  name,
  role,
}: {
  name: string;
  role: string;
}) {
  const router = useRouter();
  const supabase = createClient();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <header>
      <div className="logo">
        ~/<span>pritam</span>.mentor
      </div>
      <div className="who">
        <span>{name}</span>
        <span className="role-badge">{role}</span>
        <button className="logout" onClick={handleLogout}>
          Log out
        </button>
      </div>
    </header>
  );
}
