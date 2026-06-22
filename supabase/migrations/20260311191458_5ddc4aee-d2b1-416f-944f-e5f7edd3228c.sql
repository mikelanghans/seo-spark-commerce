ALTER TABLE public.generated_messages 
ADD CONSTRAINT generated_messages_org_text_unique 
UNIQUE (organization_id, message_text);