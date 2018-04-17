const Joi = require('joi');
const Boom = require('boom');
const oracledb = require('oracledb');
const { single_document } = require('./document');
const { strlen } = require('../../other/tools');

// Helper funtion to get doc_article_id
const get_article_id = async function (request, reply) {

	try {

		// Get an Article
		const article_query = `
			SELECT doc_article_id "doc_article_id"
			FROM doc_article
			WHERE doc_id = :doc_id
		`;
		const article_result = await request.app.db.execute(article_query, {doc_id: request.params.doc_id});
		const doc_article_id = article_result.rows[0]

		if (doc_article_id) {
			return reply(doc_article_id);
		} else {
			return reply(Boom.notFound('Tech Article not found'));
		}

	} catch(error) {

		return reply(Boom.badImplementation());

	}

}

module.exports = [
	{
		method: 'PATCH',
		path: '/document/{doc_id}/tech_article',
		config: {
			pre: [ { method: get_article_id, assign: 'article_id' } ],
			handler: patch_article,
			description: 'Modify Document:Tech Article',
			auth: 'jwt',
			tags: ['api', 'tech'],
			validate: {
				params: {
					doc_id : Joi.number().required().description('Document ID')
				},
				payload: {
					article_type: Joi.string().required(),
					mfg_account_id: Joi.number().required(),
					engine_type: Joi.string().allow('').allow(null),
					service_time: Joi.string().allow('').allow(null),
					service_difficulty: Joi.string().allow('').allow(null),
					linked_doc_title: Joi.string().allow('').allow(null),
					linked_doc_url: Joi.string().allow('').allow(null)
				}
			}
		}
	},
	{
		method: 'POST',
		path: '/document/{doc_id}/tech_article/model',
		config: {
			pre: [ { method: get_article_id, assign: 'article_id' } ],
			handler: post_model,
			description: 'Add Document:Tech Article:Model',
			auth: 'jwt',
			tags: ['api'],
			validate: {
				params: {
					doc_id : Joi.number().required().description('Document ID')
				},
				payload: {
					model_group: Joi.string(),
					year_text: Joi.string(),
					model_text: Joi.string(),
					serial_text: Joi.string()
				}
			}
		}
	},
	{
		method: 'DELETE',
		path: '/document/{doc_id}/tech_article/model/{model_id}',
		config: {
			pre: [ { method: get_article_id, assign: 'article_id' } ],
			handler: delete_model,
			description: 'Delete Document:Tech Article:Model',
			auth: 'jwt',
			tags: ['api'],
			validate: {
				params: {
					doc_id : Joi.number().required().description('Document ID'),
					model_id : Joi.number().required().description('Model ID')
				}
			}
		}
	},
	{
		method: 'GET',
		path: '/document/tech_article/product',
		config: {
			handler: get_product,
			description: 'Search for a single product by SKU',
			auth: 'jwt',
			tags: ['api'],
			validate: {
				query: {
					sku : Joi.string().required().description('SKU')
				}
			}
		}
	},
	{
		method: 'POST',
		path: '/document/{doc_id}/tech_article/product/{product_id}',
		config: {
			pre: [ { method: get_article_id, assign: 'article_id' } ],
			handler: post_product,
			description: 'Add a Product to Document:Tech Article',
			auth: 'jwt',
			tags: ['api'],
			validate: {
				params: {
					doc_id : Joi.number().required().description('Document ID'),
					product_id : Joi.number().required().description('Product ID')
				}
			}
		}
	},
	{
		method: 'DELETE',
		path: '/document/{doc_id}/tech_article/product/{product_id}',
		config: {
			pre: [ { method: get_article_id, assign: 'article_id' } ],
			handler: delete_product,
			description: 'Delete a Product from Document:Tech Article',
			auth: 'jwt',
			tags: ['api'],
			validate: {
				params: {
					doc_id : Joi.number().required().description('Document ID'),
					product_id : Joi.number().required().description('Product ID')
				}
			}
		}
	},
];


// Update Document:Tech Article
async function patch_article(request, reply) {

	try {

		const p = request.payload;

		// Update Tech Article
		const qry_update_article = `
			UPDATE doc_article
			SET article_type = NVL(:article_type,article_type), mfg_account_id = NVL(:mfg_account_id,mfg_account_id),
			engine_type = NVLC(:engine_type, :engine_type_len, engine_type), 
			service_time = NVLC(:service_time, :service_time_len, service_time),
			service_difficulty = NVLC(:service_difficulty, :service_difficulty_len, service_difficulty), 
			linked_doc_title = NVLC(:linked_doc_title, :linked_doc_title_len, linked_doc_title),
			linked_doc_url = NVLC(:linked_doc_url, :linked_doc_url_len, linked_doc_url)
			WHERE doc_id = :doc_id
		`;
		update_article = await request.app.db.execute(qry_update_article, {doc_id: request.params.doc_id, article_type: p.article_type,
			mfg_account_id: p.mfg_account_id,
            engine_type: p.engine_type, engine_type_len: strlen(p.engine_type),
            service_time: p.service_time, service_time_len: strlen(p.service_time),
            service_difficulty: p.service_difficulty, service_difficulty_len: strlen(p.service_difficulty),
			linked_doc_title: p.linked_doc_title, linked_doc_title_len: strlen(p.linked_doc_title),
            linked_doc_url: p.linked_doc_url, linked_doc_url_len: strlen(p.linked_doc_url)},
			{autoCommit: true});

		// Get the updated document
		single_doc = await single_document(request.app.db, request.params.doc_id, 'simple');
		return reply(single_doc);

	} catch(error) {

		console.log(error);
		return reply(error);

	}

};


