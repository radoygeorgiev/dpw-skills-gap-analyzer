# Local startup and port conflicts

Use the existing launcher listed below. The managed startup path tries its preferred port, then up to 99 higher ports. It prints the selected address; use that address rather than an old bookmark.

## Entry points

- `npm start`

## Behavior

- Another application using a preferred port is left running.
- Paired frontend/backend launchers pass the selected API address to the frontend.
- Managed repeated launches from the same checkout are refused while the first launcher holds its lock.
- Keep the launcher open. Use Ctrl+C for an orderly stop; do not kill an arbitrary process by port.
- Missing dependencies and startup failures are reported instead of treating an unrelated page as this application.

Windows batch wrappers and Windows-specific process handling require native Windows verification; this change was tested on Linux.
