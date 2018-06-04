const Joi = require('joi');
const Boom = require('boom');
const oracledb = require('oracledb');

module.exports = [
    {
        method: 'POST',
        path: '/product',
        config: {
            handler: post_product,
            description: 'Create a new product',
            auth: 'jwt',
            tags: ['api'],
            validate: {
                payload: { 
                    mfg_account_id: Joi.number().required().valid([1,2,10,21]),
                    group_sku: Joi.string().required(),
                    group_name: Joi.string().required(),
                    short_desc: Joi.string().required(),
                    long_desc: Joi.string(),
                    product_type: Joi.string().valid(['prop','lowerunit','powerhead','sterndrive','engine','general']),
                    category_id: Joi.number(),
                    sku: Joi.string().required(),
                    name: Joi.string().required(),
                    base_price: Joi.number().required(),
                    dropship_cost: Joi.number().required(),
                    retail_price: Joi.number().required(),
                    core_charge: Joi.number()
                }
            }
        }
    },
    {
        method: 'GET',
        path: '/product/{mfg_account_id}/{group_sku}',
        config: {
            handler: get_product,
            description: 'Gets a product group',
            notes: 'Returns a product group using mfg_account_id and group_sku',
            auth: {
                strategy: 'jwt',
                mode: 'optional'
            },
            tags: ['api'],
            validate: {
                params: {
                    mfg_account_id : Joi.number().required().description('the mfg_account_id'),
                    group_sku : Joi.string().required().min(5).description('the group sku')
                }
            }
        }
    }
];

async function post_product(request, reply) {

    try {

        const p = request.payload;

        // Check for existing product group
        const qry_existing_product_group = `
            SELECT group_name, short_desc, long_desc, product_type, category_id
            FROM products
            WHERE mfg_account_id = :mfg_account_id
            AND group_sku = :group_sku
            AND sku = group_sku
        `;
        const existing_product_group_result = await request.app.db.execute(qry_existing_product_group, {mfg_account_id: p.mfg_account_id, group_sku: p.group_sku}, {outFormat: 4002});
        const existing_product_group = existing_product_group_result.rows[0];

        if (existing_product_group) {
            // Update the group attributes
            p.group_name = existing_product_group.group_name;
            p.short_desc = existing_product_group.short_desc;
            p.long_desc = existing_product_group.long_desc;
            p.product_type = existing_product_group.product_type;
            p.category_id = existing_product_group.category_id;
        } else {
            if (p.sku != p.group_sku)
                return reply(Boom.conflict(`The group_sku ${p.group_sku} could not be found.`));

        }

        // Insert new product
        const qry_insert_product = `
            INSERT INTO products(mfg_account_id, group_sku, group_name, short_desc, long_desc, product_type, category_id, sku, name, base_price, dropship_cost, retail_price, core_charge, display)
            VALUES(:mfg_account_id, :group_sku, :group_name, :short_desc, :long_desc, :product_type, :category_id, :sku, :name, :base_price, :dropship_cost, :retail_price, :core_charge, 1)
            RETURNING product_id INTO :new_product_id
        `;
        insert_product = await request.app.db.execute(qry_insert_product, {mfg_account_id: p.mfg_account_id,
            group_sku: p.group_sku, group_name: p.group_name, short_desc: p.short_desc, long_desc: p.long_desc,
            product_type: p.product_type, category_id: p.category_id, sku: p.sku, name: p.name, base_price: p.base_price,
            dropship_cost: p.dropship_cost, retail_price: p.retail_price, core_charge: p.core_charge,
            new_product_id: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT } });

        // Get the inserted product using :new_product_id
        const new_product_id = Number(insert_product.outBinds.new_product_id);

        // Generate product_url
        const qry_update_product_url = `
            UPDATE products
            SET product_url = PRODUCT_URL(product_id, name)
            WHERE product_id = :product_id
        `;
        await request.app.db.execute(qry_update_product_url, {product_id: new_product_id});

        // Create record in dealer_inventory_2 table
        // This is normally done via a scheduled task
        const qry_insert_dealer_product = `
            INSERT INTO dealer.dealer_inventory_2(product_id, short_desc, long_desc, base_price, dropship_cost, true_cost, core_charge, preferred_vendor_id, display)
            VALUES(:product_id, :short_desc, :long_desc, :base_price, :dropship_cost, :true_cost, :core_charge, :preferred_vendor_id, 1)
        `;
        insert_dealer_product = await request.app.db.execute(qry_insert_dealer_product, {product_id: new_product_id, short_desc: p.short_desc,
            long_desc: p.long_desc, base_price: p.base_price, dropship_cost: p.dropship_cost, true_cost: p.true_cost, core_charge: p.core_charge,
            preferred_vendor_id: p.mfg_account_id });

        await request.app.db.commit();

        // Get the product group
        prod_group = await product_group(request.app.db, p.mfg_account_id, p.group_sku);
        
        // If there is an existing product group return a 206 status code
        if (existing_product_group) {
            return reply(prod_group).code(206);
        }
        else {
            return reply(prod_group);
        }

    } catch(error) {
        
        // Check for an Oracle constraint error
        if (error.message.split(':')[0] == 'ORA-00001') {
            console.log(error);
            return reply(Boom.conflict('mfg_account_id and SKU must be unique'));
        } else {
            console.log(error);
            return reply(error);
        }
    }

};

