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
                    language_id : Joi.string().required().valid(['es','fr','pt']),
                    table_name : Joi.string().required().valid(['category','content','content_doc',
                        'group_menu','group_notes','page_no','pages','products'])
                },
                query: {
                    status: Joi.string().required().valid(['waiting','translated']),
                    return_type: Joi.string().required().valid(['json','file'])
                }
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