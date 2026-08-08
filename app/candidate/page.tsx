"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PortalHeader } from "@/components/PortalHeader";
import { formatDate, formatDateTime, todayUtcDateString } from "@/lib/formatDate";
import { computeReadinessScore } from "@/lib/readiness";

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
type Interview = {
  id: string;
  scheduled_at: string;
  status: string;
  score: number | null;
  notes: string | null;
  meeting_link: string | null;
  candidate_feedback: string | null;
  candidate_self_score: number | null;
};

const TABS = ["progress", "jobs", "interviews", "applications", "dailylog", "account"] as const;
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
  const [applyingJobId, setApplyingJobId] = useState<string | null>(null);
  const [withdrawingId, setWithdrawingId] = useState<string | null>(null);
  const [jobsToast, setJobsToast] = useState("");

  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [fbDraft, setFbDraft] = useState<
    Record<string, { feedback: string; self: string }>
  >({});
  const [fbSavingId, setFbSavingId] = useState<string | null>(null);
  const [fbToast, setFbToast] = useState("");

  const [dailyLogs, setDailyLogs] = useState<DailyLog[]>([]);
  const [logDraft, setLogDraft] = useState("");
  const [logToast, setLogToast] = useState("");
  const [editingToday, setEditingToday] = useState(false);
  const [historyLimit, setHistoryLimit] = useState(14);

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
      loadInterviews(user.id);
      loadDailyLogs(user.id);
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

  async function loadInterviews(userId: string) {
    const { data } = await supabase
      .from("interviews")
      .select(
        "id, scheduled_at, status, score, notes, meeting_link, candidate_feedback, candidate_self_score",
      )
      .eq("candidate_id", userId)
      .order("scheduled_at", { ascending: false });
    setInterviews((data as Interview[]) || []);
  }

  async function handleSubmitFeedback(interviewId: string) {
    const draft = fbDraft[interviewId];
    if (!draft || !draft.feedback.trim()) return;
    setFbSavingId(interviewId);
    const { error } = await supabase.rpc("submit_interview_feedback", {
      p_interview_id: interviewId,
      p_feedback: draft.feedback.trim(),
      p_self_score: draft.self ? parseFloat(draft.self) : null,
    });
    setFbSavingId(null);
    setFbToast(error ? `Error: ${error.message}` : "Feedback saved ✓");
    if (!error && profile) loadInterviews(profile.id);
    setTimeout(() => setFbToast(""), 2500);
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

  const nowMs = Date.now();
  const upcomingInterview =
    interviews
      .filter(
        (i) =>
          i.status === "scheduled" &&
          new Date(i.scheduled_at).getTime() >= nowMs,
      )
      .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))[0] || null;
  const completedScores = interviews
    .filter((i) => i.status === "completed" && i.score != null)
    .map((i) => i.score as number);

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
          className={`tabbtn ${tab === "interviews" ? "active" : ""}`}
          onClick={() => setTab("interviews")}
        >
          Interviews
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
            <div className="card" style={{ borderColor: "var(--green)" }}>
              <div className="muted" style={{ marginBottom: 4 }}>
                Upcoming interview
              </div>
              <div style={{ fontFamily: "var(--mono)", fontSize: 15 }}>
                {formatDateTime(upcomingInterview.scheduled_at)}
              </div>
              {upcomingInterview.meeting_link && (
                <a
                  className="btn btn-sm"
                  href={upcomingInterview.meeting_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ marginTop: 10 }}
                >
                  Join meeting →
                </a>
              )}
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

      {tab === "interviews" && (
        <div className="card">
          <h2>Mock interviews</h2>
          {fbToast && <div className="msg">{fbToast}</div>}
          {interviews.length === 0 ? (
            <div className="empty">
              No interviews yet. Your mentor will schedule mock interviews as you
              progress.
            </div>
          ) : (
            interviews.map((iv) => {
              const draft = fbDraft[iv.id] || {
                feedback: iv.candidate_feedback || "",
                self:
                  iv.candidate_self_score != null
                    ? String(iv.candidate_self_score)
                    : "",
              };
              return (
                <div
                  key={iv.id}
                  style={{
                    border: "1px solid var(--line)",
                    borderRadius: 8,
                    padding: 16,
                    marginBottom: 12,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 12,
                      flexWrap: "wrap",
                    }}
                  >
                    <span style={{ fontFamily: "var(--mono)", fontSize: 14 }}>
                      {formatDateTime(iv.scheduled_at)}
                    </span>
                    <span
                      className="muted"
                      style={{
                        fontFamily: "var(--mono)",
                        fontSize: 11.5,
                        textTransform: "uppercase",
                      }}
                    >
                      {iv.status}
                    </span>
                  </div>

                  {iv.status === "scheduled" && iv.meeting_link && (
                    <a
                      className="btn btn-sm"
                      href={iv.meeting_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ marginTop: 10 }}
                    >
                      Join meeting →
                    </a>
                  )}

                  {iv.status === "completed" && (
                    <div style={{ marginTop: 12 }}>
                      <div
                        style={{
                          borderLeft: "2px solid var(--amber)",
                          paddingLeft: 12,
                          marginBottom: 14,
                        }}
                      >
                        <div className="muted" style={{ fontSize: 12.5 }}>
                          Mentor&apos;s feedback
                          {iv.score != null && (
                            <>
                              {" "}
                              ·{" "}
                              <b style={{ color: "var(--amber)" }}>
                                {iv.score}/10
                              </b>
                            </>
                          )}
                        </div>
                        <div style={{ fontSize: 13.5, marginTop: 4 }}>
                          {iv.notes || "No written feedback."}
                        </div>
                      </div>

                      <div className="field">
                        <label>Your feedback on this interview</label>
                        <textarea
                          value={draft.feedback}
                          onChange={(e) =>
                            setFbDraft({
                              ...fbDraft,
                              [iv.id]: { ...draft, feedback: e.target.value },
                            })
                          }
                          placeholder="How did it go for you? What will you work on?"
                        />
                      </div>
                      <div className="field" style={{ maxWidth: 200 }}>
                        <label>Your self-rating (/10)</label>
                        <input
                          type="number"
                          min={0}
                          max={10}
                          step={0.5}
                          value={draft.self}
                          onChange={(e) =>
                            setFbDraft({
                              ...fbDraft,
                              [iv.id]: { ...draft, self: e.target.value },
                            })
                          }
                        />
                      </div>
                      <button
                        className="btn btn-sm"
                        disabled={fbSavingId === iv.id || !draft.feedback.trim()}
                        onClick={() => handleSubmitFeedback(iv.id)}
                      >
                        {fbSavingId === iv.id
                          ? "Saving..."
                          : iv.candidate_feedback
                            ? "Update my feedback"
                            : "Submit my feedback"}
                      </button>
                    </div>
                  )}
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
