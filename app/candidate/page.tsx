"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PortalHeader } from "@/components/PortalHeader";

type Profile = { id: string; full_name: string; role: string };
type CandidateProfile = {
  track: string | null;
  level: string | null;
  weeks_completed: number | null;
  dsa_solved: number | null;
  mock_score: number | null;
  capstone_status: string | null;
  bio: string | null;
  resume_url: string | null;
};
type Job = {
  id: string;
  title: string;
  company: string;
  location: string | null;
  employment_type: string;
  description: string;
};
type Application = {
  id: string;
  status: string;
  jobs: { title: string; company: string; status: string } | null;
};

const TABS = ["progress", "jobs", "applications"] as const;
type Tab = (typeof TABS)[number];

export default function CandidatePage() {
  const supabase = createClient();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [tab, setTab] = useState<Tab>("progress");

  const [cp, setCp] = useState<CandidateProfile>({
    track: "fullstack_genai",
    level: "beginner",
    weeks_completed: 0,
    dsa_solved: 0,
    mock_score: null,
    capstone_status: "",
    bio: "",
    resume_url: "",
  });
  const [progressToast, setProgressToast] = useState("");

  const [jobs, setJobs] = useState<Job[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [upcomingInterview, setUpcomingInterview] = useState<{
    scheduled_at: string;
  } | null>(null);

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data: p } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();
      setProfile(p);

      const { data: existing } = await supabase
        .from("candidate_profiles")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      if (existing) setCp(existing);

      loadOpenJobs();
      loadMyApplications(user.id);
      loadUpcomingInterview(user.id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadOpenJobs() {
    const { data } = await supabase
      .from("jobs")
      .select("*")
      .eq("status", "open")
      .order("created_at", { ascending: false });
    setJobs(data || []);
  }

  async function loadMyApplications(userId: string) {
    const { data } = await supabase
      .from("job_applications")
      .select("*, jobs(title, company, status)")
      .eq("candidate_id", userId)
      .order("applied_at", { ascending: false });
    setApplications((data as unknown as Application[]) || []);
  }

  async function loadUpcomingInterview(userId: string) {
    const { data } = await supabase
      .from("interviews")
      .select("scheduled_at")
      .eq("candidate_id", userId)
      .eq("status", "scheduled")
      .gte("scheduled_at", new Date().toISOString())
      .order("scheduled_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    setUpcomingInterview(data);
  }

  async function handleProgressSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;
    const { error } = await supabase.from("candidate_profiles").upsert({
      user_id: profile.id,
      ...cp,
      updated_at: new Date().toISOString(),
    });
    setProgressToast(error ? `Error: ${error.message}` : "Saved ✓");
    setTimeout(() => setProgressToast(""), 2500);
  }

  async function handleApply(jobId: string) {
    if (!profile) return;
    await supabase
      .from("job_applications")
      .insert({ job_id: jobId, candidate_id: profile.id });
    loadMyApplications(profile.id);
  }

  if (!profile) {
    return (
      <div className="gate">
        <p className="muted" style={{ fontFamily: "var(--mono)" }}>
          Loading...
        </p>
      </div>
    );
  }

  return (
    <div className="wrap">
      <PortalHeader name={profile.full_name} role={profile.role} />

      <div className="tabs">
        <div
          className={`tabbtn ${tab === "progress" ? "active" : ""}`}
          onClick={() => setTab("progress")}
        >
          My Progress
        </div>
        <div
          className={`tabbtn ${tab === "jobs" ? "active" : ""}`}
          onClick={() => setTab("jobs")}
        >
          Job Listings
        </div>
        <div
          className={`tabbtn ${tab === "applications" ? "active" : ""}`}
          onClick={() => setTab("applications")}
        >
          My Applications
        </div>
      </div>

      {tab === "progress" && (
        <>
          {upcomingInterview && (
            <div className="card" style={{ borderColor: "var(--green)" }}>
              <div className="muted" style={{ marginBottom: 4 }}>
                Upcoming interview
              </div>
              <div style={{ fontFamily: "var(--mono)", fontSize: 15 }}>
                {new Date(upcomingInterview.scheduled_at).toLocaleString()}
              </div>
            </div>
          )}
          <div className="card">
          <h2>Update your progress</h2>
          <form onSubmit={handleProgressSubmit}>
            <div className="row2">
              <div className="field">
                <label>Track</label>
                <select
                  value={cp.track || "fullstack_genai"}
                  onChange={(e) => setCp({ ...cp, track: e.target.value })}
                >
                  <option value="fullstack">Full-Stack</option>
                  <option value="genai">GenAI</option>
                  <option value="fullstack_genai">Full-Stack + GenAI</option>
                  <option value="cloud">Cloud/DevOps</option>
                </select>
              </div>
              <div className="field">
                <label>Level</label>
                <select
                  value={cp.level || "beginner"}
                  onChange={(e) => setCp({ ...cp, level: e.target.value })}
                >
                  <option value="beginner">Beginner</option>
                  <option value="some_experience">Some experience</option>
                  <option value="job_ready_prep">Job-ready prep</option>
                </select>
              </div>
            </div>
            <div className="row2">
              <div className="field">
                <label>Weeks completed</label>
                <input
                  type="number"
                  min={0}
                  max={24}
                  value={cp.weeks_completed ?? 0}
                  onChange={(e) =>
                    setCp({ ...cp, weeks_completed: parseInt(e.target.value) || 0 })
                  }
                />
              </div>
              <div className="field">
                <label>DSA problems solved</label>
                <input
                  type="number"
                  min={0}
                  max={150}
                  value={cp.dsa_solved ?? 0}
                  onChange={(e) =>
                    setCp({ ...cp, dsa_solved: parseInt(e.target.value) || 0 })
                  }
                />
              </div>
            </div>
            <div className="row2">
              <div className="field">
                <label>Latest mock interview score (/10)</label>
                <input
                  type="number"
                  min={0}
                  max={10}
                  step={0.5}
                  value={cp.mock_score ?? ""}
                  onChange={(e) =>
                    setCp({
                      ...cp,
                      mock_score: e.target.value ? parseFloat(e.target.value) : null,
                    })
                  }
                />
              </div>
              <div className="field">
                <label>Capstone status</label>
                <input
                  type="text"
                  placeholder="e.g. In progress, Live"
                  value={cp.capstone_status || ""}
                  onChange={(e) => setCp({ ...cp, capstone_status: e.target.value })}
                />
              </div>
            </div>
            <div className="field">
              <label>Bio / notes</label>
              <textarea
                placeholder="Short intro for recruiters browsing candidates"
                value={cp.bio || ""}
                onChange={(e) => setCp({ ...cp, bio: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Resume URL</label>
              <input
                type="url"
                placeholder="https://..."
                value={cp.resume_url || ""}
                onChange={(e) => setCp({ ...cp, resume_url: e.target.value })}
              />
            </div>
            <button className="btn" type="submit">
              Save progress
            </button>
            {progressToast && (
              <div className="muted" style={{ marginTop: 8, color: "var(--green)" }}>
                {progressToast}
              </div>
            )}
          </form>
          </div>
        </>
      )}

      {tab === "jobs" && (
        <div className="card">
          <h2>Open positions</h2>
          {jobs.length === 0 ? (
            <div className="empty">No open jobs right now.</div>
          ) : (
            jobs.map((j) => (
              <div
                key={j.id}
                style={{
                  border: "1px solid var(--line)",
                  borderRadius: 8,
                  padding: 16,
                  marginBottom: 10,
                }}
              >
                <h3 style={{ fontFamily: "var(--mono)", fontSize: 14.5, marginBottom: 4 }}>
                  {j.title} — {j.company}
                </h3>
                <div className="muted" style={{ marginBottom: 8 }}>
                  {j.location || "Location flexible"} · {j.employment_type}
                </div>
                <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 10 }}>
                  {j.description}
                </p>
                <button
                  className="btn btn-sm"
                  onClick={() => handleApply(j.id)}
                >
                  Apply
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {tab === "applications" && (
        <div className="card">
          <h2>My applications</h2>
          {applications.length === 0 ? (
            <div className="empty">No applications yet.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Job</th>
                  <th>Company</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {applications.map((a) => (
                  <tr key={a.id}>
                    <td>{a.jobs?.title || "—"}</td>
                    <td>{a.jobs?.company || "—"}</td>
                    <td>{a.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