// Add Document:Tech Article:Model
async function post_model(request, reply) {

	try {

		const p = request.payload;
		const article_id = request.pre.article_id[0];

		// Add Model
		const qry_insert_model = `
			INSERT INTO doc_article_models(doc_article_id, model_group, year_text, model_text, serial_text, position)
			VALUES(:doc_article_id, :model_group, :year_text, :model_text, :serial_text,
				(
					SELECT NVL(MAX(position),0) + 1
					FROM doc_article_models
					WHERE doc_article_id = :doc_article_id
				)
			)
			RETURNING doc_article_model_id INTO :new_doc_article_model_id
		`;
		insert_model = await request.app.db.execute(qry_insert_model, {doc_article_id: article_id, model_group: p.model_group,
			year_text: p.year_text, model_text: p.model_text, serial_text: p.serial_text,
			new_doc_article_model_id: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT } },
			{autoCommit: true});

		// Get the updated document
		single_doc = await single_document(request.app.db, request.params.doc_id, 'simple');
		return reply(single_doc);


	} catch(error) {

		console.log(error);
		return reply(error);

	}

};


// Delete Document:Tech Article Model
async function delete_model(request, reply) {

	try {

		const article_id = request.pre.article_id[0];

		// Delete a model
		const qry_delete_model = `
			DELETE FROM doc_article_models
			WHERE doc_article_id = :doc_article_id
			AND doc_article_model_id = :model_id
		`;
		delete_model = await request.app.db.execute(qry_delete_model, {doc_article_id: article_id,
			model_id: request.params.model_id }, {autoCommit: true});

		if (delete_model.rowsAffected == 0) {
			return reply(Boom.notFound('Model not found'));
		} else {
			// Get the updated document
			single_doc = await single_document(request.app.db, request.params.doc_id, 'simple');
			return reply(single_doc);
		}

	} catch(error) {

		console.log(error);
		return reply(error);

	}

};


// Get Document:Tech Article:Product
async function get_product(request, reply) {

	try {

		// Get a Product
		const product_query = `
			SELECT product_id "product_id", account_name "mfg", sku "sku", name "name"
			FROM products p, account a
			WHERE p.mfg_account_id = a.account_id
			AND p.sku = :sku
			AND p.display = 1
			AND p.mfg_account_id IN (1,2,10)
		`;
		const product_result = await request.app.db.execute(product_query, {sku: request.query.sku}, {outFormat: 4002});
		const product = product_result.rows

		if (product.length == 0) {
			return reply(Boom.notFound('Product not found'));
		} else {
			return reply(product);
		}

	} catch(error) {

		console.log(error);
		return reply(error);

	}

};

// Add Document:Tech Article:Product
async function post_product(request, reply) {

	try {

		const article_id = request.pre.article_id[0];

		// Add Product
		const qry_insert_product = `
			INSERT INTO doc_article_products(doc_article_id, product_id)
			SELECT :doc_article_id, :product_id
			FROM dual
			WHERE EXISTS (SELECT product_id FROM products WHERE display = 1 AND mfg_account_id IN (1,2,10) AND product_id = :product_id)
		`;
		insert_product = await request.app.db.execute(qry_insert_product, {doc_article_id: article_id,
			product_id: request.params.product_id}, {autoCommit: true});

		if (insert_product.rowsAffected == 0) {
			return reply(Boom.notFound('Product not found'));
		} else {
			// Get the updated document
			single_doc = await single_document(request.app.db, request.params.doc_id, 'simple');
			return reply(single_doc);
		}

	} catch(error) {

		// Check for an Oracle constraint error
		if (error.message.split(':')[0] == 'ORA-00001') {
			console.log(error);
			return reply(Boom.badRequest('Product already exists'));
		} else {
			console.log(error);
			return reply(error);
		}

	}

};

// Delete Document:Tech Article:Product
async function delete_product(request, reply) {

	try {

		const article_id = request.pre.article_id[0];

		// Delete a Product
		const qry_delete_product = `
			DELETE FROM doc_article_products
			WHERE doc_article_id = :doc_article_id 
			AND product_id = :product_id
		`;
		delete_product = await request.app.db.execute(qry_delete_product, {doc_article_id: article_id,
			product_id: request.params.product_id }, {autoCommit: true});

		if (delete_product.rowsAffected == 0) {
			return reply(Boom.notFound('Product not found'));
		} else {
			// Get the updated document
			single_doc = await single_document(request.app.db, request.params.doc_id, 'simple');
			return reply(single_doc);
		}

	} catch(error) {

		console.log(error);
		return reply(error);

	}

};
