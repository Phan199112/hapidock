#i18n
## Data Model
We are using a separate table to store the translations for each source table. For example, all of the translations for the `products` table would be stored in `i18n_products`. When retreiving the translations (ex pilotCMS2) we use a `JOIN` to pull the translations, based on the `language_id`.

The translation tables are not modified directly. They are updated using the `merge_18n` stored procedure.

###i18n\_terms
This is the staging table where we hold the distinct terms to be translated. The columns are `text_en`, `text_es`, `text_fr`, `text_pt`, `use_en`, `source_table`. All of the i18n_ tables are generated using data from this table. **This is the only table where we can modify the data directly.**

###i18n\_terms_clob
Same as `i18n_terms`, but with `CLOB` columns instead of `VARCHAR2`.

##merge\_i18n\_terms
This procedure merges English terms to be translated from the various source tables into the `i18n_terms` table. Run this procedure whenever additional records are added into the source tables (that need to be translated).

##merge\_i18n
This procedure merges the translated terms from `i18n_terms` into the corresponding `i18n_` translation tables. Run this procedure anytime translations have been added/modified in the `i18n_terms` table.

## API endpoints
### GET /v2/i18n/{language\_id}/{table\_name}
This endpoint returns **i18n** translations for a single table, using language\_id and table\_name.

### POST /v2/i18n/{language\_id}/{table\_name}
This endpoint imports translations into i18n_terms, then merges them into the appropriate translation table. 