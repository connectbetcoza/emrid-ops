/**
 * Shared application types — barrel re-export.
 *
 * Mirrors the patient platform's split-by-entity convention. Sprint 1 ships
 * the staff `OpsUser`/`OpsRole`; future sprints add focused modules (work
 * items, queues, customers, …) and re-export them here.
 */
export * from "./user";
