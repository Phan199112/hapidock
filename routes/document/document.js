const Joi = require('joi');
const Boom = require('boom');
const oracledb = require('oracledb');
const { strlen } = require('../../other/tools');

module.exports = [
	{
		method: 'POST',
		path: '/document',
		config: {
			handler: post_document,
			description: 'Create a new document',
			auth: 'jwt',
			tags: ['api'],
			validate: {
				payload: {
					doc_group: Joi.string().required().valid(['general','support','tech_article']),
					doc_key: Joi.string().required(),
					title: Joi.string().required(),
					content: Joi.string(),
					content_html: Joi.string(),
					show_steps: Joi.number(),
					priority: Joi.number(),
					meta_title: Joi.string(),
					meta_description: Joi.string()
				}
			}
		}
	},
	{
		method: 'GET',
		path: '/document/{doc_id}',
		config: {
			handler: get_document,
			description: 'Get a single document',
			auth: {
				strategy: 'jwt',
				mode: 'optional'
	        },
			tags: ['api'],
			validate: {
				params: {
					doc_id : Joi.number().required().description('Document ID')
				}
			}
		}
	},
	{
		method: 'PATCH',
		path: '/document/{doc_id}',
		config: {
			handler: patch_document,
			description: 'Modify a single document',
			auth: 'jwt',
			tags: ['api'],
			validate: {
				params: {
					doc_id : Joi.number().required().description('Document ID')
				},
				payload: {
					title: Joi.string().allow('').allow(null),
					content: Joi.string().allow('').allow(null),
					content_html: Joi.string().allow('').allow(null),
					show_steps: Joi.number(),
					priority: Joi.number(),
					meta_title: Joi.string().allow('').allow(null),
					meta_description: Joi.string().allow('').allow(null),
					status: Joi.string().valid(['draft','review','published'])
				}
			}
		}
	},
	{
		method: 'DELETE',
		path: '/document/{doc_id}',
		config: {
			handler: delete_document,
			description: 'Delete a single document',
			auth: 'jwt',
			tags: ['api'],
			validate: {
				params: {
					doc_id : Joi.number().required().description('Document ID')
				}
			}
		}
	}
];


// Create a new Document
async function post_document(request, reply) {

	try {

		const p = request.payload;

		// Setup user credentials
		const user_id = request.auth.credentials.userid;
		const user_type = request.auth.credentials.role;

		// Create a doc_link
		const doc_link = `${p.doc_group}/${p.doc_key}`

		// Insert new document
		const qry_insert_doc = `
			INSERT INTO doc(user_id, user_type, doc_group, doc_key, doc_link, title, content, content_html, show_steps, priority, meta_title, meta_description, status)
			VALUES(:user_id, :user_type, :doc_group, :doc_key, :doc_link, :title, :content, :content_html, :show_steps, :priority, :meta_title, :meta_description, 'draft')
			RETURNING doc_id INTO :new_doc_id
		`;
		insert_doc = await request.app.db.execute(qry_insert_doc, {user_id: user_id, user_type: user_type,
			doc_group: p.doc_group, doc_key: p.doc_key, doc_link: doc_link, title: p.title, content: p.content,
			content_html: p.content_html, show_steps: p.show_steps, priority: p.priority, meta_title: p.meta_title,
			meta_description: p.meta_description, new_doc_id: { type: oracledb.NUMBER, dir: oracledb.BIND_OUT } },
			{autoCommit: true});

		// Get the inserted document using :new_doc_id
		const new_doc_id = Number(insert_doc.outBinds.new_doc_id);

		// Create a tech_article record
		if (p.doc_group == 'tech_article') {
			const qry_insert_article = `
				INSERT INTO doc_article(doc_id, article_type, mfg_account_id)
				VALUES(:doc_id, 'Instruction', 1)
			`;
			await request.app.db.execute(qry_insert_article, {doc_id: new_doc_id}, {autoCommit: true});
		}

		// Get the new document
		single_doc = await single_document(request.app.db, new_doc_id)

		return reply(single_doc);

	} catch(error) {

		console.log(error);
		return reply(error);

	}

};


