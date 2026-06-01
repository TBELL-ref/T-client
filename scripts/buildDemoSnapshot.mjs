import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function act(proposal, meeting, inquiry) {
  return {
    proposal: { label: "제안", status: proposal },
    meeting: { label: "미팅", status: meeting },
    inquiry: { label: "문의", status: inquiry }
  };
}

function summary(actions) {
  return [actions.proposal, actions.meeting, actions.inquiry]
    .filter((a) => a.status === "추천")
    .map((a) => a.label)
    .join(" · ") || "보류";
}

const rows = [
  {
    companyId: "cmp_toss",
    companyName: "toss",
    companyNameKo: "토스",
    domain: "toss.im",
    lastCollectedAt: "2026-06-01T00:00:00.000Z",
    leadGrade: "A",
    priorityScore: "95",
    scoreReason: "domain:+15|email_high:+25|contact_secured:+20|posts_2plus:+20|qa_title:+15",
    contactSecured: "yes",
    email: "recruit@toss.im",
    emailConfidence: "high",
    excluded: false,
    actions: act("추천", "추천", "추천"),
    actionReasons: ["QA 공고 3건 확인.", "담당자 이메일 확보.", "제안·미팅·문의 모두 가능."],
    posts: [
      { id: "j1", title: "QA Automation Engineer", url: "https://toss.im/career/jobs/qa-automation", source: "generic", sourceLabel: "데모", status: "new", failureReason: "", failureCategory: "" },
      { id: "j2", title: "Senior QA Engineer (Platform)", url: "https://toss.im/career/jobs/senior-qa", source: "generic", sourceLabel: "데모", status: "new", failureReason: "", failureCategory: "" },
      { id: "j3", title: "QA Lead - Payments", url: "https://toss.im/career/jobs/qa-lead", source: "generic", sourceLabel: "데모", status: "new", failureReason: "", failureCategory: "" }
    ]
  },
  {
    companyId: "cmp_baemin",
    companyName: "baemin",
    companyNameKo: "배달의민족",
    domain: "woowahan.com",
    lastCollectedAt: "2026-06-01T00:00:00.000Z",
    leadGrade: "A",
    priorityScore: "88",
    scoreReason: "domain:+15|email_high:+25|contact_secured:+20|posts_2plus:+20|qa_title:+15",
    contactSecured: "yes",
    email: "jobs@woowahan.com",
    emailConfidence: "high",
    excluded: false,
    actions: act("추천", "추천", "추천"),
    actionReasons: ["QA·테스트 Automation 공고 2건.", "대형사라 Phase 2에서 감점 예정."],
    posts: [
      { id: "j4", title: "QA Engineer (Delivery App)", url: "https://career.woowahan.com/jobs/qa", source: "generic", sourceLabel: "데모", status: "new", failureReason: "", failureCategory: "" },
      { id: "j5", title: "Test Automation Engineer", url: "https://career.woowahan.com/jobs/ta", source: "generic", sourceLabel: "데모", status: "new", failureReason: "", failureCategory: "" }
    ]
  },
  {
    companyId: "cmp_karrot",
    companyName: "karrot",
    companyNameKo: "당근마켓",
    domain: "karrotmarket.com",
    lastCollectedAt: "2026-05-31T09:00:00.000Z",
    leadGrade: "A",
    priorityScore: "82",
    scoreReason: "domain:+15|email_medium:+15|contact_secured:+20|posts_2plus:+20|qa_title:+15",
    contactSecured: "yes",
    email: "recruit@daangn.com",
    emailConfidence: "medium",
    excluded: false,
    actions: act("추천", "추천", "추천"),
    actionReasons: ["QA·SDET 공고 확인.", "성장기업 우선순위 후보."],
    posts: [
      { id: "j6", title: "QA Engineer", url: "https://jobs.lever.co/karrot/qa", source: "lever", sourceLabel: "데모", status: "new", failureReason: "", failureCategory: "" },
      { id: "j7", title: "SDET - Marketplace", url: "https://jobs.lever.co/karrot/sdet", source: "lever", sourceLabel: "데모", status: "new", failureReason: "", failureCategory: "" }
    ]
  },
  {
    companyId: "cmp_sendbird",
    companyName: "sendbird",
    companyNameKo: "센드버드",
    domain: "sendbird.com",
    lastCollectedAt: "2026-05-31T09:00:00.000Z",
    leadGrade: "B",
    priorityScore: "65",
    scoreReason: "domain:+15|email_medium:+15|contact_secured:+20|posts_1:+10|qa_title:+15",
    contactSecured: "yes",
    email: "careers@sendbird.com",
    emailConfidence: "medium",
    excluded: false,
    actions: act("보류", "추천", "추천"),
    actionReasons: ["공고 1건 → 제안은 보류.", "담당자 확보 → 미팅·문의 추천."],
    posts: [
      { id: "j8", title: "Senior QA Engineer (Chat SDK)", url: "https://boards.greenhouse.io/sendbird/jobs/qa", source: "greenhouse", sourceLabel: "데모", status: "new", failureReason: "", failureCategory: "" }
    ]
  },
  {
    companyId: "cmp_29cm",
    companyName: "29cm",
    companyNameKo: "29CM",
    domain: "29cm.co.kr",
    lastCollectedAt: "2026-05-30T09:00:00.000Z",
    leadGrade: "B",
    priorityScore: "58",
    contactSecured: "yes",
    email: "hr@29cm.co.kr",
    emailConfidence: "medium",
    excluded: false,
    actions: act("보류", "추천", "추천"),
    actionReasons: ["이커머스 QA 1건.", "추가 공고 확인 후 제안 검토."],
    posts: [
      { id: "j9", title: "QA Engineer (E-commerce)", url: "https://www.wanted.co.kr/wd/29cm-qa", source: "wanted", sourceLabel: "데모", status: "new", failureReason: "", failureCategory: "" }
    ]
  },
  {
    companyId: "cmp_loplat",
    companyName: "loplat",
    companyNameKo: "로플랫",
    domain: "loplat.com",
    lastCollectedAt: "2026-05-30T09:00:00.000Z",
    leadGrade: "B",
    priorityScore: "52",
    contactSecured: "no",
    email: "hello@loplat.com",
    emailConfidence: "low",
    excluded: false,
    actions: act("보류", "보류", "보류"),
    actionReasons: ["담당자 미확보.", "정보 수집 후 재검토."],
    posts: [
      { id: "j10", title: "QA / Test Engineer", url: "https://loplat.com/careers/qa", source: "generic", sourceLabel: "데모", status: "new", failureReason: "", failureCategory: "" }
    ]
  },
  {
    companyId: "cmp_zigbang",
    companyName: "zigbang",
    companyNameKo: "직방",
    domain: "zigbang.com",
    lastCollectedAt: "2026-05-29T09:00:00.000Z",
    leadGrade: "C",
    priorityScore: "35",
    contactSecured: "no",
    email: "",
    emailConfidence: "low",
    excluded: false,
    actions: act("보류", "보류", "보류"),
    actionReasons: ["Junior QA 1건.", "연락처 없음."],
    posts: [
      { id: "j11", title: "Junior QA Engineer", url: "https://zigbang.com/career/qa-junior", source: "generic", sourceLabel: "데모", status: "new", failureReason: "", failureCategory: "" }
    ]
  },
  {
    companyId: "cmp_spoon",
    companyName: "spoonradio",
    companyNameKo: "스푼라디오",
    domain: "spooncast.net",
    lastCollectedAt: "2026-05-28T09:00:00.000Z",
    leadGrade: "C",
    priorityScore: "25",
    contactSecured: "no",
    email: "",
    emailConfidence: "low",
    excluded: false,
    actions: act("보류", "보류", "보류"),
    actionReasons: ["수집 실패 공고 1건.", "수동 확인 필요."],
    posts: [
      { id: "j12", title: "QA Engineer (Audio Streaming)", url: "https://boards.greenhouse.io/spoonradio/jobs/qa", source: "greenhouse", sourceLabel: "데모", status: "failed", failureReason: "http_403", failureCategory: "blocked" }
    ]
  }
];

