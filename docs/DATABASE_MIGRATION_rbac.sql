-- Postrail RBAC Implementation
-- Created: 2025-11-21
-- Purpose: Add Role-Based Access Control with secure admin role management
--
-- This migration creates:
-- 1. user_roles table for role assignments
-- 2. RLS policies for role management
-- 3. Helper functions for role checking
-- 4. Initial admin role assignment capability
--
-- Security Design:
-- - Principle of least privilege (users have no role by default)
-- - Defense-in-depth (RLS + application-level checks)
-- - Audit trail (tracks who assigned roles when)
-- - Secure by default (only admins can assign roles)

-- ============================================================================
-- 1. CREATE user_roles TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role text NOT NULL CHECK (role IN ('admin', 'user')),
  assigned_by uuid REFERENCES auth.users(id),
  assigned_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  revoked_at timestamp with time zone,
  is_active boolean DEFAULT true NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,

  -- Ensure one active role per user (users can only have one role at a time)
  CONSTRAINT user_roles_user_active_unique
    UNIQUE (user_id, is_active)
    WHERE (is_active = true)
);

-- Add index for fast role lookups (critical for every admin check)
CREATE INDEX IF NOT EXISTS idx_user_roles_user_active
  ON public.user_roles(user_id, is_active)
  WHERE is_active = true;

-- Add index for audit queries
CREATE INDEX IF NOT EXISTS idx_user_roles_assigned_by
  ON public.user_roles(assigned_by, assigned_at DESC);

-- Add updated_at tracking
ALTER TABLE public.user_roles
  ADD COLUMN updated_at timestamp with time zone DEFAULT now();

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION update_user_roles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_user_roles_updated_at_trigger
  BEFORE UPDATE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION update_user_roles_updated_at();

-- ============================================================================
-- 2. ROW LEVEL SECURITY POLICIES
-- ============================================================================

-- Enable RLS
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Policy 1: All authenticated users can view their own role
CREATE POLICY "Users can view their own role"
  ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id);

-- Policy 2: Admins can view all roles (for audit/management)
CREATE POLICY "Admins can view all roles"
  ON public.user_roles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'admin'
        AND ur.is_active = true
    )
  );

-- Policy 3: Only admins can assign roles
CREATE POLICY "Admins can insert roles"
  ON public.user_roles FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'admin'
        AND ur.is_active = true
    )
  );

-- Policy 4: Only admins can update roles (revoke/reactivate)
CREATE POLICY "Admins can update roles"
  ON public.user_roles FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'admin'
        AND ur.is_active = true
    )
  );

-- Policy 5: Only admins can delete roles (hard delete for compliance)
CREATE POLICY "Admins can delete roles"
  ON public.user_roles FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'admin'
        AND ur.is_active = true
    )
  );

-- ============================================================================
-- 3. HELPER FUNCTIONS FOR ROLE CHECKING
-- ============================================================================

-- Function: Check if user has specific role
-- Used by: Application code and other database functions
-- Returns: boolean
CREATE OR REPLACE FUNCTION public.user_has_role(
  check_user_id uuid,
  check_role text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER -- Run with elevated privileges for RLS bypass
STABLE -- Function result doesn't change within transaction
AS $$
DECLARE
  has_role boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = check_user_id
      AND role = check_role
      AND is_active = true
  ) INTO has_role;

  RETURN COALESCE(has_role, false);
END;
$$;

-- Function: Check if current user is admin
-- Used by: API routes for quick admin checks
-- Returns: boolean
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  RETURN public.user_has_role(auth.uid(), 'admin');
END;
$$;

