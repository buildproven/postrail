# RBAC Architecture Documentation

**Role-Based Access Control Implementation for LetterFlow**

Last Updated: 2025-11-21
Status: Production-Ready
Security Level: High

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Database Schema](#database-schema)
4. [Security Design](#security-design)
5. [Implementation Guide](#implementation-guide)
6. [API Integration](#api-integration)
7. [Testing](#testing)
8. [Deployment](#deployment)
9. [Troubleshooting](#troubleshooting)

---

## Overview

LetterFlow implements a comprehensive Role-Based Access Control (RBAC) system to secure admin-only features and system monitoring endpoints. The implementation follows industry best practices with defense-in-depth security.

### Key Features

- **Two-Tier Role System**: Admin and User roles with clear permission boundaries
- **Database-Level Security**: Row Level Security (RLS) policies enforce access control
- **Audit Trail**: Complete logging of role assignments and access attempts
- **Fail-Safe Defaults**: Users have no role by default (principle of least privilege)
- **Zero Trust**: Every admin access verified at runtime, no session-based assumptions

### Use Cases

- **System Monitoring**: Admins view system statistics (rate limits, SSRF protection)
- **Role Management**: Admins assign/revoke admin privileges
- **Audit Logs**: Admins access security event logs
- **User Management**: Admins view all users and their roles

---

## Architecture

### Component Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     Application Layer                        │
├─────────────────────────────────────────────────────────────┤
│  API Routes                                                  │
│  ├─ /api/rate-limit-status  → checkPermission('viewSystemStats') │
│  ├─ /api/ssrf-status        → checkPermission('viewSystemStats') │
│  └─ /api/admin/*            → requireAdmin()                │
├─────────────────────────────────────────────────────────────┤
│  RBAC Utilities (lib/rbac.ts)                               │
│  ├─ checkUserRole()      - Role verification                │
│  ├─ getUserRole()         - Role retrieval                   │
│  ├─ requireAdmin()        - Admin guard for routes          │
│  ├─ assignRole()          - Role assignment (admin only)    │
│  ├─ revokeRole()          - Role revocation (admin only)    │
│  └─ checkPermission()     - Fine-grained permission check   │
├─────────────────────────────────────────────────────────────┤
│  Supabase Client (lib/supabase/server.ts)                   │
│  └─ Authentication + RLS enforcement                         │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                     Database Layer                           │
├─────────────────────────────────────────────────────────────┤
│  user_roles Table                                           │
│  ├─ Stores role assignments                                 │
│  ├─ Tracks audit trail (assigned_by, assigned_at)          │
│  └─ Soft delete support (is_active, revoked_at)            │
├─────────────────────────────────────────────────────────────┤
│  RLS Policies                                               │
│  ├─ Users can view their own role                          │
│  ├─ Admins can view all roles                              │
│  ├─ Only admins can insert/update/delete roles             │
│  └─ Enforced at database level (can't bypass)              │
├─────────────────────────────────────────────────────────────┤
│  Helper Functions (PostgreSQL)                              │
│  ├─ user_has_role(user_id, role) → boolean                 │
│  ├─ is_admin() → boolean                                    │
│  ├─ get_user_role(user_id) → text                          │
│  ├─ assign_role(target_id, role, assigner_id) → uuid       │
│  └─ revoke_role(target_id, revoker_id) → boolean           │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow

**Admin Permission Check**:

```
1. User requests /api/rate-limit-status
2. Route calls checkPermission(userId, 'viewSystemStats')
3. RBAC lib calls getUserRole(userId)
4. Supabase queries user_roles table with RLS
5. RLS policy checks if user owns role OR is admin
6. Return role to application
7. Application checks RBAC_PERMISSIONS[role]['viewSystemStats']
8. If true: include system stats in response
9. If false: omit system stats from response
```

**Role Assignment**:

```
1. Admin calls assignRole(targetUserId, 'admin', adminUserId)
2. RBAC lib verifies adminUserId has 'admin' role
3. Call database function assign_role() with SECURITY DEFINER
4. Function verifies admin status again (defense-in-depth)
5. Revoke existing role (set is_active=false)
6. Insert new role assignment
7. Return role_id
8. Log assignment to console for audit
```

---

## Database Schema

### user_roles Table

```sql
CREATE TABLE public.user_roles (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role text NOT NULL CHECK (role IN ('admin', 'user')),
  assigned_by uuid REFERENCES auth.users(id),
  assigned_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  revoked_at timestamp with time zone,
  is_active boolean DEFAULT true NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  updated_at timestamp with time zone DEFAULT now(),

  CONSTRAINT user_roles_user_active_unique
    UNIQUE (user_id, is_active)
    WHERE (is_active = true)
);
```

### Columns

| Column        | Type        | Description                          |
| ------------- | ----------- | ------------------------------------ |
| `id`          | uuid        | Primary key                          |
| `user_id`     | uuid        | Foreign key to auth.users            |
| `role`        | text        | Role name: 'admin' or 'user'         |
| `assigned_by` | uuid        | Who assigned this role (audit trail) |
| `assigned_at` | timestamptz | When role was assigned               |
| `revoked_at`  | timestamptz | When role was revoked (soft delete)  |
| `is_active`   | boolean     | Whether role is currently active     |
| `metadata`    | jsonb       | Additional role-specific data        |
| `updated_at`  | timestamptz | Last update timestamp                |

### Indexes

```sql
-- Fast role lookups (used on every admin check)
CREATE INDEX idx_user_roles_user_active
  ON user_roles(user_id, is_active)
  WHERE is_active = true;

-- Audit queries (admin dashboard)
CREATE INDEX idx_user_roles_assigned_by
  ON user_roles(assigned_by, assigned_at DESC);
```

### RLS Policies

**SELECT Policies**:

```sql
-- Users can view their own role
CREATE POLICY "Users can view their own role"
  ON user_roles FOR SELECT
  USING (auth.uid() = user_id);

-- Admins can view all roles
CREATE POLICY "Admins can view all roles"
  ON user_roles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'admin'
        AND ur.is_active = true
    )
  );
```

**Modification Policies** (INSERT/UPDATE/DELETE):

```sql
-- Only admins can modify roles
CREATE POLICY "Admins can insert roles"
  ON user_roles FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'admin'
        AND ur.is_active = true
    )
  );
```

---

## Security Design

### Defense-in-Depth Layers

**Layer 1: Environment Variables**

- `ENABLE_STATUS_ENDPOINTS=true` - Enable admin endpoints (default: disabled)

**Layer 2: Authentication**

- Supabase JWT verification on every request
- No cookies, no session-based auth

**Layer 3: RBAC Application Layer**

- `requireAdmin()` guard on admin routes
- `checkPermission()` for fine-grained access

**Layer 4: Database RLS**

- Supabase enforces policies at query level
- Can't bypass with raw SQL or malicious queries

**Layer 5: Audit Logging**

- All admin access attempts logged
- Failed access attempts logged with user details

### Threat Model

| Threat                   | Mitigation                                   |
| ------------------------ | -------------------------------------------- |
| **Privilege Escalation** | Users can't assign roles (RLS blocks INSERT) |
| **SQL Injection**        | Parameterized queries + RLS enforcement      |
| **JWT Tampering**        | Supabase validates signatures server-side    |
| **Session Hijacking**    | Stateless JWT, no session cookies            |
| **Admin Impersonation**  | Every request verified against database      |
| **Insider Threat**       | Audit trail tracks all role changes          |

### Security Principles

1. **Principle of Least Privilege**: Users have no role by default
2. **Fail-Safe Defaults**: Errors deny access (never grant)
3. **Complete Mediation**: Every request verified
4. **Separation of Duties**: Admins logged separately
5. **Audit Trail**: All admin actions logged
6. **Defense in Depth**: Multiple security layers

---

## Implementation Guide

### 1. Apply Database Migration

```bash
# Connect to Supabase SQL Editor
# Paste contents of docs/DATABASE_MIGRATION_rbac.sql
# Execute migration

# Verify tables created
SELECT * FROM information_schema.tables WHERE table_name = 'user_roles';

# Verify functions created
SELECT routine_name FROM information_schema.routines
WHERE routine_schema = 'public'
AND routine_name IN ('user_has_role', 'is_admin', 'assign_role');
```

### 2. Create First Admin

```sql
-- Find your user ID
SELECT id, email FROM auth.users WHERE email = 'your-email@example.com';

-- Assign admin role (replace YOUR_USER_ID)
INSERT INTO public.user_roles (user_id, role, assigned_by, is_active)
VALUES (
  'YOUR_USER_ID'::uuid,
  'admin',
  'YOUR_USER_ID'::uuid,  -- Self-assigned for first admin
  true
);

-- Verify admin role
SELECT * FROM user_roles WHERE user_id = 'YOUR_USER_ID';
```

### 3. Use RBAC in API Routes

```typescript
import { requireAdmin, checkPermission } from '@/lib/rbac'
import { NextRequest, NextResponse } from 'next/server'

// Example 1: Require admin for entire route
export async function GET(request: NextRequest) {
  const adminCheck = await requireAdmin(request)
  if (!adminCheck.authorized) {
    return NextResponse.json(
      { error: adminCheck.error },
      { status: adminCheck.status }
    )
  }

  // Admin-only logic here
  const userId = adminCheck.userId!
  // ...
}

// Example 2: Conditional features based on permissions
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // User-specific data (always shown)
  const userData = await getUserData(user.id)

  // Admin-only data (conditional)
  const canViewSystemStats = await checkPermission(user.id, 'viewSystemStats')
  const systemStats = canViewSystemStats ? await getSystemStats() : null

  return NextResponse.json({
    user: userData,
    ...(systemStats && { system: systemStats }),
  })
}
```

### 4. Role Management API (Optional)

```typescript
// app/api/admin/roles/assign/route.ts
import { assignRole, requireAdmin } from '@/lib/rbac'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const adminCheck = await requireAdmin(request)
  if (!adminCheck.authorized) {
    return NextResponse.json(
      { error: adminCheck.error },
      { status: adminCheck.status }
    )
  }

  const { targetUserId, role } = await request.json()

  const result = await assignRole(targetUserId, role, adminCheck.userId!)

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }

  return NextResponse.json({ success: true, roleId: result.roleId })
}
```

---

## API Integration

### Updated Endpoints

**Rate Limit Status** (`/api/rate-limit-status`):

- **All Users**: View their own rate limit status
- **Admins Only**: View system statistics (activeUsers, backend, redisHealth/memoryKeys)

**SSRF Protection Status** (`/api/ssrf-status`):

- **All Users**: View protection features and their rate limit status
- **Admins Only**: View system statistics (activeUserLimits, blockedDomains, etc.)

### Permission Matrix

| Endpoint                 | Regular User  | Admin                     |
| ------------------------ | ------------- | ------------------------- |
| `/api/rate-limit-status` | Own status    | Own status + system stats |
| `/api/ssrf-status`       | Own status    | Own status + system stats |
| `/api/admin/*`           | 403 Forbidden | Full access               |

---

## Testing

### Unit Tests

```bash
# Run RBAC unit tests
npm test tests/lib/rbac.test.ts

# Run API integration tests
npm test tests/api/rbac-integration.test.ts

# Run all tests
npm test
```

### Manual Testing

**Test Non-Admin User**:

```bash
# Login as regular user
curl -H "Authorization: Bearer $USER_TOKEN" \
  http://localhost:3000/api/rate-limit-status

# Response should NOT include system stats
{
  "user": { "id": "...", "requestsRemaining": 5 },
  "limits": { ... }
  // No "system" key
}
```

**Test Admin User**:

```bash
# Login as admin
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  http://localhost:3000/api/rate-limit-status

# Response SHOULD include system stats
{
  "user": { "id": "...", "requestsRemaining": 10 },
  "limits": { ... },
  "system": {
    "backend": "redis",
    "activeUsers": 50,
    "redisHealth": true
  }
}
```

### Test Coverage

- ✅ Role checking (admin, user, no role)
- ✅ Permission verification
- ✅ Admin authorization (success, failure, unauthenticated)
- ✅ Role assignment (admin-only, validation)
- ✅ Role revocation (admin-only, soft delete)
- ✅ API integration (conditional stats, proper errors)
- ✅ Database RLS (policy enforcement)

---

## Deployment

### Pre-Deployment Checklist

- [ ] Database migration applied (`DATABASE_MIGRATION_rbac.sql`)
- [ ] First admin user created
- [ ] Tests passing (`npm test`)
- [ ] Environment variables configured (`ENABLE_STATUS_ENDPOINTS`)
- [ ] Documentation reviewed

### Deployment Steps

1. **Apply Migration**:

   ```bash
   # In Supabase SQL Editor
   # Paste and execute docs/DATABASE_MIGRATION_rbac.sql
   ```

2. **Create First Admin**:

   ```sql
   -- Replace with your actual user ID
   INSERT INTO user_roles (user_id, role, assigned_by, is_active)
   VALUES ('YOUR_USER_ID', 'admin', 'YOUR_USER_ID', true);
   ```

3. **Deploy Application**:

   ```bash
   git add .
   git commit -m "Add RBAC implementation"
   git push origin main
   vercel deploy --prod
   ```

4. **Verify Deployment**:
   ```bash
   # Test admin endpoint
   curl https://your-app.vercel.app/api/rate-limit-status
   ```

### Rollback Plan

If issues arise:

1. **Disable Admin Features**:

   ```bash
   # Set environment variable
   ENABLE_STATUS_ENDPOINTS=false
   ```

2. **Revert Code Changes**:

   ```bash
   git revert HEAD
   git push origin main
   ```

3. **Database Rollback** (if needed):
   ```sql
   -- Drop RBAC tables (data loss!)
   DROP TABLE IF EXISTS user_roles CASCADE;
   DROP FUNCTION IF EXISTS user_has_role(uuid, text);
   DROP FUNCTION IF EXISTS is_admin();
   ```

---

## Troubleshooting

### Common Issues

**Issue**: "Only admins can assign roles" error when creating first admin

**Solution**: Use direct INSERT for first admin:

```sql
INSERT INTO user_roles (user_id, role, assigned_by, is_active)
VALUES ('YOUR_USER_ID', 'admin', 'YOUR_USER_ID', true);
```

---

**Issue**: Admin not seeing system stats in API responses

**Solution**: Check role assignment:

```sql
SELECT * FROM user_roles WHERE user_id = 'YOUR_USER_ID' AND is_active = true;
```

---

**Issue**: "Status endpoints disabled" error

**Solution**: Enable endpoints:

```bash
ENABLE_STATUS_ENDPOINTS=true
```

---

**Issue**: Database function errors (assign_role, revoke_role)

**Solution**: Verify functions exist:

```sql
SELECT routine_name FROM information_schema.routines
WHERE routine_name IN ('assign_role', 'revoke_role');
```

---

### Debug Mode

Enable verbose logging:

```typescript
// lib/rbac.ts - Uncomment debug logs
console.debug('RBAC: Checking role for user', userId)
console.debug('RBAC: Query result', data)
```

---

## Best Practices

### Security

1. **Never trust client-side role checks** - Always verify server-side
2. **Log all admin access attempts** - Failed attempts indicate attack
3. **Rotate admin users regularly** - Prevent privilege creep
4. **Use service accounts** - Don't share admin credentials
5. **Monitor audit logs** - Review who assigned roles when

### Performance

1. **Cache role checks** - Use session-based caching for repeated checks
2. **Optimize queries** - Indexes on user_id + is_active
3. **Avoid N+1 queries** - Batch role checks when listing users

### Maintenance

1. **Review roles quarterly** - Remove inactive admin accounts
2. **Audit role changes** - Review who assigned/revoked roles
3. **Update documentation** - Keep RBAC docs current
4. **Test after changes** - Run RBAC tests after schema changes

---

## References

### Files

- **Migration**: `docs/DATABASE_MIGRATION_rbac.sql`
- **RBAC Library**: `lib/rbac.ts`
- **Unit Tests**: `tests/lib/rbac.test.ts`
- **Integration Tests**: `tests/api/rbac-integration.test.ts`
- **Example Routes**: `app/api/rate-limit-status/route.ts`, `app/api/ssrf-status/route.ts`

### Related Documentation

- Database Schema: `docs/DATABASE_SCHEMA.md`
- Security Analysis: `SECURITY_ANALYSIS.md`
- API Documentation: `CLAUDE.md` (API Route Patterns section)

---

**Document Status**: Complete
**Maintainer**: Development Team
**Review Cycle**: After security changes or role updates