async function get_product(request, reply) {

	try {

        // Setup return type
        const isAuthenticated = +request.auth.isAuthenticated;
        let return_type = 'public';
        if ( isAuthenticated ) {
            return_type = '';
        }
        
        prod_group = await product_group(request.app.db, request.params.mfg_account_id, request.params.group_sku, return_type)
        
        if (prod_group) {
            return reply(prod_group);
        } else {
            return reply(Boom.notFound('Product not found'));
        }

    } catch(error) {
        
        console.log(error);
        return reply(error);

    }

};

// Product Group helper
// @TODO - Simplify by using a single query and returning JSON types
// JSON_ARRAY and JSON_OBJECT are supported starting with Oracle 12.2
async function product_group(oracledb, mfg_account_id, group_sku, return_type) {

    try {

        const prod_group_query = `
            SELECT mfg_account_id "mfg_account_id", group_sku "group_sku", group_name "group_name",
                short_desc "short_desc", long_desc "long_desc", category_id "category_id"
            FROM products WHERE mfg_account_id = ${ mfg_account_id } AND group_sku = :group_sku AND sku = group_sku
        `;
        const prod_group_result = await oracledb.execute(prod_group_query, {group_sku: group_sku}, {outFormat: 4002});
        const prod_group = prod_group_result.rows

        if (prod_group[0]) {

            // Products
            const products_query = `
                SELECT p.product_id "product_id", p.name "name", p.sku "sku", p.product_type "product_type",
                    d.dateadded "dateadded", d.dateupdated "dateupdated", d.dropship_cost "dropship_cost", d.base_price "base_price",
                    p.retail_price "retail_price", p.core_charge "core_charge", p.product_url "product_url"
                FROM products p, dealer.dealer_inventory_2 d
                WHERE p.product_id = d.product_id
                AND p.mfg_account_id = ${ mfg_account_id } AND p.group_sku = :group_sku
            `;
            const products_result = await oracledb.execute(products_query, {group_sku: group_sku}, {outFormat: 4002});
            let products = products_result.rows;

            // Setup product_id list
            const product_id_array = products.map(v => v.product_id);
            const product_id_list = `'${product_id_array.join('\',\'')}'`;

            // Product Images
            const images_query = `
                SELECT product_id "product_id", sm_image "sm_image", lg_image "lg_image", xl_image "xl_image", hires_image "hires_image"
                FROM product_images WHERE product_id IN (${product_id_list})
            `;
            const images_result = await oracledb.execute(images_query, {}, {outFormat: 4002});
            let images = images_result.rows;

            // Add all query results to 'prod_group'
            // @TODO - Remove redundant product_id from images
            products.map(v => v.images = images.filter(i => i.product_id == v.product_id)); // Map Images to Product
            prod_group.map(v => v.products = products); // Map Products to Product GRoup
        }

        // Remove pricing information
        if (return_type == 'public') {
            prod_group[0]['products'].map(v => v.dropship_cost = 0);
        }

        return prod_group[0];

    } catch(error) {
        
        console.log(error);
        return error;

    }

};