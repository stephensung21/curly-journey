-- Names a category still answers to after a rename or a merge, so built-in merchant and PocketSmith
-- mappings (which name categories) keep finding it.
alter table category add column if not exists aliases text[] not null default '{}';
update category set aliases = array[name] where cardinality(aliases) = 0;
