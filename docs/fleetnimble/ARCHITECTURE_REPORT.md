# Architecture Report

See [AI_HANDOFF_PACKAGE.md](./AI_HANDOFF_PACKAGE.md) §1 and `docs/architecture/ENTERPRISE_ARCHITECTURE.md` for the full stack diagram.

**Production path:** Mobile HTTP → Express → PostgreSQL → Socket.IO → React dashboard.  
**Optional path:** Mobile MQTT → EMQX → `backend/src/mqtt/consumer.js` → same ingest pipeline.
