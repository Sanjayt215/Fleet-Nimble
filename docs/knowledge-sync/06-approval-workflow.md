# Approval Workflow

## State Machine

```
                    ┌─────────┐
                    │DISCOVERED│
                    └────┬────┘
                         │ crawl + extract
                         ▼
                    ┌─────────┐
                    │EXTRACTED│
                    └────┬────┘
                         │ validate
                         ▼
                    ┌──────────┐
                    │ VALIDATED │
                    └────┬─────┘
                         │ diff check
                         ▼
                   ┌──────────────┐
                   │ NEEDS_REVIEW │◄────── auto if requiresApproval=true
                   └──────┬───────┘
                          │
              ┌───────────┴───────────┐
              │                       │
              ▼                       ▼
        ┌──────────┐           ┌──────────┐
        │ APPROVED │           │ REJECTED │
        └─────┬────┘           └──────────┘
              │
              ▼
        ┌────────┐
        │ ACTIVE │ ◄──── visible to SynchronizedContentProvider
        └────────┘
              │
              │ (archive)
              ▼
        ┌──────────┐
        │ ARCHIVED │
        └──────────┘
```

## Auto-Approval

If a source has `requiresApproval=false`, articles that pass validation without conflicts
are automatically approved and activated without admin intervention.

## Versioning

Every time an article is approved while it already has an APPROVED/ACTIVE state,
the previous version is saved to `KnowledgeArticleVersion` before the new version replaces it.

## Approval Actions

| Action | Method | Description |
|---|---|---|
| Approve | POST `/admin/knowledge/staged/:id/approve` | Moves to ACTIVE, creates version snapshot |
| Reject | POST `/admin/knowledge/staged/:id/reject` | Moves to REJECTED with reason |
| Archive | POST `/admin/knowledge/staged/:id/archive` | Moves to ARCHIVED, removes from active provider |
| Restore | POST `/admin/knowledge/staged/:id/restore/:version` | Restores a historic version as ACTIVE |

## Audit Trail

Every approval action creates a `KnowledgeApprovalEvent` with:
- Action type (APPROVED, REJECTED, ARCHIVED, RESTORED, AUTO_APPROVED)
- Actor ID (admin userId or "system")
- Notes/reason
- Previous and new status
- Timestamp
