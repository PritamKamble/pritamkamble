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

const TABS = ["applicants", "candidates", "interviews", "dailylogs"] as const;
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
        <div
          className={`tabbtn ${tab === "applicants" ? "active" : ""}`}
          onClick={() => setTab("applicants")}
        >
          Applicants
        </div>
        <div
          className={`tabbtn ${tab === "candidates" ? "active" : ""}`}
          onClick={() => setTab("candidates")}
        >
          Candidates
        </div>
        <div
          className={`tabbtn ${tab === "interviews" ? "active" : ""}`}
          onClick={() => setTab("interviews")}
        >
          Interviews
        </div>
        <div
          className={`tabbtn ${tab === "dailylogs" ? "active" : ""}`}
          onClick={() => setTab("dailylogs")}
        >
          Daily Logs
        </div>
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
                          <td>{r.name || "—"}</td>
                          <td>{r.phone || "—"}</td>
                          <td>{r.college_or_company || "—"}</td>
                          <td>{r.track || "—"}</td>
                          <td>{r.level || "—"}</td>
                          <td>
                            <select
                              value={r.status}
                              onChange={(e) => handleApplicantStatusChange(r.id, e.target.value)}
                              style={{ fontSize: 12.5, padding: "4px 6px" }}
                            >
                              <option value="waiting">Waiting</option>
                              <option value="contacted">Contacted</option>
                              <option value="enrolled">Enrolled</option>
                              <option value="closed">Closed</option>
                            </select>
                          </td>
                          <td className="muted">{r.referral_code || "—"}</td>
                          <td className="muted">{r.referred_by || "—"}</td>
                          <td className="muted">
                            {formatDateTime(r.created_at)}
                          </td>
                          <td>
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
            <div
              className={`tabbtn ${interviewFilter === "upcoming" ? "active" : ""}`}
              onClick={() => setInterviewFilter("upcoming")}
            >
              Upcoming
            </div>
            <div
              className={`tabbtn ${interviewFilter === "completed" ? "active" : ""}`}
              onClick={() => setInterviewFilter("completed")}
            >
              Completed
            </div>
            <div
              className={`tabbtn ${interviewFilter === "all" ? "active" : ""}`}
              onClick={() => setInterviewFilter("all")}
            >
              All
            </div>
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
    </div>
  );
}
