// The one door every client intent comes through.
//
// Socket payloads are untrusted wire data. A `null` payload (destructuring
// throws), a number where the name belongs (`.trim` throws), or a non-function
// in the ack slot (`cb(...)` throws) all used to raise inside a socket.io
// listener — and socket.io runs listeners on the next tick, so that was an
// UNCAUGHT exception: one crafted message took the whole process down, every
// room with it.
//
// So handlers are registered through here instead of `socket.on`:
//   • the payload is always a plain object (anything else becomes `{}`), so the
//     handlers' `({ a, b }, cb)` destructuring is always safe;
//   • the ack is always a function (a no-op when the client sent none);
//   • anything the handler still throws — sync or async — is logged and
//     answered with an error, and the process carries on.
export function onIntent(socket, event, handler) {
  socket.on(event, (payload, ack) => {
    const data = payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {};
    const reply = typeof ack === "function" ? ack : () => {};
    Promise.resolve()
      .then(() => handler(data, reply))
      .catch((err) => {
        console.error(`[io] ${event} from ${socket.id} failed:`, err);
        // socket.io ignores a second call to the same ack, so this is safe even
        // if the handler had already answered before it threw.
        reply({ ok: false, error: "Something went wrong on the server." });
      });
  });
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
