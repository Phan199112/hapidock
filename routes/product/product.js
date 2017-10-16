const Joi = require('joi');

module.exports = [
    {
        method: 'GET',
        path: '/product/{mfg_account_id}/{sku}',
        config: {
            handler: get_product,
            description: 'Gets a single product',
            notes: 'Returns a product using mfg_account_id and sku',
            tags: ['api'],
            validate: {
                params: {
                    mfg_account_id : Joi.number().required().description('the mfg_account_id'),
                    sku : Joi.string().required().min(5).description('the sku')
                }
            }
        }
    }
];

async function get_product(request, reply) {

	try {

		// Single Product
        var prod_query = `
            SELECT product_id "product_id", sku "sku", name "name"
            FROM products WHERE mfg_account_id = ${ request.params.mfg_account_id } AND sku = :sku
        `;
		prod_result = await request.app.db.execute(prod_query, {sku: request.params.sku}, {outFormat: 4002});
        product = prod_result.rows

        // Product Images
        var images_query = `
            SELECT sm_image "sm_image", lg_image "lg_image", xl_image "xl_image"
            FROM product_images WHERE product_id = ${ product[0].product_id }
        `;
        product_images = await request.app.db.execute(images_query, {}, {outFormat: 4002});

        // Map Product Images to Single Product
        product.map(v => v.images = product_images.rows);
		
		reply(product);

	} catch(error) {
		
		console.log(error);
		reply(error);

	}

};