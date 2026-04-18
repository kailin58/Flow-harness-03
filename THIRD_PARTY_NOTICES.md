# Third Party Notices

This document tracks third-party open-source projects referenced during Flow Harness research and design discussions.

The entries below are currently recorded as research/reference sources unless a later implementation explicitly vendors, copies, or depends on their code.

---

## GenericAgent

- Project: GenericAgent
- Repository: https://github.com/lsdefine/GenericAgent.git
- Package: https://pypi.org/project/genericagent/
- License: MIT License
- Current research note: [meeting/GenericAgent调研.md](meeting/GenericAgent调研.md)
- Intended use in Flow Harness: architecture and mechanism reference for atomic tools, self-evolving skills, bot entry points, browser/desktop automation, and structured memory.
- Current integration status: reference only; not imported as a runtime dependency.

Governance note:

GenericAgent concepts must be re-wrapped through Flow Harness `Tool Port`, `Skill Registry`, `VP11 / A2A Adapter`, `L4 / L8 / L12 / L15` governance gates, and S3 audit requirements before production use.

---

## RTK (Rust Token Killer)

- Project: RTK
- Repository: https://github.com/rtk-ai/rtk
- License: MIT License
- Local research notes:
  - [meeting/历史沟通/14-1/README.md](meeting/历史沟通/14-1/README.md)
  - [meeting/历史沟通/14-1/深度分析报告.md](meeting/历史沟通/14-1/深度分析报告.md)
- Intended use in Flow Harness: reference for command-output filtering, token compression, usage tracking, and cost-control design.
- Current integration status: reference only; not imported as a runtime dependency.

---

## Everything Claude Code

- Project: Everything Claude Code
- Repository: https://github.com/affaan-m/everything-claude-code
- License: MIT License
- Local research notes:
  - [meeting/历史沟通/13-1/README.md](meeting/历史沟通/13-1/README.md)
  - [meeting/历史沟通/13-1/深度分析报告.md](meeting/历史沟通/13-1/深度分析报告.md)
- Intended use in Flow Harness: reference for agents, skills, hooks, commands, rules, MCP configuration patterns, and multi-platform coding-agent workflows.
- Current integration status: reference only; not imported as a runtime dependency.

---

## Compliance Rule

For any third-party project that moves from "reference only" to copied code, vendored assets, package dependency, or runtime service dependency:

1. Preserve upstream copyright and license notices.
2. Record source repository, version or commit, license, and copied scope.
3. Run Flow Harness dependency/source/license checks.
4. Route high-risk licenses or unclear licensing through the governance approval chain.
5. Ensure external tools, agents, models, and MCP interfaces follow Flow Harness external-boundary rules.