-- Function: Get user's active role
-- Used by: User profile pages, admin dashboards
-- Returns: text (role name) or NULL
CREATE OR REPLACE FUNCTION public.get_user_role(check_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  user_role text;
BEGIN
  SELECT role INTO user_role
  FROM public.user_roles
  WHERE user_id = check_user_id
    AND is_active = true
  LIMIT 1;

  RETURN user_role;
END;
$$;

-- Function: Assign role to user (with audit trail)
-- Used by: Admin role management API
-- Returns: uuid (role assignment ID)
CREATE OR REPLACE FUNCTION public.assign_role(
  target_user_id uuid,
  new_role text,
  assigner_user_id uuid DEFAULT auth.uid()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  role_id uuid;
  is_assigner_admin boolean;
BEGIN
  -- Security check: Only admins can assign roles
  SELECT public.user_has_role(assigner_user_id, 'admin') INTO is_assigner_admin;

  IF NOT is_assigner_admin THEN
    RAISE EXCEPTION 'Only admins can assign roles';
  END IF;

  -- Validation: Check role is valid
  IF new_role NOT IN ('admin', 'user') THEN
    RAISE EXCEPTION 'Invalid role: %. Must be admin or user', new_role;
  END IF;

  -- Revoke existing active role (soft delete)
  UPDATE public.user_roles
  SET is_active = false, revoked_at = now()
  WHERE user_id = target_user_id
    AND is_active = true;

  -- Insert new role assignment
  INSERT INTO public.user_roles (
    user_id,
    role,
    assigned_by,
    is_active
  ) VALUES (
    target_user_id,
    new_role,
    assigner_user_id,
    true
  ) RETURNING id INTO role_id;

  RETURN role_id;
END;
$$;

-- Function: Revoke user's role
-- Used by: Admin role management API
-- Returns: boolean (success)
CREATE OR REPLACE FUNCTION public.revoke_role(
  target_user_id uuid,
  revoker_user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  is_revoker_admin boolean;
BEGIN
  -- Security check: Only admins can revoke roles
  SELECT public.user_has_role(revoker_user_id, 'admin') INTO is_revoker_admin;

  IF NOT is_revoker_admin THEN
    RAISE EXCEPTION 'Only admins can revoke roles';
  END IF;

  -- Revoke active role (soft delete)
  UPDATE public.user_roles
  SET is_active = false, revoked_at = now()
  WHERE user_id = target_user_id
    AND is_active = true;

  RETURN true;
END;
$$;

-- ============================================================================
-- 4. INITIAL SETUP & VALIDATION
-- ============================================================================

-- Create helper view for active roles (optional, for easier querying)
CREATE OR REPLACE VIEW public.active_user_roles AS
SELECT
  ur.user_id,
  ur.role,
  ur.assigned_at,
  ur.assigned_by,
  u.email as user_email
FROM public.user_roles ur
JOIN auth.users u ON u.id = ur.user_id
WHERE ur.is_active = true;

-- Grant permissions (Supabase handles this, but explicit for clarity)
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT ON public.user_roles TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_role(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_role(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_role(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_role(uuid, uuid) TO authenticated;

-- ============================================================================
-- 5. MANUAL ADMIN ASSIGNMENT (First Admin Bootstrap)
-- ============================================================================

-- IMPORTANT: Uncomment and run this section ONCE to create the first admin
-- Replace 'YOUR_USER_ID' with the actual user ID from auth.users table
--
-- To find your user ID, run:
-- SELECT id, email FROM auth.users WHERE email = 'your-email@example.com';
--
-- Then uncomment and execute:
--
-- INSERT INTO public.user_roles (user_id, role, assigned_by, is_active)
-- VALUES (
--   'YOUR_USER_ID'::uuid,  -- Replace with actual user ID
--   'admin',
--   'YOUR_USER_ID'::uuid,  -- Self-assigned for first admin
--   true
-- );
--
-- After first admin is created, use assign_role() function or admin API

-- ============================================================================
-- 6. VERIFICATION QUERIES
-- ============================================================================

-- Verify table created
-- SELECT * FROM information_schema.tables WHERE table_name = 'user_roles';

-- Verify indexes created
-- SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'user_roles';

-- Verify functions created
-- SELECT routine_name FROM information_schema.routines
-- WHERE routine_schema = 'public'
-- AND routine_name IN ('user_has_role', 'is_admin', 'get_user_role', 'assign_role', 'revoke_role');

-- Verify RLS enabled
-- SELECT tablename, rowsecurity FROM pg_tables WHERE tablename = 'user_roles';

-- Verify policies created
-- SELECT policyname, tablename FROM pg_policies WHERE tablename = 'user_roles';

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================

-- Migration Applied: user_roles table, RLS policies, helper functions
-- Next Steps:
-- 1. Find your user ID from auth.users table
-- 2. Uncomment and execute the first admin assignment (section 5)
-- 3. Test admin role checking in application
-- 4. Use assign_role() function or admin API for subsequent role assignments
