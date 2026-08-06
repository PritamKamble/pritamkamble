"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PortalHeader } from "@/components/PortalHeader";

type Profile = { full_name: string; role: string };
type Applicant = {
  id: string;
  name: string;
  phone: string;
  college_or_company: string | null;
  track: string;
  level: string;
  status: string;
  referral_code: string;
  referred_by: string | null;
  created_at: string;
};

export default function AdminPage() {
  const supabase = createClient();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [applicants, setApplicants] = useState<Applicant[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data: p } = await supabase
        .from("profiles")
        .select("full_name, role")
        .eq("id", user.id)
        .single();
      setProfile(p);
      load();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    setError("");
    const { data, error } = await supabase
      .from("applicants")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      setError(`Couldn't load applicants: ${error.message}`);
      return;
    }
    setApplicants(data || []);
  }

  const counts = (applicants || []).reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="wrap">
      {profile && <PortalHeader name={profile.full_name} role={profile.role} />}

      <div className="tabs" style={{ justifyContent: "space-between" }}>
        <div>
          <h1 style={{ fontFamily: "var(--mono)", fontSize: 20 }}>Applicants</h1>
          <div className="muted">Waitlist submissions, newest first</div>
        </div>
        <button className="btn" onClick={load}>
          Refresh
        </button>
      </div>

      <div className="stats">
        <div className="stat">
          <div className="n">{applicants?.length ?? "—"}</div>
          <div className="l">Total</div>
        </div>
        <div className="stat">
          <div className="n">{counts.waiting || 0}</div>
          <div className="l">Waiting</div>
        </div>
        <div className="stat">
          <div className="n">{counts.contacted || 0}</div>
          <div className="l">Contacted</div>
        </div>
        <div className="stat">
          <div className="n">{counts.enrolled || 0}</div>
          <div className="l">Enrolled</div>
        </div>
      </div>

      <div className="card" style={{ overflowX: "auto" }}>
        {error ? (
          <div className="empty">{error}</div>
        ) : applicants === null ? (
          <div className="empty">Loading…</div>
        ) : applicants.length === 0 ? (
          <div className="empty">No applicants yet.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Phone</th>
                <th>College / Company</th>
                <th>Track</th>
                <th>Level</th>
                <th>Status</th>
                <th>Referral code</th>
                <th>Referred by</th>
                <th>Applied</th>
              </tr>
            </thead>
            <tbody>
              {applicants.map((r) => (
                <tr key={r.id}>
                  <td>{r.name || "—"}</td>
                  <td>{r.phone || "—"}</td>
                  <td>{r.college_or_company || "—"}</td>
                  <td>{r.track || "—"}</td>
                  <td>{r.level || "—"}</td>
                  <td>{r.status}</td>
                  <td className="muted">{r.referral_code || "—"}</td>
                  <td className="muted">{r.referred_by || "—"}</td>
                  <td className="muted">
                    {new Date(r.created_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
