"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PortalHeader } from "@/components/PortalHeader";
import { formatDate, formatDateTime } from "@/lib/formatDate";
import { computeReadinessScore } from "@/lib/readiness";

type Profile = { id: string; full_name: string; role: string };
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
type ProjectLink = { label: string; url: string };
type Candidate = {
  user_id: string;
  track: string | null;
  level: string | null;
  weeks_completed: number | null;
  dsa_solved: number | null;
  mock_score: number | null;
  resume_url: string | null;
  project_links: ProjectLink[] | null;
  profiles: { full_name: string; email: string } | null;
};
type Interview = {
  id: string;
  candidate_id: string;
  scheduled_at: string;
  status: string;
  score: number | null;
  notes: string | null;
  meeting_link: string | null;
  profiles: { full_name: string; email: string } | null;
};

type DailyLog = {
  id: string;
  candidate_id: string;
  log_date: string;
  content: string;
  profiles: { full_name: string; email: string } | null;
};

type Employer = {
  id: string;
  full_name: string;
  email: string;
  company_name: string | null;
  admin_notes: string | null;
  last_contacted_at: string | null;
  follow_up_due: string | null;
};

type BlogSource = { title: string; url: string; snippet: string };
type BlogPost = {
  id: string;
  title: string;
  slug: string;
  summary: string;
  content: string;
  blog_type: string;
  sources: BlogSource[];
  status: string;
  created_at: string;
};

const TABS = ["applicants", "candidates", "interviews", "dailylogs", "employers", "blog"] as const;
type Tab = (typeof TABS)[number];

