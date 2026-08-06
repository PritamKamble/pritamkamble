"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PortalHeader } from "@/components/PortalHeader";

type Profile = { id: string; full_name: string; role: string };
type Job = {
  id: string;
  title: string;
  company: string;
  location: string | null;
  employment_type: string;
  description: string;
  job_applications?: { id: string }[];
};
type JobApplication = {
  id: string;
  status: string;
  profiles: { full_name: string; email: string } | null;
};
type Candidate = {
  user_id: string;
  track: string | null;
  level: string | null;
  weeks_completed: number | null;
  dsa_solved: number | null;
  mock_score: number | null;
  resume_url: string | null;
  profiles: { full_name: string; email: string } | null;
};

const TABS = ["post", "myJobs", "candidates"] as const;
type Tab = (typeof TABS)[number];

export default function HrPage() {
  const supabase = createClient();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [tab, setTab] = useState<Tab>("post");

  const [jTitle, setJTitle] = useState("");
  const [jCompany, setJCompany] = useState("");
  const [jLocation, setJLocation] = useState("");
  const [jType, setJType] = useState("full_time");
  const [jDesc, setJDesc] = useState("");
  const [jobToast, setJobToast] = useState("");

  const [hrJobs, setHrJobs] = useState<Job[]>([]);
  const [jobApplications, setJobApplications] = useState<
    Record<string, JobApplication[]>
  >({});
  const [candidates, setCandidates] = useState<Candidate[]>([]);

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
      loadHrJobs(user.id);
      loadCandidates();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadHrJobs(hrId: string) {
    const { data } = await supabase
      .from("jobs")
      .select("*, job_applications(id)")
      .eq("hr_id", hrId)
      .order("created_at", { ascending: false });
    setHrJobs(data || []);
    (data || []).forEach((j) => loadJobApplications(j.id));
  }

  async function loadJobApplications(jobId: string) {
    const { data } = await supabase
      .from("job_applications")
      .select("*, profiles(full_name, email)")
      .eq("job_id", jobId);
    setJobApplications((prev) => ({
      ...prev,
      [jobId]: (data as unknown as JobApplication[]) || [],
    }));
  }

  async function loadCandidates() {
    const { data } = await supabase
      .from("candidate_profiles")
      .select("*, profiles(full_name, email)")
      .order("updated_at", { ascending: false });
    setCandidates((data as unknown as Candidate[]) || []);
  }

  async function handleJobSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;
    const { error } = await supabase.from("jobs").insert({
      hr_id: profile.id,
      title: jTitle.trim(),
      company: jCompany.trim(),
      location: jLocation.trim() || null,
      employment_type: jType,
      description: jDesc.trim(),
    });
    setJobToast(error ? `Error: ${error.message}` : "Posted ✓");
    if (!error) {
      setJTitle("");
      setJCompany("");
      setJLocation("");
      setJType("full_time");
      setJDesc("");
      loadHrJobs(profile.id);
    }
    setTimeout(() => setJobToast(""), 2500);
  }

  async function handleStatusChange(applicationId: string, status: string) {
    await supabase
      .from("job_applications")
      .update({ status })
      .eq("id", applicationId);
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
          className={`tabbtn ${tab === "post" ? "active" : ""}`}
          onClick={() => setTab("post")}
        >
          Post a Job
        </div>
        <div
          className={`tabbtn ${tab === "myJobs" ? "active" : ""}`}
          onClick={() => setTab("myJobs")}
        >
          My Jobs
        </div>
        <div
          className={`tabbtn ${tab === "candidates" ? "active" : ""}`}
          onClick={() => setTab("candidates")}
        >
          Browse Candidates
        </div>
      </div>

      {tab === "post" && (
        <div className="card">
          <h2>Post a new job</h2>
          <form onSubmit={handleJobSubmit}>
            <div className="row2">
              <div className="field">
                <label>Job title</label>
                <input
                  type="text"
                  required
                  value={jTitle}
                  onChange={(e) => setJTitle(e.target.value)}
                />
              </div>
              <div className="field">
                <label>Company</label>
                <input
                  type="text"
                  required
                  value={jCompany}
                  onChange={(e) => setJCompany(e.target.value)}
                />
              </div>
            </div>
            <div className="row2">
              <div className="field">
                <label>Location</label>
                <input
                  type="text"
                  placeholder="Remote, Mumbai, etc."
                  value={jLocation}
                  onChange={(e) => setJLocation(e.target.value)}
                />
              </div>
              <div className="field">
                <label>Employment type</label>
                <select value={jType} onChange={(e) => setJType(e.target.value)}>
                  <option value="full_time">Full-time</option>
                  <option value="internship">Internship</option>
                  <option value="contract">Contract</option>
                </select>
              </div>
            </div>
            <div className="field">
              <label>Description</label>
              <textarea
                required
                placeholder="Role, requirements, how to stand out..."
                value={jDesc}
                onChange={(e) => setJDesc(e.target.value)}
              />
            </div>
            <button className="btn" type="submit">
              Post job
            </button>
            {jobToast && (
              <div className="muted" style={{ marginTop: 8, color: "var(--green)" }}>
                {jobToast}
              </div>
            )}
          </form>
        </div>
      )}

      {tab === "myJobs" && (
        <div className="card">
          <h2>Jobs you&apos;ve posted</h2>
          {hrJobs.length === 0 ? (
            <div className="empty">You haven&apos;t posted any jobs yet.</div>
          ) : (
            hrJobs.map((j) => (
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
                  {j.location || ""} · {j.job_applications?.length || 0}{" "}
                  {j.job_applications?.length === 1 ? "applicant" : "applicants"}
                </div>
                {(jobApplications[j.id] || []).length === 0 ? (
                  <div className="muted">No applicants yet.</div>
                ) : (
                  <table>
                    <thead>
                      <tr>
                        <th>Candidate</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {jobApplications[j.id].map((a) => (
                        <tr key={a.id}>
                          <td>
                            {a.profiles?.full_name || "—"}
                            <br />
                            <span className="muted">{a.profiles?.email || ""}</span>
                          </td>
                          <td>
                            <select
                              value={a.status}
                              onChange={(e) =>
                                handleStatusChange(a.id, e.target.value)
                              }
                            >
                              <option value="applied">Applied</option>
                              <option value="shortlisted">Shortlisted</option>
                              <option value="rejected">Rejected</option>
                              <option value="hired">Hired</option>
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {tab === "candidates" && (
        <div className="card">
          <h2>Candidate pool</h2>
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
                  <th>Resume</th>
                </tr>
              </thead>
              <tbody>
                {candidates.map((c) => (
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
