export interface SequenceStep {
  step: number;
  delay_days: number;
  subject: string;
  body: string;
}

export interface SequencePreset {
  key: string;
  name: string;
  description: string;
  totalDays: number;
  steps: SequenceStep[];
}

export const SEQUENCE_PRESETS: SequencePreset[] = [
  {
    key: "pain-point",
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
    key: "custom",
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

export function calculateScheduledDate(prevDelays: number[]): Date {
  const totalDays = prevDelays.reduce((sum, d) => sum + (d || 0), 0);
  const date = new Date();
  date.setDate(date.getDate() + totalDays);
  return date;
}