export default function AdminPage() {
  const supabase = createClient();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [tab, setTab] = useState<Tab>("applicants");

  const [applicants, setApplicants] = useState<Applicant[] | null>(null);
  const [applicantsError, setApplicantsError] = useState("");

  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [scheduleFor, setScheduleFor] = useState<string | null>(null);
  const [scheduleAt, setScheduleAt] = useState("");
  const [scheduleNotes, setScheduleNotes] = useState("");
  const [scheduleMeetingLink, setScheduleMeetingLink] = useState("");
  const [scheduleToast, setScheduleToast] = useState("");

  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [interviewFilter, setInterviewFilter] = useState<
    "upcoming" | "completed" | "all"
  >("upcoming");
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [completeScore, setCompleteScore] = useState("");
  const [completeNotes, setCompleteNotes] = useState("");

  const [dailyLogs, setDailyLogs] = useState<DailyLog[]>([]);

  const [employers, setEmployers] = useState<Employer[]>([]);
  const [editingEmployerId, setEditingEmployerId] = useState<string | null>(null);
  const [draftNotes, setDraftNotes] = useState("");
  const [draftFollowUp, setDraftFollowUp] = useState("");

  const [blogPosts, setBlogPosts] = useState<BlogPost[]>([]);
  const [blogFilter, setBlogFilter] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const [expandedBlogId, setExpandedBlogId] = useState<string | null>(null);

  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteMsg, setInviteMsg] = useState<{ type: "error" | "ok"; text: string } | null>(
    null,
  );

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviting(true);
    setInviteMsg(null);
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const { data, error } = await supabase.functions.invoke("invite-candidate", {
      body: { email: inviteEmail.trim(), full_name: inviteName.trim() },
      headers: { Authorization: `Bearer ${session?.access_token}` },
    });
    setInviting(false);
    if (error || data?.error) {
      setInviteMsg({ type: "error", text: data?.error || error?.message || "Invite failed." });
      return;
    }
    setInviteMsg({ type: "ok", text: `Invite sent to ${inviteEmail}.` });
    setInviteName("");
    setInviteEmail("");
  }

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data: p } = await supabase
        .from("profiles")
        .select("id, full_name, role")
        .eq("id", user.id)
        .single();
      setProfile(p);
      loadApplicants();
      loadCandidates();
      loadInterviews();
      loadDailyLogs();
      loadEmployers();
      loadBlogPosts();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadApplicants() {
    setApplicantsError("");
    const { data, error } = await supabase
      .from("applicants")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      setApplicantsError(`Couldn't load applicants: ${error.message}`);
      return;
    }
    setApplicants(data || []);
  }

  async function handleApplicantStatusChange(id: string, status: string) {
    const { error } = await supabase.from("applicants").update({ status }).eq("id", id);
    if (!error) {
      setApplicants((prev) => (prev ? prev.map((a) => (a.id === id ? { ...a, status } : a)) : prev));
    }
  }

  async function loadCandidates() {
    const { data } = await supabase
      .from("candidate_profiles")
      .select("*, profiles(full_name, email)")
      .order("updated_at", { ascending: false });
    setCandidates((data as unknown as Candidate[]) || []);
  }

  async function loadInterviews() {
    const { data } = await supabase
      .from("interviews")
      .select("*, profiles!interviews_candidate_id_fkey(full_name, email)")
      .order("scheduled_at", { ascending: true });
    setInterviews((data as unknown as Interview[]) || []);
  }

  async function loadDailyLogs() {
    const { data } = await supabase
      .from("daily_logs")
      .select("id, candidate_id, log_date, content, profiles!daily_logs_candidate_id_fkey(full_name, email)")
      .order("log_date", { ascending: false });
    setDailyLogs((data as unknown as DailyLog[]) || []);
  }

  async function loadEmployers() {
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name, email, company_name, admin_notes, last_contacted_at, follow_up_due")
      .eq("role", "hr")
      .order("full_name");
    setEmployers((data as unknown as Employer[]) || []);
  }

  async function handleMarkContacted(id: string) {
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("profiles")
      .update({ last_contacted_at: now })
      .eq("id", id);
    if (!error) {
      setEmployers((prev) => prev.map((e) => (e.id === id ? { ...e, last_contacted_at: now } : e)));
    }
  }

  function startEditingEmployer(e: Employer) {
    setEditingEmployerId(e.id);
    setDraftNotes(e.admin_notes || "");
    setDraftFollowUp(e.follow_up_due || "");
  }

  async function handleSaveEmployer(id: string) {
    const { error } = await supabase
      .from("profiles")
      .update({ admin_notes: draftNotes.trim() || null, follow_up_due: draftFollowUp || null })
      .eq("id", id);
    if (!error) {
      setEmployers((prev) =>
        prev.map((e) =>
          e.id === id ? { ...e, admin_notes: draftNotes.trim() || null, follow_up_due: draftFollowUp || null } : e,
        ),
      );
      setEditingEmployerId(null);
    }
  }

  async function loadBlogPosts() {
    const { data } = await supabase
      .from("blog_posts")
      .select("*")
      .order("created_at", { ascending: false });
    setBlogPosts((data as unknown as BlogPost[]) || []);
  }

  async function handleBlogReview(id: string, status: "approved" | "rejected") {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("blog_posts")
      .update({ status, reviewed_by: user?.id, reviewed_at: new Date().toISOString() })
      .eq("id", id);
    if (!error) {
      setBlogPosts((prev) => prev.map((p) => (p.id === id ? { ...p, status } : p)));
    }
  }

  async function handleSchedule(candidateId: string) {
    if (!profile || !scheduleAt) return;
    const { error } = await supabase.from("interviews").insert({
      candidate_id: candidateId,
      interviewer_id: profile.id,
      scheduled_at: new Date(scheduleAt).toISOString(),
      notes: scheduleNotes.trim() || null,
      meeting_link: scheduleMeetingLink.trim() || null,
    });
    setScheduleToast(error ? `Error: ${error.message}` : "Interview scheduled ✓");
    if (!error) {
      setScheduleFor(null);
      setScheduleAt("");
      setScheduleNotes("");
      setScheduleMeetingLink("");
      loadInterviews();
    }
    setTimeout(() => setScheduleToast(""), 2500);
  }

  async function handleComplete(interviewId: string) {
    const { error } = await supabase
      .from("interviews")
      .update({
        status: "completed",
        score: completeScore ? parseFloat(completeScore) : null,
        notes: completeNotes.trim() || null,
      })
      .eq("id", interviewId);
    if (!error) {
      setCompletingId(null);
      setCompleteScore("");
      setCompleteNotes("");
      loadInterviews();
    }
  }

  const filteredInterviews = interviews.filter((i) => {
    if (interviewFilter === "all") return true;
    if (interviewFilter === "completed") return i.status === "completed";
    return i.status === "scheduled";
  });

  function readinessFor(candidateUserId: string) {
    const logsForCandidate = dailyLogs
      .filter((l) => l.candidate_id === candidateUserId)
      .sort((a, b) => a.log_date.localeCompare(b.log_date));
    const completedScores = interviews
      .filter((i) => i.candidate_id === candidateUserId && i.status === "completed" && i.score != null)
      .map((i) => i.score as number);
    return computeReadinessScore(
      logsForCandidate.length,
      logsForCandidate[0]?.log_date || null,
      completedScores,
    );
  }

  const counts = (applicants || []).reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="wrap">
      {profile && <PortalHeader name={profile.full_name} role={profile.role} />}

      <div className="tabs">
        <button
          type="button"
          className={`tabbtn ${tab === "applicants" ? "active" : ""}`}
          onClick={() => setTab("applicants")}
        >
          Applicants
        </button>
        <button
          type="button"
          className={`tabbtn ${tab === "candidates" ? "active" : ""}`}
          onClick={() => setTab("candidates")}
        >
          Candidates
        </button>
        <button
          type="button"
          className={`tabbtn ${tab === "interviews" ? "active" : ""}`}
          onClick={() => setTab("interviews")}
        >
          Interviews
        </button>
        <button
          type="button"
          className={`tabbtn ${tab === "dailylogs" ? "active" : ""}`}
          onClick={() => setTab("dailylogs")}
        >
          Daily Logs
        </button>
        <button
          type="button"
          className={`tabbtn ${tab === "employers" ? "active" : ""}`}
          onClick={() => setTab("employers")}
        >
          Employers
        </button>
        <button
          type="button"
          className={`tabbtn ${tab === "blog" ? "active" : ""}`}
          onClick={() => setTab("blog")}
        >
          Blog{blogPosts.filter((p) => p.status === "pending").length > 0 &&
            ` (${blogPosts.filter((p) => p.status === "pending").length})`}
        </button>
      </div>

      {tab === "applicants" && (
        <>
          <div className="card" style={{ marginBottom: 20 }}>
            <h2>Invite a candidate</h2>
            <div className="muted" style={{ fontSize: 12.5, marginBottom: 14 }}>
              Candidate accounts are invite-only. Sends a sign-in link to their
              email - no password to set.
            </div>
            <form onSubmit={handleInvite} style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
              <div className="field" style={{ marginBottom: 0, flex: 1, minWidth: 180 }}>
                <label>Full name</label>
                <input
                  type="text"
                  required
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                />
              </div>
              <div className="field" style={{ marginBottom: 0, flex: 1, minWidth: 200 }}>
                <label>Email</label>
                <input
                  type="email"
                  required
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                />
              </div>
              <button className="btn btn-sm" type="submit" disabled={inviting}>
                {inviting ? "Sending..." : "Send invite"}
              </button>
            </form>
            {inviteMsg && <div className={`msg ${inviteMsg.type}`}>{inviteMsg.text}</div>}
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
            {applicantsError ? (
              <div className="empty">{applicantsError}</div>
            ) : applicants === null ? (
              <div className="empty">Loading…</div>
            ) : applicants.length === 0 ? (
              <div className="empty">No applicants yet.</div>
            ) : (
              <table className="responsive-table">
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
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {[...applicants]
                    .sort(
                      (a, b) =>
                        new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
                    )
                    .map((r, i) => ({ ...r, position: i + 1 }))
                    .sort(
                      (a, b) =>
                        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
                    )
                    .map((r) => {
                      const firstName = (r.name || "there").trim().split(/\s+/)[0];
                      const waText = encodeURIComponent(
                        `Hey ${firstName}! Got your application — you're #${r.position} in line for the Full-Stack + GenAI batch.\n\nQuick q before we hop on a call: what's pulling you toward this — first dev role, or switching from something else?`,
                      );
                      const phoneDigits = (r.phone || "").replace(/\D/g, "");
                      return (
                        <tr key={r.id}>
                          <td data-label="Name">{r.name || "—"}</td>
                          <td data-label="Phone">{r.phone || "—"}</td>
                          <td data-label="College / Company">{r.college_or_company || "—"}</td>
                          <td data-label="Track">{r.track || "—"}</td>
                          <td data-label="Level">{r.level || "—"}</td>
                          <td data-label="Status">
                            <select
                              className="select-sm"
                              value={r.status}
                              onChange={(e) => handleApplicantStatusChange(r.id, e.target.value)}
                            >
                              <option value="waiting">Waiting</option>
                              <option value="contacted">Contacted</option>
                              <option value="enrolled">Enrolled</option>
                              <option value="closed">Closed</option>
                            </select>
                          </td>
                          <td className="muted" data-label="Referral code">{r.referral_code || "—"}</td>
                          <td className="muted" data-label="Referred by">{r.referred_by || "—"}</td>
                          <td className="muted" data-label="Applied">
                            {formatDateTime(r.created_at)}
                          </td>
                          <td data-label="">
                            {phoneDigits && (
                              <a
                                className="btn-ghost btn-sm"
                                href={`https://wa.me/${phoneDigits}?text=${waText}`}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                Message
                              </a>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {tab === "candidates" && (
        <div className="card" style={{ overflowX: "auto" }}>
          {candidates.length === 0 ? (
            <div className="empty">No candidate profiles yet.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Track / Level</th>
                  <th>Progress</th>
                  <th>Mock</th>
                  <th>Readiness</th>
                  <th>Projects</th>
                  <th>Resume</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {candidates.map((c) => (
                  <>
                    <tr key={c.user_id}>
                      <td>
                        {c.profiles?.full_name || "—"}
                        <br />
                        <span className="muted">{c.profiles?.email || ""}</span>
                      </td>
                      <td>
                        {c.track || "—"}
                        <br />
                        <span className="muted">{c.level || ""}</span>
                      </td>
                      <td>
                        {c.weeks_completed || 0}/24 wks · {c.dsa_solved || 0} DSA
                      </td>
                      <td>{c.mock_score != null ? `${c.mock_score}/10` : "—"}</td>
                      <td>
                        {(() => {
                          const r = readinessFor(c.user_id);
                          return (
                            <span
                              style={{
                                fontFamily: "var(--mono)",
                                color:
                                  r.score >= 70
                                    ? "var(--green)"
                                    : r.score >= 40
                                      ? "var(--amber)"
                                      : "var(--rust)",
                              }}
                            >
                              {r.score}/100
                            </span>
                          );
                        })()}
                      </td>
                      <td>
                        {c.project_links && c.project_links.length > 0 ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                            {c.project_links.map((link, i) => (
                              <a
                                key={i}
                                href={link.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ color: "var(--amber)" }}
                              >
                                {link.label || "Link"} →
                              </a>
                            ))}
                          </div>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td>
                        {c.resume_url ? (
                          <a
                            href={c.resume_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: "var(--amber)" }}
                          >
                            View →
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>
                        <button
                          className="btn-ghost btn-sm"
                          onClick={() =>
                            setScheduleFor(
                              scheduleFor === c.user_id ? null : c.user_id,
                            )
                          }
                        >
                          {scheduleFor === c.user_id ? "Cancel" : "Schedule interview"}
                        </button>
                      </td>
                    </tr>
                    {scheduleFor === c.user_id && (
                      <tr>
                        <td colSpan={7}>
                          <div
                            style={{
                              display: "flex",
                              gap: 10,
                              alignItems: "flex-end",
                              flexWrap: "wrap",
                              padding: "10px 0",
                            }}
                          >
                            <div className="field" style={{ marginBottom: 0 }}>
                              <label>When</label>
                              <input
                                type="datetime-local"
                                value={scheduleAt}
                                onChange={(e) => setScheduleAt(e.target.value)}
                              />
                            </div>
                            <div
                              className="field"
                              style={{ marginBottom: 0, flex: 1, minWidth: 200 }}
                            >
                              <label>Notes (optional)</label>
                              <input
                                type="text"
                                value={scheduleNotes}
                                onChange={(e) => setScheduleNotes(e.target.value)}
                                placeholder="What to cover, panel, etc."
                              />
                            </div>
                            <div
                              className="field"
                              style={{ marginBottom: 0, flex: 1, minWidth: 200 }}
                            >
                              <label>Meeting link (optional)</label>
                              <input
                                type="url"
                                value={scheduleMeetingLink}
                                onChange={(e) => setScheduleMeetingLink(e.target.value)}
                                placeholder="Zoom / Google Meet link"
                              />
                            </div>
                            <button
                              className="btn btn-sm"
                              disabled={!scheduleAt}
                              onClick={() => handleSchedule(c.user_id)}
                            >
                              Confirm
                            </button>
                          </div>
                          {scheduleToast && (
                            <div className="muted" style={{ color: "var(--green)" }}>
                              {scheduleToast}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === "interviews" && (
        <>
          <div className="tabs">
            <button
              type="button"
              className={`tabbtn ${interviewFilter === "upcoming" ? "active" : ""}`}
              onClick={() => setInterviewFilter("upcoming")}
            >
              Upcoming
            </button>
            <button
              type="button"
              className={`tabbtn ${interviewFilter === "completed" ? "active" : ""}`}
              onClick={() => setInterviewFilter("completed")}
            >
              Completed
            </button>
            <button
              type="button"
              className={`tabbtn ${interviewFilter === "all" ? "active" : ""}`}
              onClick={() => setInterviewFilter("all")}
            >
              All
            </button>
          </div>

          <div className="card" style={{ overflowX: "auto" }}>
            {filteredInterviews.length === 0 ? (
              <div className="empty">No interviews here.</div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Candidate</th>
                    <th>Scheduled</th>
                    <th>Status</th>
                    <th>Score</th>
                    <th>Notes</th>
                    <th>Call</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredInterviews.map((i) => (
                    <>
                      <tr key={i.id}>
                        <td>
                          {i.profiles?.full_name || "—"}
                          <br />
                          <span className="muted">{i.profiles?.email || ""}</span>
                        </td>
                        <td>{formatDateTime(i.scheduled_at)}</td>
                        <td>{i.status}</td>
                        <td>{i.score != null ? i.score : "—"}</td>
                        <td className="muted">{i.notes || "—"}</td>
                        <td>
                          {i.meeting_link ? (
                            <a
                              href={i.meeting_link}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ color: "var(--amber)" }}
                            >
                              Join →
                            </a>
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                        <td>
                          {i.status === "scheduled" && (
                            <button
                              className="btn-ghost btn-sm"
                              onClick={() => {
                                const opening = completingId !== i.id;
                                setCompletingId(opening ? i.id : null);
                                setCompleteNotes(opening ? i.notes || "" : "");
                                setCompleteScore("");
                              }}
                            >
                              {completingId === i.id ? "Cancel" : "Mark complete"}
                            </button>
                          )}
                        </td>
                      </tr>
                      {completingId === i.id && (
                        <tr>
                          <td colSpan={7}>
                            <div
                              style={{
                                display: "flex",
                                gap: 10,
                                alignItems: "flex-end",
                                flexWrap: "wrap",
                                padding: "10px 0",
                              }}
                            >
                              <div className="field" style={{ marginBottom: 0 }}>
                                <label>Score (/10)</label>
                                <input
                                  type="number"
                                  min={0}
                                  max={10}
                                  step={0.5}
                                  value={completeScore}
                                  onChange={(e) => setCompleteScore(e.target.value)}
                                  style={{ width: 90 }}
                                />
                              </div>
                              <div
                                className="field"
                                style={{ marginBottom: 0, flex: 1, minWidth: 200 }}
                              >
                                <label>Notes</label>
                                <input
                                  type="text"
                                  value={completeNotes}
                                  onChange={(e) => setCompleteNotes(e.target.value)}
                                  placeholder="Evaluation notes"
                                />
                              </div>
                              <button
                                className="btn btn-sm"
                                onClick={() => handleComplete(i.id)}
                              >
                                Save
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {tab === "dailylogs" && (
        <div className="card" style={{ overflowX: "auto" }}>
          {dailyLogs.length === 0 ? (
            <div className="empty">No daily logs yet.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Candidate</th>
                  <th>Date</th>
                  <th>What they worked on</th>
                </tr>
              </thead>
              <tbody>
                {dailyLogs.map((l) => (
                  <tr key={l.id}>
                    <td>
                      {l.profiles?.full_name || "—"}
                      <br />
                      <span className="muted">{l.profiles?.email || ""}</span>
                    </td>
                    <td className="muted">{formatDate(l.log_date)}</td>
                    <td>{l.content}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === "employers" && (
        <div className="card" style={{ overflowX: "auto" }}>
          {employers.length === 0 ? (
            <div className="empty">No employer accounts yet.</div>
          ) : (
            <table className="responsive-table">
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Contact</th>
                  <th>Last contacted</th>
                  <th>Follow-up due</th>
                  <th>Notes</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {employers.map((e) => {
                  const overdue = e.follow_up_due && e.follow_up_due < new Date().toISOString().slice(0, 10);
                  return (
                    <tr key={e.id}>
                      <td data-label="Company">{e.company_name || "—"}</td>
                      <td data-label="Contact">
                        {e.full_name || "—"}
                        <br />
                        <span className="muted">{e.email}</span>
                      </td>
                      <td data-label="Last contacted" className="muted">
                        {e.last_contacted_at ? formatDateTime(e.last_contacted_at) : "Never"}
                      </td>
                      <td data-label="Follow-up due" style={overdue ? { color: "var(--rust)" } : undefined}>
                        {e.follow_up_due ? formatDate(e.follow_up_due) : "—"}
                      </td>
                      <td data-label="Notes" style={{ maxWidth: 220, whiteSpace: "pre-wrap" }}>
                        {editingEmployerId === e.id ? null : e.admin_notes || "—"}
                      </td>
                      <td data-label="">
                        {editingEmployerId === e.id ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 200 }}>
                            <textarea
                              value={draftNotes}
                              onChange={(ev) => setDraftNotes(ev.target.value)}
                              placeholder="Notes..."
                              style={{
                                width: "100%",
                                minHeight: 60,
                                background: "var(--bg)",
                                border: "1px solid var(--line)",
                                borderRadius: 6,
                                padding: "6px 8px",
                                color: "var(--ink)",
                                fontFamily: "var(--sans)",
                                fontSize: 12.5,
                              }}
                            />
                            <input
                              type="date"
                              className="select-sm"
                              value={draftFollowUp}
                              onChange={(ev) => setDraftFollowUp(ev.target.value)}
                            />
                            <div style={{ display: "flex", gap: 6 }}>
                              <button
                                className="btn btn-sm"
                                type="button"
                                onClick={() => handleSaveEmployer(e.id)}
                              >
                                Save
                              </button>
                              <button
                                className="btn-ghost btn-sm"
                                type="button"
                                onClick={() => setEditingEmployerId(null)}
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            <button
                              className="btn-ghost btn-sm"
                              type="button"
                              onClick={() => handleMarkContacted(e.id)}
                            >
                              Mark contacted
                            </button>
                            <button
                              className="btn-ghost btn-sm"
                              type="button"
                              onClick={() => startEditingEmployer(e)}
                            >
                              Edit
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === "blog" && (
        <>
          <div className="tabs">
            {(["pending", "approved", "rejected", "all"] as const).map((f) => (
              <button
                key={f}
                type="button"
                className={`tabbtn ${blogFilter === f ? "active" : ""}`}
                onClick={() => setBlogFilter(f)}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
          <div className="card">
            {(() => {
              const filtered =
                blogFilter === "all" ? blogPosts : blogPosts.filter((p) => p.status === blogFilter);
              if (filtered.length === 0) {
                return <div className="empty">No {blogFilter === "all" ? "" : blogFilter} posts.</div>;
              }
              return filtered.map((post) => (
                <div
                  key={post.id}
                  style={{
                    border: "1px solid var(--line)",
                    borderRadius: 8,
                    padding: 16,
                    marginBottom: 12,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <div>
                      <h3 style={{ fontFamily: "var(--mono)", fontSize: 14.5, marginBottom: 4 }}>
                        {post.title}
                      </h3>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {post.blog_type} · {formatDate(post.created_at)} ·{" "}
                        <span
                          style={{
                            color:
                              post.status === "approved"
                                ? "var(--green)"
                                : post.status === "rejected"
                                  ? "var(--rust)"
                                  : "var(--amber)",
                          }}
                        >
                          {post.status}
                        </span>
                      </div>
                    </div>
                    {post.status === "pending" && (
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          className="btn btn-sm"
                          type="button"
                          onClick={() => handleBlogReview(post.id, "approved")}
                        >
                          Approve
                        </button>
                        <button
                          className="btn-ghost btn-sm"
                          type="button"
                          onClick={() => handleBlogReview(post.id, "rejected")}
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                  <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 8 }}>{post.summary}</p>
                  <button
                    className="btn-ghost btn-sm"
                    type="button"
                    style={{ marginTop: 8 }}
                    onClick={() => setExpandedBlogId(expandedBlogId === post.id ? null : post.id)}
                  >
                    {expandedBlogId === post.id ? "Hide full post" : "View full post"}
                  </button>
                  {expandedBlogId === post.id && (
                    <div style={{ marginTop: 12 }}>
                      <div
                        style={{
                          whiteSpace: "pre-wrap",
                          fontSize: 13.5,
                          lineHeight: 1.7,
                          background: "var(--bg)",
                          border: "1px solid var(--line)",
                          borderRadius: 6,
                          padding: 14,
                        }}
                      >
                        {post.content}
                      </div>
                      {post.sources.length > 0 && (
                        <div style={{ marginTop: 10 }}>
                          <div className="muted" style={{ fontSize: 11.5, marginBottom: 4 }}>
                            SOURCES
                          </div>
                          <ul style={{ paddingLeft: 18, fontSize: 12.5 }}>
                            {post.sources.map((s, i) => (
                              <li key={i}>
                                <a href={s.url} target="_blank" rel="noopener noreferrer">
                                  {s.title}
                                </a>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ));
            })()}
          </div>
        </>
      )}
    </div>
  );
}
