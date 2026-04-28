# Admin Architecture

## Primary Interface

- `admin-dashboard/` is the primary web admin interface for ongoing development.

## Secondary Interface

- `app/admin/` is the in-app admin experience used for quick operational tasks and mobile-first workflows.

## Legacy / Deprecated

- `admin/` is legacy. Keep it only while migration dependencies still exist.

## Migration Plan (TODO)

- [ ] Compare route-by-route feature parity between `admin/` and `admin-dashboard/`.
- [ ] Move any missing pages/components from `admin/` into `admin-dashboard/`.
- [ ] Repoint deployment/docs to `admin-dashboard/` only.
- [ ] Remove dead API routes or duplicate helpers in `admin/`.
- [ ] Delete `admin/` once parity and rollout checks pass.
