"""Run the agent on an organiser's request and turn its working copy into a proposal.

The proposal comes from the draft, not from the model's reply: the before/after is computed by
the engine, and vendor messages are the engine's text. Nothing is applied here; the page shows
the proposal and the organiser confirms or discards it.
"""

from datetime import date

from higgins.agent.draft import Draft
from higgins.agent.loop import run_agent
from higgins.ai.providers.chain import AIBusyError, StructuredAI
from higgins.schemas.requests import AskRequest
from higgins.schemas.responses import AskResponse, DraftedVendorMessage

DONE_REPLY = "Done. Check the changes below."
PARTIAL_REPLY = "I only got part of the way through that. Check what I did below, or try again."
FAILED_REPLY = "I couldn't work that out just now. Please try again, or use the form."


async def propose(body: AskRequest, ai: StructuredAI, today: date) -> AskResponse:
    """The agent's proposal for `body.message`. Raises AIBusyError only when the hourly cap
    stopped it before it did anything, like the other AI routes."""
    if not ai.available:
        return AskResponse(ai_available=False, stopped="no_answer", partial=False, reply="", messages=[], notes=[])

    draft = Draft(message=body.message, today=today, original=body.current)
    result = await run_agent(ai, draft)
    did_something = draft.current != draft.original or bool(draft.messages)
    if result.stopped == "busy" and not did_something:
        raise AIBusyError

    if result.stopped == "done":
        reply = result.reply or DONE_REPLY
    else:
        # Stopped early: say so in the server's words, and keep whatever was done for review.
        reply = PARTIAL_REPLY if did_something else FAILED_REPLY
    plan = draft.plan()
    labels = {item.id: item.label for item in plan.checklist}
    response = AskResponse(
        ai_available=True, stopped=result.stopped, partial=result.stopped != "done" and did_something,
        reply=reply, notes=draft.notes,
        messages=[
            DraftedVendorMessage(task_id=m.task_id, label=labels.get(m.task_id, m.task_id), kind=m.kind, text=m.text)
            for m in draft.messages
        ],
    )
    if (changes := draft.changes()) is not None:
        response.inputs, response.plan, response.changes = draft.current, plan, changes
    return response
