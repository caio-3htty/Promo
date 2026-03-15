CREATE TABLE IF NOT EXISTS public.access_signup_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_type text NOT NULL CHECK (request_type IN ('company_owner', 'company_internal')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'edited')),
  applicant_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  applicant_email text NOT NULL,
  applicant_full_name text NOT NULL,
  company_name text NOT NULL,
  requested_username text NOT NULL,
  requested_job_title text NOT NULL,
  requested_role public.app_role NOT NULL DEFAULT 'operacional'::public.app_role,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
  approval_token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  approver_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approver_email text,
  reviewed_username text,
  reviewed_job_title text,
  reviewed_role public.app_role,
  review_notes text,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_access_signup_requests_status ON public.access_signup_requests (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_access_signup_requests_tenant_id ON public.access_signup_requests (tenant_id);
CREATE INDEX IF NOT EXISTS idx_access_signup_requests_applicant ON public.access_signup_requests (applicant_user_id);

ALTER TABLE public.access_signup_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own access requests" ON public.access_signup_requests;
CREATE POLICY "Users can view own access requests"
ON public.access_signup_requests
FOR SELECT
USING (auth.uid() = applicant_user_id OR auth.uid() = approver_user_id);

DROP TRIGGER IF EXISTS update_access_signup_requests_updated_at ON public.access_signup_requests;
CREATE TRIGGER update_access_signup_requests_updated_at
BEFORE UPDATE ON public.access_signup_requests
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
