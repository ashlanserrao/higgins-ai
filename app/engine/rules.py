"""Planning heuristics for Indian events, priced in INR.

These are planning guidance, not market quotes. Wedding numbers were checked against
Indian planner guides and Bengaluru caterer listings (see README > Assumptions);
birthday and community numbers are labelled assumptions.
"""

# --- Budget splits (percent of total budget) -------------------------------------

# Wedding: planner guides put venue at 20-28%, catering 18-25%, décor 10-16% and
# photography 7-10%. Catering sits a little high because food dominates Indian weddings.
BASE_SPLITS: dict[str, dict[str, int]] = {
    "wedding": {
        "venue": 20, "food": 30, "decor": 12, "photography": 10, "attire": 10,
        "entertainment": 5, "invitations": 5, "logistics": 3, "contingency": 5,
    },
    # Assumption: no reliable published data for kids' birthdays.
    "birthday": {
        "venue": 20, "food": 35, "decor": 15, "entertainment": 12,
        "return_gifts": 8, "photography": 5, "contingency": 5,
    },
    # Assumption: no reliable published data for society / community events.
    "community": {
        "venue": 20, "food": 30, "sound": 15, "decor": 10,
        "performers": 10, "safety": 10, "contingency": 5,
    },
}

CATEGORY_LABELS: dict[str, dict[str, str]] = {
    "wedding": {
        "venue": "Venue", "food": "Catering", "decor": "Décor", "photography": "Photo & video",
        "attire": "Attire & styling", "entertainment": "Music & entertainment",
        "invitations": "Invitations & gifts", "logistics": "Logistics", "contingency": "Contingency",
    },
    "birthday": {
        "venue": "Venue", "food": "Food & cake", "decor": "Décor",
        "entertainment": "Entertainment & activities", "return_gifts": "Return gifts",
        "photography": "Photography", "contingency": "Contingency",
    },
    "community": {
        "venue": "Venue & permissions", "food": "Food & refreshments",
        "sound": "Sound, stage & lighting", "decor": "Décor", "performers": "Performers",
        "safety": "Safety & logistics (security, first aid, cleaning)",
        "contingency": "Contingency",
    },
}

# Many Indian venues bundle the hall with per-plate catering.
MERGED_VENUE_FOOD_KEY = "venue_food"
MERGED_VENUE_FOOD_LABEL = "Venue & catering"

# Outdoor events need a tent / rain backup line, taken from the other categories.
TENT_KEY = "tent"
TENT_LABEL = "Tent & weather backup"
TENT_PERCENT = 5

# Home events have no venue line; its share moves to these categories in equal halves.
HOME_REDISTRIBUTE_TO = ("food", "decor")

PRIORITY_BOOST = 5
MIN_CONTINGENCY_PERCENT = 5
ROUNDING_INR = 100

# --- "Too tight" floors and city tiers ---------------------------------------------

# Minimum budget per guest in a metro. Wedding: 30% of ₹1,500 = ₹450/plate, which matches
# mid-range Bengaluru caterer starting prices (₹200-500 veg, ₹300-650 non-veg).
MIN_PER_GUEST_METRO: dict[str, int] = {"wedding": 1500, "birthday": 500, "community": 250}

TIER_MULTIPLIER: dict[int, float] = {1: 1.0, 2: 0.8, 3: 0.65}
TIER_LABELS: dict[int, str] = {1: "metro", 2: "tier-2 city", 3: "smaller town"}
DEFAULT_TIER = 2

METRO_CITIES = frozenset({
    "bengaluru", "bangalore", "mumbai", "bombay", "delhi", "new delhi", "chennai", "madras",
    "kolkata", "calcutta", "hyderabad", "pune", "ahmedabad", "gurugram", "gurgaon", "noida",
})

# Budget per guest ÷ floor → budget level passed to the AI. Ratios at or above the last
# threshold are "premium".
BUDGET_LEVEL_THRESHOLDS: tuple[tuple[float, str], ...] = (
    (1, "tight"), (2, "modest"), (4, "comfortable"),
)

# --- Vendor lead times (ideal days before the event) --------------------------------

# Wedding: Indian planning guides suggest venue 10-12 months, photographer ~10,
# caterer 6-10 months ahead.
LEAD_TIMES: dict[str, dict[str, int]] = {
    "wedding": {
        "venue": 270, "photographer": 240, "caterer": 180, "decor": 120,
        "makeup": 120, "attire": 90, "music": 90, "invitations": 60,
    },
    # Assumption.
    "birthday": {
        "venue": 21, "entertainer": 14, "invitations": 14, "decor": 10,
        "cake": 7, "return_gifts": 7,
    },
    # Assumption. Caterer stays at 21 days: realistic for 500 people.
    "community": {
        "venue": 45, "permissions": 30, "performers": 30, "sound": 21,
        "caterer": 21, "security": 14,
    },
}

