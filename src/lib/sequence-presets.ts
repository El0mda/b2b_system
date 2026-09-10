// A step is either an email SmartLead sends, or a call somebody on the
// team has to make. `type` is optional because every template written
// before call steps existed is an email step, and rewriting stored
// JSONB to say so would be busywork — read it through stepType().
export type SequenceStepType = "email" | "call";

export interface SequenceStep {
  step: number;
  type?: SequenceStepType;
  delay_days: number;
  // Emails are scheduled in whole days (SmartLead's unit); a call is
  // routinely "6 hours after the email", so the delay carries both.
  delay_hours?: number;
  subject: string;
  body: string;
  // Call steps only: what the task says, and the script to work from.
  title?: string;
  notes?: string;
}

export function stepType(step: SequenceStep): SequenceStepType {
  return step.type === "call" ? "call" : "email";
}

// A step's delay from the previous one, in hours — the single unit both
// kinds of step can be scheduled on.
export function stepDelayHours(step: SequenceStep): number {
  return (step.delay_days || 0) * 24 + (step.delay_hours || 0);
}

// Cumulative offset from launch to the end of step `index`.
export function offsetHoursThrough(steps: SequenceStep[], index: number): number {
  return steps.slice(0, index + 1).reduce((sum, s) => sum + stepDelayHours(s), 0);
}

export function describeDelay(step: SequenceStep): string {
  const days = step.delay_days || 0;
  const hours = step.delay_hours || 0;
  if (!days && !hours) return "immediately";
  const parts: string[] = [];
  if (days) parts.push(`${days} ${days === 1 ? "day" : "days"}`);
  if (hours) parts.push(`${hours} ${hours === 1 ? "hour" : "hours"}`);
  return parts.join(" ");
}

// A step is only ready to launch when the fields its own kind needs are
// filled in — a call has no subject line to check.
export function isStepComplete(step: SequenceStep): boolean {
  return stepType(step) === "call"
    ? !!step.title?.trim()
    : !!step.subject.trim() && !!step.body.trim();
}

// A vertical is the industry a sequence was written for. Copy that
// lands with a plant manager doesn't land with a logistics director, so
// templates are grouped by audience and the campaign wizard picks the
// vertical first and the sequence second.
//
// These are the ones that ship with the app; an org adds its own on the
// Sequences page (public.sequence_verticals), and both kinds appear
// side by side in the picker.
export interface SequenceVertical {
  key: string;
  name: string;
  description: string;
}

export const BUILTIN_VERTICALS: SequenceVertical[] = [
  {
    key: "manufacturing",
    name: "Manufacturing",
    description: "Plant, production and operations leaders — downtime, OEE and changeover angles.",
  },
  {
    key: "general",
    name: "General B2B",
    description: "Industry-agnostic copy that works as a starting point for any vertical.",
  },
];

// The vertical a preset belongs to. ANY_VERTICAL shows up under every
// vertical — that's the blank starting point, which is never
// industry-specific.
export const ANY_VERTICAL = "*";

export interface SequencePreset {
  key: string;
  vertical: string;
  name: string;
  description: string;
  totalDays: number;
  steps: SequenceStep[];
}

