-- Tira prefixos de modelo dos títulos já gravados, inclusive os aninhados.

update public.project_steps as step
set title = cleaned.title
from (
  select
    id,
    case
      when btrim(stripped) = '' then 'Fazer o próximo passo'
      else upper(substr(btrim(stripped), 1, 1)) || substr(btrim(stripped), 2)
    end as title
  from (
    select
      id,
      regexp_replace(
        regexp_replace(
          regexp_replace(
            title,
            '(esclarecer o resultado de|fazer o miolo de|revisar e fechar)[[:space:]]*:?[[:space:]]*',
            '',
            'gi'
          ),
          '(esclarecer o resultado de|fazer o miolo de|revisar e fechar)[[:space:]]*:?[[:space:]]*',
          '',
          'gi'
        ),
        '[[:space:]]+',
        ' ',
        'g'
      ) as stripped
    from public.project_steps
  ) once
) as cleaned
where step.id = cleaned.id
  and step.title is distinct from cleaned.title;
