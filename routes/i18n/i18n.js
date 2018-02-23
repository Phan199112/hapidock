const Joi = require('joi');

module.exports = [
    {
        method: 'GET',
        path: '/i18n/{language_id}/{table_name}',
        config: {
            handler: get_i18n,
            description: 'Gets i18n translations for a single table',
            notes: 'Returns i18n translations using language_id and table_name',
            auth: 'jwt',
            tags: ['api'],
            validate: {
                params: {
                    language_id : Joi.string().required().valid(['en','es','fr','pt']),
                    table_name : Joi.string().required().valid(['category','content','content_doc',
                        'group_menu','group_notes','page_no','pages','products'])
                },
                query: {
                    status: Joi.string().required().valid(['waiting','translated']),
                    return_type: Joi.string().required().valid(['json','file'])
                }
            }
        }
    },
    {
        method: 'POST',
        path: '/i18n/{language_id}/{table_name}',
        config: {
            handler: post_i18n,
            plugins: {
                'hapi-swagger': {
                    payloadType: 'form'
                }
            },
            description: 'Updates i18n translations for a single table',
            notes: 'Imports translations into i18n_terms, then merges them into the appropriate table',
            auth: 'jwt',
            tags: ['api'],
            validate: {
                params: {
                    language_id : Joi.string().required().valid(['es','fr','pt']),
                    table_name : Joi.string().required().valid(['category','content','content_doc',
                        'group_menu','group_notes','page_no','pages','products'])
                },
                payload: {
                    file: Joi.any().meta({ swaggerType: 'file' }).description('JSON file')
                }
            },
            payload: {
                maxBytes: 1048576,
                parse: true
            }
        }
    }
];

async function get_i18n(request, reply) {

	try {

		// Get i18n terms
        var terms_query = `
            SELECT text_en,
            CASE :status
               WHEN 'translated' THEN DECODE(:language_id, 'en', text_en, 'es', text_es, 'fr', text_fr, text_pt)
               ELSE text_en
            END AS text_translated
            FROM i18n_terms
            WHERE source_table = :table_name
            AND (
                :status = 'waiting' AND DECODE(:language_id, 'es', text_es, 'fr', text_fr, text_pt) IS NULL
                OR
                :status = 'translated' AND DECODE(:language_id, 'es', text_es, 'fr', text_fr, text_pt) IS NOT NULL
            )
        `;
		terms_result = await request.app.db.execute(terms_query, {table_name: request.params.table_name,
            language_id: request.params.language_id, status: request.query.status}, {outFormat: 4002, maxRows: 500000});
        terms = terms_result.rows;
		
		// Create flattened JSON object
        terms_array = [];
        terms.forEach(function(element) {
            i18n_pair = {[element['TEXT_EN']]: element['TEXT_TRANSLATED']};
            terms_array.push(i18n_pair);
        });


        if ( request.query.return_type == 'file' ) 
            reply(terms_array)
                .header('Content-Type', 'text/json')
                .header('Content-Disposition', 'attachment; filename=i18n.json');
        else
            reply(terms_array);

	} catch(error) {
		
		console.log(error);
		reply(error);

	}

};

async function post_i18n(request, reply) {

    try {

        const data = request.payload;

        if (data.file) {

            // @TODO - Validate JSON
            // Convert JSON object
            terms_array = [];
            data.file.forEach(function(element) {
                text_en = Object.keys(element)[0];
                text_translated = element[text_en];
                
                i18n_pair = {"en": text_en, "tr": text_translated};
                terms_array.push(i18n_pair);
            });

            var json_doc = JSON.stringify(terms_array);

            // Truncate staging table
            var qry_truncate_json = `
                TRUNCATE TABLE i18n_staging
            `;
            truncate_json = await request.app.db.execute(qry_truncate_json, {}, {autoCommit: true});

            // Insert JSON doc into staging table
            var qry_insert_json = `
                INSERT INTO i18n_staging(doc)
                VALUES(:json_doc)
            `;
            insert_json = await request.app.db.execute(qry_insert_json, {json_doc: json_doc}, {autoCommit: true});

            // Merge JSON doc into i18n_terms
            var qry_update_translation = `
                MERGE INTO i18n_terms D
                USING (
                    SELECT text_en, text_translated
                    FROM json_table( (select doc from i18n_staging) , '$[*]' COLUMNS (text_en PATH '$.en', text_translated PATH '$.tr'))
                ) S
                ON (D.text_en = S.text_en AND D.source_table = :table_name)
                WHEN MATCHED THEN UPDATE
                SET D.text_es = DECODE(:language_id, 'es', S.text_translated, D.text_es),
                    D.text_fr = DECODE(:language_id, 'fr', S.text_translated, D.text_fr),
                    D.text_pt = DECODE(:language_id, 'pt', S.text_translated, D.text_pt),
                    D.text_es_pilot = DECODE(:language_id, 'es', S.text_translated, D.text_es_pilot),
                    D.text_fr_pilot = DECODE(:language_id, 'fr', S.text_translated, D.text_fr_pilot),
                    D.text_pt_pilot = DECODE(:language_id, 'pt', S.text_translated, D.text_pt_pilot)
            `;
            update_translation = await request.app.db.execute(qry_update_translation, {table_name: request.params.table_name,
                language_id: request.params.language_id}, {autoCommit: true});

            // Merge i18n_terms into the i18n_ table
            var qry_push_translation = `
                DECLARE
                  LANGUAGE_ID VARCHAR2(200);
                  TABLE_NAME VARCHAR2(200);
                BEGIN
                  LANGUAGE_ID := :language_id;
                  TABLE_NAME := :table_name;
                  MERGE_I18N(
                    LANGUAGE_ID => LANGUAGE_ID,
                    TABLE_NAME => TABLE_NAME
                  );
                END;
            `;
            push_translation = await request.app.db.execute(qry_push_translation, {table_name: request.params.table_name,
                language_id: request.params.language_id}, {autoCommit: true});

            return reply('Translations merged');

        } else {
            return reply(Boom.badRequest('Not a file'))
        }

    } catch(error) {
        
        console.log(error);
        reply(error);

    }

};