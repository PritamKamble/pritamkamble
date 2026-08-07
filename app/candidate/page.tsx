"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PortalHeader } from "@/components/PortalHeader";
import { formatDate, formatDateTime, todayUtcDateString } from "@/lib/formatDate";
import { computeReadinessScore } from "@/lib/readiness";

type Profile = { id: string; full_name: string; role: string };
type ProjectLink = { label: string; url: string };
type CandidateProfile = {
  track: string | null;
  level: string | null;
  weeks_completed: number | null;
  dsa_solved: number | null;
  mock_score: number | null;
  capstone_status: string | null;
  bio: string | null;
  resume_url: string | null;
  project_links: ProjectLink[];
  updated_at?: string | null;
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
  job_id: string;
  status: string;
  jobs: { title: string; company: string; status: string } | null;
};
type DailyLog = {
  id: string;
  log_date: string;
  content: string;
};

const TABS = ["progress", "jobs", "applications", "dailylog", "account"] as const;
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
    project_links: [],
  });
  const [progressToast, setProgressToast] = useState("");
  const [resumeUploading, setResumeUploading] = useState(false);
  const [resumeError, setResumeError] = useState("");

  const [jobs, setJobs] = useState<Job[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [applyingJobId, setApplyingJobId] = useState<string | null>(null);
  const [withdrawingId, setWithdrawingId] = useState<string | null>(null);
  const [jobsToast, setJobsToast] = useState("");
  const [upcomingInterview, setUpcomingInterview] = useState<{
    scheduled_at: string;
    meeting_link: string | null;
  } | null>(null);

  const [dailyLogs, setDailyLogs] = useState<DailyLog[]>([]);
  const [logDraft, setLogDraft] = useState("");
  const [logToast, setLogToast] = useState("");
  const [editingToday, setEditingToday] = useState(false);
  const [historyLimit, setHistoryLimit] = useState(14);

  const [completedScores, setCompletedScores] = useState<number[]>([]);
  const [completedInterviews, setCompletedInterviews] = useState<
    { id: string; scheduled_at: string; score: number | null; notes: string | null }[]
  >([]);

  const [newFullName, setNewFullName] = useState("");
  const [nameToast, setNameToast] = useState("");

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
      if (p) setNewFullName(p.full_name);

      const { data: existing } = await supabase
        .from("candidate_profiles")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      if (existing) setCp(existing);

      loadOpenJobs();
      loadMyApplications(user.id);
      loadUpcomingInterview(user.id);
      loadDailyLogs(user.id);
      loadCompletedScores(user.id);
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
      .select("scheduled_at, meeting_link")
      .eq("candidate_id", userId)
      .eq("status", "scheduled")
      .gte("scheduled_at", new Date().toISOString())
      .order("scheduled_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    setUpcomingInterview(data);
  }

  async function loadDailyLogs(userId: string) {
    const { data } = await supabase
      .from("daily_logs")
      .select("id, log_date, content")
      .eq("candidate_id", userId)
      .order("log_date", { ascending: true });
    setDailyLogs((data as DailyLog[]) || []);
  }

  async function handleSubmitLog(e: React.FormEvent) {
    e.preventDefault();
    if (!profile || !logDraft.trim()) return;
    const today = todayUtcDateString();
    const existingToday = dailyLogs.find((l) => l.log_date === today);

    const { error } = existingToday
      ? await supabase
          .from("daily_logs")
          .update({ content: logDraft.trim() })
          .eq("id", existingToday.id)
      : await supabase
          .from("daily_logs")
          .insert({ candidate_id: profile.id, content: logDraft.trim() });

    setLogToast(error ? `Error: ${error.message}` : "Saved ✓");
    if (!error) {
      setEditingToday(false);
      loadDailyLogs(profile.id);
    }
    setTimeout(() => setLogToast(""), 2500);
  }

  async function loadCompletedScores(userId: string) {
    const { data } = await supabase
      .from("interviews")
      .select("id, scheduled_at, score, notes")
      .eq("candidate_id", userId)
      .eq("status", "completed")
      .order("scheduled_at", { ascending: false });
    const rows = data || [];
    setCompletedScores(
      rows.filter((r) => r.score != null).map((r) => r.score as number),
    );
    setCompletedInterviews(rows);
  }

  async function handleProgressSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;
    const cleanLinks = cp.project_links.filter(
      (link) => link.label.trim() && link.url.trim(),
    );
    const { error } = await supabase.from("candidate_profiles").upsert({
      user_id: profile.id,
      ...cp,
      project_links: cleanLinks,
      updated_at: new Date().toISOString(),
    });
    if (!error) setCp((prev) => ({ ...prev, project_links: cleanLinks }));
    setProgressToast(error ? `Error: ${error.message}` : "Saved ✓");
    setTimeout(() => setProgressToast(""), 2500);
  }

  async function handleResumeUpload(file: File) {
    if (!profile) return;
    setResumeError("");
    const allowedTypes = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];
    if (!allowedTypes.includes(file.type)) {
      setResumeError("Only PDF or Word documents are allowed.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setResumeError("File must be under 5MB.");
      return;
    }

    setResumeUploading(true);
    const ext = file.name.split(".").pop();
    const path = `${profile.id}/resume.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("resumes")
      .upload(path, file, { upsert: true });

    if (uploadError) {
      setResumeUploading(false);
      setResumeError(uploadError.message);
      return;
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from("resumes").getPublicUrl(path);
    // Cache-bust so a replaced file doesn't keep showing the old cached version.
    const bustUrl = `${publicUrl}?v=${Date.now()}`;

    const { error: dbError } = await supabase.from("candidate_profiles").upsert({
      user_id: profile.id,
      ...cp,
      resume_url: bustUrl,
      updated_at: new Date().toISOString(),
    });
    setResumeUploading(false);
    if (dbError) {
      setResumeError(dbError.message);
      return;
    }
    setCp((prev) => ({ ...prev, resume_url: bustUrl }));
  }

  async function handleApply(jobId: string) {
    if (!profile) return;
    setApplyingJobId(jobId);
    const { error } = await supabase
      .from("job_applications")
      .insert({ job_id: jobId, candidate_id: profile.id });
    setApplyingJobId(null);
    setJobsToast(error ? `Error: ${error.message}` : "Applied ✓");
    if (!error) loadMyApplications(profile.id);
    setTimeout(() => setJobsToast(""), 2500);
  }

  async function handleWithdraw(applicationId: string) {
    if (!profile) return;
    setWithdrawingId(applicationId);
    const { error } = await supabase
      .from("job_applications")
      .delete()
      .eq("id", applicationId);
    setWithdrawingId(null);
    setJobsToast(error ? `Error: ${error.message}` : "Application withdrawn");
    if (!error) loadMyApplications(profile.id);
    setTimeout(() => setJobsToast(""), 2500);
  }

  async function handleUpdateName(e: React.FormEvent) {
    e.preventDefault();
    if (!profile || !newFullName.trim()) return;
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: newFullName.trim() })
      .eq("id", profile.id);
    setNameToast(error ? `Error: ${error.message}` : "Saved ✓");
    if (!error) setProfile({ ...profile, full_name: newFullName.trim() });
    setTimeout(() => setNameToast(""), 2500);
  }

  function employmentTypeLabel(type: string) {
    return type
      .split("_")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join("-");
  }

  const today = todayUtcDateString();
  const todayLog = dailyLogs.find((l) => l.log_date === today) || null;
  const historyDays: { date: string; log: DailyLog | null; isToday: boolean }[] = [];
  if (dailyLogs.length > 0) {
    const start = new Date(dailyLogs[0].log_date + "T00:00:00Z");
    const end = new Date(today + "T00:00:00Z");
    for (
      let d = new Date(start);
      d <= end;
      d.setUTCDate(d.getUTCDate() + 1)
    ) {
      const dateStr = d.toISOString().slice(0, 10);
      historyDays.push({
        date: dateStr,
        log: dailyLogs.find((l) => l.log_date === dateStr) || null,
        isToday: dateStr === today,
      });
    }
    historyDays.reverse();
  }

  const readiness = computeReadinessScore(
    dailyLogs.length,
    dailyLogs[0]?.log_date || null,
    completedScores,
  );

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
        <div
          className={`tabbtn ${tab === "dailylog" ? "active" : ""}`}
          onClick={() => setTab("dailylog")}
        >
          Daily Log
        </div>
        <div
          className={`tabbtn ${tab === "account" ? "active" : ""}`}
          onClick={() => setTab("account")}
        >
          Account
        </div>
      </div>

      {tab === "progress" && (
        <>
          <div className="card">
            <div className="muted" style={{ marginBottom: 4 }}>
              Job readiness score
            </div>
            <div
              style={{
                fontFamily: "var(--mono)",
                fontSize: 32,
                fontWeight: 700,
                color:
                  readiness.score >= 70
                    ? "var(--green)"
                    : readiness.score >= 40
                      ? "var(--amber)"
                      : "var(--rust)",
              }}
            >
              {readiness.score}
              <span style={{ fontSize: 16, color: "var(--muted)" }}>/100</span>
            </div>
            <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>
              Consistency{" "}
              {readiness.consistencyPct != null
                ? `${Math.round(readiness.consistencyPct)}%`
                : "— log daily to start"}
              {" · "}
              Mock avg{" "}
              {readiness.mockAvg != null
                ? `${readiness.mockAvg.toFixed(1)}/10`
                : "— attend a mock interview"}
            </div>
          </div>

          {upcomingInterview && (
            <div
              className="card"
              style={{
                borderColor: "var(--green)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 12,
              }}
            >
              <div>
                <div className="muted" style={{ marginBottom: 4 }}>
                  Upcoming interview
                </div>
                <div style={{ fontFamily: "var(--mono)", fontSize: 15 }}>
                  {formatDateTime(upcomingInterview.scheduled_at)}
                </div>
              </div>
              {upcomingInterview.meeting_link && (
                <a
                  className="btn btn-sm"
                  href={upcomingInterview.meeting_link}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Join call →
                </a>
              )}
            </div>
          )}

          {completedInterviews.length > 0 && (
            <div className="card">
              <h2>Interview feedback</h2>
              {completedInterviews.map((iv) => (
                <div
                  key={iv.id}
                  style={{
                    border: "1px solid var(--line)",
                    borderRadius: 8,
                    padding: 14,
                    marginBottom: 10,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: iv.notes ? 8 : 0,
                    }}
                  >
                    <span style={{ fontFamily: "var(--mono)", fontSize: 13, color: "var(--muted)" }}>
                      {formatDateTime(iv.scheduled_at)}
                    </span>
                    {iv.score != null && (
                      <span
                        style={{
                          fontFamily: "var(--mono)",
                          fontWeight: 700,
                          color:
                            iv.score >= 7
                              ? "var(--green)"
                              : iv.score >= 4
                                ? "var(--amber)"
                                : "var(--rust)",
                        }}
                      >
                        {iv.score}/10
                      </span>
                    )}
                  </div>
                  {iv.notes && <div style={{ fontSize: 13.5 }}>{iv.notes}</div>}
                </div>
              ))}
            </div>
          )}
          <div className="card">
          <h2>Update your progress</h2>
          <div className="muted" style={{ fontSize: 12.5, marginBottom: 14 }}>
            These numbers are self-reported and shown to employers as-is — they
            don&apos;t affect your Job Readiness Score above, which is calculated
            automatically from your daily logs and mock interview scores.
            {cp.updated_at && (
              <> Last updated {formatDateTime(cp.updated_at)}.</>
            )}
          </div>
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
                <select
                  value={cp.capstone_status || "not_started"}
                  onChange={(e) => setCp({ ...cp, capstone_status: e.target.value })}
                >
                  <option value="not_started">Not started</option>
                  <option value="in_progress">In progress</option>
                  <option value="submitted">Submitted</option>
                  <option value="live">Live</option>
                </select>
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
              <label>Resume</label>
              {cp.resume_url && (
                <div style={{ marginBottom: 8, fontSize: 13.5 }}>
                  <a href={cp.resume_url} target="_blank" rel="noopener noreferrer">
                    View current resume →
                  </a>
                </div>
              )}
              <input
                type="file"
                accept=".pdf,.doc,.docx"
                disabled={resumeUploading}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleResumeUpload(file);
                  e.target.value = "";
                }}
              />
              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                {resumeUploading
                  ? "Uploading..."
                  : "PDF or Word, up to 5MB. Uploading replaces your current resume."}
              </div>
              {resumeError && (
                <div className="muted" style={{ fontSize: 12, marginTop: 4, color: "var(--rust)" }}>
                  {resumeError}
                </div>
              )}
            </div>
            <div className="field">
              <label>Project links</label>
              <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
                GitHub repos or live demos — this is what employers actually check before a first
                screen.
              </div>
              {cp.project_links.map((link, i) => (
                <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                  <input
                    type="text"
                    placeholder="Label (e.g. E-commerce store)"
                    value={link.label}
                    style={{ flex: "0 0 40%" }}
                    onChange={(e) => {
                      const next = [...cp.project_links];
                      next[i] = { ...next[i], label: e.target.value };
                      setCp({ ...cp, project_links: next });
                    }}
                  />
                  <input
                    type="url"
                    placeholder="https://github.com/... or live demo URL"
                    value={link.url}
                    style={{ flex: 1 }}
                    onChange={(e) => {
                      const next = [...cp.project_links];
                      next[i] = { ...next[i], url: e.target.value };
                      setCp({ ...cp, project_links: next });
                    }}
                  />
                  <button
                    type="button"
                    className="btn-ghost btn-sm"
                    onClick={() => {
                      setCp({
                        ...cp,
                        project_links: cp.project_links.filter((_, idx) => idx !== i),
                      });
                    }}
                  >
                    Remove
                  </button>
                </div>
              ))}
              {cp.project_links.length < 5 && (
                <button
                  type="button"
                  className="btn-ghost btn-sm"
                  onClick={() =>
                    setCp({ ...cp, project_links: [...cp.project_links, { label: "", url: "" }] })
                  }
                >
                  + Add project link
                </button>
              )}
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
          {jobsToast && <div className="msg">{jobsToast}</div>}
          {jobs.length === 0 ? (
            <div className="empty">No open jobs right now.</div>
          ) : (
            jobs.map((j) => {
              const alreadyApplied = applications.some((a) => a.job_id === j.id);
              return (
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
                    {j.location || "Location flexible"} ·{" "}
                    {employmentTypeLabel(j.employment_type)}
                  </div>
                  <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 10 }}>
                    {j.description}
                  </p>
                  <button
                    className="btn btn-sm"
                    disabled={alreadyApplied || applyingJobId === j.id}
                    onClick={() => handleApply(j.id)}
                  >
                    {alreadyApplied
                      ? "Applied ✓"
                      : applyingJobId === j.id
                        ? "Applying..."
                        : "Apply"}
                  </button>
                </div>
              );
            })
          )}
        </div>
      )}

      {tab === "applications" && (
        <div className="card">
          <h2>My applications</h2>
          {jobsToast && <div className="msg">{jobsToast}</div>}
          {applications.length === 0 ? (
            <div className="empty">No applications yet.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Job</th>
                  <th>Company</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {applications.map((a) => (
                  <tr key={a.id}>
                    <td>{a.jobs?.title || "—"}</td>
                    <td>{a.jobs?.company || "—"}</td>
                    <td>
                      <span
                        style={{
                          fontFamily: "var(--mono)",
                          fontSize: 11.5,
                          textTransform: "uppercase",
                          padding: "3px 8px",
                          borderRadius: 4,
                          border: `1px solid ${
                            a.status === "hired"
                              ? "var(--green)"
                              : a.status === "shortlisted"
                                ? "var(--amber)"
                                : a.status === "rejected"
                                  ? "var(--rust)"
                                  : "var(--line)"
                          }`,
                          color:
                            a.status === "hired"
                              ? "var(--green)"
                              : a.status === "shortlisted"
                                ? "var(--amber)"
                                : a.status === "rejected"
                                  ? "var(--rust)"
                                  : "var(--muted)",
                        }}
                      >
                        {a.status}
                      </span>
                    </td>
                    <td>
                      {a.status === "applied" && (
                        <button
                          className="btn-ghost btn-sm"
                          disabled={withdrawingId === a.id}
                          onClick={() => handleWithdraw(a.id)}
                        >
                          {withdrawingId === a.id ? "Withdrawing..." : "Withdraw"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
      {tab === "dailylog" && (
        <div className="card">
          <h2>Daily log</h2>
          <div className="muted" style={{ marginBottom: 16 }}>
            Log what you worked on today. Missed days can&apos;t be filled in later.
          </div>

          {todayLog && !editingToday ? (
            <div
              style={{
                border: "1px solid var(--green)",
                borderRadius: 8,
                padding: 14,
                marginBottom: 16,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontFamily: "var(--mono)", fontSize: 12.5, color: "var(--green)" }}>
                  Today · {formatDate(today)}
                </span>
                <button
                  className="btn-ghost btn-sm"
                  onClick={() => {
                    setLogDraft(todayLog.content);
                    setEditingToday(true);
                  }}
                >
                  Edit
                </button>
              </div>
              <div style={{ fontSize: 14 }}>{todayLog.content}</div>
            </div>
          ) : (
            <form onSubmit={handleSubmitLog} style={{ marginBottom: 16 }}>
              <div className="field">
                <label>What did you work on today?</label>
                <textarea
                  value={logDraft}
                  onChange={(e) => setLogDraft(e.target.value)}
                  placeholder="e.g. Built the auth flow, solved 3 DSA problems, watched RAG lecture..."
                  required
                />
              </div>
              <button className="btn" type="submit">
                {todayLog ? "Save" : "Submit today's log"}
              </button>
              {logToast && (
                <span className="muted" style={{ marginLeft: 12, color: "var(--green)" }}>
                  {logToast}
                </span>
              )}
            </form>
          )}

          {historyDays.length > 1 && (
            <>
              <h2 style={{ fontSize: 14, marginTop: 8 }}>History</h2>
              {historyDays
                .filter((d) => !d.isToday)
                .slice(0, historyLimit)
                .map((d) => (
                  <div
                    key={d.date}
                    style={{
                      border: `1px solid ${d.log ? "var(--line)" : "var(--rust)"}`,
                      borderRadius: 8,
                      padding: 12,
                      marginTop: 10,
                    }}
                  >
                    <div
                      style={{
                        fontFamily: "var(--mono)",
                        fontSize: 12,
                        color: d.log ? "var(--muted)" : "var(--rust)",
                        marginBottom: d.log ? 6 : 0,
                      }}
                    >
                      {formatDate(d.date)} {!d.log && "· Missed"}
                    </div>
                    {d.log && <div style={{ fontSize: 13.5 }}>{d.log.content}</div>}
                  </div>
                ))}
              {historyDays.filter((d) => !d.isToday).length > historyLimit && (
                <button
                  className="btn-ghost btn-sm"
                  style={{ marginTop: 12 }}
                  onClick={() => setHistoryLimit((n) => n + 14)}
                >
                  Show more
                </button>
              )}
            </>
          )}
        </div>
      )}

      {tab === "account" && (
        <>
          <div className="card">
            <h2>Profile</h2>
            <form onSubmit={handleUpdateName}>
              <div className="field">
                <label>Full name</label>
                <input
                  type="text"
                  value={newFullName}
                  onChange={(e) => setNewFullName(e.target.value)}
                  required
                />
              </div>
              <button className="btn" type="submit">
                Save
              </button>
              {nameToast && (
                <span className="muted" style={{ marginLeft: 12, color: "var(--green)" }}>
                  {nameToast}
                </span>
              )}
            </form>
          </div>
        </>
      )}
    </div>
  );
}
