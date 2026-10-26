// Every string on the landing page, in one place so it's easy to review and translate.
// Answers describe what the app does today; anything not decided yet is a TODO, not a claim.

/** Where "Sign in" goes once accounts exist. TODO(v4 accounts): set this to the sign-in route. */
export const SIGN_IN_ROUTE: string | null = null;

/** TODO: a contact address or page. The footer link appears once this is set. */
export const CONTACT_HREF: string | null = null;

export const COPY = {
  nav: {
    home: "Higgins AI home",
    howItWorks: "How it works",
    samplePlan: "Sample plan",
    questions: "Questions",
    signIn: "Sign in",
    continuePlanning: "Continue planning",
  },
  signIn: {
    title: "Accounts are coming later",
    body: "Today everything works without one. Your plans are saved in this browser, so they stay on this device.",
    close: "Got it",
  },
  hero: {
    title: "Plan your celebration, calmly",
    body: "Weddings, birthdays and community events. Get a realistic budget, book-by dates and a plan you can share with family in about a minute.",
    label: "Tell me about your event",
    placeholder: "Tell me about it. e.g. Wedding for 300 in Jaipur on 14 Feb, about 25 lakh",
    helper: "You can edit everything after",
    submit: "Plan my event",
    examplesLabel: "Examples",
    examples: ["Wedding for 300 in Jaipur", "5th birthday, 40 kids", "Society Diwali, 120 homes"],
    // The machine's own text alternative, for the no-script image.
    machineAlt: "An illustrated machine shows how Higgins turns one sentence into a plan. A paper ticket that reads “Wedding for 300 in Jaipur, about ₹25 lakh” drops into a brass hopper. Coins, standing for the budget, roll down a chute into four tanks labelled Venue, Food, Décor and Other, and how full each tank gets shows the split. A calendar drum turns to the wedding month, and book-by tags move along a rail to show how far ahead to book each part. A plan card slides out toward a phone that shows the plan and a Send to family button. Two levers change the example, +25 guests and Move the date, and a reset button goes back to the start. All numbers are examples.",
  },
  values: {
    title: "How it works",
    items: [
      { title: "A budget that adds up", body: "See what's typical for each vendor, so you know a fair price." },
      { title: "Book-by dates", body: "Know what to book first, and what can wait." },
      { title: "Share with family", body: "Send the plan on WhatsApp, so everyone's on the same page." },
    ],
  },
  sample: {
    title: "Sample plan",
    caption: "Here's what your plan looks like",
    alt: "The overview of a sample wedding plan in Jaipur: days to go, the next bookings to make and the budget.",
  },
  faq: {
    title: "Questions people ask",
    items: [
      // TODO: decide pricing before launch; the question stays hidden until it has an answer.
      { id: "faq-free", question: "Is it free?", answer: null },
      {
        id: "faq-data",
        question: "Where is my data stored?",
        answer:
          "Your events are saved in this browser, on this device. To work out a plan, the details you enter are sent to our server, which doesn't keep a copy. Clearing your browser's site data removes your plans.",
      },
      {
        id: "faq-account",
        question: "Do I need an account?",
        answer: "No. Everything works without one. Because your plans live in this browser, they don't move to another device on their own.",
      },
      {
        id: "faq-events",
        question: "Can I plan more than one event?",
        answer: "Yes. Each event keeps its own budget, bookings, vendors, guests and ideas. Switch between them from your event's name at the top.",
      },
      {
        id: "faq-ai",
        question: "How does the AI work, and can I edit what it gives me?",
        answer:
          "The AI reads what you type, like a sentence about your event or a vendor's quote, and fills in a draft for you to check. It also suggests ideas. The budget split and book-by dates come from fixed rules, not the AI. You can change everything it fills in. What you type in those boxes is sent to an AI service to be read.",
      },
    ] as { id: string; question: string; answer: string | null }[],
  },
  footer: {
    privacy: "Privacy",
    contact: "Contact",
    line: "Your plans are saved in this browser only. Our server works them out but doesn't keep a copy.",
  },
} as const;
