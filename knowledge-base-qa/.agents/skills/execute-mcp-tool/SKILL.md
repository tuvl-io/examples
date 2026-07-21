# execute-mcp-tool
description: Call a Model Context Protocol (MCP) server tool via stdio or SSE.
options:
  argument-hint: "[tool-name]"

### Body

1. Declare the server connection as a `type: mcp` structured artifact in the
   project's `artifacts/` directory (transport config never lives on the step):
   ```yaml
   # artifacts/search-server.yaml — SSE transport
   kind: Artifact
   version: v1
   enabled: true
   metadata:
     name: search-server
     description: SSE MCP search server.
   spec:
     type: mcp
     transport: sse
     url: http://localhost:3001/sse
   ```
   For a local **stdio** transport, define `command` and `args` instead of a URL
   (`${VAR}` in `env:` expands from the environment):
   ```yaml
   spec:
     type: mcp
     transport: stdio
     command: npx
     args: ["@modelcontextprotocol/server-github"]
     env:
       GITHUB_TOKEN: "${GITHUB_TOKEN}"
   ```
2. Add a step of `kind: MCP` that references the server artifact (pin the
   version) and names the tool:
   ```yaml
   - id: search_mcp
     kind: MCP
     mcp:
       server: artifact://search-server@1
       tool: search
       arguments:
         query: "{{ user_query }}"
     response:
       output_key: mcp_result
     routes:
       default: next_step
       error: END
   ```
