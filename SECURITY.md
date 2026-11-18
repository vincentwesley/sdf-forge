# Security policy

SDF Forge is a static website: there is no server, no accounts and no data leaves your browser.
Shared links carry the graph inside the URL fragment (`#g=…`), which browsers never send to the server.

## Reporting a vulnerability

Please report security problems privately through GitHub's
[private vulnerability reporting](https://github.com/vincentwesley/sdf-forge/security/advisories/new)
rather than opening a public issue. Include steps to reproduce and the browser you used.
You can expect an acknowledgement within a week.

## Scope notes

* Share links and `.sdf.json` files are untrusted input. They are parsed as JSON and normalised
  (`normalizeDoc`): unknown node types, malformed parameters, loops and oversized payloads are rejected.
  No string from a document is ever evaluated as code.
* Generated shader and JavaScript code is built only from the fixed node library and numeric
  parameters (numbers are formatted by the code generator, never interpolated from user text).
* Numeric fields accept simple arithmetic through a small hand-written parser, not `eval`.

## Supported versions

Only the latest version deployed at https://vincentwesley.github.io/sdf-forge/ is supported.
