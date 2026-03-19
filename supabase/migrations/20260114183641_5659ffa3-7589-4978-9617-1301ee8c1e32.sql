-- Project Wizard Drafts table for persistent wizard state
CREATE TABLE public.project_wizard_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID NOT NULL,
  name TEXT,
  bank_items JSONB NOT NULL DEFAULT '[]',
  floors JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.project_wizard_drafts ENABLE ROW LEVEL SECURITY;

-- RLS policies - only owner can access their drafts
CREATE POLICY "Users can view their own drafts"
ON public.project_wizard_drafts
FOR SELECT
USING (auth.uid() = created_by);

CREATE POLICY "Users can create their own drafts"
ON public.project_wizard_drafts
FOR INSERT
WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update their own drafts"
ON public.project_wizard_drafts
FOR UPDATE
USING (auth.uid() = created_by);

CREATE POLICY "Users can delete their own drafts"
ON public.project_wizard_drafts
FOR DELETE
USING (auth.uid() = created_by);

-- Trigger for updated_at
CREATE TRIGGER update_project_wizard_drafts_updated_at
BEFORE UPDATE ON public.project_wizard_drafts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();