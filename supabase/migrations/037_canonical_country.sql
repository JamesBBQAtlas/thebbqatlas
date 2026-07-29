-- Canonicalise country names to one value each so the directory shows a single
-- chip per country and counts add up. Matches lib/constants/countries.ts's
-- canonicalCountry(), which now normalises all enrichment/roster output too.
update restaurants set country = 'United States'
  where country in ('USA','US','U.S.','U.S.A.','United States of America','America');
update restaurants set country = 'United Kingdom'
  where country in ('UK','U.K.','Great Britain','Britain','England','Scotland','Wales');
update restaurants set country = 'Mexico' where country in ('México','Méjico');
update restaurants set country = 'United Arab Emirates' where country in ('UAE','U.A.E.');
update restaurants set country = 'South Korea' where country in ('Korea','Republic of Korea');
update restaurants set country = 'Netherlands' where country in ('The Netherlands','Holland');
