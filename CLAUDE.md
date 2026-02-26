## Workflow Rules

### GSD (Project Management)
- Use GSD for all phase-level work: planning, execution, and verification
- Follow the GSD flow: discuss → plan → execute → verify
- All new features go through GSD phases

### Superpowers (Troubleshooting & Code Quality)
- When a fix attempt fails twice during GSD execution, STOP the GSD flow
- Switch to Superpowers systematic-debugging (4-phase root cause analysis)
- Use Superpowers TDD: write failing test → make it pass → refactor
- Use Superpowers code-review between tasks to catch issues early
- Once the issue is resolved, return to the GSD flow

### Never Do
- Never guess-and-retry the same approach more than twice
- Never skip writing tests for new functionality
- Never continue building on top of broken code
```

To add it, open the file in any text editor or run this in your terminal from the project root:
```
notepad CLAUDE.md
```
