update public.notifications
set redirect_url = replace(redirect_url, '/leads/', '/retainers/')
where redirect_url like '/leads/%';