async function get_document(request, reply) {

	try {

		// Verify we have access to the document
        const isAuthenticated = +request.auth.isAuthenticated;
        const doc_query = `
			SELECT doc_id FROM doc
			WHERE doc_id = :doc_id
			AND (:isAuthenticated = 1 OR status = 'published')
		`;
		const doc_result = await request.app.db.execute(doc_query, {isAuthenticated: isAuthenticated, doc_id: request.params.doc_id}, {outFormat: 4002});
		const doc = doc_result.rows

		if (doc.length != 0) {
			single_doc = await single_document(request.app.db, request.params.doc_id)
			return reply(single_doc);
		} else {
			return reply(Boom.notFound('Document not found'));
		}

	} catch(error) {

		console.log(error);
		return reply(error);

	}

};


// Update a Document
async function patch_document(request, reply) {

	try {

		const p = request.payload;

		/*
		// Setup user credentials
		const user_type = request.auth.credentials.role;

		// user_type 'acai' cannot change status to 'published'
		if (user_type == 'acai' && p.status == 'published') {
			return reply(Boom.forbidden('User not allowed to publish document'));
		}
		*/

    // Update a document
		const qry_update_doc = `
			UPDATE doc
			SET date_updated = sysdate, 
			  title = NVLC(:title, :title_len, title), 
			  content = NVLC(:content, :content_len, content), 
			  content_html = NVLC(:content_html, :content_html_len, content_html),
				show_steps = NVL(:show_steps,show_steps), 
				priority = NVL(:priority,priority), 
				meta_title = NVLC(:meta_title, :meta_title_len, meta_title),
				meta_description = NVLC(:meta_description, :meta_description_len, meta_description), 
				status = NVL(:status,status)
			WHERE doc_id = :doc_id
		`;
		update_doc = await request.app.db.execute(qry_update_doc, {doc_id: request.params.doc_id,
			title: p.title, title_len: strlen(p.title),
			content: p.content, content_len: strlen(p.content),
			content_html: p.content_html, content_html_len: strlen(p.content_html),
			show_steps: p.show_steps, priority: p.priority,
			meta_title: p.meta_title, meta_title_len: strlen(p.meta_title),
			meta_description: p.meta_description, meta_description_len: strlen(p.meta_description),
			status: p.status},
			{autoCommit: true});

		if (update_doc.rowsAffected == 0) {
			return reply(Boom.notFound('Document not found'));
		} else {
			// Get the updated document
			single_doc = await single_document(request.app.db, request.params.doc_id);
			return reply(single_doc);
		}

	} catch(error) {

		console.log(error);
		return reply(error);

	}

};


// Delete a Document
async function delete_document(request, reply) {

	try {

		// Delete a document
		const qry_delete_doc = `
			DELETE FROM doc
			WHERE doc_id = :doc_id 
		`;
		delete_doc = await request.app.db.execute(qry_delete_doc, {doc_id: request.params.doc_id},
			{autoCommit: true});

		if (delete_doc.rowsAffected == 0) {
			return reply(Boom.notFound('Document not found'));
		} else {
			return reply('OK');
		}


	} catch(error) {

		// Check for an Oracle constraint error
		if (error.message.split(':')[0] == 'ORA-02292') {
			console.log(error);
			return reply(Boom.forbidden('All sections and images must be deleted first'));
		} else {
			console.log(error);
			return reply(error);
		}

	}

};


