const Joi = require('joi');

module.exports = [
	{
		method: 'GET',
		path: '/documents',
		config: {
			handler: get_documents,
			description: 'Returns one or more documents',
			auth: {
				strategy: 'jwt',
				mode: 'optional'
	        },
			tags: ['api'],
			validate: {
				query: {
					doc_group : Joi.string().required().description('Document group'),
					doc_key : Joi.string().description('Document key')
				}
			}
		}
	}
];

// One or more Documents
async function get_documents(request, reply) {

	try {

		// Setup user credentials
		const isAuthenticated = +request.auth.isAuthenticated;
		let user_id = '', user_type = '';
		if ( isAuthenticated ) {
			user_id = request.auth.credentials.userid;
			user_type = request.auth.credentials.role;
		}

		const doc_query = `
			SELECT doc_id "doc_id", doc_group "doc_group", doc_key "doc_key", doc_link "doc_link", date_added "date_added", date_updated "date_updated",
				title "title", priority "priority", status "status"
			FROM doc
			WHERE doc_group = :doc_group
			AND (doc_key = :doc_key OR :doc_key IS NULL)
			AND (
				(:isAuthenticated = 1 AND user_id = to_char(:user_id) AND user_type = :user_type)
				OR (:isAuthenticated = 1 AND :user_type = 'pilot')
				OR (:isAuthenticated = 0 AND status = 'published')
			)
		`;
		const doc_result = await request.app.db.execute(doc_query, {isAuthenticated: isAuthenticated, user_id: user_id, user_type: user_type,
			doc_group: request.query.doc_group, doc_key: request.query.doc_key}, {outFormat: 4002});
		const doc = doc_result.rows
		
		return reply(doc);

	} catch(error) {
		
		console.log(error);
		return reply(error);

	}

};