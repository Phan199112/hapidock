const Joi = require('joi');
const util = require('util');

module.exports = [
    {
        method: 'GET',
        path: '/cache/{language_id}/{endpoint}',
        config: {
            handler: get_keys,
            description: 'Gets keys from the cache',
            notes: 'Returns keys from the cache matching a pattern',
            auth: 'jwt',
            tags: ['api'],
            validate: {
                params: {
                    language_id: Joi.string().required().valid(['en','es','fr','pt']),
                    endpoint : Joi.string().required().valid(['bulletin_viewer','contact_us','content','diagram_group','diagram_page','diagram_prop','diagram_year',
                        'general_doc','parts_home','product_listing','redirect','repair_stories','single_product','tech_article'])
                    
                },
                query: {
                    pattern : Joi.string()
                }
            }
        }
    },
    {
        method: 'DELETE',
        path: '/cache/{language_id}/{endpoint}',
        config: {
            handler: delete_keys,
            description: 'Deletes keys from the cache',
            notes: 'Deletes keys from the cache matching a pattern',
            auth: 'jwt',
            tags: ['api'],
            validate: {
                params: {
                    language_id: Joi.string().required().valid(['en','es','fr','pt']),
                    endpoint : Joi.string().required().valid(['bulletin_viewer','contact_us','content','diagram_group','diagram_page','diagram_prop','diagram_year',
                        'general_doc','parts_home','product_listing','redirect','repair_stories','single_product','tech_article'])
                    
                },
                query: {
                    pattern : Joi.string()
                }
            }
        }
    },
    {
        method: 'POST',
        path: '/cache',
        config: {
            handler: delete_updated_keys,
            description: 'Deletes recently updated keys from the cache',
            notes: 'Deletes keys from the cache containing recently updated products',
            // auth: 'jwt',
            tags: ['api'],
            validate: {
                query: {
                    num_days : Joi.number().default(7)
                }
            }
        }
    }
];

async function get_keys(request, reply) {

	try {

        const client = request.redis;

        // Setup parameters
        const pattern = request.query.pattern == undefined ? '*' : `*${request.query.pattern}*`;
        const match_pattern = `/${request.params.endpoint}:${pattern}:${request.params.language_id}`;

        // Promisify Redis client
        const keysRedis = util.promisify(client.keys).bind(client);

		const redis_keys = await keysRedis(match_pattern); // Get keys from Redis

        reply(redis_keys);

	} catch(error) {
		
		console.log(error);
		reply(error);

	}

};

async function delete_keys(request, reply) {

    try {

        const client = request.redis;

        // Setup parameters
        const pattern = request.query.pattern == undefined ? '*' : `*${request.query.pattern}*`;
        const match_pattern = `/${request.params.endpoint}:${pattern}:${request.params.language_id}`;

        // Promisify Redis client
        const keysRedis = util.promisify(client.keys).bind(client);
        const delRedis = util.promisify(client.del).bind(client);

        const redis_keys = await keysRedis(match_pattern); // Get keys from Redis

        const redis_del = redis_keys.length == 0 ? 0 : await delRedis(redis_keys); // Delete keys

        reply(`${redis_del} key(s) deleted`);

    } catch(error) {
        
        console.log(error);
        reply(error);

    }

};

async function delete_updated_keys(request, reply) {

    try {

        const client = request.redis;

        // Promisify Redis client
        const delRedis = util.promisify(client.del).bind(client);

        // Get updated products
        const product_query = `
            SELECT product_id FROM dealer.dealer_inventory_2
            WHERE dateupdated > sysdate - :num_days
            UNION
            SELECT product_id FROM product_images
            WHERE dateadded > sysdate - :num_days
        `;
        const product_result = await request.app.db.execute(product_query, {num_days: request.query.num_days});
        const product_id_array = [].concat.apply([], product_result.rows);
        const product_id_list = `'${product_id_array.join('\',\'')}'`;

        // SINGLE_PRODUCT
        const redis_pattern_query = `
            SELECT '/single_product:'||product_id||':language_id' AS pattern
            FROM products
            WHERE product_id IN (${product_id_list})
        `;
        const redis_pattern_result = await request.app.db.execute(redis_pattern_query);
        const redis_pattern = [].concat.apply([], redis_pattern_result.rows);

        // Create patterns for each language
        const pattern_en = redis_pattern.map(function(x){return x.replace('language_id','en');});
        const pattern_es = redis_pattern.map(function(x){return x.replace('language_id','es');});
        const pattern_pt = redis_pattern.map(function(x){return x.replace('language_id','pt');});
        const pattern_fr = redis_pattern.map(function(x){return x.replace('language_id','fr');});

        // Combine patterns
        const redis_pattern_combined = [].concat.apply([], [pattern_en, pattern_es, pattern_pt, pattern_fr])

        // Delete keys
        const redis_del = redis_pattern_combined.length == 0 ? 0 : await delRedis(redis_pattern_combined); // Delete keys

        reply(`${redis_del} key(s) deleted`);

    } catch(error) {
        
        console.log(error);
        reply(error);

    }

};