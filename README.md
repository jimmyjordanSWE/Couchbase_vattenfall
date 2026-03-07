## Couchbase Credentials

The Couchbase server username is `asdf` and the password is `asdfasdf`.

## Prerequisites

This repo is intended to run through the Bluetext/Polytope tooling layer, not a standalone `polytope` binary installed on your PATH.

To run the stack locally for this project, please ensure you have:

- Bluetext VS Code/Cursor extension installed
- Docker installed and running on your machine

## Running The Stack

Use the Bluetext-provided `pt` command or the MCP tools exposed by the extension:

```bash
pt run stack --mcp
```

If startup is failing with "polytope is not installed", the usual cause is that the Bluetext extension has not been installed or initialized in the editor session.
