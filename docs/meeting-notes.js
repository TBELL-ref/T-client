/**
 * Meeting notes per company — DB-backed.
 */
(function () {
  const cache = new Map();

  function normalize(row = {}) {
    return {
      id: row.id,
      companyId: row.companyId ?? row.company_id,
      meetingAt: row.meetingAt ?? row.meeting_at ?? null,
      location: row.location ?? "",
      attendees: row.attendees ?? "",
      summary: row.summary ?? "",
      nextAction: row.nextAction ?? row.next_action ?? "",
      createdBy: row.createdBy ?? row.created_by ?? "",
      createdAt: row.createdAt ?? row.created_at ?? "",
      updatedAt: row.updatedAt ?? row.updated_at ?? ""
    };
  }

  async function loadForCompany(companyId, force = false) {
    if (!force && cache.has(companyId)) return cache.get(companyId);
    try {
      const rows = await window.TSupabase.getMeetingNotes(companyId);
      const list = (Array.isArray(rows) ? rows : []).map(normalize);
      cache.set(companyId, list);
      return list;
    } catch (err) {
      console.warn("[meeting-notes] load failed", err);
      return cache.get(companyId) ?? [];
    }
  }

  async function upsert(companyId, patch) {
    const result = await window.TSupabase.upsertMeetingNote({ companyId, ...patch });
    cache.delete(companyId);
    return normalize(result);
  }

  async function remove(noteId, companyId) {
    await window.TSupabase.deleteMeetingNote(noteId);
    cache.delete(companyId);
  }

  function latestSummary(notes = []) {
    const sorted = [...notes].sort((a, b) => {
      const ta = Date.parse(a.meetingAt ?? "") || 0;
      const tb = Date.parse(b.meetingAt ?? "") || 0;
      return tb - ta;
    });
    const top = sorted[0];
    if (!top) return "";
    return top.nextAction || top.summary || "";
  }

  window.TMeetingNotes = {
    loadForCompany,
    upsert,
    remove,
    latestSummary,
    normalize
  };
})();
