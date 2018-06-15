const Joi = require('joi');
const Boom = require('boom');
const oracledb = require('oracledb');
const urlSlug = require('url-slug');
const { single_document } = require('./document');

module.exports = [
	{
		method: 'POST',
		path: '/document/{doc_id}/tag',
		config: {
			handler: post_doc_tag,
			description: 'Add a tag to a document',
			auth: 'jwt',
			tags: ['api'],
			validate: {
				params: {
					doc_id : Joi.number().required().description('Document ID')
				},
				payload: { 
					tag_id: Joi.string().required()
				}
			}
		}
	},
	{
		method: 'DELETE',
		path: '/document/{doc_id}/tag/{tag_id}',
		config: {
			handler: delete_doc_tag,
			description: 'Remove a tag from a document',
			auth: 'jwt',
			tags: ['api'],
			validate: {
				params: {
					doc_id : Joi.number().required().description('Document ID'),
					tag_id : Joi.string().required().description('Tag ID')
				}
			}
		}
	},
	{
		method: 'GET',
		path: '/document/tags',
		config: {
			handler: get_tags,
			description: 'Gets all available tags',
			auth: 'jwt',
			tags: ['api']
		}
	},
	{
		method: 'POST',
		path: '/document/tag',
		config: {
			handler: post_tag,
			description: 'Create a new tag',
			auth: 'jwt',
			tags: ['api'],
			validate: {
				payload: { 
					name: Joi.string().required()
				}
			}
		}
	},
	{
		method: 'DELETE',
		path: '/document/tag/{tag_id}',
		config: {
			handler: delete_tag,
			description: 'Delete a tag',
			auth: 'jwt',
			tags: ['api'],
			validate: {
				params: {
					tag_id : Joi.string().required().description('Tag ID')
				}
			}
		}
	}
];

async function post_doc_tag(request, reply) {

	try {

		// Add a new tag
		const qry_add_tag = `
			INSERT INTO doc_tags(doc_id, tag_id)
			VALUES(:doc_id, :tag_id)
		`;
		add_tag = await request.app.db.execute(qry_add_tag, {doc_id: request.params.doc_id,
			tag_id: request.payload.tag_id }, {autoCommit: true});

		// Get the updated document
		single_doc = await single_document(request.app.db, request.params.doc_id, 'simple');
		return reply(single_doc);

	} catch(error) {
		
		// Check for an Oracle constraint error
		if (error.message.split(':')[0] == 'ORA-02291') {
			console.log(error);
			return reply(Boom.notFound('Document or tag not found'));
		} else {
			console.log(error);
			return reply(error);
		}

	}

};

async function delete_doc_tag(request, reply) {

	try {

		// Remove a tag
		const qry_remove_tag = `
			DELETE FROM doc_tags
			WHERE doc_id = :doc_id 
			AND tag_id = :tag_id
		`;
		remove_tag = await request.app.db.execute(qry_remove_tag, {doc_id: request.params.doc_id,
			tag_id: request.params.tag_id }, {autoCommit: true});
		
		if (remove_tag.rowsAffected == 0) {
			return reply(Boom.notFound('Document or tag not found'));
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

async function get_tags(request, reply) {

	try {

		// Tags
        var tags_query = `
            SELECT tag_id "tag_id", name "name"
            FROM doc_tag
        `;
		tags_result = await request.app.db.execute(tags_query, {}, {outFormat: 4002});
        tags = tags_result.rows
		
		reply(tags);

	} catch(error) {
		
		console.log(error);
		reply(error);

	}

};

async function post_tag(request, reply) {

	try {

		// Generate the tag_id from the name
		const tag_id = urlSlug(request.payload.name);

		// Insert new tag
		const qry_insert_tag = `
			INSERT INTO doc_tag(tag_id, name)
			VALUES(:tag_id, :name)
			RETURNING tag_id, name INTO :new_tag_id, :new_name
		`;
		insert_tag = await request.app.db.execute(qry_insert_tag, {tag_id: tag_id,
			name: request.payload.name, new_tag_id: { type: oracledb.VARCHAR2, dir: oracledb.BIND_OUT },
			new_name: { type: oracledb.VARCHAR2, dir: oracledb.BIND_OUT } }, {autoCommit: true});

		// Get the inserted document using :new_tag_id
		const new_tag_id = String(insert_tag.outBinds.new_tag_id);
		const new_name = String(insert_tag.outBinds.new_name);

		const tag = {
			"tag_id": new_tag_id,
			"name": new_name
		}

		return reply(tag);

	} catch(error) {
		
		// Check for an Oracle constraint error
		if (error.message.split(':')[0] == 'ORA-00001') {
			console.log(error);
			return reply(Boom.conflict('Tag already exists'));
		} else {
			console.log(error);
			return reply(error);
		}

	}

};

async function delete_tag(request, reply) {

	try {

		// Delete a tag
		const qry_delete_tag = `
			DELETE FROM doc_tag
			WHERE tag_id = :tag_id
		`;
		delete_tag = await request.app.db.execute(qry_delete_tag, {tag_id: request.params.tag_id},
			{autoCommit: true});
		
		if (delete_tag.rowsAffected == 0) {
			return reply(Boom.notFound('Tag not found'));
		} else {
			return reply('Tag deleted');
		}

	} catch(error) {
		
		// Check for an Oracle constraint error
		if (error.message.split(':')[0] == 'ORA-02292') {
			console.log(error);
			return reply(Boom.conflict('Tag must be removed from all documents first'));
		} else {
			console.log(error);
			return reply(error);
		}

	}

};