import { expect, test } from "@playwright/test";

/** A date `days` from now, as the API expects it. */
const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

test("the landing page loads", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: /Celebrations/ })).toBeVisible();
});

test("a shared plan opens after signing in with the demo account", async ({ page }) => {
  const query = new URLSearchParams({
    event_type: "birthday", event_date: inDays(60), guests: "40", budget_inr: "50000",
    city: "Mysuru", venue_type: "home", planned_on: inDays(0),
  });
  await page.goto(`/?${query}`);

  await page.getByRole("button", { name: "Fill it in" }).click();
  await page.getByRole("button", { name: "Sign in", exact: true }).click();

  // The plan comes from the rules engine over HTTP, rendered in the dashboard.
  await expect(page.getByText("Someone shared this plan with you")).toBeVisible();
  await expect(page.getByText("Budget breakdown")).toBeVisible();
});
