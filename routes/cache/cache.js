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