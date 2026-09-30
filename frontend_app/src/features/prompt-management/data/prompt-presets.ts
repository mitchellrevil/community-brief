export interface PromptPreset {
  slug: string;
  label: string;
  category: string;
  instruction: string;
  placeholders: Array<string>;
  tags: Array<string>;
}

export const PROMPT_PRESETS: Array<PromptPreset> = [
  {
    "slug": "no-hallucinations-base",
    "label": "Do not hallucinate",
    "category": "Guardrails",
    "instruction": "Do not invent facts, attendees, dates, or outcomes. Only use information explicitly present in the transcript. If a detail is missing or unclear, output \"Not stated\" or \"Unclear\" rather than guessing.",
    "placeholders": [],
    "tags": ["faithfulness","safety","community-brief"]
  },
  {
    "slug": "british-english",
    "label": "British English",
    "category": "Style",
    "instruction": "Use British English spelling, punctuation, and terminology throughout (e.g., organisation, programme, labour).",
    "placeholders": [],
    "tags": ["style","locale","uk"]
  },
  {
    "slug": "long-full-sentences",
    "label": "Long/full sentences",
    "category": "Style",
    "instruction": "Write in long sentences or full sentences; avoid staccato bullet fragments unless a list is explicitly requested.",
    "placeholders": [],
    "tags": ["style","sentences"]
  },
  {
    "slug": "tone-professional-accessible",
    "label": "Tone: professional + accessible",
    "category": "Style",
    "instruction": "Use a professional but accessible tone with clear, direct language and minimal jargon. If jargon appears in the transcript, briefly explain it.",
    "placeholders": [],
    "tags": ["style","readability"]
  },
  {
    "slug": "quote-with-evidence",
    "label": "Cite evidence with timestamp",
    "category": "Guardrails",
    "instruction": "For each decision or action you extract, include the supporting quote and its transcript timestamp in parentheses, e.g., (00:14:32).",
    "placeholders": [],
    "tags": ["traceability","timestamps"]
  },
  {
    "slug": "uncertainty-markers",
    "label": "If unsure, mark as unclear",
    "category": "Guardrails",
    "instruction": "When the transcript is ambiguous or audio is unintelligible, explicitly mark items as \"Unclear\" and include a short evidence snippet.",
    "placeholders": [],
    "tags": ["safety","faithfulness"]
  },
  {
    "slug": "scope-control",
    "label": "Limit to transcript scope",
    "category": "Guardrails",
    "instruction": "Do not use external knowledge, training data, or assumptions. Constrain all content to what is contained in the provided transcript.",
    "placeholders": [],
    "tags": ["scope","faithfulness"]
  },
  {
    "slug": "gdpr-redaction",
    "label": "GDPR redaction",
    "category": "Compliance",
    "instruction": "Redact personal data beyond what is necessary. Replace names or identifiers that are not essential with [[REDACTED:{type}]] (e.g., [[REDACTED:Address]]). Preserve meaning while minimising data.",
    "placeholders": [],
    "tags": ["gdpr","privacy","public-sector"]
  },
  {
    "slug": "safeguarding-language",
    "label": "Neutral safeguarding language",
    "category": "Compliance",
    "instruction": "Use neutral, trauma‑informed wording. Describe concerns factually without speculation or emotive language.",
    "placeholders": [],
    "tags": ["safeguarding","neutrality"]
  },
  {
    "slug": "no-legal-medical-advice",
    "label": "No legal/medical advice",
    "category": "Compliance",
    "instruction": "Do not provide legal or medical advice. Summarise what was discussed without advising on actions outside the transcript.",
    "placeholders": [],
    "tags": ["safety","compliance"]
  },
  {
    "slug": "meeting-sections-core",
    "label": "Core meeting sections",
    "category": "Structure",
    "instruction": "Produce sections in order: 1) Purpose, 2) Agenda, 3) Discussion by agenda item, 4) Decisions, 5) Actions, 6) Risks/Issues, 7) Next Steps, 8) Appendices (Key Quotes, References).",
    "placeholders": [],
    "tags": ["structure","minutes"]
  },
  {
    "slug": "attendees-from-transcript-only",
    "label": "Attendees from transcript only",
    "category": "Structure",
    "instruction": "List attendees only if they speak or are explicitly named in the transcript. Do not infer attendance from invites. If roles are known in-transcript, include role in parentheses.",
    "placeholders": [],
    "tags": ["attendees","faithfulness"]
  },
  {
    "slug": "actions-smart",
    "label": "SMART actions",
    "category": "Extraction",
    "instruction": "Extract action items in SMART form: description, owner, due date (or \"Not stated\"), priority (High/Med/Low), evidence quote, timestamp.",
    "placeholders": [],
    "tags": ["actions","SMART"]
  },
  {
    "slug": "decision-register",
    "label": "Decision register",
    "category": "Extraction",
    "instruction": "Create a decision register with: decision text, rationale, proposer, approver (if stated), vote/consensus (if stated), supporting quote and timestamp.",
    "placeholders": [],
    "tags": ["decisions","governance"]
  },
  {
    "slug": "risk-issues-log",
    "label": "Risks & issues",
    "category": "Extraction",
    "instruction": "List risks and issues with: summary, impact, likelihood (if stated), mitigation/owner (if stated), evidence quote, timestamp.",
    "placeholders": [],
    "tags": ["risks","issues"]
  },
  {
    "slug": "key-questions",
    "label": "Open questions",
    "category": "Extraction",
    "instruction": "Extract unresolved questions, assigning owners only when explicitly stated. Include the timestamp where the question was raised.",
    "placeholders": [],
    "tags": ["follow-ups","questions"]
  },
  {
    "slug": "key-quotes",
    "label": "Top key quotes",
    "category": "Extraction",
    "instruction": "Provide the five most decision‑shaping quotes verbatim with speaker label and timestamp.",
    "placeholders": [],
    "tags": ["quotes","evidence"]
  },
  {
    "slug": "executive-summary",
    "label": "Executive summary (100–150 words)",
    "category": "Style",
    "instruction": "Write an executive summary of 100–150 words highlighting purpose, main outcomes, and immediate next steps.",
    "placeholders": [],
    "tags": ["summary","leadership"]
  },
  {
    "slug": "timeline",
    "label": "Chronological timeline",
    "category": "Structure",
    "instruction": "Provide a chronological outline of the discussion with major points and timestamps.",
    "placeholders": [],
    "tags": ["timeline","structure"]
  },
  {
    "slug": "glossary",
    "label": "Glossary of terms",
    "category": "Structure",
    "instruction": "Create a glossary of acronyms and specialist terms present in the transcript; define only if the definition is explicitly provided in the transcript.",
    "placeholders": [],
    "tags": ["glossary","jargon"]
  },
  {
    "slug": "speaker-map",
    "label": "Speaker mapping",
    "category": "Transcription",
    "instruction": "Respect the provided speaker mapping {speaker_map}. If a speaker is unknown, label as Speaker X (Unknown) and keep consistent.",
    "placeholders": ["{speaker_map}"],
    "tags": ["diarisation","speakers"]
  },


  {
    "slug": "disfluency",
    "label": "Disfluency handling",
    "category": "Transcription",
    "instruction": "Remove fillers (um, er) and stutters unless they change meaning. Keep hesitations that signal uncertainty relevant to decisions.",
    "placeholders": [],
    "tags": ["cleanup","readability"]
  },
  {
    "slug": "verbatim-quotes",
    "label": "Verbatim quotes with [sic]",
    "category": "Transcription",
    "instruction": "When quoting, use verbatim text. If there is an obvious transcription error, preserve it and annotate with [sic].",
    "placeholders": [],
    "tags": ["verbatim","accuracy"]
  },
  {
    "slug": "numbers-and-units",
    "label": "Numbers, dates, units",
    "category": "Style",
    "instruction": "Preserve numeric accuracy; use UK date formats (DD/MM/YYYY) and units as spoken. Convert money to GBP if and only if stated.",
    "placeholders": [],
    "tags": ["formatting","uk"]
  },
  {
    "slug": "acronyms",
    "label": "Acronyms policy",
    "category": "Style",
    "instruction": "Expand acronyms on first use only if the expansion appears in the transcript; otherwise keep the acronym and add to the Glossary section.",
    "placeholders": [],
    "tags": ["glossary","acronyms"]
  },
  {
    "slug": "multilingual",
    "label": "Multilingual handling",
    "category": "Transcription",
    "instruction": "If a non‑English utterance appears, provide the English translation followed by the original in brackets.",
    "placeholders": [],
    "tags": ["translation","clarity"]
  },
  {
    "slug": "redaction-categories",
    "label": "Redaction categories",
    "category": "Compliance",
    "instruction": "Redact: addresses, phone numbers, NHS numbers, DOBs, emails, exact locations, and names of minors using [[REDACTED:{type}]].",
    "placeholders": [],
    "tags": ["privacy","gdpr"]
  },
  {
    "slug": "strategy-template",
    "label": "Strategy meeting template",
    "category": "Templates",
    "instruction": "Structure output for a Strategy meeting: Background, Referral/Trigger, Attendees & Roles, Chronology (timestamped), Assessment Summary, Decisions, Actions (SMART), Risks/Safeguarding, Next Review.",
    "placeholders": [],
    "tags": ["template","strategy"]
  },
  {
    "slug": "plo-template",
    "label": "PLO meeting template",
    "category": "Templates",
    "instruction": "Structure output for a Public Law Outline (PLO) meeting: Context, Legal Threshold (as stated), Professional Contributions, Family Voice, Decisions/Agreements, Actions & Timescales, Review Date.",
    "placeholders": [],
    "tags": ["template","plo"]
  },
  {
    "slug": "one-to-one-template",
    "label": "1:1 supervision template",
    "category": "Templates",
    "instruction": "For 1:1s, produce narrative minutes in full sentences with sections: Objectives since last 1:1, Progress, Challenges, Support Needed, Agreed Actions (SMART), Next 1:1 date.",
    "placeholders": [],
    "tags": ["template","supervision","full-sentences"]
  },
  {
    "slug": "case-conference-template",
    "label": "Case conference template",
    "category": "Templates",
    "instruction": "Sections: Case Summary, Multi‑agency Inputs, Analysis, Decisions, Risks, Resource Requests, Actions & Owners, Review Schedule.",
    "placeholders": [],
    "tags": ["template","multi-agency"]
  },
  {
    "slug": "project-standup-template",
    "label": "Project stand‑up template",
    "category": "Templates",
    "instruction": "Sections: Yesterday, Today, Blockers, Dependencies, Actions, Decisions. Keep each item timestamped to its first mention.",
    "placeholders": [],
    "tags": ["template","agile"]
  },
  {
    "slug": "training-session-template",
    "label": "Training session template",
    "category": "Templates",
    "instruction": "Sections: Learning Objectives, Content Summary, Participant Questions, Demonstrations, Key Takeaways, Actions, Feedback.",
    "placeholders": [],
    "tags": ["template","training"]
  },
  {
    "slug": "retrospective-template",
    "label": "Retrospective template",
    "category": "Templates",
    "instruction": "Sections: What went well, What didn't, What to change, Experiments for next sprint, Actions & Owners.",
    "placeholders": [],
    "tags": ["template","retrospective"]
  },
  {
    "slug": "stakeholder-brief",
    "label": "Stakeholder brief",
    "category": "Templates",
    "instruction": "Create a concise narrative for senior stakeholders: Purpose, Outcomes, Decisions, Risks, Required Approvals, Immediate Next Steps.",
    "placeholders": [],
    "tags": ["template","executive"]
  },
  {
    "slug": "sharing-and-access",
    "label": "Sharing & access note",
    "category": "Compliance",
    "instruction": "Append a short note: \"For internal use within {org_name} only. Contains sensitive information. Share on a need‑to‑know basis.\"",
    "placeholders": ["{org_name}"],
    "tags": ["governance","comms"]
  },
  {
    "slug": "anonymisation-mode",
    "label": "Anonymisation mode",
    "category": "Compliance",
    "instruction": "When {sensitivity_level} = \"high\", replace personal names with roles or initials consistently (e.g., \"Social Worker A\").",
    "placeholders": ["{sensitivity_level}"],
    "tags": ["privacy","gdpr"]
  },
  {
    "slug": "safeguarding-flags",
    "label": "Safeguarding flags",
    "category": "Extraction",
    "instruction": "Identify safeguarding concerns mentioned in the transcript and list them factually with timestamped evidence. Do not infer beyond the transcript.",
    "placeholders": [],
    "tags": ["safeguarding","evidence"]
  },
  {
    "slug": "quality-self-check",
    "label": "Quality self‑check",
    "category": "Guardrails",
    "instruction": "Before final output, self‑check: (a) All sections present, (b) No invented details, (c) British English, (d) Actions/Decisions have timestamps, (e) PII minimised.",
    "placeholders": [],
    "tags": ["qa","consistency"]
  },
  {
    "slug": "data-minimisation",
    "label": "Data minimisation",
    "category": "Compliance",
    "instruction": "Include only information necessary to meet the minute‑taking purpose; omit incidental personal details not relevant to decisions or actions.",
    "placeholders": [],
    "tags": ["gdpr","privacy"]
  },
  {
    "slug": "markdown-formatting",
    "label": "Markdown formatting",
    "category": "Output",
    "instruction": "Format output in Markdown with # H1 for title, ## H2 for sections, and lists where appropriate. Ensure headings reflect the chosen template.",
    "placeholders": [],
    "tags": ["formatting","markdown"]
  },

  {
    "slug": "parameterised-context",
    "label": "Parameterised context",
    "category": "Structure",
    "instruction": "Begin with a context block: Title: {meeting_title}; Date: {meeting_date} ({timezone}); Business Unit: {business_unit}; Audience: {audience}.",
    "placeholders": ["{meeting_title}","{meeting_date}","{timezone}","{business_unit}","{audience}"],
    "tags": ["context","parameters"]
  },
  {
    "slug": "next-meeting-agenda",
    "label": "Next meeting agenda",
    "category": "Structure",
    "instruction": "Propose a draft agenda for the next meeting on {next_meeting_date} based strictly on unresolved items and actions in this transcript.",
    "placeholders": ["{next_meeting_date}"],
    "tags": ["agenda","planning"]
  },
  {
    "slug": "topic-segmentation",
    "label": "Topic segmentation",
    "category": "Transcription",
    "instruction": "Segment the transcript into topics using natural boundaries; start each segment with a timestamp and short heading.",
    "placeholders": [],
    "tags": ["segmentation","readability"]
  },
  {
    "slug": "speaker-sentiment",
    "label": "Per‑speaker sentiment (cautious)",
    "category": "Analysis",
    "instruction": "Provide cautious sentiment notes per speaker only when clearly expressed (e.g., \"concerned about deadlines\"). Avoid mind‑reading or inference.",
    "placeholders": [],
    "tags": ["sentiment","caution"]
  },
  {
    "slug": "contradiction-check",
    "label": "Contradiction check",
    "category": "Guardrails",
    "instruction": "If the transcript contains conflicting statements about a decision, list both versions with timestamps and mark the decision as \"Unresolved\".",
    "placeholders": [],
    "tags": ["consistency","governance"]
  },
  {
    "slug": "evidence-index",
    "label": "Evidence index",
    "category": "Structure",
    "instruction": "Add an appendix mapping each Action and Decision ID to its supporting timestamps and quotes for quick audit.",
    "placeholders": [],
    "tags": ["audit","traceability"]
  },

  {
    "slug": "role-based-abstraction",
    "label": "Role‑based abstraction",
    "category": "Compliance",
    "instruction": "Prefer roles over full names (e.g., Chair, Social Worker, Business Support Officer) unless the transcript necessitates naming for clarity.",
    "placeholders": [],
    "tags": ["privacy","roles"]
  },
  {
    "slug": "error-handling-note",
    "label": "Gaps & errors note",
    "category": "Guardrails",
    "instruction": "Add a short note if portions of audio are missing or low confidence, indicating possible gaps in the minutes.",
    "placeholders": [],
    "tags": ["quality","transparency"]
  },
  {
    "slug": "format-consistency",
    "label": "Formatting consistency",
    "category": "Style",
    "instruction": "Ensure consistent heading hierarchy, spacing between paragraphs, and list styles; avoid stray bullets and inconsistent indentation.",
    "placeholders": [],
    "tags": ["formatting","consistency"]
  },



];

// Group presets by category
export function getPresetsByCategory(): Record<string, Array<PromptPreset>> {
  const grouped: Partial<Record<string, Array<PromptPreset>>> = {};
  
  for (const preset of PROMPT_PRESETS) {
    grouped[preset.category] = grouped[preset.category] ?? [];
    grouped[preset.category]!.push(preset);
  }
  
  return grouped as Record<string, Array<PromptPreset>>;
}

// Get all unique categories
export function getCategories(): Array<string> {
  const categories = new Set<string>();
  for (const preset of PROMPT_PRESETS) {
    categories.add(preset.category);
  }
  return Array.from(categories).sort();
}
