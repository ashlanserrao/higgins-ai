"""Security headers sent with every response: the API's and the built site's alike.

frontend/vercel.json repeats them for the site on Vercel; a test checks the two match.
"""

# Radix Select renders one fixed <style> (it hides the list's scrollbar). Allowing exactly that
# text by its hash keeps 'unsafe-inline' out; frontend/src/lib/csp.test.ts fails if Radix changes it.
RADIX_SELECT_STYLE_HASH = "'sha256-441zG27rExd4/il+NvIqyL8zFx5XmyNQtE381kSkUJk='"

SECURITY_HEADERS = {
    "Content-Security-Policy": (
        f"default-src 'self'; script-src 'self'; style-src 'self' {RADIX_SELECT_STYLE_HASH}; img-src 'self' data:; "
        "connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
    ),
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    # Plan inputs live in the URL query; never leak them to other sites.
    "Referrer-Policy": "no-referrer",
    # The microphone is for voice typing (the browser's speech recognition), on our own pages only.
    "Permissions-Policy": "camera=(), microphone=(self), geolocation=()",
    # The WhatsApp link opens with noopener, so nothing needs a handle back to this window.
    "Cross-Origin-Opener-Policy": "same-origin",
}
# Sent only over HTTPS: browsers ignore it on plain HTTP, and localhost stays usable.
HSTS = "max-age=31536000"
