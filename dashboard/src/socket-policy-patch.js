/**
 * Prevent "Permissions policy violation: unload is not allowed in this document."
 * socket.io-client's engine.io registers addEventListener("unload", ...) to abort
 * pending XHRs; in strict contexts (e.g. embedding, extensions) unload is disallowed.
 * We no-op registration of "unload" so the library doesn't trigger the violation.
 * Pending requests will simply be left to close naturally (acceptable).
 */
if (typeof window !== 'undefined') {
    const orig = window.addEventListener;
    window.addEventListener = function (type, ...args) {
        if (type === 'unload') return;
        return orig.apply(this, [type, ...args]);
    };
}
