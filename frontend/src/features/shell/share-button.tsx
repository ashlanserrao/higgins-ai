// Share with family: the phone's share sheet, or the link copied, or (if both fail) a dialog
// with the link to copy by hand. Plus the desktop page band's Share and Print pair.

import { useState } from "react";
import { Printer, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { buildShareUrl } from "@/lib/share";
import { usePlan } from "@/state/planner";

/** `tone="band"`: white on the Overview's coloured band. */
export function ShareButton({ tone }: { tone?: "band" }) {
  const { inputs, plannedOn, ideas, ideasStatus, announce } = usePlan();
  const [url, setUrl] = useState("");
  const share = async () => {
    const link = await buildShareUrl(inputs, plannedOn, ideasStatus === "ready" ? ideas : null);
    try {
      if (navigator.share) {
        await navigator.share({ title: "Our event plan", url: link });
        return;
      }
      await navigator.clipboard.writeText(link);
      announce("Link copied. Paste it into WhatsApp or email.");
    } catch {
      setUrl(link);
    }
  };
  return (
    <>
      {tone === "band" ? (
        <Button
          variant="outline" onClick={share}
          className="rounded-full border-primary-foreground/30 bg-transparent text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground"
        >
          <Share2 aria-hidden="true" /> <span className="xl:hidden">Share</span><span className="hidden xl:inline">Share with family</span>
        </Button>
      ) : (
        <Button variant="outline" onClick={share} aria-label="Share with family"><Share2 aria-hidden="true" /> <span className="hidden sm:inline">Share with family</span></Button>
      )}
      <Dialog open={Boolean(url)} onOpenChange={(o) => !o && setUrl("")}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Share this plan</DialogTitle>
            <DialogDescription>The link holds the plan and ideas only. Your notes, bookings, quotes and guest list stay with you.</DialogDescription>
          </DialogHeader>
          <Input readOnly value={url} onFocus={(e) => e.target.select()} aria-label="Shareable link" />
        </DialogContent>
      </Dialog>
    </>
  );
}

/** On a desktop the page band carries these instead of the top bar. `onPrint` prints or saves
 *  the whole plan (App renders every section first). */
export function BandTools({ onPrint }: { onPrint: () => void }) {
  return (
    <>
      <ShareButton tone="band" />
      <Button
        variant="ghost" size="icon" onClick={onPrint} aria-label="Print or save as PDF" title="Print or save as PDF"
        className="text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground"
      >
        <Printer aria-hidden="true" />
      </Button>
    </>
  );
}
