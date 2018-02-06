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
            tags: ['api'],
            validate: {
                query: {
                    num_rows : Joi.number().default(1000).description('Number of products to process')
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

        // Inner SQL for product queries
        const inner_sql = `
            SELECT product_id, dateupdated
            FROM dealer.dealer_inventory_2
            UNION ALL
            SELECT product_id, dateadded AS dateupdated
            FROM product_images
            UNION ALL
            SELECT product_id, dateentered AS dateupdated
            FROM product_inv_notes
            UNION ALL
            SELECT product_id, qa_date AS dateupdated
            FROM product_qa
            UNION ALL
            SELECT product_id, date_submitted AS dateupdated
            FROM order_stories s, orders o WHERE s.order_no = o.order_no
        `;

        /*
            Setup manufacturer variables
            Get mfg_account_id from first product
        */
        const mfg_query = `
            SELECT p.mfg_account_id FROM
            (
                ${inner_sql}
            ) x,
            products p
            WHERE x.product_id = p.product_id
            AND p.cacheupdated < x.dateupdated
        `;
        const mfg_result = await request.app.db.execute(mfg_query, {}, {outFormat: 4002, maxRows: 1});
        const mfg_account_id = mfg_result.rows[0]['MFG_ACCOUNT_ID'];
        const mfg = (mfg_account_id == 1) ? 'brp' : (mfg_account_id == 2) ? 'mercury' : 'yamaha';

        if ( mfg_result.rows.length == 0) {
            return reply(`0 products found`);
        }

        // Subquery to get updated products
        const product_query = `
            SELECT DISTINCT x.product_id FROM
            (
                ${inner_sql}
            ) x,
            products p
            WHERE x.product_id = p.product_id
            AND p.cacheupdated < x.dateupdated
            AND p.mfg_account_id = :mfg_account_id
        `;
        const product_result = await request.app.db.execute(product_query, {mfg_account_id: mfg_account_id}, {maxRows: request.query.num_rows});
        const product_id_array = [].concat.apply([], product_result.rows);
        const product_id_list = `'${product_id_array.join('\',\'')}'`;

        // Single Product
        const single_product_query = `
            SELECT '/single_product:'||product_id||':{LANGUAGE_ID}' AS pattern
            FROM products
            WHERE product_id IN (${product_id_list})
        `;

        // Product Listing
        const product_listing_query = `
            SELECT pattern FROM
            (
                SELECT '/product_listing:'||category_id||':{LANGUAGE_ID}' AS pattern, LEVEL AS cat_level
                FROM category c
                START WITH c.category_id IN (SELECT category_id FROM products WHERE product_id IN (${product_id_list}))
                CONNECT BY PRIOR c.parent_category_id = c.category_id
            )
            WHERE cat_level = 2
        `;

        // Diagram Page
        const diagram_page_query = `
            SELECT DISTINCT '/diagram_page:${mfg_account_id}-'||pageid||'-parts,refnums:{LANGUAGE_ID}' FROM
            (SELECT b.PageID, (
              SELECT MAX (
                  CASE
                    WHEN p.superceding_product_id IS NULL THEN p.Product_ID
                    WHEN di.Inventory > 0 THEN p.Product_ID
                  END
                )
              FROM  Products p
                INNER JOIN dealer.dealer_inventory_2 di ON di.product_id = p.product_id AND di.display = 1
              START WITH p.product_ID = b.product_ID
              CONNECT BY NOCYCLE PRIOR p.superceding_product_id = p.Product_ID
              AND PRIOR di.inventory = 0
            ) SS_Product_ID
            FROM ${mfg}.pages b)
            WHERE SS_Product_ID IN (${product_id_list})
        `;

        // Diagram Prop
        const diagram_prop_query = `
            SELECT DISTINCT '/diagram_prop:${mfg_account_id}-'||g.groupid||'-:{LANGUAGE_ID}'
            FROM
            (
              SELECT CONNECT_BY_ROOT product_id original_product_id, product_id AS current_product_id, CONNECT_BY_ISLEAF ISLEAF
              FROM products
              CONNECT BY NOCYCLE PRIOR superceding_product_id = Product_ID
            ) p,
            ${mfg}.pages m, ${mfg}.groups g
            WHERE m.pageid = g.pageid
            AND p.original_product_id = m.product_id
            AND ISLEAF = 1
            AND current_product_id IN (${product_id_list})
            UNION
            SELECT DISTINCT '/diagram_prop:${mfg_account_id}-'||g.groupid||'-:{LANGUAGE_ID}'
            FROM prop_groups pg, ${mfg}.groups g, gearcase_pages p, gearcase_housings h
            WHERE pg.prop_group_id = h.prop_group_id 
            AND g.pageid = p.pageid
            AND h.latest_product_id = p.latest_product_id
            AND p.mfg = ${mfg_account_id}
            AND original_group_type = 'primary'
            AND pg.product_id IN (${product_id_list})
        `;

        // Combined query to get Redis patterns
        const redis_pattern_query = `
            ${single_product_query}
            UNION ALL
            ${product_listing_query}
            UNION ALL
            ${diagram_page_query}
            UNION ALL
            ${diagram_prop_query}
        `;
        const redis_pattern_result = await request.app.db.execute(redis_pattern_query, {}, {maxRows: 100000});
        const redis_pattern = [].concat.apply([], redis_pattern_result.rows);

        // Create patterns for each language
        const pattern_en = redis_pattern.map(function(x){return x.replace('{LANGUAGE_ID}','en');});
        const pattern_es = redis_pattern.map(function(x){return x.replace('{LANGUAGE_ID}','es');});
        const pattern_pt = redis_pattern.map(function(x){return x.replace('{LANGUAGE_ID}','pt');});
        const pattern_fr = redis_pattern.map(function(x){return x.replace('{LANGUAGE_ID}','fr');});

        // Combine patterns
        const redis_pattern_combined = [].concat.apply([], [pattern_en, pattern_es, pattern_pt, pattern_fr])

        // Delete keys
        const redis_del = redis_pattern_combined.length == 0 ? 0 : await delRedis(redis_pattern_combined);

        // Update products table
        const update_query = `
            UPDATE products
            SET cacheupdated = sysdate
            WHERE product_id IN (${product_id_list})
        `;
        const update_result = await request.app.db.execute(update_query, {}, {autoCommit: true});

        reply(`${redis_del} key(s) deleted for ${mfg}`);

    } catch(error) {
        
        console.log(error);
        reply(error);

    }

};