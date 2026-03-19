-- Create workers table for tracking individual workers
CREATE TABLE public.workers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_number integer NOT NULL UNIQUE,
  name text NOT NULL,
  department text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.workers ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read workers (for selection dropdown)
CREATE POLICY "Authenticated users can view workers"
ON public.workers FOR SELECT TO authenticated
USING (true);

-- Only owners/managers can manage workers
CREATE POLICY "Owners can manage workers"
ON public.workers FOR ALL TO authenticated
USING (public.is_app_owner() OR public.has_role(auth.uid(), 'manager'))
WITH CHECK (public.is_app_owner() OR public.has_role(auth.uid(), 'manager'));

-- Create worker sessions table to track which worker is active on which email/station
CREATE TABLE public.worker_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  worker_id uuid NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
  station text,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  CONSTRAINT max_two_workers_per_user CHECK (true) -- We'll enforce this in code
);

-- Enable RLS
ALTER TABLE public.worker_sessions ENABLE ROW LEVEL SECURITY;

-- Workers can manage their own sessions
CREATE POLICY "Users can manage own sessions"
ON public.worker_sessions FOR ALL TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Owners/managers can view all sessions
CREATE POLICY "Managers can view all sessions"
ON public.worker_sessions FOR SELECT TO authenticated
USING (public.is_app_owner() OR public.has_role(auth.uid(), 'manager'));

-- Add worker_id to worker_activity_logs to track individual worker
ALTER TABLE public.worker_activity_logs 
ADD COLUMN worker_id uuid REFERENCES public.workers(id);

-- Add index for performance
CREATE INDEX idx_worker_sessions_user_active ON public.worker_sessions(user_id, is_active) WHERE is_active = true;
CREATE INDEX idx_worker_activity_logs_worker ON public.worker_activity_logs(worker_id);
CREATE INDEX idx_workers_card_number ON public.workers(card_number);

-- Trigger for updated_at
CREATE TRIGGER update_workers_updated_at
BEFORE UPDATE ON public.workers
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert all workers from the Excel data
INSERT INTO public.workers (card_number, name, department) VALUES
(34, 'סעיד אבו סאלח', 'ייצור'),
(38, 'עראבי אחמד', 'ייצור'),
(43, 'חליל חליל', 'ייצור'),
(61, 'טהאר חדר', 'מסגרות'),
(94, 'דיבילקין אנטון', 'ייצור'),
(97, 'סודרי שמעון', 'ייצור'),
(100, 'חליל עותמאן', 'ייצור'),
(104, 'מיכאילוב גנאדי', 'ייצור'),
(107, 'חליל זאהר', 'ייצור'),
(115, 'פלישמן ודים', 'ייצור'),
(117, 'דובוב ולדימיר', 'מסגרות'),
(118, 'מאזן מנאע', 'ייצור'),
(138, 'מועתסם שאער', 'ייצור'),
(143, 'גדבאן אחמד', 'מסגרות'),
(235, 'אחמד קאסם', 'ייצור'),
(253, 'קרוטיק ודים', 'ייצור'),
(263, 'אחמד סטרי', 'ייצור'),
(268, 'אסדי עלי', 'ייצור'),
(271, 'אחמד עלי', 'ייצור'),
(277, 'מג''ד מנאע', 'ייצור'),
(282, 'אחמד ג''ומעה', 'ייצור'),
(283, 'אג''יוד חליל', 'ייצור'),
(285, 'מאדי חליל מסגרות', 'מסגרות'),
(287, 'נעים מוחמד', 'ייצור'),
(299, 'אביחי קוסטיקה', 'ייצור'),
(301, 'חליל מוחמד', 'ייצור'),
(303, 'פאקון PHALAKON', 'ייצור'),
(305, 'סמוראי SAMRUAI', 'ייצור'),
(306, 'NARONGSAK', 'ייצור'),
(307, 'אוו WAYO', 'ייצור'),
(308, 'KRISSADA', 'ייצור'),
(310, 'קיאת PARHAWIN', 'ייצור'),
(312, 'נון PATIYAN', 'ייצור'),
(314, 'הוראני מוהנד', 'ייצור'),
(315, 'THONGCHAI', 'ייצור'),
(316, 'לאקלה LEKKLA', 'ייצור'),
(317, 'חאג'' מוחמד', 'ייצור'),
(318, 'SURADACH', 'ייצור'),
(319, 'NITINAI', 'ייצור');