// Single Document helper
// @TODO - Simplify by using a single query and returning JSON types
// JSON_ARRAY and JSON_OBJECT are supported starting with Oracle 12.2
async function single_document(oracledb, doc_id, return_type) {

	try {

		const doc_query = `
			SELECT doc_id "doc_id", doc_group "doc_group", doc_key "doc_key", doc_link "doc_link", date_added "date_added", date_updated "date_updated",
				title "title", content "content", content_html "content_html", show_steps "show_steps", priority "priority", meta_title "meta_title",
				meta_description "meta_description", status "status"
			FROM doc WHERE doc_id = :doc_id
		`;
		const doc_result = await oracledb.execute(doc_query, {doc_id: doc_id}, {outFormat: 4002});
		const doc = doc_result.rows

		if (doc[0]) {

			const doc_id = doc[0].doc_id;

			// Document Sections
			const section_query = `
				SELECT doc_section_id "section_id", title "title", content "content", content_html "content_html"
				FROM doc_sections WHERE doc_id = ${ doc_id }
				ORDER BY position
			`;
			const section_result = await oracledb.execute(section_query, {}, {outFormat: 4002});
			let sections = section_result.rows;

			// Document Images
			const image_src = (process.env.NODE_ENV == 'production') ? 'http://cdn.crowleymarine.com/docs/' : 'http://s3.amazonaws.com/crowley-dev/docs/';
			const images_query = `
				SELECT doc_image_id "doc_image_id", doc_id "doc_id", doc_section_id "doc_section_id", '${ image_src }${ doc_id }/'||lg_image "lg_image",
					'${ image_src }${ doc_id }/'||xl_image "xl_image", '${ image_src }${ doc_id }/'||hires_image "hires_image"
				FROM doc_images WHERE doc_id = ${ doc_id }
				ORDER BY position
			`;
			const images_result = await oracledb.execute(images_query, {}, {outFormat: 4002});
			const images = images_result.rows;

			// Document:Tags
			const tags_query = `
				SELECT t1.tag_id "tag_id", t1.name "name"
				FROM doc_tag t1, doc_tags t2
				WHERE t1.tag_id = t2.tag_id
				AND t2.doc_id = ${ doc_id }
			`;
			const tags_result = await oracledb.execute(tags_query, {}, {outFormat: 4002});
			const tags = tags_result.rows;

			// Document:Tech Article
			const article_query = `
				SELECT doc_article_id "doc_article_id", article_type "article_type", mfg_account_id "mfg_account_id", engine_type "engine_type", service_time "service_time",
					service_difficulty "service_difficulty", linked_doc_title "linked_doc_title", linked_doc_url "linked_doc_url"
				FROM doc_article WHERE doc_id = ${ doc_id }
			`;
			const article_result = await oracledb.execute(article_query, {}, {outFormat: 4002});
			let article = article_result.rows[0] || {};

			if (Object.keys(article).length) {
				// Document:Tech Article:Models
				const models_query = `
					SELECT doc_article_model_id "model_id", model_group "model_group", year_text "year_text", model_text "model_text", serial_text "serial_text"
					FROM doc_article_models WHERE doc_article_id = ${ article.doc_article_id }
					ORDER BY position
				`;
				const models_result = await oracledb.execute(models_query, {}, {outFormat: 4002});
				const models = models_result.rows;

				// Document:Tech Article:Products
				const products_query = `
					SELECT p.product_id "product_id", a.account_name "mfg", p.sku "sku", p.name "name"
					FROM doc_article_products d, products p, account a
					WHERE p.mfg_account_id = a.account_id
					AND d.product_id = p.product_id
					AND d.doc_article_id = ${ article.doc_article_id }
				`;
				const products_result = await oracledb.execute(products_query, {}, {outFormat: 4002});
				const products = products_result.rows;

				article['models'] = models || []; // Add Models to Single Document:Tech Article
				article['products'] = products || []; // Add Product to Single Document:Tech Article
			}

			// Add all query results to 'doc'
			sections.map(v => v.images = images.filter(i => i.doc_section_id == v.section_id)); // Map Images to Section
			doc.map(v => v.images = images.filter(i => i.doc_id == v.doc_id && i.doc_section_id == null)); // Map Images to Document
			doc.map(v => v.sections = sections); // Map Sections to Single Document
			doc.map(v => v.tags = tags || []); // Map Tags to Single Document
			doc[0]['tech_article'] = article || {}; // Add Tech Article to Single Document
		}

		// Remove 'content' from document
		if (return_type == 'simple') {
			doc[0]['content'] = '';
			doc[0]['content_html'] = '';
			doc[0]['sections'].map(v => v.content = '');
			doc[0]['sections'].map(v => v.content_html = '');
		}

		return doc[0];

	} catch(error) {

		console.log(error);
		return error;

	}

};

module.exports.single_document = single_document;