for (const row of rows) {
  row.actionSummary = summary(row.actions);
  row.salesStage = row.leadGrade === "C" ? "new" : "qualified";
  row.reportRequired = row.actions.proposal.status === "추천" ? "yes" : "no";
  row.meetingRequired = row.actions.meeting.status === "추천" ? "yes" : "no";
  row.manualOverrideLocked = false;
  row.excludeReason = "";
}

const gradeSummary = rows.reduce(
  (acc, row) => {
    acc[row.leadGrade] += 1;
    if (row.actions.proposal.status === "추천") acc.proposalRecommend += 1;
    if (row.actions.meeting.status === "추천") acc.meetingRecommend += 1;
    if (row.actions.inquiry.status === "추천") acc.inquiryRecommend += 1;
    if (row.contactSecured === "yes") acc.contactSecured += 1;
    return acc;
  },
  { A: 0, B: 0, C: 0, excluded: 0, proposalRecommend: 0, meetingRecommend: 0, inquiryRecommend: 0, contactSecured: 0 }
);

const snapshot = {
  generatedAt: new Date().toISOString(),
  totalCompanies: rows.length,
  totalPosts: rows.reduce((n, r) => n + r.posts.length, 0),
  totalManualReview: 1,
  failureSummary: { blocked: 1 },
  gradeSummary,
  rows,
  dedupeCandidates: [
    {
      candidate_id: "cmp_toss_cmp_baemin",
      company_id_left: "cmp_toss",
      company_id_right: "cmp_baemin",
      company_name_left: "토스",
      company_name_right: "배달의민족",
      match_basis: "both enterprise",
      review_status: "pending"
    }
  ],
  manualReviewQueue: [
    {
      url: "https://www.wanted.co.kr/wd/blocked-qa",
      status: "manual_review",
      failureReason: "blocked_content_detected",
      failureCategory: "blocked",
      retryCount: "3",
      lastProcessedAt: "2026-05-31T09:00:00.000Z",
      notes: "max_retries_reached"
    }
  ]
};

const out = resolve(__dirname, "../data/snapshot.json");
await writeFile(out, JSON.stringify(snapshot, null, 2), "utf8");
console.log(`Wrote ${out}`);
