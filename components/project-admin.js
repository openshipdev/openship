"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export default function ProjectAdmin({ project: p }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function update(data, refresh = false) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(
        `/api/projects/${p.id}${refresh ? "/refresh" : ""}`,
        {
          method: refresh ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          ...(refresh ? {} : { body: JSON.stringify(data) }),
        },
      );
      const result = await response.json();
      if (!response.ok) throw Error(result.error);
      setMessage(refresh ? "Refresh queued." : "Saved.");
      router.refresh();
    } catch (e) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="project-admin">
      <label>
        Homepage slot{" "}
        <select
          disabled={busy}
          value={p.featuredPosition || ""}
          onChange={(e) =>
            update({
              featuredPosition: e.target.value ? Number(e.target.value) : null,
            })
          }
        >
          <option value="">None</option>
          {[1, 2, 3].map((n) => (
            <option key={n}>{n}</option>
          ))}
        </select>
      </label>
      {[
        ["isTop", "Top"],
        ["isPromoted", "Promoted"],
        ["hidden", "Hidden"],
      ].map(([key, label]) => (
        <label key={key}>
          <input
            type="checkbox"
            checked={p[key]}
            disabled={busy}
            onChange={(e) => update({ [key]: e.target.checked })}
          />
          {label}
        </label>
      ))}
      <button disabled={busy} onClick={() => update(null, true)}>
        Refresh
      </button>
      <span role="status">{message}</span>
    </div>
  );
}