export const SEQUENCE_PRESETS: SequencePreset[] = [
  {
    key: "pain-point",
    vertical: "manufacturing",
    name: "Pain Point Opener",
    description: "4 steps, 10 days — surfaces a manufacturing pain point and offers a quick fix.",
    totalDays: 10,
    steps: [
      {
        step: 1,
        delay_days: 0,
        subject: "{{first_name}}, quick question about {{company}}'s manufacturing ops",
        body:
          "Hi {{first_name}},\n\n" +
          "Manufacturing teams at companies like {{company}} usually lose 2–4 hours a day to unplanned downtime. I've helped a few similar operators clip that down by ~40% in the first quarter.\n\n" +
          "Worth a 15-min look at how this could apply to {{company}}?\n\n" +
          "Best,\nKhaled",
      },
      {
        step: 2,
        delay_days: 3,
        subject: "Re: downtime at {{company}}",
        body:
          "Hi {{first_name}},\n\n" +
          "Wanted to make sure my note didn't get buried. The team at one of your peers freed up 12 production hours per week with the same approach.\n\n" +
          "Would Thursday or Friday work for a quick call?\n\n" +
          "— Khaled",
      },
      {
        step: 3,
        delay_days: 3,
        subject: "{{first_name}} — small case study for {{company}}",
        body:
          "Hi {{first_name}},\n\n" +
          "Sharing a 2-page summary of how a similar plant cut their changeover time. Happy to walk you through it.\n\n" +
          "Want me to send the link?\n\n" +
          "— Khaled",
      },
      {
        step: 4,
        delay_days: 4,
        subject: "Closing the loop, {{first_name}}",
        body:
          "Hi {{first_name}},\n\n" +
          "If this isn't a priority right now, no worries — I'll close the loop on my side. Just reply \"later\" and I'll check back next quarter.\n\n" +
          "— Khaled",
      },
    ],
  },
  {
    key: "social-proof",
    vertical: "manufacturing",
    name: "Social Proof Play",
    description: "4 steps, 12 days — leads with named customer wins.",
    totalDays: 12,
    steps: [
      {
        step: 1,
        delay_days: 0,
        subject: "How {{company}}'s peers are running faster lines",
        body:
          "Hi {{first_name}},\n\n" +
          "Three of {{company}}'s peers in the region just rolled out a small change that lifted OEE by 11–18% inside a quarter. I think it's directly relevant to you.\n\n" +
          "Open to a 15-min look?\n\n" +
          "— Khaled",
      },
      {
        step: 2,
        delay_days: 4,
        subject: "{{first_name}}, two quick numbers",
        body:
          "Hi {{first_name}},\n\n" +
          "Two data points from a similar plant: 17% less downtime, 9% lower scrap. Both within 90 days.\n\n" +
          "Worth comparing notes?\n\n" +
          "— Khaled",
      },
      {
        step: 3,
        delay_days: 4,
        subject: "A 60-second video for {{company}}",
        body:
          "Hi {{first_name}},\n\n" +
          "Recorded a quick 60-second walkthrough specific to operations like {{company}}. Want me to send it?\n\n" +
          "— Khaled",
      },
      {
        step: 4,
        delay_days: 4,
        subject: "Last check-in, {{first_name}}",
        body:
          "Hi {{first_name}},\n\n" +
          "I'll stop reaching out after this one. If the timing is wrong, just reply \"next quarter\" and I'll circle back.\n\n" +
          "— Khaled",
      },
    ],
  },
  {
    key: "value-first",
    vertical: "manufacturing",
    name: "Value-First Approach",
    description: "4 steps, 13 days — offers a small asset before asking for time.",
    totalDays: 13,
    steps: [
      {
        step: 1,
        delay_days: 0,
        subject: "Free benchmarking report for {{company}}",
        body:
          "Hi {{first_name}},\n\n" +
          "I put together a benchmarking report on plant productivity across companies similar to {{company}}. Happy to share a copy — no strings.\n\n" +
          "Want me to send it?\n\n" +
          "— Khaled",
      },
      {
        step: 2,
        delay_days: 4,
        subject: "Re: benchmarking report",
        body:
          "Hi {{first_name}},\n\n" +
          "Did the last note get through? The report has a section on automation ROI that's getting a lot of replies.\n\n" +
          "— Khaled",
      },
      {
        step: 3,
        delay_days: 4,
        subject: "A second resource for {{title}}s at {{company}}",
        body:
          "Hi {{first_name}},\n\n" +
          "Also sharing a checklist we use with new operators to triage their biggest line losses. Useful even without us in the picture.\n\n" +
          "Want it?\n\n" +
          "— Khaled",
      },
      {
        step: 4,
        delay_days: 5,
        subject: "Closing the loop",
        body:
          "Hi {{first_name}},\n\n" +
          "Wrapping up my outreach. If any of this lands later, you have my note. Otherwise — wishing you a strong quarter at {{company}}.\n\n" +
          "— Khaled",
      },
    ],
  },
  {
    key: "short-direct",
    vertical: "manufacturing",
    name: "Short & Direct",
    description: "4 steps, 9 days — minimal copy, fast cadence.",
    totalDays: 9,
    steps: [
      {
        step: 1,
        delay_days: 0,
        subject: "{{first_name}} — 1 question",
        body:
          "Hi {{first_name}},\n\n" +
          "Is downtime on your top-3 priorities at {{company}} this quarter?\n\n" +
          "— Khaled",
      },
      {
        step: 2,
        delay_days: 2,
        subject: "Quick bump",
        body: "Hi {{first_name}}, bumping this up — worth a 10-min call?\n\n— Khaled",
      },
      {
        step: 3,
        delay_days: 3,
        subject: "Friendly nudge",
        body: "Hi {{first_name}}, any time this week?\n\n— Khaled",
      },
      {
        step: 4,
        delay_days: 4,
        subject: "Closing out",
        body: "Hi {{first_name}}, I'll stop here. Reply \"later\" if I should check back next quarter.\n\n— Khaled",
      },
    ],
  },
  {
    key: "general-problem-solve",
    vertical: "general",
    name: "Problem → Proof → Ask",
    description: "3 steps, 8 days — names a problem, backs it with a result, asks for 15 minutes.",
    totalDays: 8,
    steps: [
      {
        step: 1,
        delay_days: 0,
        subject: "{{first_name}} — is this a problem at {{company}}?",
        body:
          "Hi {{first_name}},\n\n" +
          "Most {{title}}s I speak with say the same thing: the process works, it just takes far more manual effort than it should.\n\n" +
          "If that's true at {{company}} too, I'd like to show you what we changed for a company your size.\n\n" +
          "Worth 15 minutes?\n\n" +
          "Best,\nKhaled",
      },
      {
        step: 2,
        delay_days: 3,
        subject: "Re: {{company}}",
        body:
          "Hi {{first_name}},\n\n" +
          "Adding the number I mentioned: the last team we worked with cut that effort by about a third inside the first quarter, without changing tools.\n\n" +
          "Happy to walk you through how — Thursday or Friday?\n\n" +
          "— Khaled",
      },
      {
        step: 3,
        delay_days: 5,
        subject: "Should I close the loop, {{first_name}}?",
        body:
          "Hi {{first_name}},\n\n" +
          "I don't want to keep landing in your inbox. Reply \"later\" and I'll check back next quarter — or \"not me\" and I'll stop.\n\n" +
          "— Khaled",
      },
    ],
  },
  {
    key: "general-right-person",
    vertical: "general",
    name: "Right Person Check",
    description: "3 steps, 7 days — asks for the right owner instead of pitching cold.",
    totalDays: 7,
    steps: [
      {
        step: 1,
        delay_days: 0,
        subject: "Who owns this at {{company}}?",
        body:
          "Hi {{first_name}},\n\n" +
          "Quick one — are you the right person at {{company}} for how the team handles this, or should I be speaking with someone else?\n\n" +
          "Happy to send the 2-minute version either way.\n\n" +
          "— Khaled",
      },
      {
        step: 2,
        delay_days: 3,
        subject: "Re: who owns this at {{company}}",
        body:
          "Hi {{first_name}},\n\n" +
          "Just a pointer is plenty — a name and I'll take it from there.\n\n" +
          "— Khaled",
      },
      {
        step: 3,
        delay_days: 4,
        subject: "Last one, {{first_name}}",
        body:
          "Hi {{first_name}},\n\n" +
          "Assuming this isn't the right time. I'll stop here — my details are below if it becomes relevant.\n\n" +
          "— Khaled",
      },
    ],
  },
  {
    key: "custom",
    vertical: ANY_VERTICAL,
    name: "Custom (start blank)",
    description: "Build your own sequence from scratch.",
    totalDays: 0,
    steps: [
      {
        step: 1,
        delay_days: 0,
        subject: "",
        body: "",
      },
    ],
  },
];

// Presets available inside a vertical, including the always-present
// blank starting point.
export function presetsForVertical(verticalKey: string): SequencePreset[] {
  return SEQUENCE_PRESETS.filter(
    (p) => p.vertical === verticalKey || p.vertical === ANY_VERTICAL,
  );
}

export function totalDays(steps: SequenceStep[]): number {
  return Math.round(steps.reduce((sum, s) => sum + stepDelayHours(s), 0) / 24);
}

