const Joi = require('joi');
const Boom = require('boom');
const oracledb = require('oracledb');
const { single_document } = require('./document');

module.exports = [
	{
		method: 'POST',
		path: '/document/{doc_id}/section',
		config: {
			handler: post_section,
			description: 'Create a new document section',
			auth: 'jwt',
			tags: ['api'],
			validate: {
				params: {
					doc_id : Joi.number().required().description('Document ID')
				},
				payload: { 
					title: Joi.string().required(), 
					content: Joi.string().required(),
					content_html: Joi.string().required()
				}
			}
		}
	},
	{
		method: 'PATCH',
		path: '/document/{doc_id}/section/{section_id}',
		config: {
			handler: patch_section,
			description: 'Modify a document section',
			auth: 'jwt',
			tags: ['api'],
			validate: {
				params: {
					doc_id : Joi.number().required().description('Document ID'),
					section_id : Joi.number().required().description('Section ID')
				},
				payload: { 
					title: Joi.string(), 
					content: Joi.string(),
					content_html: Joi.string()
				}
			}
		}
	},
	{
		method: 'DELETE',
		path: '/document/{doc_id}/section/{section_id}',
		config: {
			handler: delete_section,
			description: 'Delete a document section',
			auth: 'jwt',
			tags: ['api'],
			validate: {
				params: {
					doc_id : Joi.number().required().description('Document ID'),
					section_id : Joi.number().required().description('Section ID')
				}
			}
		}
	}
];

async function post_section(request, reply) {

	try {

		// Insert new section
		const qry_insert_section = `
			INSERT INTO doc_sections(doc_id, title, content, content_html, position)
			VALUES(:doc_id, :title, :content, :content_html,
				(SELECT NVL(MAX(position),0) + 1 FROM doc_sections WHERE doc_id = :doc_id)
			)
		`;
		insert_section = await request.app.db.execute(qry_insert_section, {doc_id: request.params.doc_id,
			title: request.payload.title, content: request.payload.content, content_html: request.payload.content_html },
			{autoCommit: true});

		// Get the updated document
		single_doc = await single_document(request.app.db, request.params.doc_id, 'simple');
		return reply(single_doc);

	} catch(error) {
		
		// Check for an Oracle constraint error
		if (error.message.split(':')[0] == 'ORA-02291') {
			console.log(error);
			return reply(Boom.notFound('Document not found'));
		} else {
			console.log(error);
			return reply(error);
		}

	}

};

async function patch_section(request, reply) {

	try {

		// Modify a section
		const qry_patch_section = `
			UPDATE doc_sections
			SET title = :title, content = :content, content_html = :content_html
			WHERE doc_id = :doc_id 
			AND doc_section_id = :section_id
		`;
		const patch_section = await request.app.db.execute(qry_patch_section, {doc_id: request.params.doc_id,
			section_id: request.params.section_id, title: request.payload.title, content: request.payload.content,
			content_html: request.payload.content_html},
			{autoCommit: true});

		if (patch_section.rowsAffected == 0) {
			return reply(Boom.notFound('Document or section not found'));
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

async function delete_section(request, reply) {

	try {

		// Delete a section
		const qry_delete_section = `
			DELETE FROM doc_sections
			WHERE doc_id = :doc_id 
			AND doc_section_id = :section_id
		`;
		delete_section = await request.app.db.execute(qry_delete_section, {doc_id: request.params.doc_id,
			section_id: request.params.section_id }, {autoCommit: true});
		
		if (delete_section.rowsAffected == 0) {
			return reply(Boom.notFound('Document or section not found'));
		} else {
			// Get the updated document
			single_doc = await single_document(request.app.db, request.params.doc_id, 'simple');
			return reply(single_doc);
		}

	} catch(error) {
		
		// Check for an Oracle constraint error
		if (error.message.split(':')[0] == 'ORA-02292') {
			console.log(error);
			return reply(Boom.conflict('All images must be deleted first'));
		} else {
			console.log(error);
			return reply(error);
		}

	}

};