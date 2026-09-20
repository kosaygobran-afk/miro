# Architecture Boundaries

## Rendering/Caching Decisions
- Public content is server-rendered and cached appropriately.
- Private content is rendered on the server with user-specific data.
- Client components are used for interactions (theme switching, mobile navigation, forms).

## Data Flow
- Route files handle framework conventions and compose screens.
- Feature modules contain business validation, components, and use cases.
- Server-only data access verifies identity and permissions and queries Supabase.
- Database constraints, grants, and row-level security enforce data ownership.
- Shared UI components contain presentation and accessibility, not hidden business permissions.