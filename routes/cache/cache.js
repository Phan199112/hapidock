const Joi = require('joi');
const uuid = require('uuid');
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
            tags: ['api'],
            validate: {
                query: {
                    num_rows : Joi.number().default(500).description('Number of products to process')
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

        // Create a batch_id
        const batch_id = uuid.v1();

        // Set batch_id
        const batch_query = `
            UPDATE q_cache_keys
            SET batch_id = :batch_id
            WHERE batch_id IS NULL
        `;
        const batch_result = await request.app.db.execute(batch_query, {batch_id: batch_id}, {autoCommit: true});

        /* 
            Get Redis patterns from queue
        */
        const redis_pattern_query = `
            SELECT redis_pattern FROM q_cache_keys
            WHERE batch_id = :batch_id
        `;
        const redis_pattern_result = await request.app.db.execute(redis_pattern_query, {batch_id: batch_id});
        const redis_pattern = [].concat.apply([], redis_pattern_result.rows);

        // Log number of patterns in batch
        console.log(`${redis_pattern.length} pattern(s) in batch`)

        // Create patterns for each language
        const pattern_en = redis_pattern.map(function(x){return x.replace('{LANGUAGE_ID}','en');});
        const pattern_es = redis_pattern.map(function(x){return x.replace('{LANGUAGE_ID}','es');});
        const pattern_pt = redis_pattern.map(function(x){return x.replace('{LANGUAGE_ID}','pt');});
        const pattern_fr = redis_pattern.map(function(x){return x.replace('{LANGUAGE_ID}','fr');});

        // Combine patterns
        const redis_pattern_combined = [].concat.apply([], [pattern_en, pattern_es, pattern_pt, pattern_fr])

        // Log number of patterns generated
        console.log(`${redis_pattern_combined.length} pattern(s) generated across all languages`)

        // Delete keys
        const redis_del = redis_pattern_combined.length == 0 ? 0 : await delRedis(redis_pattern_combined);

        // Delete processed keys from q_cache_keys
        const delete_query = `
            DELETE FROM q_cache_keys
            WHERE batch_id = :batch_id
        `;
        const delete_result = await request.app.db.execute(delete_query, {batch_id: batch_id}, {autoCommit: true});

        const message = `${redis_del} key(s) deleted`;

        // Log number of keys deleted
        console.log(message);

        reply(message);

    } catch(error) {
        
        console.log(error);
        reply(error);

    }

};