VENDOR_LABELS: dict[str, str] = {
    "venue": "Book the venue",
    "photographer": "Book the photographer & videographer",
    "caterer": "Book the caterer",
    "decor": "Book the decorator",
    "makeup": "Book makeup & styling",
    "attire": "Order outfits",
    "music": "Book music / DJ",
    "invitations": "Order or send invitations",
    "entertainer": "Book the entertainer",
    "cake": "Order the cake",
    "return_gifts": "Buy return gifts",
    "permissions": "Get society / police / fire permissions",
    "performers": "Book performers",
    "sound": "Book sound, stage & lighting",
    "security": "Arrange security & first aid",
    "tent": "Book a tent or covered backup space",
    "weather_backup": "Plan a monsoon weather backup (covered area, tarps, drainage)",
}

# Essentials are flagged "book today" in triage but never suggested as cuts.
ESSENTIAL_ITEMS = frozenset({"venue", "permissions", "caterer"})

# Peak wedding season pulls venue and photographer bookings earlier.
PEAK_MONTHS = frozenset({11, 12, 1, 2})
PEAK_EXTRA_DAYS = 60
PEAK_ITEMS = frozenset({"venue", "photographer"})

MONSOON_MONTHS = frozenset({6, 7, 8, 9})
TENT_LEAD_DAYS = 14
WEATHER_BACKUP_LEAD_DAYS = 7

# --- Triage cuts and cost-saving swaps ---------------------------------------------

CUT_ALTERNATIVES: dict[str, str] = {
    "photographer": "Book a freelance photographer for the main ceremony only, or ask a skilled friend.",
    "decor": "Go for simple DIY décor: marigolds, fairy lights and rented drapes.",
    "makeup": "Book makeup for the main day only, or a local salon package.",
    "attire": "Buy ready-to-wear or rent outfits instead of custom tailoring.",
    "music": "Use a curated playlist with a rented speaker instead of a live band.",
    "invitations": "Send digital invitations on WhatsApp instead of printed cards.",
    "entertainer": "Run DIY games (treasure hunt, musical chairs) instead of a hired entertainer.",
    "cake": "Order from a local bakery's ready designs instead of a custom cake.",
    "return_gifts": "Give simple return gifts (sweets, stationery) bought in one trip.",
    "performers": "Feature resident talent: kids' dance, music and a talent show.",
    "sound": "Rent a basic PA package (2 speakers + mic) instead of full stage lighting.",
    "security": "Ask volunteer residents to manage entry, plus a first-aid kit and one guard.",
}

COST_SAVING_SWAPS: dict[str, list[str]] = {
    "wedding": [
        "Trim the guest list: every 10 guests saves a full catering table.",
        "Choose a venue with in-house catering and décor packages.",
        "Pick a weekday or off-season date for lower venue rates.",
        "Send digital invitations instead of printed cards.",
    ],
    "birthday": [
        "Serve homemade snacks with a bakery cake instead of full catering.",
        "Do DIY décor: balloons, banners and a themed backdrop.",
        "Run games yourself instead of hiring an entertainer.",
        "Swap individual return gifts for one shared craft activity.",
    ],
    "community": [
        "Collect a per-flat contribution and seek sponsorship from local shops.",
        "Run a potluck or food stalls instead of full catering.",
        "Feature resident performers instead of hired artists.",
        "Borrow décor and lighting from previous society events.",
    ],
}

# Fixed planning milestones (days before the event).
MILESTONES: dict[str, list[tuple[int, str]]] = {
    "wedding": [
        (150, "Finalise the guest list"),
        (45, "Send invitations"),
        (14, "Confirm final headcount and payments"),
        (3, "Final confirmation calls with every vendor"),
    ],
    "birthday": [
        (10, "Send invitations"),
        (3, "Confirm headcount and buy supplies"),
    ],
    "community": [
        (21, "Announce to residents and collect contributions"),
        (7, "Prepare the volunteer roster and run sheet"),
        (1, "Final walkthrough with vendors"),
    ],
}

EVENT_LABELS: dict[str, str] = {
    "wedding": "wedding", "birthday": "birthday party", "community": "community event",
}

MAX_DAYS_AHEAD = 3 * 365
